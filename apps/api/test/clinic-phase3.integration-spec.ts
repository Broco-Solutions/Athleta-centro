import { Test } from '@nestjs/testing';
import { ClinicalTestResponseType, Role, TrainingCondition } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { ClinicalCatalogService } from '../src/clinic/clinical-catalog.service';
import { EvaluationService } from '../src/clinic/evaluation.service';
import { IndicationService } from '../src/clinic/indication.service';
import { SocialWorkService } from '../src/clinic/social-work.service';
import { StudyService } from '../src/clinic/study.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ClinicService } from '../src/clinic/clinic.service';

describe('Clinic Phase 3 persistence workflows', () => {
  let prisma: PrismaService;
  let evaluations: EvaluationService;
  let catalogs: ClinicalCatalogService;
  let studies: StudyService;
  let socialWork: SocialWorkService;
  let indications: IndicationService;
  let clinic: ClinicService;
  const suffix = () => `${Date.now()}-${Math.random()}`;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = module.get(PrismaService);
    evaluations = module.get(EvaluationService);
    catalogs = module.get(ClinicalCatalogService);
    studies = module.get(StudyService);
    socialWork = module.get(SocialWorkService);
    indications = module.get(IndicationService);
    clinic = module.get(ClinicService);
  });

  afterEach(async () => {
    await prisma.clinicalAppointment.deleteMany();
    await prisma.salaServiceType.deleteMany({ where: { name: { startsWith: 'Kinesiología ' } } });
    await prisma.clinicalTestResult.deleteMany();
    await prisma.clinicalEvaluation.deleteMany();
    await prisma.salaClinicalIndication.deleteMany();
    await prisma.socialWorkOrder.deleteMany();
    await prisma.socialWork.deleteMany();
    await prisma.clinicalStudy.deleteMany();
    await prisma.clinicalTestDefinition.deleteMany();
    await prisma.measurementMethod.deleteMany();
    await prisma.clinicalProtocol.deleteMany();
    await prisma.clinicalAttention.deleteMany();
    await prisma.clinicalPatient.deleteMany();
    await prisma.internalUserRole.deleteMany({ where: { internalUser: { email: { contains: '@phase3.test' } } } });
    await prisma.internalUser.deleteMany({ where: { email: { contains: '@phase3.test' } } });
    await prisma.person.deleteMany({ where: { dni: { startsWith: '55' } } });
  });

  it('snapshots a selectable service duration on appointments', async () => {
    const token = suffix(); const professional = await prisma.internalUser.create({ data: { firstName: 'Profesional', lastName: 'Servicio', email: `${token}@phase3.test`, normalizedEmail: `${token}@phase3.test`, roles: { create: { role: Role.KINESIOLOGIST } } } });
    const dni = `55${Date.now()}`.slice(0, 12); const person = await prisma.person.create({ data: { firstName: 'Paciente', lastName: 'Servicio', dni, normalizedDni: dni, phone: '3510000000', birthDate: new Date('1990-01-01') } }); await prisma.clinicalPatient.create({ data: { personId: person.id, registeredById: professional.id } });
    const service = await prisma.salaServiceType.create({ data: { name: `Kinesiología ${token}`, normalizedName: `kinesiología ${token}`, durationMinutes: 60 } }); const future = new Date(Date.now() + 86_400_000).toISOString();
    const appointment = await clinic.create({ personId: person.id, serviceId: service.id, professionalId: professional.id, startAt: future }); expect(appointment.durationMinutes).toBe(60); expect(appointment.serviceTypeId).toBe(service.id);
    await prisma.salaServiceType.update({ where: { id: service.id }, data: { durationMinutes: 45 } }); expect((await prisma.clinicalAppointment.findUniqueOrThrow({ where: { id: appointment.id } })).durationMinutes).toBe(60);
    const next = await clinic.create({ personId: person.id, serviceId: service.id, professionalId: professional.id, startAt: new Date(Date.now() + 172_800_000).toISOString() }); expect(next.durationMinutes).toBe(45);
  });

  it('preserves evaluation snapshots and permits multiple evaluations and repeated tests', async () => {
    const token = suffix();
    const professional = await prisma.internalUser.create({ data: { firstName: 'Profesional', lastName: 'Sintético', email: `${token}@phase3.test`, normalizedEmail: `${token}@phase3.test`, roles: { create: { role: Role.KINESIOLOGIST } } } });
    const dni = `55${Date.now()}`.slice(0, 12);
    const person = await prisma.person.create({ data: { firstName: 'Paciente', lastName: 'Sintético', dni, normalizedDni: dni, phone: '3510000000', birthDate: new Date('1990-01-01') } });
    await prisma.clinicalPatient.create({ data: { personId: person.id, registeredById: professional.id } });
    const attention = await prisma.clinicalAttention.create({ data: { personId: person.id, professionalId: professional.id, occurredAt: new Date() } });
    const definition = await catalogs.createTest({ name: `Escala ${token}`, responseType: ClinicalTestResponseType.SCALE, scaleMin: '0.25', scaleMax: '10.5' });
    const first = await evaluations.create(attention.id, professional.id, { bodyAreaOrType: 'Rodilla', results: [{ testDefinitionId: definition.id, side: 'LEFT', value: '4.5' }, { testDefinitionId: definition.id, side: 'RIGHT', value: '5.25' }] });
    await prisma.clinicalTestDefinition.update({ where: { id: definition.id }, data: { scaleMax: '100' } });
    const historical = await evaluations.detail(first.id);
    expect(historical.results).toHaveLength(2);
    expect(historical.results[0]?.definitionSnapshot).toMatchObject({ responseType: 'SCALE', scaleMin: '0.25', scaleMax: '10.5' });
    await evaluations.create(attention.id, professional.id, { bodyAreaOrType: 'Hombro', results: [{ testDefinitionId: definition.id, value: '20' }] });
    expect(await prisma.clinicalEvaluation.count({ where: { attentionId: attention.id } })).toBe(2);
  });

  it('keeps studies, social-work orders and Sala projections separate and historical', async () => {
    const token = suffix();
    const professional = await prisma.internalUser.create({ data: { firstName: 'Profesional', lastName: 'Sintético', email: `${token}@phase3.test`, normalizedEmail: `${token}@phase3.test`, roles: { create: { role: Role.OSTEOPATH } } } });
    const dni = `55${Date.now()}`.slice(0, 12);
    const person = await prisma.person.create({ data: { firstName: 'Paciente', lastName: 'Sintético', dni, normalizedDni: dni, phone: '3510000000', birthDate: new Date('1990-01-01') } });
    const study = await studies.create({ personId: person.id, studyDate: '2026-08-27', studyType: 'Imagen sintética' });
    expect(study.fileAssetId).toBeNull();
    const work = await socialWork.createCatalog(`Cobertura ${token}`);
    const order = await socialWork.createOrder({ personId: person.id, socialWorkId: work.id, reference: 'Referencia libre', issueDate: '2026-08-27', expirationDate: '2026-08-01' });
    expect((await socialWork.listOrders(person.id)).find((item) => item.id === order.id)?.isExpired).toBe(true);
    const indication = await indications.create(professional.id, { personId: person.id, trainingCondition: TrainingCondition.RESTRICTED, affectedArea: 'Rodilla', instructions: 'Carga progresiva sintética' });
    const projection = await indications.safe(person.id);
    expect(projection[0]).toEqual(expect.objectContaining({ id: indication.id, trainingCondition: 'RESTRICTED', affectedArea: 'Rodilla' }));
    expect(projection[0]).not.toHaveProperty('treatmentId');
  });
});
