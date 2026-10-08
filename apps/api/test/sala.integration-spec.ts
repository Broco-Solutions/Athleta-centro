import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Role, type SalaWeekday } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { InternalUserService } from '../src/team/internal-user.service';
import { SalaService } from '../src/sala/sala.service';

describe('Sala configuration API', () => {
  let app: INestApplication; let prisma: PrismaService; let users: InternalUserService; let auth: AuthService; let sala: SalaService;
  async function cleanSalaFixtures() { await prisma.salaPaymentReversal.deleteMany(); await prisma.salaPaymentAllocation.deleteMany(); await prisma.salaPayment.deleteMany(); await prisma.clinicalPatient.deleteMany(); await prisma.physicalTestResult.deleteMany(); await prisma.physicalEvaluation.deleteMany(); await prisma.physicalTestDefinition.deleteMany(); await prisma.routineExercise.deleteMany(); await prisma.routineDay.deleteMany(); await prisma.routine.deleteMany(); await prisma.exerciseDefinition.deleteMany(); await prisma.salaOccurrence.deleteMany(); await prisma.oneOffReservation.deleteMany(); await prisma.fixedSalaBooking.deleteMany(); await prisma.salaServiceType.deleteMany(); await prisma.salaCharge.deleteMany(); await prisma.salaBillingConfiguration.deleteMany(); await prisma.salaParticipation.deleteMany(); await prisma.salaScheduleException.deleteMany(); await prisma.salaScheduleSlot.deleteMany(); await prisma.salaPlan.deleteMany(); await prisma.salaConfiguration.deleteMany(); await prisma.session.deleteMany(); await prisma.internalCredential.deleteMany(); await prisma.internalUserRole.deleteMany(); await prisma.internalUser.deleteMany(); await prisma.portalCredential.deleteMany(); await prisma.person.deleteMany(); }
  beforeAll(async () => { app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication(); app.use(cookieParser()); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); app.setGlobalPrefix('api'); await app.init(); prisma = app.get(PrismaService); users = app.get(InternalUserService); auth = app.get(AuthService); sala = app.get(SalaService); await cleanSalaFixtures(); });
  afterEach(cleanSalaFixtures);
  afterAll(() => app.close());
  const uniqueDni = () => `${Date.now()}${Math.floor(Math.random() * 100000)}`.slice(-12);
  async function session(role: Role) { const user = await users.create({ firstName: 'Sala', lastName: 'User', email: `${role.toLowerCase()}@sala.test`, roles: [role] }); await auth.provisionCredential(user.id, 'ValidPass1!'); await prisma.internalCredential.update({ where: { internalUserId: user.id }, data: { mustChangePassword: false } }); const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(200); return { cookie: login.headers['set-cookie'][0] as string, csrf: login.body.data.csrfToken as string }; }
  it('configures positive capacity, plans, slots and explicit closure/override exceptions', async () => {
    const authn = await session(Role.ADMINISTRATIVE);
    const service = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 });
    await request(app.getHttpServer()).patch('/api/sala/configuration').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ capacity: 12 }).expect(200);
    const plan = await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'Mensual', monthlyAmount: 30000, serviceTypeIds: [service.id] }).expect(201);
    expect(plan.body.data.monthlyAmount).toBe('30000');
    const slot = await request(app.getHttpServer()).post('/api/sala/schedule').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ weekday: 'MONDAY', startTime: '09:00', durationMinutes: 60 }).expect(201);
    await request(app.getHttpServer()).post(`/api/sala/schedule/${slot.body.data.id}/exceptions`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ date: '2026-09-01', type: 'CLOSURE' }).expect(201);
    const override = await request(app.getHttpServer()).post(`/api/sala/schedule/${slot.body.data.id}/exceptions`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ date: '2026-09-02', type: 'CAPACITY_OVERRIDE', capacityOverride: 4 }).expect(201);
    expect(override.body.data.capacityOverride).toBe(4);
  });
  it('rejects non-positive capacities and overlapping slots', async () => {
    const authn = await session(Role.PROFESSOR);
    await request(app.getHttpServer()).patch('/api/sala/configuration').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ capacity: 0 }).expect(400);
    await request(app.getHttpServer()).post('/api/sala/schedule').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ weekday: 'TUESDAY', startTime: '09:00', durationMinutes: 60, specificCapacity: 0 }).expect(400);
    await request(app.getHttpServer()).post('/api/sala/schedule').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ weekday: 'TUESDAY', startTime: '09:00', durationMinutes: 60 }).expect(201);
    const overlap = await request(app.getHttpServer()).post('/api/sala/schedule').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ weekday: 'TUESDAY', startTime: '09:30', durationMinutes: 30 }).expect(409);
    expect(overlap.body.code).toBe('SALA_SCHEDULE_OVERLAP');
  });
  it('replaces the complete weekly configuration atomically, including closed days and split ranges', async () => {
    const authn = await session(Role.ADMINISTRATIVE);
    const weekly = { windows: [
      { weekday: 'MONDAY', startTime: '08:00', durationMinutes: 240 },
      { weekday: 'MONDAY', startTime: '16:00', durationMinutes: 240 },
      { weekday: 'TUESDAY', startTime: '08:00', durationMinutes: 720 },
    ] };
    await request(app.getHttpServer()).put('/api/sala/schedule/week').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(weekly).expect(200);
    const listed = await request(app.getHttpServer()).get('/api/sala/schedule').set('Cookie', authn.cookie).expect(200);
    expect(listed.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ weekday: 'MONDAY' }), expect.objectContaining({ weekday: 'TUESDAY' })]));
    expect(listed.body.data.filter((slot: { weekday: string }) => slot.weekday === 'SUNDAY')).toHaveLength(0);
    await request(app.getHttpServer()).put('/api/sala/schedule/week').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ windows: [{ weekday: 'MONDAY', startTime: '08:00', durationMinutes: 240 }, { weekday: 'MONDAY', startTime: '11:00', durationMinutes: 120 }] }).expect(409);
    const afterRejected = await request(app.getHttpServer()).get('/api/sala/schedule').set('Cookie', authn.cookie).expect(200);
    expect(afterRejected.body.data).toHaveLength(3);
  });
  it('enforces catalog permissions independently from schedule permissions', async () => {
    const authn = await session(Role.PROFESSOR);
    const service = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 });
    const plan = await prisma.salaPlan.create({ data: { name: 'Disponible', monthlyAmount: 1000 } });
    await request(app.getHttpServer()).get('/api/sala/plans').set('Cookie', authn.cookie).expect(200);
    await request(app.getHttpServer()).get('/api/team/users').set('Cookie', authn.cookie).expect(403);
    await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'No', monthlyAmount: 1, serviceTypeIds: [service.id] }).expect(403);
    await request(app.getHttpServer()).patch(`/api/sala/plans/${plan.id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'No', monthlyAmount: 1, serviceTypeIds: [service.id] }).expect(403);
    await request(app.getHttpServer()).post(`/api/sala/plans/${plan.id}/retire`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).expect(403);
    expect(await prisma.salaPlan.findUnique({ where: { id: plan.id } })).toMatchObject({ name: 'Disponible', isSelectable: true });
  });
  it.each([Role.ADMINISTRATIVE, Role.GENERAL_ADMIN])('preserves plan reading and administration for %s', async (role) => {
    const authn = await session(role);
    const service = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 });
    const created = await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'Mensual', monthlyAmount: 1000, serviceTypeIds: [service.id] }).expect(201);
    await request(app.getHttpServer()).get('/api/sala/plans').set('Cookie', authn.cookie).expect(200);
    await request(app.getHttpServer()).patch(`/api/sala/plans/${created.body.data.id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'Actualizado', monthlyAmount: 2000, serviceTypeIds: [service.id] }).expect(200);
    await request(app.getHttpServer()).post(`/api/sala/plans/${created.body.data.id}/retire`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).expect(201);
  });
  it('creates and lists plans with sorted service projections and persisted links', async () => {
    const authn = await session(Role.ADMINISTRATIVE);
    const muscle = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 });
    const functional = await sala.createServiceType({ name: 'Funcional', durationMinutes: 45 });
    const created = await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf)
      .send({ name: ' Plan Base ', monthlyAmount: 20000, serviceTypeIds: [muscle.id, functional.id] }).expect(201);
    const expectedServices = [functional, muscle].map(({ id, name, durationMinutes, isSelectable }) => ({ id, name, durationMinutes, isSelectable }));
    expect(created.body.data).toMatchObject({ name: 'Plan Base', monthlyAmount: '20000', services: expectedServices });
    expect(await prisma.salaPlanService.findMany({ where: { planId: created.body.data.id } })).toEqual(expect.arrayContaining([
      { planId: created.body.data.id, serviceTypeId: muscle.id }, { planId: created.body.data.id, serviceTypeId: functional.id },
    ]));
    expect(await prisma.salaPlanService.count({ where: { planId: created.body.data.id } })).toBe(2);
    const old = await prisma.salaPlan.create({ data: { name: 'Plan anterior', monthlyAmount: 1000 } });
    const listed = await request(app.getHttpServer()).get('/api/sala/plans').set('Cookie', authn.cookie).expect(200);
    expect(listed.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.body.data.id, services: expectedServices }),
      expect.objectContaining({ id: old.id, services: [] }),
    ]));
    // The same service can belong to multiple plans.
    await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf)
      .send({ name: 'Otro Plan', monthlyAmount: 30000, serviceTypeIds: [muscle.id] }).expect(201);
    expect(await prisma.salaPlanService.count({ where: { serviceTypeId: muscle.id } })).toBe(2);
  });
  it('replaces the complete plan service set atomically with the plan fields', async () => {
    const authn = await session(Role.ADMINISTRATIVE);
    const muscle = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 });
    const functional = await sala.createServiceType({ name: 'Funcional', durationMinutes: 45 });
    const calisthenics = await sala.createServiceType({ name: 'Calistenia', durationMinutes: 60 });
    const plan = await sala.createPlan({ name: 'Plan Base', monthlyAmount: 20000, serviceTypeIds: [muscle.id, functional.id] });
    const updated = await request(app.getHttpServer()).patch(`/api/sala/plans/${plan.id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf)
      .send({ name: 'Plan editado', monthlyAmount: 25000, isSelectable: false, serviceTypeIds: [muscle.id, calisthenics.id] }).expect(200);
    expect(updated.body.data).toMatchObject({ name: 'Plan editado', monthlyAmount: '25000', isSelectable: false,
      services: [expect.objectContaining({ id: calisthenics.id }), expect.objectContaining({ id: muscle.id })] });
    const links = await prisma.salaPlanService.findMany({ where: { planId: plan.id } });
    expect(links.map((link) => link.serviceTypeId).sort()).toEqual([muscle.id, calisthenics.id].sort());
    expect(await prisma.salaPlan.findUnique({ where: { id: plan.id } })).toMatchObject({ name: 'Plan editado', isSelectable: false });
  });
  it.each(['missing', 'empty', 'duplicate', 'not-uuid'])('rejects %s service arrays without creating a plan', async (invalid) => {
    const authn = await session(Role.ADMINISTRATIVE);
    const service = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 });
    const ids = invalid === 'empty' ? [] : invalid === 'duplicate' ? [service.id, service.id] : ['invalid'];
    await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf)
      .send({ name: 'Inválido', monthlyAmount: 20000, ...(invalid === 'missing' ? {} : { serviceTypeIds: ids }) }).expect(400);
    expect(await prisma.salaPlan.count()).toBe(0);
    expect(await prisma.salaPlanService.count()).toBe(0);
  });
  it.each(['unknown', 'retired'])('rejects %s services on create/update and preserves the persisted plan', async (invalid) => {
    const authn = await session(Role.GENERAL_ADMIN);
    const muscle = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 });
    const retired = await sala.createServiceType({ name: 'Funcional', durationMinutes: 45 });
    await sala.retireServiceType(retired.id);
    const invalidId = invalid === 'unknown' ? crypto.randomUUID() : retired.id;
    const plan = await sala.createPlan({ name: 'Plan Base', monthlyAmount: 20000, serviceTypeIds: [muscle.id] });
    const before = await prisma.salaPlan.findUnique({ where: { id: plan.id } });
    const beforeLinks = await prisma.salaPlanService.findMany({ where: { planId: plan.id } });
    const created = await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf)
      .send({ name: 'Inválido', monthlyAmount: 30000, serviceTypeIds: [muscle.id, invalidId] }).expect(400);
    expect(created.body.code).toBe('SALA_PLAN_SERVICE_INVALID');
    expect(await prisma.salaPlan.count()).toBe(1);
    const updated = await request(app.getHttpServer()).patch(`/api/sala/plans/${plan.id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf)
      .send({ name: 'No guardar', monthlyAmount: 30000, isSelectable: false, serviceTypeIds: [muscle.id, invalidId] }).expect(400);
    expect(updated.body.code).toBe('SALA_PLAN_SERVICE_INVALID');
    expect(await prisma.salaPlan.findUnique({ where: { id: plan.id } })).toEqual(before);
    expect(await prisma.salaPlanService.findMany({ where: { planId: plan.id } })).toEqual(beforeLinks);
    expect(await prisma.salaPlanService.count()).toBe(1);
  });
  it('preserves linked services when a service or plan is retired', async () => {
    const authn = await session(Role.ADMINISTRATIVE);
    const service = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 });
    const plan = await sala.createPlan({ name: 'Plan Base', monthlyAmount: 20000, serviceTypeIds: [service.id] });
    await sala.retireServiceType(service.id);
    expect((await sala.listPlans())[0]?.services).toEqual([{ id: service.id, name: service.name, durationMinutes: 60, isSelectable: false }]);
    await sala.retirePlan(plan.id);
    expect(await prisma.salaPlan.findUnique({ where: { id: plan.id } })).toMatchObject({ name: plan.name, isSelectable: false });
    expect(await prisma.salaPlanService.count({ where: { planId: plan.id, serviceTypeId: service.id } })).toBe(1);
    expect(await sala.listPlans()).toEqual([]);

    const activeService = await sala.createServiceType({ name: 'Funcional', durationMinutes: 45 });
    const replacement = await sala.createPlan({ name: plan.name, monthlyAmount: 25000, serviceTypeIds: [activeService.id] });
    expect(replacement.id).not.toBe(plan.id);
    expect(await sala.listPlans()).toEqual([replacement]);
    const listed = await request(app.getHttpServer()).get('/api/sala/plans').set('Cookie', authn.cookie).expect(200);
    expect(listed.body.data).toEqual([expect.objectContaining({ id: replacement.id, name: plan.name, isSelectable: true })]);
    const duplicate = await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf)
      .send({ name: '  PLAN BASE  ', monthlyAmount: 30000, serviceTypeIds: [activeService.id] }).expect(409);
    expect(duplicate.body.code).toBe('SALA_PLAN_DUPLICATE');
    expect(await prisma.salaPlan.count()).toBe(2);
    expect(await prisma.salaPlan.findUnique({ where: { id: plan.id } })).toMatchObject({ name: plan.name, isSelectable: false });
    expect(await prisma.salaPlanService.findMany({ where: { planId: plan.id } })).toEqual([{ planId: plan.id, serviceTypeId: service.id }]);
  });
  it('lists only eligible professors with the minimum Sala projection', async () => {
    const authn = await session(Role.PROFESSOR);
    const active = await users.create({ firstName: 'Ana', lastName: 'Alfa', email: 'active@sala.test', roles: [Role.PROFESSOR] });
    const inactive = await users.create({ firstName: 'Ina', lastName: 'Inactiva', email: 'inactive@sala.test', roles: [Role.PROFESSOR] });
    await prisma.internalUser.update({ where: { id: inactive.id }, data: { status: 'INACTIVE' } });
    const admin = await users.create({ firstName: 'Admin', lastName: 'Administrativa', email: 'admin@sala.test', roles: [Role.ADMINISTRATIVE] });
    const multi = await users.create({ firstName: 'Ana', lastName: 'Zeta', email: 'multi@sala.test', roles: [Role.PROFESSOR, Role.KINESIOLOGIST] });
    const clinical = await session(Role.KINESIOLOGIST);
    const response = await request(app.getHttpServer()).get('/api/sala/professors').set('Cookie', authn.cookie).expect(200);
    expect(response.body.data).toEqual([{ id: active.id, firstName: 'Ana', lastName: 'Alfa' }, expect.objectContaining({ firstName: 'Sala', lastName: 'User' }), { id: multi.id, firstName: 'Ana', lastName: 'Zeta' }]);
    for (const option of response.body.data) expect(Object.keys(option).sort()).toEqual(['firstName', 'id', 'lastName']);
    for (const excluded of [inactive.id, admin.id]) expect(response.body.data.map((option: { id: string }) => option.id)).not.toContain(excluded);
    expect(JSON.stringify(response.body)).not.toMatch(/email|phone|dni|address|credential|password|roles|status|birthDate|profession/);
    await request(app.getHttpServer()).get('/api/sala/professors').set('Cookie', clinical.cookie).expect(403);
  });
  const studentPayload = { firstName: 'Ana', lastName: 'Sintética', dni: '30123456', phone: '(341) 555-1234', birthDate: '1990-01-01', emergencyContactName: 'Contacto', emergencyContactPhone: '11 1234-5678' };
  const operationalToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  it.each([false, true])('creates a new Sala student atomically as Professor and returns the PIN only once (billing=%s)', async (billing) => {
    const authn = await session(Role.PROFESSOR);
    const professor = await prisma.internalUser.findFirstOrThrow({ where: { roles: { some: { role: Role.PROFESSOR } } } });
    const plan = await prisma.salaPlan.create({ data: { name: 'Alta', monthlyAmount: 1000 } });
    if (billing) await prisma.salaBillingConfiguration.create({ data: { id: 'default', cutoverDate: new Date(`${operationalToday()}T00:00:00Z`) } });
    const result = await request(app.getHttpServer()).post('/api/sala/students').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ ...studentPayload, planId: plan.id, mainProfessorId: professor.id }).expect(201);
    expect(result.body.data).toMatchObject({ dni: '30123456', phone: '3415551234', hasSalaParticipation: true, contexts: ['SALA'], status: 'ACTIVE' });
    expect(result.body.data.initialPin).toMatch(/^\d{4}$/);
    const id = result.body.data.id as string;
    expect(await prisma.person.count({ where: { id } })).toBe(1);
    expect(await prisma.portalCredential.count({ where: { personId: id } })).toBe(1);
    const credential = await prisma.portalCredential.findUniqueOrThrow({ where: { personId: id } });
    expect(credential.pinHash).not.toBe(result.body.data.initialPin);
    expect(credential.mustChangePin).toBe(true);
    const participations = await prisma.salaParticipation.findMany({ where: { personId: id, endDate: null }, include: { planAssignments: true } });
    expect(participations).toHaveLength(1);
    expect(participations[0]).toMatchObject({ mainProfessorId: professor.id, planId: plan.id, startDate: new Date(`${operationalToday()}T00:00:00Z`) });
    expect(participations[0]?.planAssignments).toHaveLength(1);
    expect(participations[0]?.planAssignments[0]).toMatchObject({ planId: plan.id, effectiveFrom: new Date(`${operationalToday()}T00:00:00Z`) });
    const charges = await prisma.salaCharge.findMany({ where: { personId: id } });
    expect(charges).toHaveLength(billing ? 1 : 0);
    if (billing) expect(charges[0]).toMatchObject({ salaParticipationId: participations[0]?.id, planId: plan.id, kind: 'MONTHLY', planNameSnapshot: plan.name, chargeDate: new Date(`${operationalToday()}T00:00:00Z`) });
    const read = await request(app.getHttpServer()).get(`/api/people/${id}`).set('Cookie', authn.cookie).expect(200);
    expect(read.body.data.initialPin).toBeUndefined();
  });
  it.each(['professor', 'plan'])('rolls back Person, credential and participation on invalid %s', async (invalid) => {
    const authn = await session(Role.PROFESSOR);
    const professor = await prisma.internalUser.findFirstOrThrow({ where: { roles: { some: { role: Role.PROFESSOR } } } });
    const plan = await prisma.salaPlan.create({ data: { name: 'Rollback alta', monthlyAmount: 1000, isSelectable: invalid !== 'plan' } });
    const counts = { people: await prisma.person.count(), credentials: await prisma.portalCredential.count(), participations: await prisma.salaParticipation.count(), assignments: await prisma.salaPlanAssignment.count(), charges: await prisma.salaCharge.count() };
    const result = await request(app.getHttpServer()).post('/api/sala/students').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ ...studentPayload, mainProfessorId: invalid === 'professor' ? crypto.randomUUID() : professor.id, planId: plan.id }).expect(400);
    expect(result.body.code).toBe(invalid === 'professor' ? 'SALA_PROFESSOR_INVALID' : 'SALA_PLAN_INVALID');
    expect(await prisma.person.findUnique({ where: { normalizedDni: studentPayload.dni } })).toBeNull();
    expect(await prisma.person.count()).toBe(counts.people);
    expect(await prisma.portalCredential.count()).toBe(counts.credentials);
    expect(await prisma.salaParticipation.count()).toBe(counts.participations);
    expect(await prisma.salaPlanAssignment.count()).toBe(counts.assignments);
    expect(await prisma.salaCharge.count()).toBe(counts.charges);
  });
  it('rejects duplicate DNI without incorporating the existing Person', async () => {
    const authn = await session(Role.PROFESSOR);
    const professor = await prisma.internalUser.findFirstOrThrow({ where: { roles: { some: { role: Role.PROFESSOR } } } });
    const plan = await prisma.salaPlan.create({ data: { name: 'Duplicado', monthlyAmount: 1000 } });
    const existing = await request(app.getHttpServer()).post('/api/people').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(studentPayload).expect(201);
    const result = await request(app.getHttpServer()).post('/api/sala/students').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ ...studentPayload, dni: '30.123.456', mainProfessorId: professor.id, planId: plan.id }).expect(409);
    expect(result.body.code).toBe('PERSON_DNI_ALREADY_EXISTS');
    expect(await prisma.person.count()).toBe(1);
    expect(await prisma.portalCredential.count()).toBe(1);
    expect(await prisma.salaParticipation.count({ where: { personId: existing.body.data.id } })).toBe(0);
  });
  it('incorporates an existing Person as Professor without replacing the Portal credential', async () => {
    const authn = await session(Role.PROFESSOR);
    const professor = await prisma.internalUser.findFirstOrThrow({ where: { roles: { some: { role: Role.PROFESSOR } } } });
    const plan = await prisma.salaPlan.create({ data: { name: 'Existente', monthlyAmount: 1000 } });
    const created = await request(app.getHttpServer()).post('/api/people').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(studentPayload).expect(201);
    const id = created.body.data.id as string;
    const credential = await prisma.portalCredential.findUniqueOrThrow({ where: { personId: id } });
    const joined = await request(app.getHttpServer()).post('/api/sala/participations').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ personId: id, planId: plan.id, mainProfessorId: professor.id, startDate: operationalToday() }).expect(201);
    expect(joined.body.data).toMatchObject({ personId: id, planId: plan.id, mainProfessorId: professor.id, endDate: null });
    expect(joined.body.data.initialPin).toBeUndefined();
    expect(await prisma.person.count()).toBe(1);
    expect(await prisma.portalCredential.findUnique({ where: { personId: id } })).toEqual(credential);
  });
  it('rejects new students for a clinical actor without participation permission', async () => {
    const authn = await session(Role.KINESIOLOGIST);
    await request(app.getHttpServer()).post('/api/sala/students').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ ...studentPayload, mainProfessorId: crypto.randomUUID(), planId: crypto.randomUUID() }).expect(403);
    expect(await prisma.person.count()).toBe(0);
  });
  it('retires services without deleting their historical catalog row', async () => {
    const authn = await session(Role.GENERAL_ADMIN);
    const name = `Retirable-${uniqueDni()}`;
    const created = await request(app.getHttpServer()).post('/api/sala/service-types').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name, durationMinutes: 45 }).expect(201);
    const serviceId = created.body.data.id as string;
    expect(created.body.data.isSelectable).toBe(true);
    const activeList = await request(app.getHttpServer()).get('/api/sala/service-types').set('Cookie', authn.cookie).expect(200);
    expect(activeList.body.data.some((service: { id: string }) => service.id === serviceId)).toBe(true);
    await request(app.getHttpServer()).post(`/api/sala/service-types/${serviceId}/retire`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({}).expect(201);
    const selectableAfterRetirement = await request(app.getHttpServer()).get('/api/sala/service-types').set('Cookie', authn.cookie).expect(200);
    expect(selectableAfterRetirement.body.data.some((service: { id: string }) => service.id === serviceId)).toBe(false);
    const allServices = await request(app.getHttpServer()).get('/api/sala/service-types/all').set('Cookie', authn.cookie).expect(200);
    expect(allServices.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: serviceId, name, durationMinutes: 45, isSelectable: false })]));
    await expect(sala.retireServiceType(serviceId)).resolves.toMatchObject({ id: serviceId, isSelectable: false, durationMinutes: 45 });
  });
  it('joins, leaves, preserves history and allows re-entry with new assignments', async () => {
    const authn = await session(Role.ADMINISTRATIVE); const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Ana', lastName: 'Sala', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1990-01-01T00:00:00Z') } }); const plan = await prisma.salaPlan.create({ data: { name: 'Plan', monthlyAmount: 1000 } }); const professor = await users.create({ firstName: 'Prof', lastName: 'Uno', email: `prof-one-${dni}@sala.test`, roles: [Role.PROFESSOR] });
    const joined = await request(app.getHttpServer()).post('/api/sala/participations').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-10' }).expect(201); expect(joined.body.data.endDate).toBeNull();
    await request(app.getHttpServer()).post(`/api/sala/participations/${joined.body.data.id}/leave`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).expect(201); expect(await sala.hasActiveSalaParticipation(person.id)).toBe(false); await request(app.getHttpServer()).post(`/api/sala/participations/${joined.body.data.id}/leave`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).expect(404);
    const plan2 = await prisma.salaPlan.create({ data: { name: 'Plan 2', monthlyAmount: 2000 } }); const professor2 = await users.create({ firstName: 'Prof', lastName: 'Dos', email: 'prof-two@sala.test', roles: [Role.PROFESSOR] }); const reentry = await sala.join({ personId: person.id, planId: plan2.id, mainProfessorId: professor2.id, startDate: '2026-02-01' }); const history = await sala.listParticipations(person.id); expect(history).toHaveLength(2); expect(history[0]?.id).toBe(reentry.id); expect(history[1]?.endDate).not.toBeNull();
  });
  it('rejects invalid professor and duplicate active participation at the application boundary', async () => {
    const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Dos', lastName: 'Sala', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const plan = await prisma.salaPlan.create({ data: { name: 'Plan', monthlyAmount: 1000 } }); const admin = await users.create({ firstName: 'Admin', lastName: 'Sala', email: `admin-two-${dni}@sala.test`, roles: [Role.ADMINISTRATIVE] }); const professor = await users.create({ firstName: 'Prof', lastName: 'Valid', email: `prof-valid-${dni}@sala.test`, roles: [Role.PROFESSOR] });
    await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); await expect(sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-02' })).rejects.toMatchObject({ response: { code: 'SALA_ACTIVE_PARTICIPATION_EXISTS' } }); await expect(sala.join({ personId: person.id, planId: plan.id, mainProfessorId: admin.id, startDate: '2026-01-02' })).rejects.toMatchObject({ response: { code: 'SALA_PROFESSOR_INVALID' } });
  });
  it('rejects inactive and non-professor main professors', async () => {
    const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Invalid', lastName: 'Professor', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const plan = await prisma.salaPlan.create({ data: { name: `Invalid-${dni}`, monthlyAmount: 1000 } }); const inactive = await users.create({ firstName: 'Inactive', lastName: 'Professor', email: `inactive-${dni}@sala.test`, roles: [Role.PROFESSOR] }); await prisma.internalUser.update({ where: { id: inactive.id }, data: { status: 'INACTIVE' } }); const administrative = await users.create({ firstName: 'Administrative', lastName: 'User', email: `admin-${dni}@sala.test`, roles: [Role.ADMINISTRATIVE] });
    await expect(sala.join({ personId: person.id, planId: plan.id, mainProfessorId: inactive.id, startDate: '2026-01-01' })).rejects.toMatchObject({ response: { code: 'SALA_PROFESSOR_INVALID' } }); await expect(sala.join({ personId: person.id, planId: plan.id, mainProfessorId: administrative.id, startDate: '2026-01-01' })).rejects.toMatchObject({ response: { code: 'SALA_PROFESSOR_INVALID' } });
  });
  it('protects one active participation under concurrent joins with PostgreSQL unique index', async () => {
    const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Concurrent', lastName: 'Sala', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const plan = await prisma.salaPlan.create({ data: { name: 'Concurrent', monthlyAmount: 1000 } }); const professor = await users.create({ firstName: 'Prof', lastName: 'Concurrent', email: `prof-concurrent-${dni}@sala.test`, roles: [Role.PROFESSOR] });
    const results = await Promise.allSettled([sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-03-01' }), sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-03-01' })]); expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1); expect(await prisma.salaParticipation.count({ where: { personId: person.id, endDate: null } })).toBe(1);
  });
  it('enforces the partial unique index when persistence bypasses the service', async () => {
    const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Direct', lastName: 'Constraint', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const plan = await prisma.salaPlan.create({ data: { name: `Direct-${dni}`, monthlyAmount: 1000 } }); const professor = await users.create({ firstName: 'Prof', lastName: 'Direct', email: `prof-direct-${dni}@sala.test`, roles: [Role.PROFESSOR] });
    await prisma.salaParticipation.create({ data: { personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: new Date('2026-01-01T00:00:00Z') } });
    await expect(prisma.salaParticipation.create({ data: { personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: new Date('2026-01-02T00:00:00Z') } })).rejects.toMatchObject({ code: 'P2002' });
    expect(await prisma.salaParticipation.count({ where: { personId: person.id, endDate: null } })).toBe(1);
  });
  async function planBookingFixture() {
    const muscle = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 });
    const functional = await sala.createServiceType({ name: 'Funcional', durationMinutes: 45 });
    const calisthenics = await sala.createServiceType({ name: 'Calistenia', durationMinutes: 60 });
    const plan = await sala.createPlan({ name: 'Plan Base', monthlyAmount: 20000, serviceTypeIds: [muscle.id, functional.id] });
    const professor = await users.create({ firstName: 'Profesor', lastName: 'Sintético', email: 'plan-professor@sala.test', roles: [Role.PROFESSOR] });
    const dni = uniqueDni();
    const person = await prisma.person.create({ data: { firstName: 'Alumno', lastName: 'Sintético', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } });
    const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' });
    const window = await sala.createSlot({ weekday: 'MONDAY', startTime: '08:00', durationMinutes: 240, specificCapacity: 5 });
    const booking = { personId: person.id, salaParticipationId: participation.id, scheduleSlotId: window.id, startTime: '09:00', startDate: '2026-08-31', date: '2026-08-31' };
    return { muscle, functional, calisthenics, plan, participation, person, booking };
  }
  it('allows distinct and consecutive activities in one day while rejecting full-interval overlaps', async () => {
    const f = await planBookingFixture();
    await prisma.salaScheduleSlot.update({ where: { id: f.booking.scheduleSlotId }, data: { durationMinutes: 300 } });
    await sala.createReservation({ ...f.booking, serviceTypeId: f.muscle.id, startTime: '09:00' });
    await sala.createReservation({ ...f.booking, serviceTypeId: f.functional.id, startTime: '10:00' });
    expect(await prisma.oneOffReservation.count({ where: { personId: f.person.id, date: new Date('2026-08-31') } })).toBe(2);
    await expect(sala.createReservation({ ...f.booking, serviceTypeId: f.functional.id, startTime: '10:30' })).rejects.toMatchObject({ response: { code: 'SALA_BOOKING_OVERLAP' } });
    await expect(sala.createReservation({ ...f.booking, serviceTypeId: f.muscle.id, startTime: '09:00' })).rejects.toMatchObject({ response: { code: 'SALA_RESERVATION_DUPLICATE' } });
    const fixed = await sala.createFixed({ ...f.booking, serviceTypeId: f.muscle.id, startTime: '11:00' });
    await expect(sala.createReservation({ ...f.booking, serviceTypeId: f.functional.id, startTime: '11:30' })).rejects.toMatchObject({ response: { code: 'SALA_BOOKING_OVERLAP' } });
    await expect(sala.changeFixed({ ...f.booking, id: fixed.id, serviceTypeId: f.muscle.id, startTime: '10:30' })).rejects.toMatchObject({ response: { code: 'SALA_BOOKING_OVERLAP' } });
    await expect(sala.createFixed({ ...f.booking, serviceTypeId: f.muscle.id, startTime: '09:30' })).rejects.toMatchObject({ response: { code: 'SALA_BOOKING_OVERLAP' } });
    expect((await prisma.fixedSalaBooking.findUniqueOrThrow({ where: { id: fixed.id } })).startTime).toEqual(new Date('1970-01-01T11:00:00Z'));
  });
  it('uses initial capacity 10 and preserves configured, specific and exceptional priorities', async () => {
    const f = await planBookingFixture();
    const date = f.booking.date;
    await sala.updateSlot(f.booking.scheduleSlotId, { weekday: 'MONDAY', startTime: '08:00', durationMinutes: 240, specificCapacity: null });
    expect((await sala.availability(date))[0]?.capacity).toBe(10);
    await sala.updateConfiguration({ capacity: 8 });
    expect((await sala.availability(date))[0]?.capacity).toBe(8);
    await sala.updateSlot(f.booking.scheduleSlotId, { weekday: 'MONDAY', startTime: '08:00', durationMinutes: 240, specificCapacity: 5 });
    expect((await sala.availability(date))[0]?.capacity).toBe(5);
    await sala.addException(f.booking.scheduleSlotId, { date, type: 'CAPACITY_OVERRIDE', capacityOverride: 3 });
    expect((await sala.availability(date))[0]?.capacity).toBe(3);
  });
  it('admits ten different people at one hour and rejects the eleventh', async () => {
    const f = await planBookingFixture();
    await sala.updateSlot(f.booking.scheduleSlotId, { weekday: 'MONDAY', startTime: '08:00', durationMinutes: 240, specificCapacity: null });
    await prisma.salaConfiguration.deleteMany();
    const professorId = (await prisma.salaParticipation.findUniqueOrThrow({ where: { id: f.participation.id } })).mainProfessorId;
    for (let index = 0; index < 10; index++) {
      const dni = uniqueDni();
      const person = await prisma.person.create({ data: { firstName: `Cupo${index}`, lastName: 'Sintético', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01') } });
      const participation = await sala.join({ personId: person.id, planId: f.plan.id, mainProfessorId: professorId, startDate: '2026-01-01' });
      await sala.createReservation({ ...f.booking, personId: person.id, salaParticipationId: participation.id, serviceTypeId: f.muscle.id });
    }
    expect((await sala.availability(f.booking.date)).find((item) => item.startTime === '09:00')).toMatchObject({ capacity: 10, reserved: 10, available: 0 });
    await expect(sala.createReservation({ ...f.booking, serviceTypeId: f.muscle.id })).rejects.toMatchObject({ response: { code: 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED' } });
  });
  it('checks a new fixed booking against future one-off capacity in its recurrence', async () => {
    const f = await planBookingFixture();
    await sala.updateSlot(f.booking.scheduleSlotId, { weekday: 'MONDAY', startTime: '08:00', durationMinutes: 240, specificCapacity: 1 });
    await sala.createReservation({ ...f.booking, date: '2026-09-07', serviceTypeId: f.muscle.id });
    const dni = uniqueDni();
    const person = await prisma.person.create({ data: { firstName: 'Otro', lastName: 'Alumno', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01') } });
    const professorId = (await prisma.salaParticipation.findUniqueOrThrow({ where: { id: f.participation.id } })).mainProfessorId;
    const participation = await sala.join({ personId: person.id, planId: f.plan.id, mainProfessorId: professorId, startDate: '2026-01-01' });
    await expect(sala.createFixed({ ...f.booking, personId: person.id, salaParticipationId: participation.id, serviceTypeId: f.muscle.id })).rejects.toMatchObject({ response: { code: 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED', details: { date: '2026-09-07' } } });
    expect(await prisma.fixedSalaBooking.count({ where: { personId: person.id } })).toBe(0);
  });
  it.each(['reservation', 'fixed'].flatMap(operation => ['12:00', '12:30', '12:15', '12:45'].map(startTime => [operation, startTime])))('enforces half-hour planned starts for %s at %s through DTO and service', async (operation, startTime) => {
    const authn = await session(Role.ADMINISTRATIVE);
    const f = await planBookingFixture();
    await prisma.salaScheduleSlot.update({ where: { id: f.booking.scheduleSlotId }, data: { startTime: new Date('1970-01-01T12:00:00Z'), durationMinutes: 120 } });
    const { date, startDate, ...common } = f.booking;
    const input = { ...common, startTime: startTime!, serviceTypeId: f.muscle.id, ...(operation === 'reservation' ? { date } : { startDate }) };
    const valid = ['12:00', '12:30'].includes(startTime!);
    const response = await request(app.getHttpServer()).post(`/api/sala/${operation === 'reservation' ? 'reservations' : 'fixed-bookings'}`)
      .set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(input).expect(valid ? 201 : 400);
    if (valid) {
      expect(response.body.data.startTime).toContain(`T${startTime}:00`);
    } else {
      const serviceInput = { ...f.booking, startTime: startTime!, serviceTypeId: f.muscle.id };
      await expect(operation === 'reservation' ? sala.createReservation(serviceInput) : sala.createFixed(serviceInput))
        .rejects.toMatchObject({ response: { code: 'SALA_REQUIRED_SLOTS_UNAVAILABLE' } });
      expect(await prisma.oneOffReservation.count()).toBe(0);
      expect(await prisma.fixedSalaBooking.count()).toBe(0);
    }
  });
  it.each(['12:15', '12:45'])('preserves a historical fixed start %s and requires a half-hour start when changing it', async startTime => {
    const f = await planBookingFixture();
    await prisma.salaScheduleSlot.update({ where: { id: f.booking.scheduleSlotId }, data: { durationMinutes: 420 } });
    const fixed = await sala.createFixed({ ...f.booking, serviceTypeId: f.functional.id });
    const historical = await prisma.fixedSalaBooking.update({ where: { id: fixed.id }, data: { startTime: new Date(`1970-01-01T${startTime}:00Z`) } });
    expect(await sala.listFixed(f.person.id)).toEqual(expect.arrayContaining([expect.objectContaining({ id: fixed.id, startTime: historical.startTime })]));
    await expect(sala.changeFixed({ ...f.booking, id: fixed.id, serviceTypeId: f.functional.id, startTime }))
      .rejects.toMatchObject({ response: { code: 'SALA_REQUIRED_SLOTS_UNAVAILABLE' } });
    expect(await prisma.fixedSalaBooking.findUnique({ where: { id: fixed.id } })).toEqual(historical);
    await sala.changeFixed({ ...f.booking, id: fixed.id, serviceTypeId: f.functional.id, startTime: '12:30' });
  });
  it('counts simultaneous presence in every quarter-hour for 60 and 45 minute services', async () => {
    const f = await planBookingFixture();
    await prisma.salaScheduleSlot.update({ where: { id: f.booking.scheduleSlotId }, data: { startTime: new Date('1970-01-01T12:00:00Z'), durationMinutes: 120, specificCapacity: 10 } });
    await sala.createReservation({ ...f.booking, serviceTypeId: f.functional.id, startTime: '12:30' });
    expect((await sala.availability(f.booking.date)).map(slot => [slot.startTime, slot.reserved])).toEqual([
      ['12:00', 0], ['12:15', 0], ['12:30', 1], ['12:45', 1], ['13:00', 1], ['13:15', 0], ['13:30', 0], ['13:45', 0],
    ]);
    const participation = await prisma.salaParticipation.findUniqueOrThrow({ where: { id: f.participation.id } });
    for (let index = 0; index < 9; index++) {
      const dni = uniqueDni();
      const person = await prisma.person.create({ data: { firstName: `Capacidad${index}`, lastName: 'Sintética', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1990-01-01') } });
      const joined = await sala.join({ personId: person.id, planId: f.plan.id, mainProfessorId: participation.mainProfessorId, startDate: '2026-01-01' });
      await sala.createFixed({ ...f.booking, personId: person.id, salaParticipationId: joined.id, serviceTypeId: f.muscle.id, startTime: '12:00' });
    }
    expect((await sala.availability(f.booking.date)).slice(0, 6).map(slot => slot.reserved)).toEqual([9, 9, 10, 10, 1, 0]);
    await expect(sala.createReservation({ ...f.booking, serviceTypeId: f.muscle.id, startTime: '12:30' }))
      .rejects.toMatchObject({ response: { code: 'SALA_RESERVATION_DUPLICATE' } });
  });
  it('lists only selectable services from the current active participation plan', async () => {
    const authn = await session(Role.PROFESSOR);
    const f = await planBookingFixture();
    const expected = [f.functional, f.muscle].map(({ id, name, durationMinutes }) => ({ id, name, durationMinutes }));
    expect(await sala.listPersonServiceTypes(f.person.id)).toEqual(expected);
    const response = await request(app.getHttpServer()).get(`/api/sala/people/${f.person.id}/services`).set('Cookie', authn.cookie).expect(200);
    expect(response.body.data).toEqual(expected);
    await request(app.getHttpServer()).get(`/api/sala/people/${f.person.id}/services`).expect(401);
    await sala.retireServiceType(f.functional.id);
    expect(await sala.listPersonServiceTypes(f.person.id)).toEqual([expected[1]]);
    const otherPlan = await sala.createPlan({ name: 'Plan Completo', monthlyAmount: 30000, serviceTypeIds: [f.calisthenics.id] });
    await sala.changePlan(f.participation.id, otherPlan.id);
    expect(await sala.listPersonServiceTypes(f.person.id)).toEqual([{ id: f.calisthenics.id, name: f.calisthenics.name, durationMinutes: 60 }]);
    await prisma.salaParticipation.update({ where: { id: f.participation.id }, data: { endDate: new Date('2026-09-01') } });
    expect(await sala.listPersonServiceTypes(f.person.id)).toEqual([]);
    expect(await sala.listPersonServiceTypes(crypto.randomUUID())).toEqual([]);
  });
  it('creates reservations and fixed bookings for services included in the current plan', async () => {
    const f = await planBookingFixture();
    const reservation = await sala.createReservation({ ...f.booking, serviceTypeId: f.muscle.id });
    const fixed = await sala.createFixed({ ...f.booking, serviceTypeId: f.functional.id, startTime: '10:00' });
    expect(await prisma.oneOffReservation.findUnique({ where: { id: reservation.id } })).toMatchObject({ serviceTypeId: f.muscle.id, serviceDurationMinutes: 60 });
    expect(await prisma.fixedSalaBooking.findUnique({ where: { id: fixed.id } })).toMatchObject({ serviceTypeId: f.functional.id, serviceDurationMinutes: 45 });
  });
  it.each(['reservation', 'fixed'])('rejects a selectable service outside the plan on new %s operations', async (operation) => {
    const authn = await session(Role.ADMINISTRATIVE);
    const f = await planBookingFixture();
    const path = operation === 'reservation' ? 'reservations' : 'fixed-bookings';
    const { date, startDate, ...common } = f.booking;
    const response = await request(app.getHttpServer()).post(`/api/sala/${path}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf)
      .send({ ...common, serviceTypeId: f.calisthenics.id, ...(operation === 'reservation' ? { date } : { startDate }) }).expect(400);
    expect(response.body.code).toBe('SALA_SERVICE_NOT_INCLUDED_IN_PLAN');
    expect(await prisma.oneOffReservation.count()).toBe(0);
    expect(await prisma.fixedSalaBooking.count()).toBe(0);
  });
  it.each(['reservation', 'fixed'])('requires a service for new %s operations', async (operation) => {
    const f = await planBookingFixture();
    const action = operation === 'reservation' ? sala.createReservation(f.booking) : sala.createFixed(f.booking);
    await expect(action).rejects.toMatchObject({ status: 400, response: { code: 'SALA_SERVICE_REQUIRED' } });
    expect(await prisma.oneOffReservation.count()).toBe(0);
    expect(await prisma.fixedSalaBooking.count()).toBe(0);
  });
  it.each(['reservation', 'fixed'])('rejects retired or nonexistent services on %s operations', async (operation) => {
    const f = await planBookingFixture();
    await sala.retireServiceType(f.muscle.id);
    for (const serviceTypeId of [f.muscle.id, crypto.randomUUID()]) {
      const input = { ...f.booking, serviceTypeId };
      await expect(operation === 'reservation' ? sala.createReservation(input) : sala.createFixed(input))
        .rejects.toMatchObject({ status: 400, response: { code: 'SALA_SERVICE_TYPE_INVALID' } });
    }
    expect(await prisma.oneOffReservation.count()).toBe(0);
    expect(await prisma.fixedSalaBooking.count()).toBe(0);
  });
  it('preserves existing reservations and fixed bookings when plan services change and rejects reuse', async () => {
    const f = await planBookingFixture();
    const reservation = await sala.createReservation({ ...f.booking, serviceTypeId: f.muscle.id });
    const fixed = await sala.createFixed({ ...f.booking, serviceTypeId: f.muscle.id, startTime: '10:00' });
    const beforeReservation = await prisma.oneOffReservation.findUnique({ where: { id: reservation.id } });
    const beforeFixed = await prisma.fixedSalaBooking.findUnique({ where: { id: fixed.id } });
    await sala.updatePlan(f.plan.id, { name: f.plan.name, monthlyAmount: 20000, serviceTypeIds: [f.functional.id] });
    expect(await prisma.oneOffReservation.findUnique({ where: { id: reservation.id } })).toEqual(beforeReservation);
    expect(await prisma.fixedSalaBooking.findUnique({ where: { id: fixed.id } })).toEqual(beforeFixed);
    await expect(sala.createReservation({ ...f.booking, date: '2026-09-07', serviceTypeId: f.muscle.id }))
      .rejects.toMatchObject({ status: 400, response: { code: 'SALA_SERVICE_NOT_INCLUDED_IN_PLAN' } });
    await expect(sala.changeFixed({ ...f.booking, id: fixed.id, serviceTypeId: f.muscle.id }))
      .rejects.toMatchObject({ status: 400, response: { code: 'SALA_SERVICE_NOT_INCLUDED_IN_PLAN' } });
    await expect(sala.changeFixed({ ...f.booking, id: fixed.id }))
      .rejects.toMatchObject({ status: 400, response: { code: 'SALA_SERVICE_REQUIRED' } });
    expect(await prisma.fixedSalaBooking.findUnique({ where: { id: fixed.id } })).toEqual(beforeFixed);
    const changed = await sala.changeFixed({ ...f.booking, id: fixed.id, startTime: '10:00', serviceTypeId: f.functional.id });
    expect(changed.serviceTypeId).toBe(f.functional.id);
  });
  it('creates one-off reservations, reports availability and requires explicit overbooking confirmation', async () => {
    const authn = await session(Role.ADMINISTRATIVE); const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Booking', lastName: 'Sala', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const plan = await prisma.salaPlan.create({ data: { name: `Booking-${dni}`, monthlyAmount: 1000 } }); const professor = await users.create({ firstName: 'Prof', lastName: 'Booking', email: `prof-booking-${dni}@sala.test`, roles: [Role.PROFESSOR] }); const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); const slot = await sala.createSlot({ weekday: 'MONDAY', startTime: '09:00', durationMinutes: 60 });
    const service = await sala.createServiceType({ name: `Gimnasio-${dni}`, durationMinutes: 60 }); await prisma.salaPlanService.create({ data: { planId: plan.id, serviceTypeId: service.id } }); const date = '2026-08-31'; await request(app.getHttpServer()).post('/api/sala/reservations').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ personId: person.id, salaParticipationId: participation.id, scheduleSlotId: slot.id, serviceTypeId: service.id, startTime: '09:00', date }).expect(201); const state = await sala.availability(date); expect(state.find((item) => item.scheduleSlotId === slot.id)?.reserved).toBe(1); await expect(sala.createReservation({ personId: person.id, salaParticipationId: participation.id, scheduleSlotId: slot.id, serviceTypeId: service.id, startTime: '09:00', date, confirmOverbooking: true })).rejects.toMatchObject({ response: { code: 'SALA_RESERVATION_DUPLICATE' } });
  });
  it('serializes concurrent last-slot reservations in PostgreSQL', async () => {
    const plan = await prisma.salaPlan.create({ data: { name: 'Concurrent booking', monthlyAmount: 1000 } }); const service = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 }); await prisma.salaPlanService.create({ data: { planId: plan.id, serviceTypeId: service.id } }); const slot = await sala.createSlot({ weekday: 'MONDAY', startTime: '10:00', durationMinutes: 60, specificCapacity: 1 }); const professor = await users.create({ firstName: 'Prof', lastName: 'Race', email: `race-${uniqueDni()}@sala.test`, roles: [Role.PROFESSOR] });
    const people = await Promise.all([1, 2].map(async (index) => { const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: `Race${index}`, lastName: 'Booking', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); return sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); })); const date = '2026-08-31'; const results = await Promise.allSettled(people.map((participation) => sala.createReservation({ personId: participation.personId, salaParticipationId: participation.id, scheduleSlotId: slot.id, serviceTypeId: service.id, date }))); expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1); expect((await sala.availability(date)).find((item) => item.scheduleSlotId === slot.id)?.reserved).toBe(1);
  });
  it('requires explicit confirmation and records deliberate internal overbooking', async () => {
    const plan = await prisma.salaPlan.create({ data: { name: 'Overbook', monthlyAmount: 1000 } }); const service = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 }); await prisma.salaPlanService.create({ data: { planId: plan.id, serviceTypeId: service.id } }); const slot = await sala.createSlot({ weekday: 'MONDAY', startTime: '11:00', durationMinutes: 60, specificCapacity: 1 }); const professor = await users.create({ firstName: 'Prof', lastName: 'Overbook', email: `over-${uniqueDni()}@sala.test`, roles: [Role.PROFESSOR] });
    const participations = await Promise.all([1, 2].map(async (index) => { const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: `Over${index}`, lastName: 'Booking', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); return sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); })); const date = '2026-08-31'; await sala.createReservation({ personId: participations[0]!.personId, salaParticipationId: participations[0]!.id, scheduleSlotId: slot.id, serviceTypeId: service.id, date }); await expect(sala.createReservation({ personId: participations[1]!.personId, salaParticipationId: participations[1]!.id, scheduleSlotId: slot.id, serviceTypeId: service.id, date })).rejects.toMatchObject({ response: { code: 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED' } }); await sala.createReservation({ personId: participations[1]!.personId, salaParticipationId: participations[1]!.id, scheduleSlotId: slot.id, serviceTypeId: service.id, date, confirmOverbooking: true }); await expect(sala.availability(date)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ scheduleSlotId: slot.id, reserved: 2, isOverbooked: true })]));
  });
  it('occupies every 15-minute slot, rejects an out-of-window start and overbooks atomically', async () => {
    const plan = await prisma.salaPlan.create({ data: { name: 'Multi slot', monthlyAmount: 1000 } });
    const window = await sala.createSlot({ weekday: 'MONDAY', startTime: '08:00', durationMinutes: 720, specificCapacity: 1 });
    const service = await sala.createServiceType({ name: 'Gimnasio', durationMinutes: 60 }); await prisma.salaPlanService.create({ data: { planId: plan.id, serviceTypeId: service.id } });
    const professor = await users.create({ firstName: 'Prof', lastName: 'Multi', email: `multi-${uniqueDni()}@sala.test`, roles: [Role.PROFESSOR] });
    const participations = await Promise.all([1, 2].map(async (index) => { const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: `Multi${index}`, lastName: 'Booking', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); return sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); }));
    const date = '2026-08-31';
    await sala.createReservation({ personId: participations[0]!.personId, salaParticipationId: participations[0]!.id, scheduleSlotId: window.id, serviceTypeId: service.id, startTime: '12:00', date });
    const occupied = (await sala.availability(date)).filter((slot) => ['12:00','12:15','12:30','12:45'].includes(slot.startTime));
    expect(occupied).toHaveLength(4); expect(occupied.every((slot) => slot.reserved === 1)).toBe(true);
    await expect(sala.createReservation({ personId: participations[1]!.personId, salaParticipationId: participations[1]!.id, scheduleSlotId: window.id, serviceTypeId: service.id, startTime: '12:00', date })).rejects.toMatchObject({ response: { code: 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED', details: { fullSlots: 4, requiredSlots: 4 } } });
    await sala.createReservation({ personId: participations[1]!.personId, salaParticipationId: participations[1]!.id, scheduleSlotId: window.id, serviceTypeId: service.id, startTime: '12:00', date, confirmOverbooking: true });
    expect((await sala.availability(date)).filter((slot) => ['12:00','12:15','12:30','12:45'].includes(slot.startTime)).every((slot) => slot.reserved === 2 && slot.isOverbooked)).toBe(true);
    await expect(sala.createReservation({ personId: participations[1]!.personId, salaParticipationId: participations[1]!.id, scheduleSlotId: window.id, serviceTypeId: service.id, startTime: '19:15', date, confirmOverbooking: true })).rejects.toMatchObject({ response: { code: 'SALA_REQUIRED_SLOTS_UNAVAILABLE' } });
  });
  it('serializes concurrent multi-slot reservations at the PostgreSQL window lock', async () => {
    const plan = await prisma.salaPlan.create({ data: { name: 'Multi race', monthlyAmount: 1000 } }); const window = await sala.createSlot({ weekday: 'MONDAY', startTime: '08:00', durationMinutes: 720, specificCapacity: 1 }); const service = await sala.createServiceType({ name: 'Gimnasio race', durationMinutes: 60 }); await prisma.salaPlanService.create({ data: { planId: plan.id, serviceTypeId: service.id } }); const professor = await users.create({ firstName: 'Prof', lastName: 'Multi race', email: `multi-race-${uniqueDni()}@sala.test`, roles: [Role.PROFESSOR] });
    const participations = await Promise.all([1,2].map(async(index)=>{const dni=uniqueDni();const person=await prisma.person.create({data:{firstName:`Concurrent${index}`,lastName:'Multi',dni,normalizedDni:dni,phone:'351',birthDate:new Date('1991-01-01T00:00:00Z')}});return sala.join({personId:person.id,planId:plan.id,mainProfessorId:professor.id,startDate:'2026-01-01'});}));
    const results = await Promise.allSettled(participations.map((participation)=>sala.createReservation({personId:participation.personId,salaParticipationId:participation.id,scheduleSlotId:window.id,serviceTypeId:service.id,startTime:'12:00',date:'2026-08-31'})));
    expect(results.filter((result)=>result.status==='fulfilled')).toHaveLength(1); expect(await prisma.oneOffReservation.count({where:{scheduleSlotId:window.id,date:new Date('2026-08-31T00:00:00Z')}})).toBe(1);
  });
  it('rejects duplicate one-off reservations racing at the database boundary', async () => {
    const plan = await prisma.salaPlan.create({ data: { name: 'Duplicate race', monthlyAmount: 1000 } }); const service = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 }); await prisma.salaPlanService.create({ data: { planId: plan.id, serviceTypeId: service.id } }); const slot = await sala.createSlot({ weekday: 'MONDAY', startTime: '12:00', durationMinutes: 60, specificCapacity: 5 }); const professor = await users.create({ firstName: 'Prof', lastName: 'Duplicate', email: `dup-${uniqueDni()}@sala.test`, roles: [Role.PROFESSOR] }); const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Duplicate', lastName: 'Booking', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); const results = await Promise.allSettled([1, 2].map(() => sala.createReservation({ personId: person.id, salaParticipationId: participation.id, scheduleSlotId: slot.id, serviceTypeId: service.id, date: '2026-08-31' }))); expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1); expect(await prisma.oneOffReservation.count({ where: { personId: person.id, date: new Date('2026-08-31T00:00:00Z') } })).toBe(1);
  });
  it('updates capacity without replacing the schedule or cancelling bookings', async () => {
    const plan = await prisma.salaPlan.create({ data: { name: 'Non structural', monthlyAmount: 1000 } }); const service = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 }); await prisma.salaPlanService.create({ data: { planId: plan.id, serviceTypeId: service.id } }); const slot = await sala.createSlot({ weekday: 'MONDAY', startTime: '13:00', durationMinutes: 60, specificCapacity: 2 }); const professor = await users.create({ firstName: 'Prof', lastName: 'Capacity', email: `cap-${uniqueDni()}@sala.test`, roles: [Role.PROFESSOR] }); const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Capacity', lastName: 'Booking', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const dni2 = uniqueDni(); const person2 = await prisma.person.create({ data: { firstName: 'Capacity2', lastName: 'Booking', dni: dni2, normalizedDni: dni2, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); const participation2 = await sala.join({ personId: person2.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); await sala.createReservation({ personId: person.id, salaParticipationId: participation.id, scheduleSlotId: slot.id, serviceTypeId: service.id, date: '2026-08-31' }); await sala.createReservation({ personId: person2.id, salaParticipationId: participation2.id, scheduleSlotId: slot.id, serviceTypeId: service.id, date: '2026-08-31' }); await sala.updateSlot(slot.id, { weekday: 'MONDAY', startTime: '13:00', durationMinutes: 90, specificCapacity: 1 }); expect(await prisma.salaScheduleSlot.count({ where: { id: slot.id, isActive: true } })).toBe(1); expect(await prisma.oneOffReservation.count({ where: { scheduleSlotId: slot.id, cancelledAt: null } })).toBe(2); await expect(sala.availability('2026-08-31')).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ scheduleSlotId: slot.id, capacity: 1, isOverbooked: true })]));
  });
  it('replaces a schedule atomically and preserves old schedule history', async () => {
    const slot = await sala.createSlot({ weekday: 'TUESDAY', startTime: '14:00', durationMinutes: 60 }); const replacement = await sala.replaceSlot(slot.id, { weekday: 'WEDNESDAY', startTime: '15:00', durationMinutes: 60, specificCapacity: 1, effectiveDate: '2026-09-01' }); expect((await prisma.salaScheduleSlot.findUnique({ where: { id: slot.id } }))?.isActive).toBe(false); expect(replacement.weekday).toBe('WEDNESDAY'); expect(await prisma.salaScheduleSlot.count({ where: { isActive: true, weekday: 'WEDNESDAY' } })).toBe(1);
  });
  it('rolls back schedule replacement after booking mutations fail', async () => {
    const plan = await prisma.salaPlan.create({ data: { name: 'Rollback', monthlyAmount: 1000 } }); const service = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 }); await prisma.salaPlanService.create({ data: { planId: plan.id, serviceTypeId: service.id } }); const slot = await sala.createSlot({ weekday: 'THURSDAY', startTime: '16:00', durationMinutes: 120 }); const professor = await users.create({ firstName: 'Prof', lastName: 'Rollback', email: `rollback-${uniqueDni()}@sala.test`, roles: [Role.PROFESSOR] }); const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Rollback', lastName: 'Person', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); const fixed = await sala.createFixed({ personId: person.id, salaParticipationId: participation.id, scheduleSlotId: slot.id, serviceTypeId: service.id, startDate: '2026-01-01' }); const reservation = await sala.createReservation({ personId: person.id, salaParticipationId: participation.id, scheduleSlotId: slot.id, serviceTypeId: service.id, startTime: '17:00', date: '2026-08-27', confirmOverbooking: true }); await expect(sala.replaceSlot(slot.id, { weekday: 'FRIDAY', startTime: '17:00', durationMinutes: 60, effectiveDate: '2026-08-27' }, true)).rejects.toThrow('SIMULATED_SCHEDULE_REPLACEMENT_FAILURE'); expect((await prisma.salaScheduleSlot.findUnique({ where: { id: slot.id } }))?.isActive).toBe(true); expect((await prisma.fixedSalaBooking.findUnique({ where: { id: fixed.id } }))?.endDate).toBeNull(); expect((await prisma.oneOffReservation.findUnique({ where: { id: reservation.id } }))?.cancelledAt).toBeNull(); expect(await prisma.salaScheduleSlot.count({ where: { weekday: 'FRIDAY' } })).toBe(0);
  });
  it('rolls back LeaveSala after booking mutations fail', async () => {
    const plan = await prisma.salaPlan.create({ data: { name: 'Leave rollback', monthlyAmount: 1000 } }); const service = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 }); await prisma.salaPlanService.create({ data: { planId: plan.id, serviceTypeId: service.id } }); const slot = await sala.createSlot({ weekday: 'FRIDAY', startTime: '18:00', durationMinutes: 120 }); const professor = await users.create({ firstName: 'Prof', lastName: 'Leave rollback', email: `leave-rollback-${uniqueDni()}@sala.test`, roles: [Role.PROFESSOR] }); const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Leave', lastName: 'Rollback', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); const fixed = await sala.createFixed({ personId: person.id, salaParticipationId: participation.id, scheduleSlotId: slot.id, serviceTypeId: service.id, startDate: '2026-01-01' }); const reservation = await sala.createReservation({ personId: person.id, salaParticipationId: participation.id, scheduleSlotId: slot.id, serviceTypeId: service.id, startTime: '19:00', date: '2026-08-28', confirmOverbooking: true }); await expect(sala.leave(participation.id, true)).rejects.toThrow('SIMULATED_LEAVE_FAILURE'); expect((await prisma.salaParticipation.findUnique({ where: { id: participation.id } }))?.endDate).toBeNull(); expect((await prisma.fixedSalaBooking.findUnique({ where: { id: fixed.id } }))?.endDate).toBeNull(); expect((await prisma.oneOffReservation.findUnique({ where: { id: reservation.id } }))?.cancelledAt).toBeNull();
  });
  it('replaces routines transactionally, preserves history and enforces exercise rules', async () => {
    const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Routine', lastName: 'Person', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const plan = await prisma.salaPlan.create({ data: { name: `Routine-${dni}`, monthlyAmount: 1000 } }); const professor = await users.create({ firstName: 'Routine', lastName: 'Professor', email: `routine-${dni}@sala.test`, roles: [Role.PROFESSOR] }); const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); const exercise = await sala.createExerciseDefinition({ name: `Sentadilla-${dni}`, primaryMuscle: 'Piernas' });
    const first = await sala.replaceRoutine({ personId: person.id, salaParticipationId: participation.id, days: [{ exercises: [{ exerciseDefinitionId: exercise.id, series: '3', repetitions: '10' }] }] }); expect(first.status).toBe('ACTIVE');
    const second = await sala.replaceRoutine({ personId: person.id, salaParticipationId: participation.id, days: [{ name: 'Día B', exercises: [{ exerciseDefinitionId: exercise.id, series: '4', duration: '30s' }] }] }); expect(second.status).toBe('ACTIVE'); expect(await prisma.routine.count({ where: { personId: person.id } })).toBe(2); expect(await prisma.routine.count({ where: { personId: person.id, status: 'ACTIVE' } })).toBe(1); await expect(sala.replaceRoutine({ personId: person.id, salaParticipationId: participation.id, days: [{ exercises: [{ exerciseDefinitionId: exercise.id, series: '1', repetitions: '1', duration: '1m' }] }] })).rejects.toMatchObject({ response: { code: 'SALA_ROUTINE_REPETITIONS_DURATION_EXCLUSIVE' } });
    await expect(sala.retireExerciseDefinition(exercise.id, false)).rejects.toMatchObject({ response: { code: 'SALA_EXERCISE_RETIRE_CONFIRMATION_REQUIRED' } }); await sala.retireExerciseDefinition(exercise.id, true); expect((await prisma.exerciseDefinition.findUnique({ where: { id: exercise.id } }))?.isActive).toBe(false); expect(await prisma.routineExercise.count({ where: { exerciseDefinitionId: exercise.id, routineDay: { routine: { status: 'ACTIVE' } } } })).toBe(0); expect(await prisma.routineExercise.count({ where: { exerciseDefinitionId: exercise.id, routineDay: { routine: { status: 'HISTORICAL' } } } })).toBe(1);
  });
  it('persists and lists physical test definitions', async () => {
    const test = await sala.createPhysicalTest({ name: `Catalog-${uniqueDni()}`, type: 'distance', description: 'Centimeters' });
    expect(await prisma.physicalTestDefinition.findUnique({ where: { id: test.id } })).toMatchObject({ id: test.id, isActive: true });
    expect(await sala.listPhysicalTests()).toEqual(expect.arrayContaining([expect.objectContaining({ id: test.id, name: test.name, type: 'distance' })]));
  });
  it('keeps physical test definitions separate from evaluation results and validates the professor', async () => {
    const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Eval', lastName: 'Person', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const plan = await prisma.salaPlan.create({ data: { name: `Eval-${dni}`, monthlyAmount: 1000 } }); const professor = await users.create({ firstName: 'Eval', lastName: 'Professor', email: `eval-${dni}@sala.test`, roles: [Role.PROFESSOR] }); const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); const test = await sala.createPhysicalTest({ name: `Flex-${dni}`, type: 'distance' }); const evaluation = await sala.createPhysicalEvaluation({ personId: person.id, salaParticipationId: participation.id, professorId: professor.id, evaluationDate: '2026-08-27', results: [{ testDefinitionId: test.id, resultText: '25 cm' }] }, professor.id); expect(evaluation.results).toHaveLength(1); expect(await prisma.physicalEvaluation.findUnique({ where: { id: evaluation.id } })).toMatchObject({ id: evaluation.id, personId: person.id, salaParticipationId: participation.id }); expect(await prisma.physicalTestResult.findFirst({ where: { evaluationId: evaluation.id, testDefinitionId: test.id } })).toMatchObject({ resultText: '25 cm' }); const listed = await sala.listPhysicalEvaluations(person.id); expect(listed).toHaveLength(1); expect(listed[0]?.results).toEqual(expect.arrayContaining([expect.objectContaining({ testDefinitionId: test.id, resultText: '25 cm' })])); await sala.retirePhysicalTest(test.id); await expect(sala.createPhysicalEvaluation({ personId: person.id, salaParticipationId: participation.id, professorId: professor.id, evaluationDate: '2026-08-28', results: [{ testDefinitionId: test.id, resultText: '26 cm' }] }, professor.id)).rejects.toMatchObject({ response: { code: 'SALA_PHYSICAL_TEST_INVALID' } });
  });
  async function planPaymentFixture() {
    const authn = await session(Role.ADMINISTRATIVE);
    const actor = await prisma.internalUser.findFirstOrThrow({ where: { roles: { some: { role: Role.ADMINISTRATIVE } } } });
    const dni = uniqueDni();
    const person = await prisma.person.create({ data: { firstName: 'Pago', lastName: 'Sintético', dni, normalizedDni: dni, phone: '3515550000', birthDate: new Date('1990-01-01') } });
    const professor = await users.create({ firstName: 'Pago', lastName: 'Profesor', email: `plan-payment-${dni}@test.local`, roles: [Role.PROFESSOR] });
    const plan = await prisma.salaPlan.create({ data: { name: 'Plan de pagos', monthlyAmount: 20000 } });
    const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2020-01-01' });
    const method = await prisma.paymentMethod.create({ data: { name: `PlanPayment-${dni}` } });
    const input = { personId: person.id, paidAt: '2020-01-01', paymentMethodId: method.id, periods: [10, 11, 12].map((month) => ({ year: 2026, month, operationId: crypto.randomUUID() })) };
    const post = (body: unknown) => request(app.getHttpServer()).post('/api/sala/payments/plan-months').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(body);
    return { person, professor, actor, plan, participation, method, input, post, authn };
  }
  it('registers plan months atomically through HTTP using the current price and monthly allocations', async () => {
    const f = await planPaymentFixture();
    const charge = await prisma.salaCharge.create({ data: { personId: f.person.id, salaParticipationId: f.participation.id, planId: f.plan.id, kind: 'MONTHLY', year: 2026, month: 10, chargeDate: new Date('2026-10-01'), concept: 'Cuota sintética', amount: 20000 } });
    const result = await f.post(f.input).expect(201);
    expect(result.body.data).toMatchObject({ plan: { id: f.plan.id, name: f.plan.name, monthlyAmount: '20000' }, months: 3, totalAmount: '60000' });
    expect(result.body.data.payments).toHaveLength(3);
    const saved = await prisma.salaPayment.findMany({ where: { personId: f.person.id }, include: { allocations: true }, orderBy: { month: 'asc' } });
    expect(saved).toHaveLength(3);
    for (const [index, payment] of saved.entries()) {
      expect(payment).toMatchObject({ year: 2026, month: index + 10, paymentMethodId: f.method.id, registeredById: f.actor.id, operationId: f.input.periods[index]!.operationId, paidAt: new Date('2020-01-01') });
      expect(payment.amount.toString()).toBe('20000');
    }
    expect(saved[0]!.allocations).toEqual([expect.objectContaining({ chargeId: charge.id })]);
    expect(saved[0]!.allocations[0]!.amount.toString()).toBe('20000');
    expect(saved[1]!.allocations).toHaveLength(0);
    expect(saved[2]!.allocations).toHaveLength(0);
    const listed = await request(app.getHttpServer()).get(`/api/sala/people/${f.person.id}/payments`).set('Cookie', f.authn.cookie).expect(200);
    expect(listed.body.data).toHaveLength(3);
  });
  it('rejects a paid plan month without persisting the other requested months', async () => {
    const f = await planPaymentFixture();
    await sala.registerPlanPayments({ ...f.input, periods: [f.input.periods[1]!] }, f.actor.id);
    const result = await f.post({ ...f.input, periods: f.input.periods.map((period) => ({ ...period, operationId: crypto.randomUUID() })) }).expect(409);
    expect(result.body.code).toBe('SALA_PAYMENT_ALREADY_EXISTS');
    expect(result.body.message).toContain('noviembre');
    const saved = await prisma.salaPayment.findMany({ where: { personId: f.person.id } });
    expect(saved).toHaveLength(1);
    expect(saved[0]!.month).toBe(11);
  });
  it('rolls back earlier plan payments and allocations when a later allocation cannot be persisted', async () => {
    const f = await planPaymentFixture();
    const charges = [];
    for (const month of [8, 10, 11]) {
      charges.push(await prisma.salaCharge.create({ data: { personId: f.person.id, salaParticipationId: f.participation.id, planId: f.plan.id, kind: 'MONTHLY', year: 2026, month, chargeDate: new Date(`2026-${String(month).padStart(2, '0')}-01`), concept: 'Cuota sintética', amount: 20000 } }));
    }
    const previous = await sala.createPayment({ personId: f.person.id, year: 2026, month: 9, paidAt: '2020-01-01', amount: '1', paymentMethodId: f.method.id, operationId: crypto.randomUUID(), allocations: [{ chargeId: charges[0]!.id, amount: '1', operationId: f.input.periods[1]!.operationId }] }, f.actor.id);
    await expect(sala.registerPlanPayments(f.input, f.actor.id)).rejects.toMatchObject({ code: 'P2002' });
    const saved = await prisma.salaPayment.findMany({ where: { personId: f.person.id }, include: { allocations: true } });
    expect(saved).toHaveLength(1);
    expect(saved[0]!.id).toBe(previous.id);
    expect(saved[0]!.allocations).toHaveLength(1);
    expect(await prisma.salaPaymentAllocation.count()).toBe(1);
  });
  it('creates a new plan payment after reversal and preserves the original and its reversal', async () => {
    const f = await planPaymentFixture();
    const first = await sala.registerPlanPayments({ ...f.input, periods: [f.input.periods[1]!] }, f.actor.id);
    const reversal = await sala.reversePayment(first.payments[0]!.id, 'Corrección sintética', crypto.randomUUID(), f.actor.id);
    const replacement = await f.post({ ...f.input, periods: [{ year: 2026, month: 11, operationId: crypto.randomUUID() }] }).expect(201);
    expect(replacement.body.data.payments[0].id).not.toBe(first.payments[0]!.id);
    expect(await prisma.salaPayment.count({ where: { personId: f.person.id } })).toBe(2);
    expect(await prisma.salaPayment.findUnique({ where: { id: first.payments[0]!.id }, include: { reversal: true } })).toMatchObject({ reversal: { id: reversal.id } });
    expect(await prisma.salaPayment.count({ where: { personId: f.person.id, reversal: null } })).toBe(1);
  });
  it.each(['period', 'operation'])('rejects duplicate %s values in a plan payment request without writes', async (duplicate) => {
    const f = await planPaymentFixture();
    const periods = duplicate === 'period' ? [f.input.periods[0]!, { ...f.input.periods[0]!, operationId: crypto.randomUUID() }] : [f.input.periods[0]!, { ...f.input.periods[1]!, operationId: f.input.periods[0]!.operationId }];
    const result = await f.post({ ...f.input, periods }).expect(400);
    expect(result.body.code).toBe(duplicate === 'period' ? 'SALA_PAYMENT_PERIOD_DUPLICATE' : 'SALA_PAYMENT_OPERATION_DUPLICATE');
    expect(await prisma.salaPayment.count({ where: { personId: f.person.id } })).toBe(0);
  });
  it('keeps recorded plan prices and uses the active participation current Plan for new payments', async () => {
    const f = await planPaymentFixture();
    const firstInput = { ...f.input, periods: [f.input.periods[0]!] };
    const first = await sala.registerPlanPayments(firstInput, f.actor.id);
    await prisma.salaPlan.update({ where: { id: f.plan.id }, data: { monthlyAmount: 25000 } });
    const second = await sala.registerPlanPayments({ ...f.input, periods: [f.input.periods[1]!] }, f.actor.id);
    expect(second.payments[0]!.amount.toString()).toBe('25000');
    expect((await prisma.salaPayment.findUniqueOrThrow({ where: { id: first.payments[0]!.id } })).amount.toString()).toBe('20000');
    const retry = await sala.registerPlanPayments(firstInput, f.actor.id);
    expect(retry.payments[0]!.id).toBe(first.payments[0]!.id);
    expect(retry.totalAmount).toBe('20000');
    const nextPlan = await prisma.salaPlan.create({ data: { name: 'Nuevo Plan de pagos', monthlyAmount: 30000 } });
    await sala.changePlan(f.participation.id, nextPlan.id);
    const third = await sala.registerPlanPayments({ ...f.input, periods: [f.input.periods[2]!] }, f.actor.id);
    expect(third.plan.id).toBe(nextPlan.id);
    expect(third.payments[0]!.amount.toString()).toBe('30000');
  });
  it.each(['participation', 'method', 'future'])('rejects plan payments with invalid %s without writes', async (invalid) => {
    const f = await planPaymentFixture();
    if (invalid === 'participation') await prisma.salaParticipation.update({ where: { id: f.participation.id }, data: { endDate: new Date('2020-01-02') } });
    if (invalid === 'method') await prisma.paymentMethod.update({ where: { id: f.method.id }, data: { isSelectable: false } });
    const result = await f.post({ ...f.input, ...(invalid === 'future' ? { paidAt: '2999-01-01' } : {}) }).expect(400);
    expect(result.body.code).toBe({ participation: 'SALA_PARTICIPATION_REQUIRED', method: 'PAYMENT_METHOD_NOT_SELECTABLE', future: 'SALA_PAYMENT_DATE_FUTURE' }[invalid]);
    expect(await prisma.salaPayment.count({ where: { personId: f.person.id } })).toBe(0);
  });
  it('validates the plan payment DTO and refuses client prices and a user without payment permissions', async () => {
    const f = await planPaymentFixture();
    for (const changes of [{ amount: '1' }, { planId: f.plan.id }, { monthlyAmount: '1' }, { periods: [] }, { periods: [{ year: 2026, month: 13, operationId: crypto.randomUUID() }] }, { periods: [{ year: 2026.5, month: 10, operationId: 'invalid' }] }, { personId: 'invalid' }, { paidAt: '2026-02-30' }, { paymentMethodId: 'invalid' }]) {
      await f.post({ ...f.input, ...changes }).expect(400);
    }
    await request(app.getHttpServer()).post('/api/sala/payments/plan-months').send(f.input).expect(401);
    const denied = await session(Role.KINESIOLOGIST);
    await request(app.getHttpServer()).post('/api/sala/payments/plan-months').set('Cookie', denied.cookie).set('x-csrf-token', denied.csrf).send(f.input).expect(403);
    expect(await prisma.salaPayment.count({ where: { personId: f.person.id } })).toBe(0);
  });
  it('retries plan months idempotently and serializes competing batches for the same Person', async () => {
    const f = await planPaymentFixture();
    const first = await f.post(f.input).expect(201);
    const retry = await f.post(f.input).expect(201);
    expect(retry.body.data.payments.map((payment: { id: string }) => payment.id)).toEqual(first.body.data.payments.map((payment: { id: string }) => payment.id));
    expect(await prisma.salaPayment.count({ where: { personId: f.person.id } })).toBe(3);
    const next = { ...f.input, periods: [{ year: 2027, month: 1, operationId: crypto.randomUUID() }, { year: 2027, month: 2, operationId: crypto.randomUUID() }] };
    const competing = { ...next, periods: next.periods.map((period) => ({ ...period, operationId: crypto.randomUUID() })) };
    const results = await Promise.allSettled([sala.registerPlanPayments(next, f.actor.id), sala.registerPlanPayments(competing, f.actor.id)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { response: { code: 'SALA_PAYMENT_ALREADY_EXISTS' } } });
    expect(await prisma.salaPayment.count({ where: { personId: f.person.id } })).toBe(5);
  });
  it('enforces SalaPayment uniqueness and retired method history', async () => {
    const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Pay', lastName: 'Person', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const plan = await prisma.salaPlan.create({ data: { name: `Pay-${dni}`, monthlyAmount: 1000 } }); const professor = await users.create({ firstName: 'Pay', lastName: 'Professor', email: `pay-${dni}@sala.test`, roles: [Role.PROFESSOR] }); await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); const method = await prisma.paymentMethod.create({ data: { name: `Method-${dni}` } }); const operationId = crypto.randomUUID(); const payment = await sala.createPayment({ personId: person.id, year: 2026, month: 8, paidAt: '2026-08-27', amount: '1000', paymentMethodId: method.id, operationId }, professor.id); expect(payment.amount.toString()).toBe('1000'); await expect(sala.createPayment({ personId: person.id, year: 2026, month: 8, paidAt: '2026-08-27', amount: '1000', paymentMethodId: method.id, operationId: crypto.randomUUID() }, professor.id)).rejects.toMatchObject({ response: { code: 'SALA_PAYMENT_ALREADY_EXISTS' } }); await prisma.paymentMethod.update({ where: { id: method.id }, data: { isSelectable: false } }); expect((await sala.listPayments(person.id))[0]?.paymentMethod.name).toBe(method.name); await expect(sala.createPayment({ personId: person.id, year: 2026, month: 9, paidAt: '2026-08-27', amount: '1000', paymentMethodId: method.id, operationId: crypto.randomUUID() }, professor.id)).rejects.toMatchObject({ response: { code: 'PAYMENT_METHOD_NOT_SELECTABLE' } });
    await prisma.salaPayment.deleteMany({ where: { personId: person.id } });
  });
  it('separates operation idempotency from month uniqueness under concurrency', async () => {
    const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Race', lastName: 'Payment', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const actor = await users.create({ firstName: 'Race', lastName: 'Actor', email: `race-${dni}@sala.test`, roles: [Role.PROFESSOR] }); const method = await prisma.paymentMethod.create({ data: { name: `RaceMethod-${dni}` } }); const base = { personId: person.id, year: 2026, month: 9, paidAt: '2026-08-27', amount: '1000', paymentMethodId: method.id }; const op = crypto.randomUUID(); const first = await sala.createPayment({ ...base, operationId: op }, actor.id); const retry = await sala.createPayment({ ...base, operationId: op }, actor.id); expect(retry.id).toBe(first.id); await prisma.salaPayment.delete({ where: { id: first.id } }); const results = await Promise.allSettled([sala.createPayment({ ...base, operationId: crypto.randomUUID() }, actor.id), sala.createPayment({ ...base, operationId: crypto.randomUUID() }, actor.id)]); expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1); expect(await prisma.salaPayment.count({ where: { personId: person.id, year: 2026, month: 9 } })).toBe(1); await prisma.salaPayment.deleteMany({ where: { personId: person.id } });
  });
  it('keeps fixed-booking edit availability consistent with the update validation', async () => {
    const plan = await prisma.salaPlan.create({ data: { name: 'Fixed edit consistency', monthlyAmount: 1000 } });
    const window = await sala.createSlot({ weekday: 'MONDAY', startTime: '08:00', durationMinutes: 240, specificCapacity: 1 });
    const service = await sala.createServiceType({ name: 'Evaluación fixed edit', durationMinutes: 45 }); await prisma.salaPlanService.create({ data: { planId: plan.id, serviceTypeId: service.id } });
    const professor = await users.create({ firstName: 'Prof', lastName: 'Fixed edit', email: `fixed-edit-${uniqueDni()}@sala.test`, roles: [Role.PROFESSOR] });
    const dni = uniqueDni();
    const person = await prisma.person.create({ data: { firstName: 'Fixed', lastName: 'Edit', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } });
    const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' });
    const fixed = await sala.createFixed({ personId: person.id, salaParticipationId: participation.id, scheduleSlotId: window.id, serviceTypeId: service.id, startTime: '10:00', startDate: '2026-08-31' });
    const offeredWithoutSelf = (await sala.availability('2026-08-31', prisma, fixed.id)).filter((slot) => ['09:30', '09:45', '10:00'].includes(slot.startTime));
    expect({ serviceId: service.id, weekday: 'MONDAY', startTime: '09:30', fixedBookingId: fixed.id, participationId: participation.id, requiredSlots: service.durationMinutes / 15 }).toEqual({ serviceId: service.id, weekday: 'MONDAY', startTime: '09:30', fixedBookingId: fixed.id, participationId: participation.id, requiredSlots: 3 });
    expect(offeredWithoutSelf).toHaveLength(3);
    expect(offeredWithoutSelf.every((slot) => slot.available === 1)).toBe(true);
    const changed = await sala.changeFixed({ id: fixed.id, personId: person.id, salaParticipationId: participation.id, scheduleSlotId: window.id, serviceTypeId: service.id, startTime: '09:30', startDate: '2026-08-31' });
    expect(changed.id).toBe(fixed.id);
    expect(changed.startTime?.toISOString().slice(11, 16)).toBe('09:30');
    const persisted = await prisma.fixedSalaBooking.findFirstOrThrow({ where: { id: changed.id } });
    expect({ startTime: persisted.startTime?.toISOString().slice(11, 16), serviceDurationMinutes: persisted.serviceDurationMinutes, scheduleSlotId: persisted.scheduleSlotId }).toEqual({ startTime: '09:30', serviceDurationMinutes: 45, scheduleSlotId: window.id });
  });
  describe('spontaneous attendance with explicit services', () => {
    const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
    const shifted = (offset: number) => new Date(new Date(`${today()}T00:00:00Z`).getTime() + offset * 86400000).toISOString().slice(0, 10);
    async function fixture(date = today(), role: Role = Role.PROFESSOR) {
      const authn = await session(role);
      const professor = role === Role.PROFESSOR ? await prisma.internalUser.findFirstOrThrow({ where: { roles: { some: { role: Role.PROFESSOR } } } }) : await users.create({ firstName: 'Profe', lastName: 'Sintético', email: `profe-${randomUUID()}@test.local`, roles: [Role.PROFESSOR] });
      const actor = await prisma.internalUser.findFirstOrThrow({ where: { email: `${role.toLowerCase()}@sala.test` } });
      const service = await sala.createServiceType({ name: 'Funcional', durationMinutes: 45 });
      const other = await sala.createServiceType({ name: 'Calistenia', durationMinutes: 60 });
      const plan = await sala.createPlan({ name: 'Plan Base', monthlyAmount: 1000, serviceTypeIds: [service.id] });
      const person = await prisma.person.create({ data: { firstName: 'Alumna', lastName: 'Sintética', dni: '30123456', normalizedDni: '30123456', phone: '3515550000', birthDate: new Date('1990-01-01') } });
      const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: shifted(-30) });
      const weekday = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date(`${date}T00:00:00Z`).getUTCDay()] as SalaWeekday;
      const slot = await sala.createSlot({ weekday, startTime: '09:00', durationMinutes: 120, specificCapacity: 1 });
      const input = { personId: person.id, scheduleSlotId: slot.id, date, startTime: '09:00', serviceTypeId: service.id };
      return { authn, actor, professor, person, participation, service, other, plan, slot, input };
    }
    function post(path: string, authn: { cookie: string; csrf: string }, input: object) { return request(app.getHttpServer()).post(`/api/sala/occurrences/spontaneous${path}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(input); }
    it('persists service and a 45-minute snapshot, projects its Professor and occupies only three blocks', async () => {
      const f = await fixture();
      const response = await post('', f.authn, f.input).expect(201);
      expect(response.body.data).toMatchObject({ origin: 'SPONTANEOUS', status: 'ATTENDED', serviceTypeId: f.service.id, serviceDurationMinutes: 45 });
      const persisted = await prisma.salaOccurrence.findUniqueOrThrow({ where: { id: response.body.data.id } });
      expect(persisted.startTime?.toISOString().slice(11, 16)).toBe('09:00');
      expect((await sala.agenda(today()))[0]?.people[0]).toMatchObject({ service: { name: 'Funcional' }, durationMinutes: 45, professional: { id: f.professor.id } });
      expect((await sala.availability(today())).slice(0, 4).map((state) => state.reserved)).toEqual([1, 1, 1, 0]);
      // A later catalog edit must not rewrite attendance duration.
      await sala.updateServiceType(f.service.id, { name: 'Funcional', durationMinutes: 60 });
      expect((await sala.agenda(today()))[0]?.people[0]?.durationMinutes).toBe(45);
      expect((await sala.availability(today()))[3]?.reserved).toBe(0);
    });
    it('keeps a spontaneous arrival at 12:15 valid and occupies three quarter-hour blocks', async () => {
      const f = await fixture();
      await prisma.salaScheduleSlot.update({ where: { id: f.slot.id }, data: { startTime: new Date('1970-01-01T12:00:00Z') } });
      const response = await post('', f.authn, { ...f.input, startTime: '12:15' }).expect(201);
      expect(response.body.data).toMatchObject({ origin: 'SPONTANEOUS', status: 'ATTENDED' });
      expect(response.body.data.startTime).toContain('T12:15:00');
      expect((await sala.availability(today())).slice(0, 5).map(slot => slot.reserved)).toEqual([0, 1, 1, 1, 0]);
    });
    it('rejects services outside the Plan, retired services and missing service without creating attendance', async () => {
      const f = await fixture();
      expect((await post('', f.authn, { ...f.input, serviceTypeId: f.other.id }).expect(400)).body.code).toBe('SALA_SERVICE_NOT_INCLUDED_IN_PLAN');
      await sala.retireServiceType(f.service.id);
      expect((await post('', f.authn, f.input).expect(400)).body.code).toBe('SALA_SERVICE_TYPE_INVALID');
      const missing = { personId: f.input.personId, scheduleSlotId: f.input.scheduleSlotId, date: f.input.date, startTime: f.input.startTime };
      await post('', f.authn, missing).expect(400);
      expect(await prisma.salaOccurrence.count()).toBe(0);
    });
    it('rejects future attendance', async () => {
      const f = await fixture(shifted(1));
      expect((await post('', f.authn, f.input).expect(400)).body.code).toBe('SALA_SPONTANEOUS_FUTURE_NOT_ALLOWED');
      expect(await prisma.salaOccurrence.count()).toBe(0);
    });
    it('uses the applicable past Plan assignment and returns its selectable services in options', async () => {
      const past = shifted(-7); const f = await fixture(past);
      const later = await sala.createPlan({ name: 'Plan posterior', monthlyAmount: 2000, serviceTypeIds: [f.other.id] });
      await prisma.salaParticipation.update({ where: { id: f.participation.id }, data: { planId: later.id, endDate: new Date(`${shifted(-1)}T00:00:00Z`), planAssignments: { create: { planId: later.id, effectiveFrom: new Date(`${shifted(-2)}T00:00:00Z`) } } } });
      const options = await request(app.getHttpServer()).get(`/api/sala/people/${f.person.id}/spontaneous-options?date=${past}`).set('Cookie', f.authn.cookie).expect(200);
      expect(options.body.data).toMatchObject({ eligible: true, participationId: f.participation.id, plan: { id: f.plan.id }, services: [{ id: f.service.id, durationMinutes: 45 }] });
      expect((await post('', f.authn, { ...f.input, serviceTypeId: f.other.id }).expect(400)).body.code).toBe('SALA_SERVICE_NOT_INCLUDED_IN_PLAN');
      await post('', f.authn, f.input).expect(201);
      expect((await sala.agenda(past))[0]?.people[0]).toMatchObject({ origin: 'SPONTANEOUS', status: 'ATTENDED', professional: { id: f.professor.id } });
      expect(await sala.getSpontaneousOptions(f.person.id, today())).toEqual({ eligible: false, services: [] });
    });
    it('falls back to the participation Plan for legacy history and retains legacy occurrence duration', async () => {
      const f = await fixture(shifted(-7));
      await prisma.salaPlanAssignment.deleteMany();
      expect(await sala.getSpontaneousOptions(f.person.id, f.input.date)).toMatchObject({ eligible: true, plan: { id: f.plan.id } });
      await prisma.salaOccurrence.create({ data: { personId: f.person.id, scheduleSlotId: f.slot.id, date: new Date(`${f.input.date}T00:00:00Z`), startTime: new Date('1970-01-01T09:00:00Z'), origin: 'SPONTANEOUS', status: 'ATTENDED', createdBy: f.actor.id, lastModifiedBy: f.actor.id } });
      expect((await sala.agenda(f.input.date))[0]?.people[0]).toMatchObject({ service: null, durationMinutes: 60 });
      expect((await sala.availability(f.input.date)).slice(0, 5).map((state) => state.reserved)).toEqual([1, 1, 1, 1, 0]);
    });
    it('rejects past attendance without valid participation and offers ineligible options', async () => {
      const f = await fixture(shifted(-7));
      await prisma.salaParticipation.update({ where: { id: f.participation.id }, data: { startDate: new Date(`${today()}T00:00:00Z`) } });
      expect((await post('', f.authn, f.input).expect(400)).body.code).toBe('SALA_PARTICIPATION_REQUIRED');
      expect(await sala.getSpontaneousOptions(f.person.id, f.input.date)).toEqual({ eligible: false, services: [] });
      expect(await prisma.salaOccurrence.count()).toBe(0);
    });
    it.each(['fixed', 'reservation', 'occurrence'])('rejects duplicate presence from %s', async (source) => {
      const f = await fixture();
      const booking = { ...f.input, salaParticipationId: f.participation.id };
      if (source === 'fixed') await sala.createFixed({ ...booking, startDate: today() });
      else if (source === 'reservation') await sala.createReservation(booking);
      else await post('', f.authn, f.input).expect(201);
      expect((await post('', f.authn, f.input).expect(409)).body.code).toBe('SALA_OCCURRENCE_DUPLICATE');
      expect(await prisma.salaOccurrence.count()).toBe(source === 'occurrence' ? 1 : 0);
    });
    it('rejects incomplete duration and closed schedules', async () => {
      const f = await fixture();
      expect((await post('', f.authn, { ...f.input, startTime: '10:45' }).expect(409)).body.code).toBe('SALA_REQUIRED_SLOTS_UNAVAILABLE');
      await sala.addException(f.slot.id, { date: today(), type: 'CLOSURE' });
      expect((await post('', f.authn, f.input).expect(409)).body.code).toBe('SALA_SCHEDULE_CLOSED');
      expect(await prisma.salaOccurrence.count()).toBe(0);
    });
    it('requests deliberate overbooking and lets attendance constrain new reservations and fixed bookings', async () => {
      const f = await fixture();
      await post('', f.authn, f.input).expect(201);
      const second = await prisma.person.create({ data: { firstName: 'Otro', lastName: 'Sintético', dni: '30123457', normalizedDni: '30123457', phone: '3515550000', birthDate: new Date('1990-01-01') } });
      const participation = await sala.join({ personId: second.id, planId: f.plan.id, mainProfessorId: f.professor.id, startDate: today() });
      const input = { ...f.input, personId: second.id };
      const rejected = await post('', f.authn, input).expect(409);
      expect(rejected.body).toMatchObject({ code: 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED', details: { fullSlots: 3, requiredSlots: 3 } });
      await expect(sala.createReservation({ ...input, salaParticipationId: participation.id })).rejects.toMatchObject({ response: { code: 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED' } });
      await expect(sala.createFixed({ ...input, salaParticipationId: participation.id, startDate: today() })).rejects.toMatchObject({ response: { code: 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED' } });
      await post('', f.authn, { ...input, confirmOverbooking: true }).expect(201);
      expect((await sala.availability(today())).slice(0, 3).every((state) => state.isOverbooked)).toBe(true);
    });
    it('serializes concurrent attendance at the last available capacity', async () => {
      const f = await fixture();
      const second = await prisma.person.create({ data: { firstName: 'Otra', lastName: 'Concurrente', dni: '30123457', normalizedDni: '30123457', phone: '3515550000', birthDate: new Date('1990-01-01') } });
      await sala.join({ personId: second.id, planId: f.plan.id, mainProfessorId: f.professor.id, startDate: today() });
      const responses = await Promise.all([post('', f.authn, f.input), post('', f.authn, { ...f.input, personId: second.id })]);
      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect(responses.find((response) => response.status === 409)?.body.code).toBe('SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED');
      expect(await prisma.salaOccurrence.count()).toBe(1);
    });
    it.each(['join', 'create-student'])('atomically onboards through %s, returns PIN only for a new Person, and never creates a Payment', async (route) => {
      const f = await fixture();
      await prisma.salaBillingConfiguration.create({ data: { id: 'default', cutoverDate: new Date(`${today()}T00:00:00Z`) } });
      const candidate = route === 'join' ? await prisma.person.create({ data: { firstName: 'Nueva', lastName: 'Existente', dni: '30123457', normalizedDni: '30123457', phone: '3515550000', birthDate: new Date('1990-01-01') } }) : null;
      const input = { scheduleSlotId: f.slot.id, serviceTypeId: f.service.id, startTime: '09:00', date: today(), planId: f.plan.id, mainProfessorId: f.professor.id, ...(candidate ? { personId: candidate.id } : { firstName: 'Nueva', lastName: 'Sintética', dni: '30123457', phone: '3515550000', birthDate: '1990-01-01' }) };
      const response = await post(`/${route}`, f.authn, input).expect(201);
      const createdPerson = await prisma.person.findUniqueOrThrow({ where: { normalizedDni: '30123457' } });
      const participation = await prisma.salaParticipation.findFirstOrThrow({ where: { personId: createdPerson.id } });
      expect(await prisma.salaPlanAssignment.count({ where: { salaParticipationId: participation.id } })).toBe(1);
      expect(await prisma.salaOccurrence.findFirstOrThrow({ where: { personId: createdPerson.id } })).toMatchObject({ status: 'ATTENDED', origin: 'SPONTANEOUS' });
      expect(await prisma.salaPayment.count()).toBe(0);
      expect(await prisma.salaCharge.count({ where: { personId: createdPerson.id } })).toBe(1);
      if (!candidate) {
        const pin = response.body.data.person.initialPin;
        expect(pin).toMatch(/^\d{4}$/);
        const credential = await prisma.portalCredential.findUniqueOrThrow({ where: { personId: createdPerson.id } });
        expect(await argon2.verify(credential.pinHash, pin)).toBe(true);
        expect(credential.mustChangePin).toBe(true);
      }
      // Full capacity must roll back every onboarding record, including the generated charge.
      const failed = { ...input, ...(candidate ? { personId: f.person.id } : { dni: '30123458' }) };
      if (candidate) await prisma.salaParticipation.delete({ where: { id: f.participation.id } });
      const counts = { people: await prisma.person.count(), credentials: await prisma.portalCredential.count(), assignments: await prisma.salaPlanAssignment.count(), participations: await prisma.salaParticipation.count(), charges: await prisma.salaCharge.count(), occurrences: await prisma.salaOccurrence.count() };
      expect((await post(`/${route}`, f.authn, failed).expect(409)).body.code).toBe('SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED');
      expect({ people: await prisma.person.count(), credentials: await prisma.portalCredential.count(), assignments: await prisma.salaPlanAssignment.count(), participations: await prisma.salaParticipation.count(), charges: await prisma.salaCharge.count(), occurrences: await prisma.salaOccurrence.count() }).toEqual(counts);
      if (!candidate) expect(await prisma.person.findUnique({ where: { normalizedDni: '30123458' } })).toBeNull();
    });
    it.each(['join', 'create-student'])('allows inline %s only today', async (route) => {
      const f = await fixture();
      const input = { scheduleSlotId: f.slot.id, serviceTypeId: f.service.id, startTime: '09:00', planId: f.plan.id, mainProfessorId: f.professor.id, ...(route === 'join' ? { personId: f.person.id } : { firstName: 'Nueva', lastName: 'Sintética', dni: '30123458', phone: '3515550000', birthDate: '1990-01-01' }) };
      for (const date of [shifted(-1), shifted(1)]) expect((await post(`/${route}`, f.authn, { ...input, date }).expect(400)).body.code).toBe('SALA_SPONTANEOUS_ONBOARDING_TODAY_ONLY');
      expect(await prisma.person.count()).toBe(1); expect(await prisma.salaOccurrence.count()).toBe(0);
    });
    it.each([Role.PROFESSOR, Role.ADMINISTRATIVE, Role.GENERAL_ADMIN])('preserves spontaneous permissions for %s', async (role) => {
      const f = await fixture(today(), role);
      await post('', f.authn, f.input).expect(201);
      const student = { scheduleSlotId: f.slot.id, serviceTypeId: f.service.id, startTime: '10:00', date: today(), planId: f.plan.id, mainProfessorId: f.professor.id, firstName: 'Nueva', lastName: 'Sintética', dni: '30123458', phone: '3515550000', birthDate: '1990-01-01' };
      await post('/create-student', f.authn, student).expect(201);
    });
    it('uses the current Plan today and offers only its selectable services sorted by name', async () => {
      const f = await fixture();
      const alphabetical = await sala.createServiceType({ name: 'Aeróbico', durationMinutes: 30 });
      const current = await sala.createPlan({ name: 'Plan actual', monthlyAmount: 1500, serviceTypeIds: [f.other.id, alphabetical.id] });
      await prisma.salaParticipation.update({ where: { id: f.participation.id }, data: { planId: current.id, planAssignments: { create: { planId: current.id, effectiveFrom: new Date(`${shifted(20)}T00:00:00Z`) } } } });
      const options = await sala.getSpontaneousOptions(f.person.id, today());
      expect(options).toMatchObject({ plan: { id: current.id }, services: [{ id: alphabetical.id }, { id: f.other.id }] });
      await sala.retireServiceType(f.other.id);
      expect((await sala.getSpontaneousOptions(f.person.id, today())).services).toEqual([{ id: alphabetical.id, name: 'Aeróbico', durationMinutes: 30 }]);
      await post('', f.authn, { ...f.input, serviceTypeId: alphabetical.id }).expect(201);
    });
    it('keeps the existing duplicate DNI error and leaves no inline onboarding records', async () => {
      const f = await fixture();
      const before = { people: await prisma.person.count(), credentials: await prisma.portalCredential.count(), assignments: await prisma.salaPlanAssignment.count(), participations: await prisma.salaParticipation.count() };
      const input = { scheduleSlotId: f.slot.id, serviceTypeId: f.service.id, startTime: '09:00', date: today(), planId: f.plan.id, mainProfessorId: f.professor.id, firstName: 'Duplicada', lastName: 'Sintética', dni: f.person.dni, phone: '3515550000', birthDate: '1990-01-01' };
      expect((await post('/create-student', f.authn, input).expect(409)).body.code).toBe('PERSON_DNI_ALREADY_EXISTS');
      expect({ people: await prisma.person.count(), credentials: await prisma.portalCredential.count(), assignments: await prisma.salaPlanAssignment.count(), participations: await prisma.salaParticipation.count() }).toEqual(before);
      expect(await prisma.salaOccurrence.count()).toBe(0);
    });
    it('rejects users lacking agenda permission on all spontaneous endpoints', async () => {
      const f = await fixture(); const denied = await session(Role.KINESIOLOGIST);
      await post('', denied, f.input).expect(403);
      await post('/join', denied, { ...f.input, planId: f.plan.id, mainProfessorId: f.professor.id }).expect(403);
      await post('/create-student', denied, { scheduleSlotId: f.slot.id, serviceTypeId: f.service.id, startTime: '09:00', date: today(), planId: f.plan.id, mainProfessorId: f.professor.id, firstName: 'Nueva', lastName: 'Sintética', dni: '30123458', phone: '3515550000', birthDate: '1990-01-01' }).expect(403);
      expect(await prisma.salaOccurrence.count()).toBe(0);
    });
  });

});
