import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { InternalUserService } from '../src/team/internal-user.service';
import { SalaService } from '../src/sala/sala.service';

describe('Sala configuration API', () => {
  let app: INestApplication; let prisma: PrismaService; let users: InternalUserService; let auth: AuthService; let sala: SalaService;
  async function cleanSalaFixtures() { await prisma.clinicalPatient.deleteMany(); await prisma.physicalTestResult.deleteMany(); await prisma.physicalEvaluation.deleteMany(); await prisma.physicalTestDefinition.deleteMany(); await prisma.routineExercise.deleteMany(); await prisma.routineDay.deleteMany(); await prisma.routine.deleteMany(); await prisma.exerciseDefinition.deleteMany(); await prisma.salaOccurrence.deleteMany(); await prisma.oneOffReservation.deleteMany(); await prisma.fixedSalaBooking.deleteMany(); await prisma.salaServiceType.deleteMany(); await prisma.salaCharge.deleteMany(); await prisma.salaBillingConfiguration.deleteMany(); await prisma.salaParticipation.deleteMany(); await prisma.salaScheduleException.deleteMany(); await prisma.salaScheduleSlot.deleteMany(); await prisma.salaPlan.deleteMany(); await prisma.salaConfiguration.deleteMany(); await prisma.session.deleteMany(); await prisma.internalCredential.deleteMany(); await prisma.internalUserRole.deleteMany(); await prisma.internalUser.deleteMany(); await prisma.portalCredential.deleteMany(); await prisma.person.deleteMany(); }
  beforeAll(async () => { app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication(); app.use(cookieParser()); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); app.setGlobalPrefix('api'); await app.init(); prisma = app.get(PrismaService); users = app.get(InternalUserService); auth = app.get(AuthService); sala = app.get(SalaService); await cleanSalaFixtures(); });
  afterEach(cleanSalaFixtures);
  afterAll(() => app.close());
  const uniqueDni = () => `${Date.now()}${Math.floor(Math.random() * 100000)}`.slice(-12);
  async function session(role: Role) { const user = await users.create({ firstName: 'Sala', lastName: 'User', email: `${role.toLowerCase()}@sala.test`, roles: [role] }); await auth.provisionCredential(user.id, 'ValidPass1!'); await prisma.internalCredential.update({ where: { internalUserId: user.id }, data: { mustChangePassword: false } }); const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(200); return { cookie: login.headers['set-cookie'][0] as string, csrf: login.body.data.csrfToken as string }; }
  it('configures positive capacity, plans, slots and explicit closure/override exceptions', async () => {
    const authn = await session(Role.ADMINISTRATIVE);
    await request(app.getHttpServer()).patch('/api/sala/configuration').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ capacity: 12 }).expect(200);
    const plan = await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'Mensual', monthlyAmount: 30000 }).expect(201);
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
    const plan = await prisma.salaPlan.create({ data: { name: 'Disponible', monthlyAmount: 1000 } });
    await request(app.getHttpServer()).get('/api/sala/plans').set('Cookie', authn.cookie).expect(200);
    await request(app.getHttpServer()).get('/api/team/users').set('Cookie', authn.cookie).expect(403);
    await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'No', monthlyAmount: 1 }).expect(403);
    await request(app.getHttpServer()).patch(`/api/sala/plans/${plan.id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'No', monthlyAmount: 1 }).expect(403);
    await request(app.getHttpServer()).post(`/api/sala/plans/${plan.id}/retire`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).expect(403);
    expect(await prisma.salaPlan.findUnique({ where: { id: plan.id } })).toMatchObject({ name: 'Disponible', isSelectable: true });
  });
  it.each([Role.ADMINISTRATIVE, Role.GENERAL_ADMIN])('preserves plan reading and administration for %s', async (role) => {
    const authn = await session(role);
    const created = await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'Mensual', monthlyAmount: 1000 }).expect(201);
    await request(app.getHttpServer()).get('/api/sala/plans').set('Cookie', authn.cookie).expect(200);
    await request(app.getHttpServer()).patch(`/api/sala/plans/${created.body.data.id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'Actualizado', monthlyAmount: 2000 }).expect(200);
    await request(app.getHttpServer()).post(`/api/sala/plans/${created.body.data.id}/retire`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).expect(201);
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
  it('creates one-off reservations, reports availability and requires explicit overbooking confirmation', async () => {
    const authn = await session(Role.ADMINISTRATIVE); const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Booking', lastName: 'Sala', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const plan = await prisma.salaPlan.create({ data: { name: `Booking-${dni}`, monthlyAmount: 1000 } }); const professor = await users.create({ firstName: 'Prof', lastName: 'Booking', email: `prof-booking-${dni}@sala.test`, roles: [Role.PROFESSOR] }); const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); const slot = await sala.createSlot({ weekday: 'MONDAY', startTime: '09:00', durationMinutes: 60 });
    const service = await sala.createServiceType({ name: `Gimnasio-${dni}`, durationMinutes: 60 }); const date = '2026-08-31'; await request(app.getHttpServer()).post('/api/sala/reservations').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ personId: person.id, salaParticipationId: participation.id, scheduleSlotId: slot.id, serviceTypeId: service.id, startTime: '09:00', date }).expect(201); const state = await sala.availability(date); expect(state.find((item) => item.scheduleSlotId === slot.id)?.reserved).toBe(1); await expect(sala.createReservation({ personId: person.id, salaParticipationId: participation.id, scheduleSlotId: slot.id, serviceTypeId: service.id, startTime: '09:00', date, confirmOverbooking: true })).rejects.toMatchObject({ response: { code: 'SALA_RESERVATION_DUPLICATE' } });
  });
  it('serializes concurrent last-slot reservations in PostgreSQL', async () => {
    const plan = await prisma.salaPlan.create({ data: { name: 'Concurrent booking', monthlyAmount: 1000 } }); const slot = await sala.createSlot({ weekday: 'MONDAY', startTime: '10:00', durationMinutes: 60 }); const professor = await users.create({ firstName: 'Prof', lastName: 'Race', email: `race-${uniqueDni()}@sala.test`, roles: [Role.PROFESSOR] });
    const people = await Promise.all([1, 2].map(async (index) => { const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: `Race${index}`, lastName: 'Booking', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); return sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); })); const date = '2026-08-31'; const results = await Promise.allSettled(people.map((participation) => sala.createReservation({ personId: participation.personId, salaParticipationId: participation.id, scheduleSlotId: slot.id, date }))); expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1); expect((await sala.availability(date)).find((item) => item.scheduleSlotId === slot.id)?.reserved).toBe(1);
  });
  it('requires explicit confirmation and records deliberate internal overbooking', async () => {
    const plan = await prisma.salaPlan.create({ data: { name: 'Overbook', monthlyAmount: 1000 } }); const slot = await sala.createSlot({ weekday: 'MONDAY', startTime: '11:00', durationMinutes: 60, specificCapacity: 1 }); const professor = await users.create({ firstName: 'Prof', lastName: 'Overbook', email: `over-${uniqueDni()}@sala.test`, roles: [Role.PROFESSOR] });
    const participations = await Promise.all([1, 2].map(async (index) => { const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: `Over${index}`, lastName: 'Booking', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); return sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); })); const date = '2026-08-31'; await sala.createReservation({ personId: participations[0]!.personId, salaParticipationId: participations[0]!.id, scheduleSlotId: slot.id, date }); await expect(sala.createReservation({ personId: participations[1]!.personId, salaParticipationId: participations[1]!.id, scheduleSlotId: slot.id, date })).rejects.toMatchObject({ response: { code: 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED' } }); await sala.createReservation({ personId: participations[1]!.personId, salaParticipationId: participations[1]!.id, scheduleSlotId: slot.id, date, confirmOverbooking: true }); await expect(sala.availability(date)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ scheduleSlotId: slot.id, reserved: 2, isOverbooked: true })]));
  });
  it('occupies every 15-minute slot, rejects an out-of-window start and overbooks atomically', async () => {
    const plan = await prisma.salaPlan.create({ data: { name: 'Multi slot', monthlyAmount: 1000 } });
    const window = await sala.createSlot({ weekday: 'MONDAY', startTime: '08:00', durationMinutes: 720, specificCapacity: 1 });
    const service = await sala.createServiceType({ name: 'Gimnasio', durationMinutes: 60 });
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
    const plan = await prisma.salaPlan.create({ data: { name: 'Multi race', monthlyAmount: 1000 } }); const window = await sala.createSlot({ weekday: 'MONDAY', startTime: '08:00', durationMinutes: 720, specificCapacity: 1 }); const service = await sala.createServiceType({ name: 'Gimnasio race', durationMinutes: 60 }); const professor = await users.create({ firstName: 'Prof', lastName: 'Multi race', email: `multi-race-${uniqueDni()}@sala.test`, roles: [Role.PROFESSOR] });
    const participations = await Promise.all([1,2].map(async(index)=>{const dni=uniqueDni();const person=await prisma.person.create({data:{firstName:`Concurrent${index}`,lastName:'Multi',dni,normalizedDni:dni,phone:'351',birthDate:new Date('1991-01-01T00:00:00Z')}});return sala.join({personId:person.id,planId:plan.id,mainProfessorId:professor.id,startDate:'2026-01-01'});}));
    const results = await Promise.allSettled(participations.map((participation)=>sala.createReservation({personId:participation.personId,salaParticipationId:participation.id,scheduleSlotId:window.id,serviceTypeId:service.id,startTime:'12:00',date:'2026-08-31'})));
    expect(results.filter((result)=>result.status==='fulfilled')).toHaveLength(1); expect(await prisma.oneOffReservation.count({where:{scheduleSlotId:window.id,date:new Date('2026-08-31T00:00:00Z')}})).toBe(1);
  });
  it('rejects duplicate one-off reservations racing at the database boundary', async () => {
    const plan = await prisma.salaPlan.create({ data: { name: 'Duplicate race', monthlyAmount: 1000 } }); const slot = await sala.createSlot({ weekday: 'MONDAY', startTime: '12:00', durationMinutes: 60, specificCapacity: 5 }); const professor = await users.create({ firstName: 'Prof', lastName: 'Duplicate', email: `dup-${uniqueDni()}@sala.test`, roles: [Role.PROFESSOR] }); const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Duplicate', lastName: 'Booking', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); const results = await Promise.allSettled([1, 2].map(() => sala.createReservation({ personId: person.id, salaParticipationId: participation.id, scheduleSlotId: slot.id, date: '2026-08-31' }))); expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1); expect(await prisma.oneOffReservation.count({ where: { personId: person.id, date: new Date('2026-08-31T00:00:00Z') } })).toBe(1);
  });
  it('updates capacity without replacing the schedule or cancelling bookings', async () => {
    const plan = await prisma.salaPlan.create({ data: { name: 'Non structural', monthlyAmount: 1000 } }); const slot = await sala.createSlot({ weekday: 'MONDAY', startTime: '13:00', durationMinutes: 60, specificCapacity: 2 }); const professor = await users.create({ firstName: 'Prof', lastName: 'Capacity', email: `cap-${uniqueDni()}@sala.test`, roles: [Role.PROFESSOR] }); const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Capacity', lastName: 'Booking', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const dni2 = uniqueDni(); const person2 = await prisma.person.create({ data: { firstName: 'Capacity2', lastName: 'Booking', dni: dni2, normalizedDni: dni2, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); const participation2 = await sala.join({ personId: person2.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); await sala.createReservation({ personId: person.id, salaParticipationId: participation.id, scheduleSlotId: slot.id, date: '2026-08-31' }); await sala.createReservation({ personId: person2.id, salaParticipationId: participation2.id, scheduleSlotId: slot.id, date: '2026-08-31' }); await sala.updateSlot(slot.id, { weekday: 'MONDAY', startTime: '13:00', durationMinutes: 90, specificCapacity: 1 }); expect(await prisma.salaScheduleSlot.count({ where: { id: slot.id, isActive: true } })).toBe(1); expect(await prisma.oneOffReservation.count({ where: { scheduleSlotId: slot.id, cancelledAt: null } })).toBe(2); await expect(sala.availability('2026-08-31')).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ scheduleSlotId: slot.id, capacity: 1, isOverbooked: true })]));
  });
  it('replaces a schedule atomically and preserves old schedule history', async () => {
    const slot = await sala.createSlot({ weekday: 'TUESDAY', startTime: '14:00', durationMinutes: 60 }); const replacement = await sala.replaceSlot(slot.id, { weekday: 'WEDNESDAY', startTime: '15:00', durationMinutes: 60, specificCapacity: 1, effectiveDate: '2026-09-01' }); expect((await prisma.salaScheduleSlot.findUnique({ where: { id: slot.id } }))?.isActive).toBe(false); expect(replacement.weekday).toBe('WEDNESDAY'); expect(await prisma.salaScheduleSlot.count({ where: { isActive: true, weekday: 'WEDNESDAY' } })).toBe(1);
  });
  it('rolls back schedule replacement after booking mutations fail', async () => {
    const plan = await prisma.salaPlan.create({ data: { name: 'Rollback', monthlyAmount: 1000 } }); const slot = await sala.createSlot({ weekday: 'THURSDAY', startTime: '16:00', durationMinutes: 60 }); const professor = await users.create({ firstName: 'Prof', lastName: 'Rollback', email: `rollback-${uniqueDni()}@sala.test`, roles: [Role.PROFESSOR] }); const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Rollback', lastName: 'Person', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); const fixed = await sala.createFixed({ personId: person.id, salaParticipationId: participation.id, scheduleSlotId: slot.id, startDate: '2026-01-01' }); const reservation = await sala.createReservation({ personId: person.id, salaParticipationId: participation.id, scheduleSlotId: slot.id, date: '2026-08-27', confirmOverbooking: true }); await expect(sala.replaceSlot(slot.id, { weekday: 'FRIDAY', startTime: '17:00', durationMinutes: 60, effectiveDate: '2026-08-27' }, true)).rejects.toThrow('SIMULATED_SCHEDULE_REPLACEMENT_FAILURE'); expect((await prisma.salaScheduleSlot.findUnique({ where: { id: slot.id } }))?.isActive).toBe(true); expect((await prisma.fixedSalaBooking.findUnique({ where: { id: fixed.id } }))?.endDate).toBeNull(); expect((await prisma.oneOffReservation.findUnique({ where: { id: reservation.id } }))?.cancelledAt).toBeNull(); expect(await prisma.salaScheduleSlot.count({ where: { weekday: 'FRIDAY' } })).toBe(0);
  });
  it('rolls back LeaveSala after booking mutations fail', async () => {
    const plan = await prisma.salaPlan.create({ data: { name: 'Leave rollback', monthlyAmount: 1000 } }); const slot = await sala.createSlot({ weekday: 'FRIDAY', startTime: '18:00', durationMinutes: 60 }); const professor = await users.create({ firstName: 'Prof', lastName: 'Leave rollback', email: `leave-rollback-${uniqueDni()}@sala.test`, roles: [Role.PROFESSOR] }); const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Leave', lastName: 'Rollback', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); const fixed = await sala.createFixed({ personId: person.id, salaParticipationId: participation.id, scheduleSlotId: slot.id, startDate: '2026-01-01' }); const reservation = await sala.createReservation({ personId: person.id, salaParticipationId: participation.id, scheduleSlotId: slot.id, date: '2026-08-28', confirmOverbooking: true }); await expect(sala.leave(participation.id, true)).rejects.toThrow('SIMULATED_LEAVE_FAILURE'); expect((await prisma.salaParticipation.findUnique({ where: { id: participation.id } }))?.endDate).toBeNull(); expect((await prisma.fixedSalaBooking.findUnique({ where: { id: fixed.id } }))?.endDate).toBeNull(); expect((await prisma.oneOffReservation.findUnique({ where: { id: reservation.id } }))?.cancelledAt).toBeNull();
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
    const service = await sala.createServiceType({ name: 'Evaluación fixed edit', durationMinutes: 45 });
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
});
