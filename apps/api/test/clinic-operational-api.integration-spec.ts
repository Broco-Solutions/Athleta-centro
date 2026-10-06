import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClinicalAppointmentStatus, ClinicalCoverage, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { InternalUserService } from '../src/team/internal-user.service';

describe('Clinic operational appointments API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: InternalUserService;
  let auth: AuthService;
  const suffix = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  beforeAll(async () => {
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    users = app.get(InternalUserService);
    auth = app.get(AuthService);
  });

  afterEach(async () => {
    if (!prisma) return;
    await prisma.clinicalIncome.deleteMany({ where: { attention: { person: { dni: { startsWith: '56' } } } } });
    await prisma.clinicalCharge.deleteMany({ where: { attention: { person: { dni: { startsWith: '56' } } } } });
    await prisma.clinicalEvaluation.deleteMany({ where: { attention: { person: { dni: { startsWith: '56' } } } } });
    await prisma.evolution.deleteMany({ where: { attention: { person: { dni: { startsWith: '56' } } } } });
    await prisma.clinicalAttention.deleteMany({ where: { person: { dni: { startsWith: '56' } } } });
    await prisma.treatment.deleteMany({ where: { person: { dni: { startsWith: '56' } } } });
    await prisma.clinicalAppointment.deleteMany({ where: { person: { dni: { startsWith: '56' } } } });
    await prisma.clinicalPatient.deleteMany({ where: { person: { dni: { startsWith: '56' } } } });
    await prisma.person.deleteMany({ where: { dni: { startsWith: '56' } } });
    await prisma.authAttemptBucket.deleteMany();
    await prisma.session.deleteMany({ where: { internalUser: { email: { endsWith: '@clinic-operational.test' } } } });
    await prisma.internalCredential.deleteMany({ where: { internalUser: { email: { endsWith: '@clinic-operational.test' } } } });
    await prisma.internalUserRole.deleteMany({ where: { internalUser: { email: { endsWith: '@clinic-operational.test' } } } });
    await prisma.internalUser.deleteMany({ where: { email: { endsWith: '@clinic-operational.test' } } });
  });

  afterAll(() => app?.close());

  async function session(role: Role) {
    const token = suffix();
    const user = await users.create({ firstName: 'API', lastName: role, email: `${token}@clinic-operational.test`, roles: [role] });
    await auth.provisionCredential(user.id, 'ValidPass1!');
    await prisma.internalCredential.update({ where: { internalUserId: user.id }, data: { mustChangePassword: false } });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(200);
    return { cookie: login.headers['set-cookie'][0] as string, csrf: login.body.data.csrfToken as string };
  }

  async function clinicFixture() {
    const token = suffix();
    const professional = await prisma.internalUser.create({
      data: {
        firstName: 'Profesional', lastName: 'Clínico', email: `${token}@clinic-operational.test`, normalizedEmail: `${token}@clinic-operational.test`,
        roles: { create: { role: Role.KINESIOLOGIST } },
      },
    });
    const dni = `56${Date.now()}`.slice(0, 12);
    const person = await prisma.person.create({ data: { firstName: 'Paciente', lastName: 'Operativo', dni, normalizedDni: dni, phone: '3510000000', birthDate: new Date('1990-01-01') } });
    await prisma.clinicalPatient.create({ data: { personId: person.id, registeredById: professional.id } });
    return { professional, person };
  }

  it('allows Administrative to operate safe appointments but never to read clinical history; Professor is forbidden', async () => {
    const administrative = await session(Role.ADMINISTRATIVE);
    const professor = await session(Role.PROFESSOR);
    const { professional, person } = await clinicFixture();
    const future = new Date(Date.now() + 86_400_000).toISOString();

    await request(app.getHttpServer()).get('/api/clinic/professionals').set('Cookie', administrative.cookie).expect(200);
    await request(app.getHttpServer()).get('/api/clinic/professionals').set('Cookie', professor.cookie).expect(403);
    const operationalAttentions = await request(app.getHttpServer()).get('/api/clinic/attentions').set('Cookie', administrative.cookie).expect(200);
    expect(JSON.stringify(operationalAttentions.body)).not.toMatch(/evolutionText|consultationReason|bodyAreaOrInjury|interventionPlan/i);

    const created = await request(app.getHttpServer())
      .post('/api/clinic/appointments').set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf)
      .send({ personId: person.id, professionalId: professional.id, startAt: future, durationMinutes: 37, operationalNote: 'Control operativo' })
      .expect(201);
    expect(created.body.data).toMatchObject({ personId: person.id, professionalId: professional.id, durationMinutes: 37, status: 'SCHEDULED', hasAttention: false });
    expect(JSON.stringify(created.body.data)).not.toMatch(/serviceId|fee|charge|evolutionText|consultationReason/i);

    const attended = await request(app.getHttpServer())
      .post(`/api/clinic/appointments/${created.body.data.id}/correct`).set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf)
      .send({ status: 'ATTENDED', coverage: 'PRIVATE' })
      .expect(201);
    expect(attended.body.data).toMatchObject({ status: 'ATTENDED', coverage: 'PRIVATE', hasAttention: true, hasEvolution: false });
    const attention = await prisma.clinicalAttention.findUniqueOrThrow({ where: { appointmentId: created.body.data.id } });
    expect(attention.serviceId).toBeNull();
    expect(await prisma.clinicalCharge.count({ where: { attentionId: attention.id } })).toBe(0);

    const listed = await request(app.getHttpServer())
      .get(`/api/clinic/appointments?from=${encodeURIComponent('2026-01-01T03:00:00.000Z')}&to=${encodeURIComponent('2030-01-01T03:00:00.000Z')}`)
      .set('Cookie', administrative.cookie)
      .expect(200);
    expect(listed.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.data.id, status: ClinicalAppointmentStatus.ATTENDED, coverage: 'PRIVATE' })]));
    expect(JSON.stringify(listed.body.data)).not.toMatch(/serviceId|fee|charge|evolutionText|consultationReason|bodyAreaOrInjury/i);
  });

  it('enforces coverage and Buenos Aires historical-professional rules for direct attentions', async () => {
    const administrative = await session(Role.ADMINISTRATIVE);
    const professor = await session(Role.PROFESSOR);
    const { professional, person } = await clinicFixture();
    const inactive = await prisma.internalUser.create({ data: { firstName: 'Histórico', lastName: 'Clínico', email: `${suffix()}@clinic-operational.test`, normalizedEmail: `${suffix()}-normalized@clinic-operational.test`, status: 'INACTIVE', roles: { create: { role: Role.OSTEOPATH } } } });
    const now = new Date().toISOString();
    const yesterday = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const future = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const base = { personId: person.id, professionalId: professional.id, occurredAt: now };

    await request(app.getHttpServer()).post('/api/clinic/attentions').set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf).send(base).expect(400);
    await request(app.getHttpServer()).post('/api/clinic/attentions').set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf).send({ ...base, coverage: 'PRIVATE' }).expect(201);
    const social = await request(app.getHttpServer()).post('/api/clinic/attentions').set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf).send({ ...base, coverage: 'SOCIAL_WORK' }).expect(201);
    expect(social.body.data.coverage).toBe('SOCIAL_WORK');
    const historical = await request(app.getHttpServer()).post('/api/clinic/attentions').set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf).send({ personId: person.id, professionalId: inactive.id, occurredAt: yesterday, coverage: 'PRIVATE' }).expect(201);
    await request(app.getHttpServer()).post('/api/clinic/attentions').set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf).send({ personId: person.id, professionalId: inactive.id, occurredAt: now, coverage: 'PRIVATE' }).expect(400);
    await request(app.getHttpServer()).post('/api/clinic/attentions').set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf).send({ ...base, occurredAt: future, coverage: 'PRIVATE' }).expect(400);
    await request(app.getHttpServer()).post('/api/clinic/attentions').set('Cookie', professor.cookie).set('x-csrf-token', professor.csrf).send({ ...base, coverage: 'PRIVATE' }).expect(403);

    const updated = await request(app.getHttpServer()).patch(`/api/clinic/attentions/${historical.body.data.id}`).set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf).send({ occurredAt: yesterday, professionalId: inactive.id, coverage: 'SOCIAL_WORK' }).expect(200);
    expect(updated.body.data).toMatchObject({ coverage: 'SOCIAL_WORK', origin: 'DIRECT' });
    await request(app.getHttpServer()).delete(`/api/clinic/attentions/${historical.body.data.id}`).set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf).expect(200);
  });

  it('keeps evolution authorship, protects clinical actions, and blocks deleting dependent attentions', async () => {
    const administrative = await session(Role.ADMINISTRATIVE);
    const kinesio = await session(Role.KINESIOLOGIST);
    const osteopath = await session(Role.OSTEOPATH);
    const general = await session(Role.GENERAL_ADMIN);
    const professor = await session(Role.PROFESSOR);
    const { professional, person } = await clinicFixture();
    const direct = await request(app.getHttpServer()).post('/api/clinic/attentions').set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf)
      .send({ personId: person.id, professionalId: professional.id, occurredAt: new Date().toISOString(), coverage: ClinicalCoverage.PRIVATE }).expect(201);
    const attentionId = direct.body.data.id as string;

    const safeList = await request(app.getHttpServer()).get(`/api/clinic/attentions?personId=${person.id}`).set('Cookie', administrative.cookie).expect(200);
    expect(safeList.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: attentionId, origin: 'DIRECT', coverage: 'PRIVATE' })]));
    for (const forbidden of ['evolution', 'consultationReason', 'bodyArea', 'injury', 'antecedents', 'studies', 'evaluation', 'interventionPlan', 'treatment']) {
      expect(JSON.stringify(safeList.body.data)).not.toContain(forbidden);
    }
    await request(app.getHttpServer()).get(`/api/clinic/attentions/${attentionId}/evolution`).set('Cookie', administrative.cookie).expect(403);
    await request(app.getHttpServer()).post(`/api/clinic/attentions/${attentionId}/evolution`).set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf).send({ evolutionText: 'No autorizado' }).expect(403);
    await request(app.getHttpServer()).post(`/api/clinic/attentions/${attentionId}/evolution`).set('Cookie', professor.cookie).set('x-csrf-token', professor.csrf).send({ evolutionText: 'No autorizado' }).expect(403);

    for (const body of [{ evolutionText: 'Evolución' }, { practicesOrManeuvers: 'Maniobras' }, { indicationsOrNextSteps: 'Indicaciones' }]) {
      const candidate = await request(app.getHttpServer()).post('/api/clinic/attentions').set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf)
        .send({ personId: person.id, professionalId: professional.id, occurredAt: new Date().toISOString(), coverage: 'PRIVATE' }).expect(201);
      await request(app.getHttpServer()).post(`/api/clinic/attentions/${candidate.body.data.id}/evolution`).set('Cookie', kinesio.cookie).set('x-csrf-token', kinesio.csrf).send(body).expect(201);
    }
    await request(app.getHttpServer()).post(`/api/clinic/attentions/${attentionId}/evolution`).set('Cookie', kinesio.cookie).set('x-csrf-token', kinesio.csrf)
      .send({ evolutionText: 'Evolución original', practicesOrManeuvers: 'Práctica original' }).expect(201);
    const original = await prisma.evolution.findUniqueOrThrow({ where: { attentionId } });
    const duplicate = await request(app.getHttpServer()).post(`/api/clinic/attentions/${attentionId}/evolution`).set('Cookie', general.cookie).set('x-csrf-token', general.csrf)
      .send({ evolutionText: 'Duplicada' }).expect(409);
    expect(duplicate.body.code).toBe('EVOLUTION_ALREADY_EXISTS');
    const emptyEvolution = await request(app.getHttpServer()).post(`/api/clinic/attentions/${attentionId}/evolution`).set('Cookie', kinesio.cookie).set('x-csrf-token', kinesio.csrf)
      .send({ evolutionText: '  ', practicesOrManeuvers: ' ', indicationsOrNextSteps: '\t' }).expect(400);
    expect(emptyEvolution.body.code).toBe('EVOLUTION_CONTENT_REQUIRED');

    await request(app.getHttpServer()).patch(`/api/clinic/attentions/${attentionId}`).set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf)
      .send({ occurredAt: new Date(Date.now() - 60_000).toISOString(), professionalId: professional.id, coverage: 'SOCIAL_WORK' }).expect(200);
    const unchanged = await prisma.evolution.findUniqueOrThrow({ where: { attentionId } });
    expect(unchanged).toMatchObject({ authorId: original.authorId, evolutionText: original.evolutionText, practicesOrManeuvers: original.practicesOrManeuvers });
    expect(unchanged.createdAt).toEqual(original.createdAt);
    expect(await prisma.clinicalCharge.count({ where: { attentionId } })).toBe(0);
    expect(await prisma.clinicalIncome.count({ where: { attentionId } })).toBe(0);
    const corrected = await request(app.getHttpServer()).patch(`/api/clinic/evolutions/${original.id}`).set('Cookie', osteopath.cookie).set('x-csrf-token', osteopath.csrf)
      .send({ indicationsOrNextSteps: 'Nuevo próximo paso' }).expect(200);
    expect(corrected.body.data).toMatchObject({ authorId: original.authorId, lastModifiedById: expect.any(String), indicationsOrNextSteps: 'Nuevo próximo paso' });
    expect(new Date(corrected.body.data.createdAt)).toEqual(original.createdAt);

    const treatment = await prisma.treatment.create({ data: { personId: person.id, responsibleProfessionalId: professional.id, consultationReason: 'Motivo', bodyAreaOrInjury: 'Zona', startDate: new Date('2026-01-01') } });
    await request(app.getHttpServer()).post(`/api/clinic/attentions/${attentionId}/treatment`).set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf).send({ treatmentId: treatment.id }).expect(403);
    await request(app.getHttpServer()).post(`/api/clinic/attentions/${attentionId}/treatment`).set('Cookie', kinesio.cookie).set('x-csrf-token', kinesio.csrf).send({ treatmentId: treatment.id }).expect(201);
    expect((await prisma.clinicalAttention.findUniqueOrThrow({ where: { id: attentionId } })).treatmentId).toBe(treatment.id);
    const blockedDeletion = await request(app.getHttpServer()).delete(`/api/clinic/attentions/${attentionId}`).set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf)
      .expect(409);
    expect(blockedDeletion.body.code).toBe('ATTENTION_HAS_DEPENDENCIES');
    expect(await prisma.clinicalAttention.count({ where: { id: attentionId } })).toBe(1);
    await request(app.getHttpServer()).post(`/api/clinic/attentions/${attentionId}/treatment`).set('Cookie', kinesio.cookie).set('x-csrf-token', kinesio.csrf).send({ treatmentId: null }).expect(201);
  });

  it('blocks deletion for evaluations, charges and incomes, and rejects a treatment from another person', async () => {
    const administrative = await session(Role.ADMINISTRATIVE);
    const kinesio = await session(Role.KINESIOLOGIST);
    const { professional, person } = await clinicFixture();
    const create = async () => (await request(app.getHttpServer()).post('/api/clinic/attentions').set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf)
      .send({ personId: person.id, professionalId: professional.id, occurredAt: new Date().toISOString(), coverage: 'PRIVATE' }).expect(201)).body.data.id as string;
    const evaluationAttention = await create();
    const evaluation = await prisma.clinicalEvaluation.create({ data: { attentionId: evaluationAttention, authorId: professional.id, bodyAreaOrType: 'Rodilla' } });
    const blockedEvaluation = await request(app.getHttpServer()).delete(`/api/clinic/attentions/${evaluationAttention}`).set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf).expect(409);
    expect(blockedEvaluation.body.code).toBe('ATTENTION_HAS_DEPENDENCIES');
    expect(await prisma.clinicalAttention.count({ where: { id: evaluationAttention } })).toBe(1);
    expect(await prisma.clinicalEvaluation.count({ where: { id: evaluation.id } })).toBe(1);

    const service = await prisma.clinicalService.create({ data: { name: `Servicio ${suffix()}`, normalizedName: `servicio-${suffix()}`, durationMinutes: 60, feeArs: 1000 } });
    const chargeAttention = await create();
    const charge = await prisma.clinicalCharge.create({ data: { attentionId: chargeAttention, personId: person.id, serviceId: service.id, concept: 'Histórico', totalAmount: 1000, patientAmount: 1000, socialWorkAmount: 0 } });
    const blockedCharge = await request(app.getHttpServer()).delete(`/api/clinic/attentions/${chargeAttention}`).set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf).expect(409);
    expect(blockedCharge.body.code).toBe('ATTENTION_HAS_DEPENDENCIES');
    expect(await prisma.clinicalAttention.count({ where: { id: chargeAttention } })).toBe(1);
    expect(await prisma.clinicalCharge.count({ where: { id: charge.id } })).toBe(1);

    const paymentMethod = await prisma.paymentMethod.create({ data: { name: `Método ${suffix()}` } });
    const incomeAttention = await create();
    const income = await prisma.clinicalIncome.create({ data: { personId: person.id, attentionId: incomeAttention, cashDate: new Date('2026-01-01'), amount: 1000, paymentMethodId: paymentMethod.id, payer: 'PATIENT', registeredById: professional.id, operationId: randomUUID() } });
    const blockedIncome = await request(app.getHttpServer()).delete(`/api/clinic/attentions/${incomeAttention}`).set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf).expect(409);
    expect(blockedIncome.body.code).toBe('ATTENTION_HAS_DEPENDENCIES');
    expect(await prisma.clinicalAttention.count({ where: { id: incomeAttention } })).toBe(1);
    expect(await prisma.clinicalIncome.count({ where: { id: income.id } })).toBe(1);

    const otherDni = `56${Math.floor(Math.random() * 10_000_000_000)}`.slice(0, 12);
    const other = await prisma.person.create({ data: { firstName: 'Otra', lastName: 'Persona', dni: otherDni, normalizedDni: otherDni, phone: '3510000001', birthDate: new Date('1991-01-01') } });
    const otherTreatment = await prisma.treatment.create({ data: { personId: other.id, responsibleProfessionalId: professional.id, consultationReason: 'Otro', bodyAreaOrInjury: 'Otra zona', startDate: new Date('2026-01-01') } });
    const unattached = await create();
    const mismatch = await request(app.getHttpServer()).post(`/api/clinic/attentions/${unattached}/treatment`).set('Cookie', kinesio.cookie).set('x-csrf-token', kinesio.csrf).send({ treatmentId: otherTreatment.id }).expect(400);
    expect(mismatch.body.code).toBe('ATTENTION_TREATMENT_PERSON_MISMATCH');
    expect((await prisma.clinicalAttention.findUniqueOrThrow({ where: { id: unattached } })).treatmentId).toBeNull();
    expect(await prisma.treatment.count({ where: { id: otherTreatment.id } })).toBe(1);
  });

  it('derives last attention from direct and attended-appointment attentions and falls back after deletion', async () => {
    const administrative = await session(Role.ADMINISTRATIVE);
    const { professional, person } = await clinicFixture();
    const oldAt = new Date(Date.now() - 3 * 86_400_000);
    const recentAt = new Date(Date.now() - 2 * 86_400_000);
    const old = await prisma.clinicalAttention.create({ data: { personId: person.id, professionalId: professional.id, occurredAt: oldAt, coverage: 'PRIVATE' } });
    const recent = await prisma.clinicalAttention.create({ data: { personId: person.id, professionalId: professional.id, occurredAt: recentAt, coverage: 'SOCIAL_WORK' } });
    const overview = async () => (await request(app.getHttpServer()).get('/api/clinic/patients/overview?page=1&pageSize=25').set('Cookie', administrative.cookie).expect(200)).body.data.find((row: { id: string }) => row.id === person.id);
    expect((await overview()).lastAttentionAt).toBe(recentAt.toISOString());
    await prisma.evolution.create({ data: { attentionId: recent.id, authorId: professional.id, evolutionText: 'No modifica fecha' } });
    expect((await overview()).lastAttentionAt).toBe(recentAt.toISOString());
    await prisma.evolution.delete({ where: { attentionId: recent.id } });
    await request(app.getHttpServer()).delete(`/api/clinic/attentions/${recent.id}`).set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf).expect(200);
    expect((await overview()).lastAttentionAt).toBe(oldAt.toISOString());
    await request(app.getHttpServer()).delete(`/api/clinic/attentions/${old.id}`).set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf).expect(200);
    expect((await overview()).lastAttentionAt).toBeNull();
  });

  it('uses the attention created by correcting an appointment to ATTENDED as the patient last attention', async () => {
    const administrative = await session(Role.ADMINISTRATIVE);
    const { professional, person } = await clinicFixture();
    const startAt = new Date(Date.now() + 86_400_000).toISOString();
    const appointment = await request(app.getHttpServer()).post('/api/clinic/appointments').set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf)
      .send({ personId: person.id, professionalId: professional.id, startAt, durationMinutes: 60 }).expect(201);
    await request(app.getHttpServer()).post(`/api/clinic/appointments/${appointment.body.data.id}/correct`).set('Cookie', administrative.cookie).set('x-csrf-token', administrative.csrf)
      .send({ status: 'ATTENDED', coverage: 'PRIVATE' }).expect(201);
    const attention = await prisma.clinicalAttention.findUniqueOrThrow({ where: { appointmentId: appointment.body.data.id } });
    expect(await prisma.clinicalAttention.count({ where: { appointmentId: appointment.body.data.id } })).toBe(1);
    expect(await prisma.evolution.count({ where: { attentionId: attention.id } })).toBe(0);
    expect(await prisma.clinicalEvaluation.count({ where: { attentionId: attention.id } })).toBe(0);
    const overview = await request(app.getHttpServer()).get('/api/clinic/patients/overview?page=1&pageSize=25').set('Cookie', administrative.cookie).expect(200);
    const patient = overview.body.data.find((row: { id: string }) => row.id === person.id) as { lastAttentionAt: string | null };
    expect(patient.lastAttentionAt).toBe(attention.occurredAt.toISOString());
  });
  it.each([Role.PROFESSOR, Role.KINESIOLOGIST, Role.OSTEOPATH, Role.ADMINISTRATIVE, Role.GENERAL_ADMIN])('applies catalog permissions for %s independently of order permissions', async (role) => {
    const user = await session(role);
    const canManage = role === Role.ADMINISTRATIVE || role === Role.GENERAL_ADMIN;
    const work = await prisma.socialWork.create({ data: { name: 'Catalog fixture', normalizedName: `catalog-${suffix()}` } });
    const listed = await request(app.getHttpServer()).get('/api/clinic/social-works').set('Cookie', user.cookie).expect(200);
    expect(listed.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: work.id, name: work.name })]));
    const created = await request(app.getHttpServer()).post('/api/clinic/social-works').set('Cookie', user.cookie).set('x-csrf-token', user.csrf).send({ name: `Catalog ${suffix()}` }).expect(canManage ? 201 : 403);
    await request(app.getHttpServer()).patch(`/api/clinic/social-works/${work.id}/retire`).set('Cookie', user.cookie).set('x-csrf-token', user.csrf).expect(canManage ? 200 : 403);
    expect((await prisma.socialWork.findUniqueOrThrow({ where: { id: work.id } })).isSelectable).toBe(!canManage);
    await prisma.socialWork.delete({ where: { id: work.id } });
    if (canManage) await prisma.socialWork.delete({ where: { id: created.body.data.id } });
  });

});
