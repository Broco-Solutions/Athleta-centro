import { Test } from '@nestjs/testing';
import { ClinicalCoverage, ClinicalTestResponseType, Role, TrainingCondition } from '@prisma/client';
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
    await prisma.clinicalService.deleteMany({ where: { name: { startsWith: 'Kinesiología ' } } });
    await prisma.evolution.deleteMany();
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
    await prisma.clinicalAppointment.deleteMany();
    await prisma.salaParticipation.deleteMany({ where: { person: { dni: { startsWith: '55' } } } });
    await prisma.clinicalPatient.deleteMany();
    await prisma.internalUserRole.deleteMany({ where: { internalUser: { email: { contains: '@phase3.test' } } } });
    await prisma.internalUser.deleteMany({ where: { email: { contains: '@phase3.test' } } });
    await prisma.person.deleteMany({ where: { dni: { startsWith: '55' } } });
  });

  it('stores the freely selected positive appointment duration without a billing service', async () => {
    const token = suffix(); const professional = await prisma.internalUser.create({ data: { firstName: 'Profesional', lastName: 'Servicio', email: `${token}@phase3.test`, normalizedEmail: `${token}@phase3.test`, roles: { create: { role: Role.KINESIOLOGIST } } } });
    const dni = `55${Date.now()}`.slice(0, 12); const person = await prisma.person.create({ data: { firstName: 'Paciente', lastName: 'Servicio', dni, normalizedDni: dni, phone: '3510000000', birthDate: new Date('1990-01-01') } }); await prisma.clinicalPatient.create({ data: { personId: person.id, registeredById: professional.id } });
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const appointment = await clinic.create({ personId: person.id, professionalId: professional.id, startAt: future, durationMinutes: 37 });
    expect(appointment).toMatchObject({ durationMinutes: 37, overlapCount: 0 });
    expect((await prisma.clinicalAppointment.findUniqueOrThrow({ where: { id: appointment.id } })).serviceId).toBeNull();
    expect((await clinic.list({ personId: person.id })).some((item) => item.id === appointment.id)).toBe(true);
  });

  it('creates one covered, unbilled Attention on Atendido and removes it again when empty', async () => {
    const token = suffix();
    const professional = await prisma.internalUser.create({ data: { firstName: 'Profesional', lastName: 'Agenda', email: `${token}@phase3.test`, normalizedEmail: `${token}@phase3.test`, roles: { create: { role: Role.KINESIOLOGIST } } } });
    const dni = `55${Date.now()}`.slice(0, 12);
    const person = await prisma.person.create({ data: { firstName: 'Paciente', lastName: 'Agenda', dni, normalizedDni: dni, phone: '3510000000', birthDate: new Date('1990-01-01') } });
    await prisma.clinicalPatient.create({ data: { personId: person.id, registeredById: professional.id } });
    const appointment = await clinic.create({ personId: person.id, professionalId: professional.id, startAt: new Date(Date.now() + 86_400_000).toISOString(), durationMinutes: 45 });

    const attended = await clinic.correct(appointment.id, { status: 'ATTENDED', coverage: ClinicalCoverage.SOCIAL_WORK });
    expect(attended).toMatchObject({ status: 'ATTENDED', hasAttention: true, coverage: 'SOCIAL_WORK' });
    const attention = await prisma.clinicalAttention.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
    expect(attention).toMatchObject({ personId: person.id, professionalId: professional.id, coverage: ClinicalCoverage.SOCIAL_WORK, serviceId: null });
    expect(await prisma.clinicalCharge.count({ where: { attentionId: attention.id } })).toBe(0);
    expect((await prisma.clinicalAppointment.findUniqueOrThrow({ where: { id: appointment.id } })).serviceId).toBeNull();

    const cancelled = await clinic.correct(appointment.id, { status: 'CANCELLED' });
    expect(cancelled).toMatchObject({ status: 'CANCELLED', hasAttention: false });
    expect(await prisma.clinicalAttention.findUnique({ where: { appointmentId: appointment.id } })).toBeNull();
  });

  it('allows manual corrections among the four appointment statuses and preserves dependent Attention history', async () => {
    const token = suffix();
    const professional = await prisma.internalUser.create({ data: { firstName: 'Profesional', lastName: 'Corrección', email: `${token}@phase3.test`, normalizedEmail: `${token}@phase3.test`, roles: { create: { role: Role.KINESIOLOGIST } } } });
    const dni = `55${Date.now()}`.slice(0, 12);
    const person = await prisma.person.create({ data: { firstName: 'Paciente', lastName: 'Corrección', dni, normalizedDni: dni, phone: '3510000000', birthDate: new Date('1990-01-01') } });
    await prisma.clinicalPatient.create({ data: { personId: person.id, registeredById: professional.id } });
    const appointment = await clinic.create({ personId: person.id, professionalId: professional.id, startAt: new Date(Date.now() + 86_400_000).toISOString(), durationMinutes: 60 });

    await expect(clinic.correct(appointment.id, { status: 'ATTENDED' })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'CLINIC_ATTENTION_COVERAGE_REQUIRED' }) });
    await clinic.correct(appointment.id, { status: 'CANCELLED' });
    await clinic.correct(appointment.id, { status: 'SCHEDULED' });
    await clinic.correct(appointment.id, { status: 'ABSENT' });
    await clinic.correct(appointment.id, { status: 'ATTENDED', coverage: ClinicalCoverage.PRIVATE });
    const attention = await prisma.clinicalAttention.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
    await prisma.evolution.create({ data: { attentionId: attention.id, authorId: professional.id, evolutionText: 'Evolución sintética' } });

    await expect(clinic.correct(appointment.id, { status: 'CANCELLED' })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'ATTENTION_HAS_DEPENDENCIES' }) });
    expect(await prisma.clinicalAttention.findUnique({ where: { id: attention.id } })).not.toBeNull();
    expect((await prisma.clinicalAppointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe('ATTENDED');
  });

  it('keeps exactly one Attention when Atendido is requested concurrently', async () => {
    const token = suffix();
    const professional = await prisma.internalUser.create({ data: { firstName: 'Profesional', lastName: 'Concurrencia', email: `${token}@phase3.test`, normalizedEmail: `${token}@phase3.test`, roles: { create: { role: Role.KINESIOLOGIST } } } });
    const dni = `55${Date.now()}`.slice(0, 12);
    const person = await prisma.person.create({ data: { firstName: 'Paciente', lastName: 'Concurrencia', dni, normalizedDni: dni, phone: '3510000000', birthDate: new Date('1990-01-01') } });
    await prisma.clinicalPatient.create({ data: { personId: person.id, registeredById: professional.id } });
    const appointment = await clinic.create({ personId: person.id, professionalId: professional.id, startAt: new Date(Date.now() + 86_400_000).toISOString(), durationMinutes: 60 });

    const results = await Promise.allSettled([
      clinic.correct(appointment.id, { status: 'ATTENDED', coverage: ClinicalCoverage.PRIVATE }),
      clinic.correct(appointment.id, { status: 'ATTENDED', coverage: ClinicalCoverage.PRIVATE }),
    ]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(await prisma.clinicalAttention.count({ where: { appointmentId: appointment.id } })).toBe(1);
    await clinic.correct(appointment.id, { status: 'CANCELLED' });
  });

  it('persists direct attention and returns it from the patient read model', async () => {
    const token = suffix();
    const professional = await prisma.internalUser.create({ data: { firstName: 'Profesional', lastName: 'Atención', email: `${token}@phase3.test`, normalizedEmail: `${token}@phase3.test`, roles: { create: { role: Role.KINESIOLOGIST } } } });
    const dni = `55${Date.now()}`.slice(0, 12);
    const person = await prisma.person.create({ data: { firstName: 'Paciente', lastName: 'Atención', dni, normalizedDni: dni, phone: '3510000000', birthDate: new Date('1990-01-01') } });
    await prisma.clinicalPatient.create({ data: { personId: person.id, registeredById: professional.id } });
    const attention = await clinic.registerDirectAttention({ personId: person.id, professionalId: professional.id, occurredAt: new Date().toISOString(), coverage: ClinicalCoverage.PRIVATE });
    expect(await prisma.clinicalAttention.findUnique({ where: { id: attention.id } })).toEqual(expect.objectContaining({ personId: person.id }));
    expect(await prisma.clinicalCharge.count({ where: { attentionId: attention.id } })).toBe(0);
    expect((await clinic.listAttentions(person.id)).some((item) => item.id === attention.id)).toBe(true);
  });

  it('registers a clinical patient idempotently without changing Sala participation', async () => {
    const token = suffix();
    const professional = await prisma.internalUser.create({ data: { firstName: 'Profesional', lastName: 'Alta', email: `${token}@phase3.test`, normalizedEmail: `${token}@phase3.test`, roles: { create: { role: Role.KINESIOLOGIST } } } });
    const professor = await prisma.internalUser.create({ data: { firstName: 'Profesor', lastName: 'Sala', email: `${token}-sala@phase3.test`, normalizedEmail: `${token}-sala@phase3.test`, roles: { create: { role: Role.PROFESSOR } } } });
    const plan = await prisma.salaPlan.create({ data: { name: `Plan ${token}`, monthlyAmount: 1000 } });
    const dni = `55${Date.now()}`.slice(0, 12);
    const person = await prisma.person.create({ data: { firstName: 'Paciente', lastName: 'Coexistente', dni, normalizedDni: dni, phone: '3510000000', birthDate: new Date('1990-01-01') } });
    const participation = await prisma.salaParticipation.create({ data: { personId: person.id, mainProfessorId: professor.id, planId: plan.id, startDate: new Date('2026-08-01') } });
    await clinic.registerPatient(person.id, professional.id);
    await clinic.registerPatient(person.id, professional.id);
    expect(await prisma.clinicalPatient.count({ where: { personId: person.id } })).toBe(1);
    expect((await prisma.salaParticipation.findUniqueOrThrow({ where: { id: participation.id } })).endDate).toBeNull();
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
