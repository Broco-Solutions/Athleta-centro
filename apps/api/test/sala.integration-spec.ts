import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Prisma, Role, type Person, type SalaParticipation, type SalaWeekday } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { InternalUserService } from '../src/team/internal-user.service';
import { SalaService } from '../src/sala/sala.service';

describe('Sala configuration API', () => {
  let app: INestApplication; let prisma: PrismaService; let users: InternalUserService; let auth: AuthService; let sala: SalaService;
  it('persists normalized movement patterns and preserves exercises on rename and reassignment', async () => {
    const sala = app.get(SalaService);
    const legacy = await sala.createExerciseDefinition({ name: 'Legacy exercise' });
    expect(legacy.movementPatternId).toBeNull();
    await expect(sala.saveMovementPattern('   ')).rejects.toThrow();
    const pattern = await sala.saveMovementPattern(' Empuje ');
    await expect(sala.saveMovementPattern('empuje')).rejects.toMatchObject({ response: { code: 'SALA_MOVEMENT_PATTERN_DUPLICATE' } });
    const exercise = await sala.createExerciseDefinition({ name: 'Press', movementPatternId: pattern.id });
    await sala.saveMovementPattern('Empuje superior', pattern.id);
    expect(await sala.listMovementPatterns()).toEqual(expect.arrayContaining([expect.objectContaining({ id: pattern.id, name: 'Empuje superior' })]));
    const other = await sala.saveMovementPattern('Tracción');
    const updated = await sala.updateExerciseDefinition(exercise.id, { name: 'Press', movementPatternId: other.id });
    expect(updated).toMatchObject({ id: exercise.id, movementPatternId: other.id });
    await expect(sala.createExerciseDefinition({ name: 'Invalid', movementPatternId: '00000000-0000-4000-8000-000000000000' })).rejects.toMatchObject({ response: { code: 'SALA_MOVEMENT_PATTERN_NOT_FOUND' } });
  });
  it('deletes a movement pattern while preserving active, retired, and routine exercise references', async () => {
    const pattern = await sala.saveMovementPattern('Empuje');
    const active = await sala.createExerciseDefinition({ name: 'Press activo', movementPatternId: pattern.id });
    const retired = await sala.createExerciseDefinition({ name: 'Press retirado', movementPatternId: pattern.id });
    await prisma.exerciseDefinition.update({ where: { id: retired.id }, data: { isActive: false } });
    const template = await sala.createRoutineTemplate({ name: 'Modelo', days: [{ exercises: [{ exerciseDefinitionId: active.id }] }] });
    await sala.deleteMovementPattern(pattern.id);
    expect(await prisma.exerciseMovementPattern.findUnique({ where: { id: pattern.id } })).toBeNull();
    expect(await prisma.exerciseDefinition.findMany({ where: { id: { in: [active.id, retired.id] } }, orderBy: { name: 'asc' } })).toEqual(expect.arrayContaining([expect.objectContaining({ id: active.id, isActive: true, movementPatternId: null }), expect.objectContaining({ id: retired.id, isActive: false, movementPatternId: null })]));
    expect((await sala.listRoutineTemplates()).find((item) => item.id === template.id)?.days[0]?.exercises[0]?.exerciseDefinitionId).toBe(active.id);
    await expect(sala.deleteMovementPattern(pattern.id)).rejects.toMatchObject({ response: { code: 'SALA_MOVEMENT_PATTERN_NOT_FOUND' } });
  });
  it('rolls back exercise unassignment when pattern deletion fails', async () => {
    const pattern = await sala.saveMovementPattern('Rotación');
    const exercise = await sala.createExerciseDefinition({ name: 'Rotación externa', movementPatternId: pattern.id });
    await prisma.$executeRawUnsafe(`CREATE FUNCTION test_reject_movement_pattern_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SIMULATED_PATTERN_DELETE_FAILURE'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER test_reject_movement_pattern_delete BEFORE DELETE ON exercise_movement_patterns FOR EACH ROW EXECUTE FUNCTION test_reject_movement_pattern_delete()`);
    try {
      await expect(sala.deleteMovementPattern(pattern.id)).rejects.toThrow('SIMULATED_PATTERN_DELETE_FAILURE');
      expect(await prisma.exerciseDefinition.findUnique({ where: { id: exercise.id } })).toMatchObject({ movementPatternId: pattern.id });
      expect(await prisma.exerciseMovementPattern.findUnique({ where: { id: pattern.id } })).not.toBeNull();
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER test_reject_movement_pattern_delete ON exercise_movement_patterns');
      await prisma.$executeRawUnsafe('DROP FUNCTION test_reject_movement_pattern_delete()');
    }
  });
  it('returns a clear conflict and keeps a template exercise active when retirement is attempted over HTTP', async () => {
    const authn = await session(Role.PROFESSOR);
    const exercise = await sala.createExerciseDefinition({ name: 'Peso muerto' });
    await sala.createRoutineTemplate({ name: 'Fuerza', days: [{ exercises: [{ exerciseDefinitionId: exercise.id }] }] });
    const response = await request(app.getHttpServer()).post(`/api/sala/exercise-definitions/${exercise.id}/retire`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ confirmActiveRoutineImpact: true }).expect(409);
    expect(response.body).toMatchObject({ code: 'SALA_EXERCISE_IN_ROUTINE_TEMPLATE', message: 'No se puede retirar el ejercicio porque está incluido en una rutina preestablecida. Primero quitá el ejercicio de esa rutina para poder retirarlo.' });
    expect(await prisma.exerciseDefinition.findUnique({ where: { id: exercise.id } })).toMatchObject({ isActive: true });
  });
  it('protects the movement pattern delete endpoint with routine management permission', async () => {
    const pattern = await sala.saveMovementPattern('Tracción');
    const allowed = await session(Role.PROFESSOR);
    await request(app.getHttpServer()).delete(`/api/sala/movement-patterns/${pattern.id}`).set('Cookie', allowed.cookie).set('x-csrf-token', allowed.csrf).expect(200);
    await expect(sala.deleteMovementPattern(pattern.id)).rejects.toMatchObject({ response: { code: 'SALA_MOVEMENT_PATTERN_NOT_FOUND' } });
    const denied = await session(Role.BROCO_SUPPORT);
    const another = await sala.saveMovementPattern('Empuje');
    await request(app.getHttpServer()).delete(`/api/sala/movement-patterns/${another.id}`).set('Cookie', denied.cookie).set('x-csrf-token', denied.csrf).expect(403);
    expect(await prisma.exerciseMovementPattern.findUnique({ where: { id: another.id } })).not.toBeNull();
  });
  async function cleanSalaFixtures() { await prisma.salaClinicalIndication.deleteMany(); await prisma.salaPaymentReversal.deleteMany(); await prisma.salaPaymentAllocation.deleteMany(); await prisma.salaPayment.deleteMany(); await prisma.clinicalPatient.deleteMany(); await prisma.physicalTestResult.deleteMany(); await prisma.physicalEvaluation.deleteMany(); await prisma.physicalTestDefinition.deleteMany(); await prisma.routineExercise.deleteMany(); await prisma.routineDay.deleteMany(); await prisma.routine.deleteMany(); await prisma.routineTemplate.deleteMany(); await prisma.exerciseDefinition.deleteMany(); await prisma.exerciseMovementPattern.deleteMany(); await prisma.salaOccurrence.deleteMany(); await prisma.oneOffReservation.deleteMany(); await prisma.fixedSalaBooking.deleteMany(); await prisma.salaServiceType.deleteMany(); await prisma.salaCharge.deleteMany(); await prisma.salaBillingConfiguration.deleteMany(); await prisma.salaParticipation.deleteMany(); await prisma.salaScheduleException.deleteMany(); await prisma.salaScheduleSlot.deleteMany(); await prisma.salaPlan.deleteMany(); await prisma.salaConfiguration.deleteMany(); await prisma.paperHealthDeclaration.deleteMany(); await prisma.healthDeclaration.deleteMany(); await prisma.session.deleteMany(); await prisma.internalCredential.deleteMany(); await prisma.internalUserRole.deleteMany(); await prisma.internalUser.deleteMany(); await prisma.portalCredential.deleteMany(); await prisma.person.deleteMany(); }
  beforeAll(async () => { app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication(); app.use(cookieParser()); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); app.setGlobalPrefix('api'); await app.init(); prisma = app.get(PrismaService); users = app.get(InternalUserService); auth = app.get(AuthService); sala = app.get(SalaService); await cleanSalaFixtures(); });
  afterEach(cleanSalaFixtures);
  afterAll(() => app.close());
  const uniqueDni = () => `${Date.now()}${Math.floor(Math.random() * 100000)}`.slice(-12);
  async function session(role: Role, httpApp = app) { const user = await users.create({ firstName: 'Sala', lastName: 'User', email: `${role.toLowerCase()}@sala.test`, roles: [role] }); await auth.provisionCredential(user.id, 'ValidPass1!'); await prisma.internalCredential.update({ where: { internalUserId: user.id }, data: { mustChangePassword: false } }); const login = await request(httpApp.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(200); return { cookie: login.headers['set-cookie'][0] as string, csrf: login.body.data.csrfToken as string }; }
  it('configures positive capacity, plans, slots and explicit closure/override exceptions', async () => {
    const authn = await session(Role.ADMINISTRATIVE);
    const service = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 });
    await request(app.getHttpServer()).patch('/api/sala/configuration').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ capacity: 12 }).expect(200);
    const plan = await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'Mensual', monthlyAmount: 30000, weeklySessions: 5, serviceTypeIds: [service.id] }).expect(201);
    expect(plan.body.data.monthlyAmount).toBe('30000');
    const slot = await request(app.getHttpServer()).post('/api/sala/schedule').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ weekday: 'MONDAY', startTime: '09:00', durationMinutes: 60 }).expect(201);
    await request(app.getHttpServer()).post(`/api/sala/schedule/${slot.body.data.id}/exceptions`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ date: '2026-09-01', type: 'CLOSURE' }).expect(201);
    const override = await request(app.getHttpServer()).post(`/api/sala/schedule/${slot.body.data.id}/exceptions`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ date: '2026-09-02', type: 'CAPACITY_OVERRIDE', capacityOverride: 4 }).expect(201);
    expect(override.body.data.capacityOverride).toBe(4);
  });
  it('rejects non-positive capacities and overlapping slots', async () => {
    const authn = await session(Role.ADMINISTRATIVE);
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
    await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'No', monthlyAmount: 1, weeklySessions: 5, serviceTypeIds: [service.id] }).expect(403);
    await request(app.getHttpServer()).patch(`/api/sala/plans/${plan.id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'No', monthlyAmount: 1, weeklySessions: 5, serviceTypeIds: [service.id] }).expect(403);
    await request(app.getHttpServer()).post(`/api/sala/plans/${plan.id}/retire`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).expect(403);
    expect(await prisma.salaPlan.findUnique({ where: { id: plan.id } })).toMatchObject({ name: 'Disponible', isSelectable: true });
  });
  it.each([Role.ADMINISTRATIVE, Role.GENERAL_ADMIN])('preserves plan reading and administration for %s', async (role) => {
    const authn = await session(role);
    const service = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 });
    const created = await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'Mensual', monthlyAmount: 1000, weeklySessions: 5, serviceTypeIds: [service.id] }).expect(201);
    await request(app.getHttpServer()).get('/api/sala/plans').set('Cookie', authn.cookie).expect(200);
    await request(app.getHttpServer()).patch(`/api/sala/plans/${created.body.data.id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'Actualizado', monthlyAmount: 2000, weeklySessions: 5, serviceTypeIds: [service.id] }).expect(200);
    await request(app.getHttpServer()).post(`/api/sala/plans/${created.body.data.id}/retire`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).expect(201);
  });
  it('creates and lists plans with sorted service projections and persisted links', async () => {
    const authn = await session(Role.ADMINISTRATIVE);
    const muscle = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 });
    const functional = await sala.createServiceType({ name: 'Funcional', durationMinutes: 45 });
    const created = await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf)
      .send({ name: ' Plan Base ', monthlyAmount: 20000, weeklySessions: 5, serviceTypeIds: [muscle.id, functional.id] }).expect(201);
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
      .send({ name: 'Otro Plan', monthlyAmount: 30000, weeklySessions: 5, serviceTypeIds: [muscle.id] }).expect(201);
    expect(await prisma.salaPlanService.count({ where: { serviceTypeId: muscle.id } })).toBe(2);
  });
  it('replaces the complete plan service set atomically with the plan fields', async () => {
    const authn = await session(Role.ADMINISTRATIVE);
    const muscle = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 });
    const functional = await sala.createServiceType({ name: 'Funcional', durationMinutes: 45 });
    const calisthenics = await sala.createServiceType({ name: 'Calistenia', durationMinutes: 60 });
    const plan = await sala.createPlan({ name: 'Plan Base', monthlyAmount: 20000, weeklySessions: 5, serviceTypeIds: [muscle.id, functional.id] });
    const updated = await request(app.getHttpServer()).patch(`/api/sala/plans/${plan.id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf)
      .send({ name: 'Plan editado', monthlyAmount: 25000, weeklySessions: 5, isSelectable: false, serviceTypeIds: [muscle.id, calisthenics.id] }).expect(200);
    expect(updated.body.data).toMatchObject({ name: 'Plan editado', monthlyAmount: '25000', isSelectable: false,
      services: [expect.objectContaining({ id: calisthenics.id }), expect.objectContaining({ id: muscle.id })] });
    const links = await prisma.salaPlanService.findMany({ where: { planId: plan.id } });
    expect(links.map((link) => link.serviceTypeId).sort()).toEqual([muscle.id, calisthenics.id].sort());
    expect(await prisma.salaPlan.findUnique({ where: { id: plan.id } })).toMatchObject({ name: 'Plan editado', isSelectable: false });
  });
  it.each(['duplicate', 'not-uuid'])('rejects %s service arrays without creating a plan', async (invalid) => {
    const authn = await session(Role.ADMINISTRATIVE);
    const service = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 });
    const ids = invalid === 'empty' ? [] : invalid === 'duplicate' ? [service.id, service.id] : ['invalid'];
    await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf)
      .send({ name: 'Inválido', monthlyAmount: 20000, weeklySessions: 5, ...(invalid === 'missing' ? {} : { serviceTypeIds: ids }) }).expect(400);
    expect(await prisma.salaPlan.count()).toBe(0);
    expect(await prisma.salaPlanService.count()).toBe(0);
  });
  it.each(['unknown', 'retired'])('rejects %s services on create/update and preserves the persisted plan', async (invalid) => {
    const authn = await session(Role.GENERAL_ADMIN);
    const muscle = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 });
    const retired = await sala.createServiceType({ name: 'Funcional', durationMinutes: 45 });
    await sala.retireServiceType(retired.id);
    const invalidId = invalid === 'unknown' ? crypto.randomUUID() : retired.id;
    const plan = await sala.createPlan({ name: 'Plan Base', monthlyAmount: 20000, weeklySessions: 5, serviceTypeIds: [muscle.id] });
    const before = await prisma.salaPlan.findUnique({ where: { id: plan.id } });
    const beforeLinks = await prisma.salaPlanService.findMany({ where: { planId: plan.id } });
    const created = await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf)
      .send({ name: 'Inválido', monthlyAmount: 30000, weeklySessions: 5, serviceTypeIds: [muscle.id, invalidId] }).expect(400);
    expect(created.body.code).toBe('SALA_PLAN_SERVICE_INVALID');
    expect(await prisma.salaPlan.count()).toBe(1);
    const updated = await request(app.getHttpServer()).patch(`/api/sala/plans/${plan.id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf)
      .send({ name: 'No guardar', monthlyAmount: 30000, weeklySessions: 5, isSelectable: false, serviceTypeIds: [muscle.id, invalidId] }).expect(400);
    expect(updated.body.code).toBe('SALA_PLAN_SERVICE_INVALID');
    expect(await prisma.salaPlan.findUnique({ where: { id: plan.id } })).toEqual(before);
    expect(await prisma.salaPlanService.findMany({ where: { planId: plan.id } })).toEqual(beforeLinks);
    expect(await prisma.salaPlanService.count()).toBe(1);
  });
  it('preserves linked services when a service or plan is retired', async () => {
    const authn = await session(Role.ADMINISTRATIVE);
    const service = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 });
    const plan = await sala.createPlan({ name: 'Plan Base', monthlyAmount: 20000, weeklySessions: 5, serviceTypeIds: [service.id] });
    await sala.retireServiceType(service.id);
    expect((await sala.listPlans())[0]?.services).toEqual([{ id: service.id, name: service.name, durationMinutes: 60, isSelectable: false }]);
    await sala.retirePlan(plan.id);
    expect(await prisma.salaPlan.findUnique({ where: { id: plan.id } })).toMatchObject({ name: plan.name, isSelectable: false });
    expect(await prisma.salaPlanService.count({ where: { planId: plan.id, serviceTypeId: service.id } })).toBe(1);
    expect(await sala.listPlans()).toEqual([]);

    const activeService = await sala.createServiceType({ name: 'Funcional', durationMinutes: 45 });
    const replacement = await sala.createPlan({ name: plan.name, monthlyAmount: 25000, weeklySessions: 5, serviceTypeIds: [activeService.id] });
    expect(replacement.id).not.toBe(plan.id);
    expect(await sala.listPlans()).toEqual([replacement]);
    const listed = await request(app.getHttpServer()).get('/api/sala/plans').set('Cookie', authn.cookie).expect(200);
    expect(listed.body.data).toEqual([expect.objectContaining({ id: replacement.id, name: plan.name, isSelectable: true })]);
    const duplicate = await request(app.getHttpServer()).post('/api/sala/plans').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf)
      .send({ name: '  PLAN BASE  ', monthlyAmount: 30000, weeklySessions: 5, serviceTypeIds: [activeService.id] }).expect(409);
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
    expect(charges).toHaveLength(0);
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
  async function weeklyFixture() {
    const f = await planBookingFixture();
    await prisma.salaPlan.update({ where: { id: f.plan.id }, data: { weeklySessions: 2 } });
    const thursday = await sala.createSlot({ weekday: 'THURSDAY', startTime: '08:00', durationMinutes: 240, specificCapacity: 5 });
    const wednesday = await sala.createSlot({ weekday: 'WEDNESDAY', startTime: '08:00', durationMinutes: 240, specificCapacity: 5 });
    return { ...f, thursday, wednesday, booking: { personId: f.person.id, salaParticipationId: f.participation.id, scheduleSlotId: f.booking.scheduleSlotId, startTime: '09:00', date: '2099-01-05' } };
  }
  it('keeps Monday/Thursday fixed, releases only the cancelled Monday, and permits one replacement that week', async () => {
    const f = await weeklyFixture();
    const monday = await sala.createFixed({ ...f.booking, startDate: f.booking.date });
    await sala.createFixed({ ...f.booking, startDate: f.booking.date, scheduleSlotId: f.thursday.id });
    const replacement = { ...f.booking, scheduleSlotId: f.wednesday.id, startTime: '10:00', date: '2099-01-07' };
    await expect(sala.createReservation({ ...replacement, confirmOverbooking: true })).rejects.toMatchObject({ response: { code: 'SALA_WEEKLY_LIMIT_EXCEEDED' } });
    expect(await prisma.oneOffReservation.count()).toBe(0);
    await sala.cancelFixedOccurrenceFromPortal(monday.id, f.person.id, '2099-01-05', new Date('2099-01-04T12:00:00Z'));
    expect((await sala.availability('2099-01-05')).find(item => item.startTime === '09:00')?.reserved).toBe(0);
    await sala.createReservation(replacement);
    await expect(sala.createReservation({ ...replacement, startTime: '11:00' })).rejects.toMatchObject({ response: { code: 'SALA_WEEKLY_LIMIT_EXCEEDED' } });
    await expect(sala.createReservation({ ...replacement, date: '2099-01-14' })).rejects.toMatchObject({ response: { code: 'SALA_WEEKLY_LIMIT_EXCEEDED' } });
    expect(await prisma.oneOffReservation.count()).toBe(1);
    expect(await prisma.salaOccurrence.findMany({ where: { fixedSalaBookingId: monday.id } })).toEqual([expect.objectContaining({ date: new Date('2099-01-05'), status: 'CANCELLED' })]);
    expect(await prisma.fixedSalaBooking.findUnique({ where: { id: monday.id } })).toMatchObject({ endDate: null });
    expect((await sala.availability('2099-01-12')).find(item => item.startTime === '09:00')?.reserved).toBe(1);
  });
  describe('ending fixed bookings', () => {
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      jest.setSystemTime(new Date('2026-10-23T12:00:00Z'));
    });
    afterEach(() => jest.useRealTimers());
    it.each([false, true])('deletes a future configuration and only its linked occurrences (materialized=%s)', async materialized => {
      const f = await planBookingFixture(); const authn = await session(Role.ADMINISTRATIVE);
      const booking = await sala.createFixed({ ...f.booking, startDate: '2026-10-26' });
      const other = await sala.createFixed({ ...f.booking, startDate: '2026-10-26', startTime: '10:00' });
      const occurrenceData = { personId: f.person.id, scheduleSlotId: f.booking.scheduleSlotId, date: new Date('2026-10-26'), origin: 'FIXED' as const, status: 'RESERVED' as const };
      if (materialized) await prisma.salaOccurrence.create({ data: { ...occurrenceData, fixedSalaBookingId: booking.id } });
      const unrelated = await prisma.salaOccurrence.create({ data: { ...occurrenceData, fixedSalaBookingId: other.id } });
      const createdReservation = await sala.createReservation({ ...f.booking, date: '2026-10-26', startTime: '11:00' });
      const reservation = await prisma.oneOffReservation.findUniqueOrThrow({ where: { id: createdReservation.id } });
      await request(app.getHttpServer()).post(`/api/sala/fixed-bookings/${booking.id}/end`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ endDate: '2026-10-23' }).expect(201);
      expect(await prisma.fixedSalaBooking.findUnique({ where: { id: booking.id } })).toBeNull();
      expect(await prisma.salaOccurrence.count({ where: { fixedSalaBookingId: booking.id } })).toBe(0);
      expect(await prisma.salaOccurrence.findUnique({ where: { id: unrelated.id } })).toEqual(unrelated);
      expect(await prisma.oneOffReservation.findUnique({ where: { id: reservation.id } })).toEqual(reservation);
    });
    it('preserves a started booking and its occurrences with the requested endDate', async () => {
      const f = await planBookingFixture(); const authn = await session(Role.ADMINISTRATIVE);
      const booking = await sala.createFixed({ ...f.booking, startDate: '2026-10-01' });
      const occurrence = await prisma.salaOccurrence.create({ data: { personId: f.person.id, scheduleSlotId: f.booking.scheduleSlotId, fixedSalaBookingId: booking.id, date: new Date('2026-10-26'), origin: 'FIXED', status: 'RESERVED' } });
      await request(app.getHttpServer()).post(`/api/sala/fixed-bookings/${booking.id}/end`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ endDate: '2026-10-23' }).expect(201);
      expect(await prisma.fixedSalaBooking.findUnique({ where: { id: booking.id } })).toMatchObject({ id: booking.id, startDate: booking.startDate, endDate: new Date('2026-10-23') });
      expect(await prisma.salaOccurrence.findUnique({ where: { id: occurrence.id } })).toEqual(occurrence);
    });
    it('immediately releases one of two Plan configuration slots before the start date', async () => {
      const f = await weeklyFixture(); const authn = await session(Role.PROFESSOR);
      const base = { ...f.booking, startDate: '2026-10-26' };
      const a = await sala.createFixed(base);
      await sala.createFixed({ ...base, scheduleSlotId: f.thursday.id });
      await request(app.getHttpServer()).post(`/api/sala/fixed-bookings/${a.id}/end`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ endDate: '2026-10-23' }).expect(201);
      await request(app.getHttpServer()).post('/api/sala/fixed-bookings').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ personId: f.person.id, salaParticipationId: f.participation.id, scheduleSlotId: f.wednesday.id, startDate: base.startDate, startTime: '09:00' }).expect(201);
      expect(await prisma.fixedSalaBooking.count({ where: { personId: f.person.id, endDate: null } })).toBe(2);
    });
    it('rolls back occurrence deletion if a historical reference prevents deleting the future configuration', async () => {
      const f = await planBookingFixture();
      const booking = await sala.createFixed({ ...f.booking, startDate: '2026-10-26' });
      const base = { personId: f.person.id, scheduleSlotId: f.booking.scheduleSlotId, fixedSalaBookingId: booking.id, origin: 'FIXED' as const, status: 'RESERVED' as const };
      // Defensive case: persistence contains a reference predating this configuration.
      await prisma.salaOccurrence.create({ data: { ...base, date: new Date('2026-10-19') } });
      await prisma.salaOccurrence.create({ data: { ...base, date: new Date('2026-10-26') } });
      const before = await prisma.salaOccurrence.findMany({ orderBy: { id: 'asc' } });
      await expect(sala.endFixed(booking.id, '2026-10-23')).rejects.toMatchObject({ code: 'P2003' });
      expect(await prisma.fixedSalaBooking.findUnique({ where: { id: booking.id } })).toMatchObject({ id: booking.id, endDate: null });
      expect(await prisma.salaOccurrence.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
    });
    it('returns the existing not-found error for a missing booking', async () => {
      await expect(sala.endFixed(randomUUID(), '2026-10-23')).rejects.toMatchObject({ response: { code: 'SALA_FIXED_BOOKING_NOT_FOUND' } });
    });
  });
  describe('internal fixed occurrence reassignment', () => {
    async function fixture() {
      const f = await weeklyFixture();
      const monday = await sala.createFixed({ ...f.booking, startDate: f.booking.date });
      await sala.createFixed({ ...f.booking, startDate: f.booking.date, scheduleSlotId: f.thursday.id });
      const actor = await prisma.internalUser.findUniqueOrThrow({ where: { normalizedEmail: 'plan-professor@sala.test' } });
      const target = { targetDate: '2099-01-07', scheduleSlotId: f.wednesday.id, startTime: '10:00' };
      return { ...f, monday, actor, target };
    }
    it.each([false, true])('cancels only one occurrence and keeps recurrence and weeklySessions (materialized=%s)', async materialized => {
      const f = await fixture();
      if (materialized) await prisma.salaOccurrence.create({ data: { personId: f.person.id, scheduleSlotId: f.booking.scheduleSlotId, fixedSalaBookingId: f.monday.id, date: new Date(f.booking.date), origin: 'FIXED', status: 'RESERVED', createdBy: f.actor.id } });
      const before = await prisma.fixedSalaBooking.findMany();
      const saved = await sala.reassignFixedOccurrence(f.monday.id, f.booking.date, f.target, f.actor.id);
      expect(saved).toMatchObject({ personId: f.person.id, salaParticipationId: f.participation.id, date: new Date(f.target.targetDate), serviceTypeId: null, serviceDurationMinutes: 60 });
      expect(await prisma.salaOccurrence.findMany()).toEqual([expect.objectContaining({ fixedSalaBookingId: f.monday.id, origin: 'FIXED', status: 'CANCELLED', createdBy: f.actor.id, lastModifiedBy: f.actor.id, cancelledForNonPaymentAt: null })]);
      expect(await prisma.fixedSalaBooking.findMany()).toEqual(before);
      expect((await sala.availability('2099-01-12')).find(item => item.startTime === '09:00')?.reserved).toBe(1);
      expect(await sala.listPortalReplacementWeeks(f.person.id, '2099-01-05')).toEqual([]);
      await expect(sala.createReservation({ ...f.booking, scheduleSlotId: f.wednesday.id, date: f.target.targetDate, startTime: '11:00' })).rejects.toMatchObject({ response: { code: 'SALA_WEEKLY_LIMIT_EXCEEDED' } });
      await expect(sala.reassignFixedOccurrence(f.monday.id, f.booking.date, f.target, f.actor.id)).rejects.toMatchObject({ response: { code: 'SALA_FIXED_OCCURRENCE_NOT_REASSIGNABLE' } });
      expect(await prisma.oneOffReservation.count()).toBe(1);
    });
    it.each(['week', 'capacity', 'invalid-slot', 'past-target', 'same-day', 'invalid-source', 'started'])('rejects %s and persists no cancellation or reservation', async invalid => {
      const f = await fixture(); let source = f.booking.date; let target = f.target;
      if (invalid === 'week') target = { ...target, targetDate: '2099-01-14' };
      if (invalid === 'capacity') await sala.addException(f.wednesday.id, { date: target.targetDate, type: 'CLOSURE' });
      if (invalid === 'invalid-slot') target = { ...target, scheduleSlotId: randomUUID() };
      if (invalid === 'same-day') target = { ...target, targetDate: source };
      if (invalid === 'invalid-source') source = '2099-01-06';
      if (invalid === 'past-target') target = { ...target, targetDate: '2020-01-01' };
      if (invalid === 'started') { source = '2026-01-05'; await prisma.fixedSalaBooking.update({ where: { id: f.monday.id }, data: { startDate: new Date(source) } }); }
      const code = invalid === 'week' || invalid === 'same-day' || invalid === 'past-target' ? 'SALA_FIXED_OCCURRENCE_REASSIGN_WEEK_INVALID' : invalid === 'capacity' ? 'SALA_SCHEDULE_CLOSED' : invalid === 'invalid-slot' ? 'SALA_SCHEDULE_NOT_FOUND' : invalid === 'started' ? 'SALA_FIXED_OCCURRENCE_STARTED' : 'SALA_FIXED_OCCURRENCE_INVALID';
      await expect(sala.reassignFixedOccurrence(f.monday.id, source, target, f.actor.id)).rejects.toMatchObject({ response: { code } });
      expect(await prisma.salaOccurrence.count()).toBe(0); expect(await prisma.oneOffReservation.count()).toBe(0);
    });
    it.each(['implicit', 'RESERVED', 'portal'] as const)('rolls back a full target, preserving the source occurrence (%s)', async source => {
      const f = await fixture();
      const other = await prisma.person.create({ data: { firstName: 'Otro', lastName: 'Sintético', dni: '8800000099', normalizedDni: '8800000099', phone: '000', birthDate: new Date('1990-01-01') } });
      await sala.addException(f.wednesday.id, { date: f.target.targetDate, type: 'CAPACITY_OVERRIDE', capacityOverride: 1 });
      await prisma.salaOccurrence.create({ data: { personId: other.id, scheduleSlotId: f.wednesday.id, date: new Date(f.target.targetDate), startTime: new Date('1970-01-01T10:00:00Z'), serviceDurationMinutes: 60, origin: 'SPONTANEOUS', status: 'ATTENDED' } });
      if (source !== 'implicit') await prisma.salaOccurrence.create({ data: { personId: f.person.id, scheduleSlotId: f.booking.scheduleSlotId, fixedSalaBookingId: f.monday.id, date: new Date(f.booking.date), origin: 'FIXED', status: source === 'portal' ? 'CANCELLED' : 'RESERVED' } });
      const before = await prisma.salaOccurrence.findMany({ orderBy: { id: 'asc' } });
      await expect(sala.reassignFixedOccurrence(f.monday.id, f.booking.date, f.target, f.actor.id)).rejects.toMatchObject({ response: { code: 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED' } });
      expect(await prisma.salaOccurrence.findMany({ orderBy: { id: 'asc' } })).toEqual(before); expect(await prisma.oneOffReservation.count()).toBe(0);
    });
    it('rejects a target that already started today using operational time', async () => {
      const f = await fixture();
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      try {
        jest.setSystemTime(new Date('2099-01-05T13:00:00Z'));
        const thursday = await prisma.fixedSalaBooking.findFirstOrThrow({ where: { scheduleSlotId: f.thursday.id } });
        await expect(sala.reassignFixedOccurrence(thursday.id, '2099-01-08', { targetDate: '2099-01-05', scheduleSlotId: f.booking.scheduleSlotId, startTime: '10:00' }, f.actor.id)).rejects.toMatchObject({ response: { code: 'SALA_FIXED_OCCURRENCE_STARTED' } });
        expect(await prisma.salaOccurrence.count()).toBe(0); expect(await prisma.oneOffReservation.count()).toBe(0);
      } finally { jest.useRealTimers(); }
    });
    it.each(['ATTENDED', 'ABSENT', 'CANCELLED', 'unpaid'] as const)('rejects existing state %s without altering it', async state => {
      const f = await fixture();
      const existing = await prisma.salaOccurrence.create({ data: { personId: f.person.id, scheduleSlotId: f.booking.scheduleSlotId, fixedSalaBookingId: f.monday.id, date: new Date(f.booking.date), origin: 'FIXED', status: state === 'unpaid' ? 'CANCELLED' : state, lastModifiedBy: state === 'CANCELLED' ? f.actor.id : null, cancelledForNonPaymentAt: state === 'unpaid' ? new Date() : null } });
      await expect(sala.reassignFixedOccurrence(f.monday.id, f.booking.date, f.target, f.actor.id)).rejects.toMatchObject({ response: { code: state === 'unpaid' ? 'SALA_FIXED_OCCURRENCE_NON_PAYMENT_CANCELLED' : 'SALA_FIXED_OCCURRENCE_NOT_REASSIGNABLE' } });
      expect(await prisma.salaOccurrence.findUnique({ where: { id: existing.id } })).toEqual(existing); expect(await prisma.oneOffReservation.count()).toBe(0);
    });
    it('serializes concurrent requests for the same occurrence', async () => {
      const f = await fixture(); const results = await Promise.allSettled([sala.reassignFixedOccurrence(f.monday.id, f.booking.date, f.target, f.actor.id), sala.reassignFixedOccurrence(f.monday.id, f.booking.date, f.target, f.actor.id)]);
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect(await prisma.oneOffReservation.count()).toBe(1);
    });
    it.each([Role.PROFESSOR, Role.ADMINISTRATIVE, Role.GENERAL_ADMIN, Role.KINESIOLOGIST, Role.OSTEOPATH])('enforces the existing agenda permission for %s', async role => {
      const f = await fixture(); const authn = await session(role); const allowed = [Role.PROFESSOR, Role.ADMINISTRATIVE, Role.GENERAL_ADMIN].some(item => item === role);
      await request(app.getHttpServer()).post(`/api/sala/fixed-bookings/${f.monday.id}/occurrences/${f.booking.date}/reassign`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(f.target).expect(allowed ? 201 : 403);
      expect(await prisma.oneOffReservation.count()).toBe(allowed ? 1 : 0);
    });
  });
  it('releases a configuration slot on the exact end date and edits while at the limit', async () => {
    const f = await weeklyFixture();
    const a = await sala.createFixed({ ...f.booking, startDate: f.booking.date });
    const b = await sala.createFixed({ ...f.booking, startDate: f.booking.date, scheduleSlotId: f.thursday.id });
    await sala.endFixed(b.id, f.booking.date);
    const c = await sala.createFixed({ ...f.booking, startDate: f.booking.date, scheduleSlotId: f.wednesday.id });
    await expect(sala.createFixed({ ...f.booking, startDate: f.booking.date, startTime: '11:00' })).rejects.toMatchObject({ response: { code: 'SALA_FIXED_BOOKING_LIMIT_EXCEEDED' } });
    await sala.changeFixed({ ...f.booking, startDate: f.booking.date, id: a.id, startTime: '10:00' });
    expect(await prisma.fixedSalaBooking.count({ where: { salaParticipationId: f.participation.id, OR: [{ endDate: null }, { endDate: { gt: new Date(f.booking.date) } }] } })).toBe(2);
    expect(await prisma.fixedSalaBooking.findUnique({ where: { id: c.id } })).not.toBeNull();
  });
  it('counts sessions rather than distinct dates and serializes concurrent reservations in different windows', async () => {
    const f = await weeklyFixture();
    await sala.createReservation(f.booking);
    const results = await Promise.allSettled([
      sala.createReservation({ ...f.booking, startTime: '10:00' }),
      sala.createReservation({ ...f.booking, scheduleSlotId: f.wednesday.id, date: '2099-01-07' }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toEqual([expect.objectContaining({ reason: expect.objectContaining({ response: expect.objectContaining({ code: 'SALA_WEEKLY_LIMIT_EXCEEDED' }) }) })]);
    expect(await prisma.oneOffReservation.count()).toBe(2);
  });
  it('consumes two sessions for two trainings on the same date', async () => {
    const f = await weeklyFixture();
    await sala.createReservation(f.booking);
    await sala.createReservation({ ...f.booking, startTime: '10:00' });
    await expect(sala.createReservation({ ...f.booking, startTime: '11:00' })).rejects.toMatchObject({ response: { code: 'SALA_WEEKLY_LIMIT_EXCEEDED' } });
    expect(await prisma.oneOffReservation.count()).toBe(2);
  });
  it.each(['ATTENDED', 'ABSENT', 'CANCELLED', 'RESERVED'] as const)('deduplicates a materialized one-off %s and respects cancelledAt without losing attendance history', async status => {
    const f = await weeklyFixture();
    const reservation = await sala.createReservation(f.booking);
    await prisma.oneOffReservation.update({ where: { id: reservation.id }, data: { cancelledAt: new Date() } });
    await prisma.salaOccurrence.create({ data: { personId: f.person.id, scheduleSlotId: f.booking.scheduleSlotId, date: new Date(f.booking.date), origin: 'ONE_OFF', status, oneOffReservationId: reservation.id } });
    await sala.createReservation({ ...f.booking, startTime: '10:00' });
    const next = sala.createReservation({ ...f.booking, startTime: '11:00' });
    if (status === 'ATTENDED' || status === 'ABSENT') await expect(next).rejects.toMatchObject({ response: { code: 'SALA_WEEKLY_LIMIT_EXCEEDED' } });
    else await next;
    expect(await prisma.oneOffReservation.count()).toBe(status === 'ATTENDED' || status === 'ABSENT' ? 2 : 3);
    expect(await prisma.salaOccurrence.findFirst()).toMatchObject({ status });
  });
  it.each(['ATTENDED', 'ABSENT', 'CANCELLED', 'RESERVED'] as const)('counts a fixed %s once, including pending payment, and releases cancelled nonpayment', async status => {
    const f = await weeklyFixture();
    const fixed = await sala.createFixed({ ...f.booking, startDate: f.booking.date });
    await prisma.salaOccurrence.create({ data: { personId: f.person.id, scheduleSlotId: f.booking.scheduleSlotId, date: new Date(f.booking.date), origin: 'FIXED', status, fixedSalaBookingId: fixed.id, ...(status === 'CANCELLED' ? { cancelledForNonPaymentAt: new Date() } : {}) } });
    await sala.createReservation({ ...f.booking, scheduleSlotId: f.wednesday.id, date: '2099-01-07' });
    const next = sala.createReservation({ ...f.booking, scheduleSlotId: f.thursday.id, date: '2099-01-08' });
    if (status === 'CANCELLED') await next;
    else await expect(next).rejects.toMatchObject({ response: { code: 'SALA_WEEKLY_LIMIT_EXCEEDED' } });
  });
  it('checks the full recurrent pattern after a first-week cancellation and a later recurrence boundary', async () => {
    const f = await weeklyFixture();
    const monday = await sala.createFixed({ ...f.booking, startDate: f.booking.date });
    await sala.createFixed({ ...f.booking, scheduleSlotId: f.thursday.id, startDate: '2099-02-02' });
    await sala.cancelFixedOccurrenceFromPortal(monday.id, f.person.id, f.booking.date, new Date('2099-01-04'));
    await expect(sala.createFixed({ ...f.booking, startDate: f.booking.date, scheduleSlotId: f.wednesday.id })).rejects.toMatchObject({ response: { code: 'SALA_FIXED_BOOKING_LIMIT_EXCEEDED' } });
    expect(await prisma.fixedSalaBooking.count()).toBe(2);
  });
  it('ignores ended bookings and future one-off consumption when configuring a recurrence', async () => {
    const f = await weeklyFixture();
    await sala.createFixed({ ...f.booking, startDate: f.booking.date, endDate: '2099-01-05' });
    await sala.createReservation({ ...f.booking, scheduleSlotId: f.wednesday.id, date: '2099-02-04' });
    await sala.createReservation({ ...f.booking, scheduleSlotId: f.thursday.id, date: '2099-02-05' });
    await sala.createFixed({ ...f.booking, startDate: '2099-01-12' });
    expect(await prisma.fixedSalaBooking.count()).toBe(2);
  });
  it('excludes the replaced recurrence and preserves its prefix in the transition week', async () => {
    const f = await weeklyFixture();
    const monday = await sala.createFixed({ ...f.booking, startDate: f.booking.date });
    const thursday = await sala.createFixed({ ...f.booking, startDate: f.booking.date, scheduleSlotId: f.thursday.id });
    const changed = await sala.changeFixed({ ...f.booking, startDate: f.booking.date, id: thursday.id, scheduleSlotId: f.wednesday.id });
    expect(changed.id).toBe(thursday.id);
    await sala.changeFixed({ ...f.booking, id: monday.id, scheduleSlotId: f.thursday.id, startDate: '2099-01-06' });
    expect(await prisma.fixedSalaBooking.findUnique({ where: { id: monday.id } })).toMatchObject({ endDate: new Date('2099-01-05') });
  });
  it('configures exactly two fixed bookings despite ended bookings and consumed weekly history', async () => {
    const f = await weeklyFixture();
    const old = await sala.createFixed({ ...f.booking, startDate: '2098-12-01', endDate: '2099-01-04' });
    await sala.createFixed({ ...f.booking, scheduleSlotId: f.thursday.id, startDate: '2098-12-01', endDate: '2099-01-04' });
    const reservation = await sala.createReservation({ ...f.booking, startTime: '08:00' });
    await prisma.salaOccurrence.create({ data: { personId: f.person.id, scheduleSlotId: f.booking.scheduleSlotId, date: new Date(f.booking.date), origin: 'ONE_OFF', status: 'ATTENDED', oneOffReservationId: reservation.id } });
    await sala.createFixed({ ...f.booking, startDate: f.booking.date });
    await sala.createFixed({ ...f.booking, startDate: f.booking.date, scheduleSlotId: f.thursday.id });
    await expect(sala.createFixed({ ...f.booking, startDate: f.booking.date, scheduleSlotId: f.wednesday.id })).rejects.toMatchObject({ response: { code: 'SALA_FIXED_BOOKING_LIMIT_EXCEEDED' } });
    expect(await prisma.fixedSalaBooking.count({ where: { salaParticipationId: f.participation.id, endDate: null } })).toBe(2);
    expect(await prisma.fixedSalaBooking.findUnique({ where: { id: old.id } })).toMatchObject({ endDate: new Date('2099-01-04') });
    expect(await prisma.oneOffReservation.count()).toBe(1);
    expect(await prisma.salaOccurrence.count({ where: { status: 'ATTENDED' } })).toBe(1);
  });
  it('serializes concurrent fixed-booking creation under the participation lock', async () => {
    const f = await weeklyFixture();
    await sala.createFixed({ ...f.booking, startDate: f.booking.date });
    const results = await Promise.allSettled([
      sala.createFixed({ ...f.booking, startDate: f.booking.date, scheduleSlotId: f.wednesday.id }),
      sala.createFixed({ ...f.booking, startDate: f.booking.date, scheduleSlotId: f.thursday.id }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toEqual([expect.objectContaining({ reason: expect.objectContaining({ response: expect.objectContaining({ code: 'SALA_FIXED_BOOKING_LIMIT_EXCEEDED' }) }) })]);
    expect(await prisma.fixedSalaBooking.count({ where: { salaParticipationId: f.participation.id, endDate: null } })).toBe(2);
  });
  it.each([Role.PROFESSOR, Role.ADMINISTRATIVE, Role.GENERAL_ADMIN, Role.KINESIOLOGIST, Role.OSTEOPATH])('preserves fixed-booking create/change/end permissions for %s', async role => {
    const f = await weeklyFixture();
    const authn = await session(role);
    const allowed = new Set<Role>([Role.PROFESSOR, Role.ADMINISTRATIVE, Role.GENERAL_ADMIN]).has(role);
    const body = { personId: f.person.id, salaParticipationId: f.participation.id, scheduleSlotId: f.booking.scheduleSlotId, startTime: '09:00', startDate: f.booking.date };
    const post = (path: string, input: object) => request(app.getHttpServer()).post(`/api/sala/fixed-bookings${path}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(input);
    const created = await post('', body).expect(allowed ? 201 : 403);
    const id = allowed ? created.body.data.id : (await sala.createFixed(body)).id;
    await post(`/${id}/change`, { ...body, id, startTime: '10:00' }).expect(allowed ? 201 : 403);
    await post(`/${id}/end`, { endDate: f.booking.date }).expect(allowed ? 201 : 403);
    expect(await prisma.fixedSalaBooking.findUnique({ where: { id } })).toMatchObject({ endDate: allowed ? new Date(f.booking.date) : null });
  });
  it('does not double count a materialized recurrence while changing its time', async () => {
    const f = await weeklyFixture();
    const fixed = await sala.createFixed({ ...f.booking, startDate: f.booking.date });
    await sala.createFixed({ ...f.booking, startDate: f.booking.date, scheduleSlotId: f.thursday.id });
    const occurrence = await prisma.salaOccurrence.create({ data: { personId: f.person.id, scheduleSlotId: f.booking.scheduleSlotId, date: new Date(f.booking.date), origin: 'FIXED', status: 'ATTENDED', fixedSalaBookingId: fixed.id } });
    await sala.changeFixed({ ...f.booking, startDate: f.booking.date, id: fixed.id, startTime: '10:00' });
    expect(await prisma.salaOccurrence.findUnique({ where: { id: occurrence.id } })).toEqual(occurrence);
    expect(await prisma.fixedSalaBooking.count()).toBe(2);
  });
  it('retains existing reservations after reducing the plan limit and permits historical corrections', async () => {
    const f = await weeklyFixture();
    await prisma.salaPlan.update({ where: { id: f.plan.id }, data: { weeklySessions: 3 } });
    const first = await sala.createReservation(f.booking);
    await sala.createReservation({ ...f.booking, startTime: '10:00' });
    await sala.createReservation({ ...f.booking, startTime: '11:00' });
    await sala.updatePlan(f.plan.id, { name: f.plan.name, monthlyAmount: 20000, weeklySessions: 2 });
    await expect(sala.createReservation({ ...f.booking, scheduleSlotId: f.wednesday.id, date: '2099-01-07' })).rejects.toMatchObject({ response: { code: 'SALA_WEEKLY_LIMIT_EXCEEDED' } });
    expect(await prisma.oneOffReservation.count()).toBe(3);
    const professor = await prisma.salaParticipation.findUniqueOrThrow({ where: { id: f.participation.id } });
    await sala.commandOccurrence({ personId: f.person.id, scheduleSlotId: f.booking.scheduleSlotId, date: f.booking.date, startTime: '09:00', sourceId: first.id, status: 'ABSENT' }, professor.mainProfessorId);
    expect(await prisma.salaOccurrence.findFirst()).toMatchObject({ status: 'ABSENT', oneOffReservationId: first.id });
  });
  it('permits existing null-limit plans without inferring a maximum', async () => {
    const f = await weeklyFixture();
    await prisma.salaPlan.update({ where: { id: f.plan.id }, data: { weeklySessions: null } });
    for (const startTime of ['08:00', '09:00', '10:00', '11:00']) await sala.createReservation({ ...f.booking, startTime });
    expect(await prisma.oneOffReservation.count()).toBe(4);
  });
  it('rejects a spontaneous attendance at the weekly limit without persisting it, then allows general Sala when a session is released', async () => {
    const f = await weeklyFixture();
    const date = '2026-08-31';
    const first = await sala.createReservation({ ...f.booking, date, startTime: '08:00' });
    await sala.createReservation({ ...f.booking, date, startTime: '09:00' });
    const participation = await prisma.salaParticipation.findUniqueOrThrow({ where: { id: f.participation.id } });
    const input = { personId: f.person.id, scheduleSlotId: f.booking.scheduleSlotId, date, startTime: '10:15', confirmOverbooking: true };
    await expect(sala.createSpontaneousOccurrence(input, participation.mainProfessorId)).rejects.toMatchObject({ response: { code: 'SALA_WEEKLY_LIMIT_EXCEEDED' } });
    expect(await prisma.salaOccurrence.count()).toBe(0);
    await prisma.oneOffReservation.update({ where: { id: first.id }, data: { cancelledAt: new Date() } });
    const attended = await sala.createSpontaneousOccurrence(input, participation.mainProfessorId);
    expect(attended).toMatchObject({ origin: 'SPONTANEOUS', status: 'ATTENDED', serviceTypeId: null, serviceDurationMinutes: 60 });
    await expect(sala.createReservation({ ...f.booking, date, startTime: '08:00' })).rejects.toMatchObject({ response: { code: 'SALA_WEEKLY_LIMIT_EXCEEDED' } });
  });
  it.each([undefined, []])('allows creating a plan without services (%s), retaining omitted links and removing explicit empty links', async serviceTypeIds => {
    const created = await sala.createPlan({ name: 'General', monthlyAmount: 1000, weeklySessions: 2, ...(serviceTypeIds ? { serviceTypeIds } : {}) });
    expect(created.services).toEqual([]);
    const service = await sala.createServiceType({ name: 'Servicio', durationMinutes: 45 });
    await sala.updatePlan(created.id, { name: 'General', monthlyAmount: 1000, weeklySessions: 2, serviceTypeIds: [service.id] });
    const retained = await sala.updatePlan(created.id, { name: 'General', monthlyAmount: 1000, weeklySessions: 2 });
    expect(retained.services).toHaveLength(1);
    const removed = await sala.updatePlan(created.id, { name: 'General', monthlyAmount: 1000, weeklySessions: 2, serviceTypeIds: [] });
    expect(removed.services).toEqual([]);
  });
  it.each([undefined, 1, 6, 2.5])('requires a 2–5 integer weekly limit for new and historical edited plans (%s)', async weeklySessions => {
    const authn = await session(Role.ADMINISTRATIVE);
    const old = await prisma.salaPlan.create({ data: { name: 'Histórico', monthlyAmount: 1000 } });
    expect(old.weeklySessions).toBeNull();
    for (const [method, path] of [['post', '/api/sala/plans'], ['patch', `/api/sala/plans/${old.id}`]] as const) {
      await request(app.getHttpServer())[method](path).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'General', monthlyAmount: 1000, weeklySessions }).expect(400);
    }
    expect(await prisma.salaPlan.findUnique({ where: { id: old.id } })).toEqual(old);
    expect(await prisma.salaPlan.count()).toBe(1);
  });
  it('resets the limit on Monday and includes Sunday in the previous week', async () => {
    const f = await weeklyFixture();
    const sunday = await sala.createSlot({ weekday: 'SUNDAY', startTime: '09:00', durationMinutes: 60 });
    await sala.createReservation(f.booking);
    await sala.createReservation({ ...f.booking, startTime: '10:00' });
    await expect(sala.createReservation({ ...f.booking, scheduleSlotId: sunday.id, date: '2099-01-11' })).rejects.toMatchObject({ response: { code: 'SALA_WEEKLY_LIMIT_EXCEEDED' } });
    await sala.createReservation({ ...f.booking, date: '2099-01-12' });
    expect(await prisma.oneOffReservation.count()).toBe(3);
  });
  it.each([Role.GENERAL_ADMIN, Role.ADMINISTRATIVE, Role.PROFESSOR])('applies the same weekly maximum to %s even with confirmed capacity overbooking', async role => {
    const authn = await session(role);
    const f = await weeklyFixture();
    await sala.createReservation(f.booking);
    await sala.createReservation({ ...f.booking, startTime: '10:00' });
    const denied = await request(app.getHttpServer()).post('/api/sala/reservations').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf)
      .send({ ...f.booking, startTime: '11:00', confirmOverbooking: true }).expect(409);
    expect(denied.body.code).toBe('SALA_WEEKLY_LIMIT_EXCEEDED');
    expect(await prisma.oneOffReservation.count()).toBe(2);
  });
  it('enforces the nullable weekly limit CHECK in PostgreSQL and preserves legacy null values', async () => {
    const old = await prisma.salaPlan.create({ data: { name: 'Histórico', monthlyAmount: 1000 } });
    for (const weeklySessions of [1, 6]) await expect(prisma.salaPlan.update({ where: { id: old.id }, data: { weeklySessions } })).rejects.toBeDefined();
    expect(await prisma.salaPlan.findUnique({ where: { id: old.id } })).toEqual(old);
  });
  async function planBookingFixture() {
    const muscle = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 });
    const functional = await sala.createServiceType({ name: 'Funcional', durationMinutes: 45 });
    const calisthenics = await sala.createServiceType({ name: 'Calistenia', durationMinutes: 60 });
    const plan = await sala.createPlan({ name: 'Plan Base', monthlyAmount: 20000, weeklySessions: 5, serviceTypeIds: [muscle.id, functional.id] });
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
    await expect(sala.createReservation({ ...f.booking, serviceTypeId: f.functional.id, startTime: '10:30' })).rejects.toMatchObject({ response: { code: 'SALA_REQUIRED_SLOTS_UNAVAILABLE' } });
    await expect(sala.createReservation({ ...f.booking, serviceTypeId: f.muscle.id, startTime: '09:00' })).rejects.toMatchObject({ response: { code: 'SALA_RESERVATION_DUPLICATE' } });
    const fixed = await sala.createFixed({ ...f.booking, serviceTypeId: f.muscle.id, startTime: '11:00' });
    await expect(sala.createReservation({ ...f.booking, serviceTypeId: f.functional.id, startTime: '11:30' })).rejects.toMatchObject({ response: { code: 'SALA_REQUIRED_SLOTS_UNAVAILABLE' } });
    await expect(sala.changeFixed({ ...f.booking, id: fixed.id, serviceTypeId: f.muscle.id, startTime: '10:30' })).rejects.toMatchObject({ response: { code: 'SALA_REQUIRED_SLOTS_UNAVAILABLE' } });
    await expect(sala.createFixed({ ...f.booking, serviceTypeId: f.muscle.id, startTime: '09:30' })).rejects.toMatchObject({ response: { code: 'SALA_REQUIRED_SLOTS_UNAVAILABLE' } });
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
  it.each(['reservation', 'fixed'].flatMap(operation => ['12:00', '12:30', '12:15', '12:45'].map(startTime => [operation, startTime])))('enforces hourly planned starts for %s at %s through DTO and service', async (operation, startTime) => {
    const authn = await session(Role.ADMINISTRATIVE);
    const f = await planBookingFixture();
    await prisma.salaScheduleSlot.update({ where: { id: f.booking.scheduleSlotId }, data: { startTime: new Date('1970-01-01T12:00:00Z'), durationMinutes: 120 } });
    const { date, startDate, ...common } = f.booking;
    const input = { ...common, startTime: startTime!, serviceTypeId: f.muscle.id, ...(operation === 'reservation' ? { date } : { startDate }) };
    const valid = startTime === '12:00';
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
  it.each(['12:15', '12:45'])('preserves a historical fixed start %s and requires an exact-hour start when changing it', async startTime => {
    const f = await planBookingFixture();
    await prisma.salaScheduleSlot.update({ where: { id: f.booking.scheduleSlotId }, data: { durationMinutes: 420 } });
    const fixed = await sala.createFixed({ ...f.booking, serviceTypeId: f.functional.id });
    const historical = await prisma.fixedSalaBooking.update({ where: { id: fixed.id }, data: { startTime: new Date(`1970-01-01T${startTime}:00Z`) } });
    expect(await sala.listFixed(f.person.id)).toEqual(expect.arrayContaining([expect.objectContaining({ id: fixed.id, startTime: historical.startTime })]));
    await expect(sala.changeFixed({ ...f.booking, id: fixed.id, serviceTypeId: f.functional.id, startTime }))
      .rejects.toMatchObject({ response: { code: 'SALA_REQUIRED_SLOTS_UNAVAILABLE' } });
    expect(await prisma.fixedSalaBooking.findUnique({ where: { id: fixed.id } })).toEqual(historical);
    await sala.changeFixed({ ...f.booking, id: fixed.id, serviceTypeId: f.functional.id, startTime: '12:00' });
  });
  it('counts simultaneous presence in every quarter-hour for 60 and 45 minute services', async () => {
    const f = await planBookingFixture();
    await prisma.salaScheduleSlot.update({ where: { id: f.booking.scheduleSlotId }, data: { startTime: new Date('1970-01-01T12:00:00Z'), durationMinutes: 120, specificCapacity: 10 } });
    const historical = await sala.createReservation({ ...f.booking, serviceTypeId: f.functional.id, startTime: '13:00' });
    await prisma.oneOffReservation.update({ where: { id: historical.id }, data: { startTime: new Date('1970-01-01T12:30:00Z') } });
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
    await expect(sala.createReservation({ ...f.booking, serviceTypeId: f.muscle.id, startTime: '13:00' }))
      .rejects.toMatchObject({ response: { code: 'SALA_BOOKING_OVERLAP' } });
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
    const otherPlan = await sala.createPlan({ name: 'Plan Completo', monthlyAmount: 30000, weeklySessions: 5, serviceTypeIds: [f.calisthenics.id] });
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
  it.each(['reservation', 'fixed'])('allows general Sala without a service for %s operations', async (operation) => {
    const f = await planBookingFixture();
    const result = await (operation === 'reservation' ? sala.createReservation(f.booking) : sala.createFixed(f.booking));
    expect(result).toMatchObject({ serviceTypeId: null, serviceDurationMinutes: 60 });
    expect(await prisma.oneOffReservation.count()).toBe(operation === 'reservation' ? 1 : 0);
    expect(await prisma.fixedSalaBooking.count()).toBe(operation === 'fixed' ? 1 : 0);
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
    await sala.updatePlan(f.plan.id, { name: f.plan.name, monthlyAmount: 20000, weeklySessions: 5, serviceTypeIds: [f.functional.id] });
    expect(await prisma.oneOffReservation.findUnique({ where: { id: reservation.id } })).toEqual(beforeReservation);
    expect(await prisma.fixedSalaBooking.findUnique({ where: { id: fixed.id } })).toEqual(beforeFixed);
    await expect(sala.createReservation({ ...f.booking, date: '2026-09-07', serviceTypeId: f.muscle.id }))
      .rejects.toMatchObject({ status: 400, response: { code: 'SALA_SERVICE_NOT_INCLUDED_IN_PLAN' } });
    await expect(sala.changeFixed({ ...f.booking, id: fixed.id, serviceTypeId: f.muscle.id }))
      .rejects.toMatchObject({ status: 400, response: { code: 'SALA_SERVICE_NOT_INCLUDED_IN_PLAN' } });
    const general = await sala.changeFixed({ ...f.booking, id: fixed.id, startTime: '10:00' });
    expect(general).toMatchObject({ serviceTypeId: null, serviceDurationMinutes: 60 });
    expect(await prisma.fixedSalaBooking.findUnique({ where: { id: fixed.id } })).toMatchObject({ serviceTypeId: null, serviceDurationMinutes: 60 });
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
  it('persists, edits and copies blocks across templates, assignments and historical reuse', async () => {
    const exercise = await sala.createExerciseDefinition({ name: 'Bloques sintéticos' });
    const exercises = [1, 1, 2].map(blockPosition => ({ exerciseDefinitionId: exercise.id, blockPosition, series: blockPosition === 1 ? '4' : '3', repetitions: '8', load: '30 kg' }));
    const template = await sala.createRoutineTemplate({ name: 'Bloques', days: [{ exercises }] });
    expect(template.days[0]!.exercises.map(e => [e.blockPosition, e.series])).toEqual([[1, '4'], [1, '4'], [2, '3']]);
    const edited = await sala.updateRoutineTemplate(template.id, { name: 'Editada', days: [{ exercises: exercises.map(e => ({ ...e, series: '5' })) }] });
    const duplicate = await sala.createRoutineTemplate({ name: 'Copia', days: edited.days });
    expect(duplicate.days[0]!.exercises.map(e => e.blockPosition)).toEqual([1, 1, 2]);
    const dni = uniqueDni();
    const person = await prisma.person.create({ data: { firstName: 'Bloques', lastName: 'Sintético', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01') } });
    const plan = await prisma.salaPlan.create({ data: { name: 'Plan bloques', monthlyAmount: 1000 } });
    const professor = await users.create({ firstName: 'Profesor', lastName: 'Sintético', email: 'blocks@sala.test', roles: [Role.PROFESSOR] });
    const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' });
    const assigned = await sala.replaceRoutine({ personId: person.id, salaParticipationId: participation.id, days: duplicate.days });
    expect(assigned.days[0]!.exercises.map(e => [e.blockPosition, e.series])).toEqual([[1, '5'], [1, '5'], [2, '5']]);
    await sala.replaceRoutine({ personId: person.id, salaParticipationId: participation.id, days: [{ exercises: [{ exerciseDefinitionId: exercise.id, series: 'individual', load: '9 kg' }] }] });
    const reused = await sala.duplicateRoutine(assigned.id);
    expect(reused.version).toBe(3); expect(reused.days[0]!.exercises.map(e => [e.blockPosition, e.series])).toEqual([[1, '5'], [1, '5'], [2, '5']]);
    const legacy = (await sala.listRoutines(person.id)).find(r => r.version === 2)!;
    expect(legacy.days[0]!.exercises[0]).toMatchObject({ blockPosition: null, series: 'individual', load: '9 kg' });
    expect((await sala.listRoutineTemplates()).find(t => t.id === template.id)!.days[0]!.exercises.map(e => e.series)).toEqual(['5', '5', '5']);
    for (const table of ['routine_template_exercises', 'routine_exercises', 'sala_training_record_exercises']) {
      const constraint = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*) FROM pg_constraint WHERE conrelid = '${table}'::regclass AND conname = 'chk_${table}_block_position'`);
      expect(Number(constraint[0]!.count)).toBe(1);
    }
    await expect(prisma.routineExercise.update({ where: { id: reused.days[0]!.exercises[0]!.id }, data: { blockPosition: 0 } })).rejects.toThrow();
  });
  it.each([
    [2], [1, 3], [1, 2, 1], [1, null], [0], [-1], [1.5],
  ])('rejects invalid block positions %j without modifying saved content', async (...positions: (number | null)[]) => {
    const definition = await sala.createExerciseDefinition({ name: 'Validación bloques' });
    const template = await sala.createRoutineTemplate({ name: 'Anterior', days: [{ exercises: [{ exerciseDefinitionId: definition.id, blockPosition: null, series: '7' }] }] });
    await expect(sala.updateRoutineTemplate(template.id, { name: 'Inválida', days: [{ exercises: positions.map(blockPosition => ({ exerciseDefinitionId: definition.id, blockPosition, series: '4' })) }] })).rejects.toMatchObject({ response: { code: 'SALA_ROUTINE_BLOCKS_INVALID' } });
    expect((await sala.listRoutineTemplates()).find(t => t.id === template.id)).toEqual(template);
  });
  it('normalizes series for comparison and rejects inconsistent shared series', async () => {
    const definition = await sala.createExerciseDefinition({ name: 'Series compartidas' });
    const exercise = { exerciseDefinitionId: definition.id, blockPosition: 1 };
    await expect(sala.createRoutineTemplate({ name: 'Inválida', days: [{ exercises: [{ ...exercise, series: '4' }, { ...exercise, series: '3' }] }] })).rejects.toMatchObject({ response: { code: 'SALA_ROUTINE_BLOCKS_INVALID' } });
    const empty = await sala.createRoutineTemplate({ name: 'Vacías', days: [{ exercises: [{ ...exercise, series: ' ' }, { ...exercise, series: null }] }] });
    expect(empty.days[0]!.exercises.map(e => e.series)).toEqual([null, null]);
    const normalized = await sala.createRoutineTemplate({ name: 'Normalizadas', days: [{ exercises: [{ ...exercise, series: ' 4 ' }, { ...exercise, series: '4' }] }] });
    expect(normalized.days[0]!.exercises.map(e => e.series)).toEqual(['4', '4']);
  });
  it('creates, lists and atomically edits complete shared routine templates without unique names', async () => {
    const authn = await session(Role.PROFESSOR);
    const squat = await sala.createExerciseDefinition({ name: 'Sentadilla', primaryMuscle: 'Piernas' });
    const plank = await sala.createExerciseDefinition({ name: 'Plancha', primaryMuscle: 'Core' });
    const input = { name: '  Fuerza general  ', days: [
      { name: 'Fuerza', exercises: [{ exerciseDefinitionId: squat.id, series: '4', repetitions: '10', load: '60 kg', rest: '90 s', notes: 'Controlar técnica' }, { exerciseDefinitionId: plank.id, duration: '45 s' }] },
      { name: 'Core', exercises: [{ exerciseDefinitionId: plank.id }] },
    ] };
    const created = await request(app.getHttpServer()).post('/api/sala/routine-templates').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(input).expect(201);
    const id = created.body.data.id as string;
    await sala.createRoutineTemplate({ ...input, name: 'A primera' });
    await sala.createRoutineTemplate(input);
    const listed = await request(app.getHttpServer()).get('/api/sala/routine-templates').set('Cookie', authn.cookie).expect(200);
    expect(listed.body.data.map((item: { name: string }) => item.name)).toEqual(['A primera', 'Fuerza general', 'Fuerza general']);
    const template = listed.body.data.find((item: { id: string }) => item.id === id);
    expect(template.days.map((day: { position: number }) => day.position)).toEqual([1, 2]);
    expect(template.days[0].exercises.map((entry: { position: number }) => entry.position)).toEqual([1, 2]);
    expect(template.days[0].exercises[0]).toMatchObject({ series: '4', repetitions: '10', duration: null, load: '60 kg', rest: '90 s', notes: 'Controlar técnica', exerciseDefinition: { id: squat.id, name: squat.name, isActive: true } });
    expect(template.days[0].exercises[1]).toMatchObject({ series: null, repetitions: null, duration: '45 s' });
    expect(template.days[1].exercises[0]).toMatchObject({ series: null, repetitions: null, duration: null, load: null, rest: null, notes: null });
    const oldDayIds = template.days.map((day: { id: string }) => day.id);
    const updated = await request(app.getHttpServer()).put(`/api/sala/routine-templates/${id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'Nueva estructura', days: [{ exercises: [{ exerciseDefinitionId: squat.id, series: '5', repetitions: '5' }] }] }).expect(200);
    expect(updated.body.data.name).toBe('Nueva estructura');
    expect(updated.body.data.days).toHaveLength(1);
    expect(updated.body.data.days[0].exercises[0]).toMatchObject({ position: 1, series: '5', repetitions: '5' });
    expect(await prisma.routineTemplateDay.count({ where: { id: { in: oldDayIds } } })).toBe(0);
    expect(await prisma.routineTemplateExercise.count({ where: { routineTemplateDayId: { in: oldDayIds } } })).toBe(0);
    const before = await prisma.routineTemplate.findUnique({ where: { id }, include: { days: { include: { exercises: true } } } });
    const invalid = await request(app.getHttpServer()).put(`/api/sala/routine-templates/${id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ name: 'Invalid update', days: [{ exercises: [{ exerciseDefinitionId: squat.id, repetitions: '10', duration: '30 s' }] }] }).expect(400);
    expect(invalid.body.code).toBe('SALA_ROUTINE_REPETITIONS_DURATION_EXCLUSIVE');
    expect(await prisma.routineTemplate.findUnique({ where: { id }, include: { days: { include: { exercises: true } } } })).toEqual(before);
    // Force a late persistence failure, after deletion of the old composition, to prove rollback.
    await expect(sala.updateRoutineTemplate(id, { name: 'Must roll back', days: [{ name: 'x'.repeat(121), exercises: [{ exerciseDefinitionId: squat.id }] }] })).rejects.toThrow();
    expect(await prisma.routineTemplate.findUnique({ where: { id }, include: { days: { include: { exercises: true } } } })).toEqual(before);
  });
  it('rejects empty names, missing days, invalid/retired exercises and repetitions with time; prebuilt routines block retirement', async () => {
    const exercise = await sala.createExerciseDefinition({ name: 'Sentadilla', primaryMuscle: 'Piernas' });
    const input = { name: 'Modelo', days: [{ exercises: [{ exerciseDefinitionId: exercise.id }] }] };
    const template = await sala.createRoutineTemplate(input);
    await expect(sala.createRoutineTemplate({ ...input, name: '   ' })).rejects.toMatchObject({ response: { code: 'SALA_ROUTINE_TEMPLATE_NAME_INVALID' } });
    await expect(sala.createRoutineTemplate({ ...input, days: [] })).rejects.toMatchObject({ response: { code: 'SALA_ROUTINE_TEMPLATE_DAYS_REQUIRED' } });
    await expect(sala.createRoutineTemplate({ ...input, days: [{ exercises: [{ exerciseDefinitionId: exercise.id, repetitions: '10', duration: '45 s' }] }] })).rejects.toMatchObject({ response: { code: 'SALA_ROUTINE_REPETITIONS_DURATION_EXCLUSIVE' } });
    await expect(sala.createRoutineTemplate({ ...input, days: [{ exercises: [{ exerciseDefinitionId: '00000000-0000-4000-8000-000000000099' }] }] })).rejects.toMatchObject({ response: { code: 'SALA_EXERCISE_INVALID' } });
    await expect(prisma.exerciseDefinition.delete({ where: { id: exercise.id } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(sala.retireExerciseDefinition(exercise.id, false)).rejects.toMatchObject({ response: { code: 'SALA_EXERCISE_IN_ROUTINE_TEMPLATE' } });
    expect(await prisma.exerciseDefinition.findUnique({ where: { id: exercise.id } })).toMatchObject({ isActive: true });
    await sala.updateRoutineTemplate(template.id, { ...input, days: [{ exercises: [] }] });
    await sala.retireExerciseDefinition(exercise.id, false);
    await expect(sala.createRoutineTemplate(input)).rejects.toMatchObject({ response: { code: 'SALA_EXERCISE_INVALID' } });
    await expect(sala.updateRoutineTemplate(template.id, { ...input, name: 'Rechazada' })).rejects.toMatchObject({ response: { code: 'SALA_EXERCISE_INVALID' } });
    expect(await prisma.routineTemplate.count()).toBe(1);
    const active = await sala.createExerciseDefinition({ name: 'Remo', primaryMuscle: 'Espalda' });
    await sala.updateRoutineTemplate(template.id, { ...input, days: [{ exercises: [{ exerciseDefinitionId: active.id }] }] });
    expect((await sala.listRoutineTemplates())[0]?.days[0]?.exercises[0]?.exerciseDefinition.isActive).toBe(true);
  });
  it('copies templates into independent student routines and cascades only template children', async () => {
    const dni = uniqueDni();
    const person = await prisma.person.create({ data: { firstName: 'Template', lastName: 'Student', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } });
    const plan = await prisma.salaPlan.create({ data: { name: 'Plan', monthlyAmount: 1000 } });
    const professor = await users.create({ firstName: 'Template', lastName: 'Professor', email: 'template@sala.test', roles: [Role.PROFESSOR] });
    const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' });
    const exercise = await sala.createExerciseDefinition({ name: 'Sentadilla', primaryMuscle: 'Piernas' });
    const input = { name: 'Modelo A', days: [{ name: 'Fuerza', exercises: [{ exerciseDefinitionId: exercise.id, series: '4', repetitions: '10' }] }] };
    const template = await sala.createRoutineTemplate(input);
    const assigned = await sala.replaceRoutine({ personId: person.id, salaParticipationId: participation.id, days: template.days.map((day) => ({ name: day.name, exercises: day.exercises.map((entry) => ({ exerciseDefinitionId: entry.exerciseDefinitionId, series: entry.series, repetitions: entry.repetitions, duration: entry.duration, load: entry.load, rest: entry.rest, notes: entry.notes })) })) });
    expect(assigned).not.toHaveProperty('routineTemplateId');
    expect(assigned.days[0]?.id).not.toBe(template.days[0]?.id);
    const original = await sala.listRoutines(person.id);
    await sala.updateRoutineTemplate(template.id, { name: 'Editada', days: [{ name: 'Cambio', exercises: [{ exerciseDefinitionId: exercise.id, series: '5', repetitions: '5' }] }] });
    expect(await sala.listRoutines(person.id)).toEqual(original);
    // Student customization is also independent; it preserves the normal historical version.
    await sala.replaceRoutine({ personId: person.id, salaParticipationId: participation.id, days: [{ name: 'Personalizada', exercises: [{ exerciseDefinitionId: exercise.id, series: '3', repetitions: '8' }] }] });
    expect((await sala.listRoutineTemplates())[0]?.days[0]?.exercises[0]).toMatchObject({ series: '5', repetitions: '5' });
    const studentBeforeDelete = await sala.listRoutines(person.id);
    expect(studentBeforeDelete.map((routine) => routine.status)).toEqual(['ACTIVE', 'HISTORICAL']);
    const templateDays = await prisma.routineTemplateDay.findMany({ where: { routineTemplateId: template.id } });
    await sala.deleteRoutineTemplate(template.id);
    expect(await prisma.routineTemplate.count()).toBe(0);
    expect(await prisma.routineTemplateDay.count({ where: { routineTemplateId: template.id } })).toBe(0);
    expect(await prisma.routineTemplateExercise.count({ where: { routineTemplateDayId: { in: templateDays.map((day) => day.id) } } })).toBe(0);
    expect(await sala.listRoutines(person.id)).toEqual(studentBeforeDelete);
    expect(await prisma.routineDay.count()).toBe(2);
    expect(await prisma.routineExercise.count()).toBe(2);
    await expect(sala.deleteRoutineTemplate(template.id)).rejects.toMatchObject({ response: { code: 'SALA_ROUTINE_TEMPLATE_NOT_FOUND' } });
    await expect(sala.updateRoutineTemplate(template.id, input)).rejects.toMatchObject({ response: { code: 'SALA_ROUTINE_TEMPLATE_NOT_FOUND' } });
  });
  it.each([Role.PROFESSOR, Role.GENERAL_ADMIN, Role.ADMINISTRATIVE])('enforces SALA_ROUTINE_MANAGE for every template endpoint (%s)', async (role) => {
    const authn = await session(role);
    const exercise = await sala.createExerciseDefinition({ name: 'Sentadilla', primaryMuscle: 'Piernas' });
    const input = { name: 'Modelo', days: [{ exercises: [{ exerciseDefinitionId: exercise.id }] }] };
    const template = await sala.createRoutineTemplate(input);
    const allowed = role !== Role.ADMINISTRATIVE;
    await request(app.getHttpServer()).get('/api/sala/routine-templates').set('Cookie', authn.cookie).expect(allowed ? 200 : 403);
    await request(app.getHttpServer()).post('/api/sala/routine-templates').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(input).expect(allowed ? 201 : 403);
    await request(app.getHttpServer()).put(`/api/sala/routine-templates/${template.id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(input).expect(allowed ? 200 : 403);
    await request(app.getHttpServer()).delete(`/api/sala/routine-templates/${template.id}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).expect(allowed ? 200 : 403);
  });
  it('replaces routines transactionally, preserves history and enforces exercise rules', async () => {
    const dni = uniqueDni();
    const person = await prisma.person.create({ data: { firstName: 'Routine', lastName: 'Person', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } });
    const plan = await prisma.salaPlan.create({ data: { name: `Routine-${dni}`, monthlyAmount: 1000 } });
    const professor = await users.create({ firstName: 'Routine', lastName: 'Professor', email: `routine-${dni}@sala.test`, roles: [Role.PROFESSOR] });
    const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' });
    const exercise = await sala.createExerciseDefinition({ name: `Sentadilla-${dni}`, primaryMuscle: 'Piernas' });
    const otherExercise = await sala.createExerciseDefinition({ name: `Plancha-${dni}`, primaryMuscle: 'Core' });
    const input = { personId: person.id, salaParticipationId: participation.id, days: [
      { name: 'Día 1', exercises: [
        { exerciseDefinitionId: exercise.id, series: null, repetitions: '10', load: '40 kg', rest: '30 s', notes: 'Técnica controlada' },
        { exerciseDefinitionId: otherExercise.id, duration: '45 s' },
      ] },
      { name: 'Día 2', exercises: [{ exerciseDefinitionId: exercise.id, series: '4', duration: '30 s', load: 'Peso corporal', rest: '1 min', notes: 'Sin dolor' }] },
    ] };
    const first = await sala.replaceRoutine(input);
    expect(first.status).toBe('ACTIVE');
    expect(first.days.map(day => day.position)).toEqual([1, 2]);
    expect(first.days.map(day => day.exercises.map(entry => entry.position))).toEqual([[1, 2], [1]]);
    expect(first.days[0]?.exercises[0]).toMatchObject({ series: null, repetitions: '10', duration: null, load: '40 kg', rest: '30 s', notes: 'Técnica controlada' });
    expect(first.days[0]?.exercises[1]).toMatchObject({ series: null, repetitions: null, duration: '45 s', load: null, rest: null, notes: null });

    await expect(sala.replaceRoutine(input, true)).rejects.toThrow('SIMULATED_ROUTINE_REPLACEMENT_FAILURE');
    expect(await prisma.routine.findUnique({ where: { id: first.id } })).toMatchObject({ status: 'ACTIVE' });
    expect(await prisma.routine.count({ where: { personId: person.id } })).toBe(1);
    const second = await sala.replaceRoutine({ ...input, days: input.days.map(day => ({ ...day, name: `${day.name} editado` })) });
    expect(second).toMatchObject({ status: 'ACTIVE', version: first.version + 1 });
    expect(await prisma.routine.findUnique({ where: { id: first.id } })).toMatchObject({ status: 'HISTORICAL' });
    expect(second.days.map(day => day.name)).toEqual(['Día 1 editado', 'Día 2 editado']);
    expect(second.days.map(day => day.exercises.length)).toEqual([2, 1]);
    await expect(sala.replaceRoutine({ ...input, days: [{ exercises: [{ exerciseDefinitionId: exercise.id, repetitions: '1', duration: '1m' }] }] })).rejects.toMatchObject({ response: { code: 'SALA_ROUTINE_REPETITIONS_DURATION_EXCLUSIVE' } });
    expect(await prisma.routine.count({ where: { personId: person.id } })).toBe(2);
    expect(await prisma.routine.count({ where: { personId: person.id, status: 'ACTIVE' } })).toBe(1);

    const duplicate = await sala.duplicateRoutine(second.id);
    expect(duplicate.id).not.toBe(second.id);
    expect(duplicate).toMatchObject({ version: second.version + 1, status: 'ACTIVE' });
    const functionalDays = (routine: typeof second) => routine.days.map(day => ({ name: day.name, position: day.position, exercises: day.exercises.map(entry => ({ exerciseDefinitionId: entry.exerciseDefinitionId, position: entry.position, series: entry.series, repetitions: entry.repetitions, duration: entry.duration, load: entry.load, rest: entry.rest, notes: entry.notes })) }));
    expect(functionalDays(duplicate)).toEqual(functionalDays(second));
    expect(await prisma.routine.findUnique({ where: { id: second.id } })).toMatchObject({ status: 'HISTORICAL' });
    expect(await prisma.routine.count({ where: { personId: person.id, status: 'ACTIVE' } })).toBe(1);
    const sourceIds = new Set(second.days.flatMap(day => [day.id, ...day.exercises.map(entry => entry.id)]));
    expect(duplicate.days.flatMap(day => [day.id, ...day.exercises.map(entry => entry.id)]).some(id => sourceIds.has(id))).toBe(false);

    const otherDni = uniqueDni();
    const otherPerson = await prisma.person.create({ data: { firstName: 'Otra', lastName: 'Persona', dni: otherDni, normalizedDni: otherDni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } });
    const otherParticipation = await sala.join({ personId: otherPerson.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' });
    await sala.replaceRoutine({ personId: otherPerson.id, salaParticipationId: otherParticipation.id, days: [{ exercises: [{ exerciseDefinitionId: exercise.id }] }] });
    await expect(sala.retireExerciseDefinition(exercise.id, false)).rejects.toMatchObject({ response: { code: 'SALA_EXERCISE_RETIRE_CONFIRMATION_REQUIRED', details: { activeRoutines: 2 } } });
    expect(await prisma.routineExercise.count({ where: { exerciseDefinitionId: exercise.id, routineDay: { routine: { status: 'ACTIVE' } } } })).toBe(3);
    expect(await prisma.exerciseDefinition.findUnique({ where: { id: exercise.id } })).toMatchObject({ isActive: true });
    const historicalBefore = await prisma.routineExercise.findMany({ where: { routineDay: { routine: { status: 'HISTORICAL' } } }, orderBy: { id: 'asc' } });
    expect(await sala.retireExerciseDefinition(exercise.id, true)).toMatchObject({ affectedActiveRoutines: 2 });
    expect(await prisma.exerciseDefinition.findUnique({ where: { id: exercise.id } })).toMatchObject({ isActive: false });
    expect(await prisma.routineExercise.count({ where: { exerciseDefinitionId: exercise.id, routineDay: { routine: { status: 'ACTIVE' } } } })).toBe(0);
    expect(await prisma.routineExercise.findMany({ where: { routineDay: { routine: { status: 'HISTORICAL' } } }, orderBy: { id: 'asc' } })).toEqual(historicalBefore);
    expect((await sala.listRoutines(person.id)).find(routine => routine.id === first.id)?.days[0]?.exercises[0]?.exerciseDefinition.name).toBe(exercise.name);
    expect((await sala.listExerciseDefinitions()).some(definition => definition.id === exercise.id)).toBe(false);
  });
  it('persists and lists physical test definitions', async () => {
    const test = await sala.createPhysicalTest({ name: `Catalog-${uniqueDni()}`, type: 'MOBILITY', description: 'Centimeters' });
    expect(await prisma.physicalTestDefinition.findUnique({ where: { id: test.id } })).toMatchObject({ id: test.id, isActive: true });
    expect(await sala.listPhysicalTests()).toEqual(expect.arrayContaining([expect.objectContaining({ id: test.id, name: test.name, type: 'MOBILITY' })]));
  });
  it('keeps physical test definitions separate from evaluation results and validates the professor', async () => {
    const dni = uniqueDni(); const person = await prisma.person.create({ data: { firstName: 'Eval', lastName: 'Person', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01T00:00:00Z') } }); const plan = await prisma.salaPlan.create({ data: { name: `Eval-${dni}`, monthlyAmount: 1000 } }); const professor = await users.create({ firstName: 'Eval', lastName: 'Professor', email: `eval-${dni}@sala.test`, roles: [Role.PROFESSOR] }); const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' }); const test = await sala.createPhysicalTest({ name: `Flex-${dni}`, type: 'MOBILITY' }); const evaluation = await sala.createPhysicalEvaluation({ personId: person.id, salaParticipationId: participation.id, professorId: professor.id, evaluationDate: '2026-08-27', results: [{ testDefinitionId: test.id, resultText: '25 cm' }] }, professor.id); expect(evaluation.results).toHaveLength(1); expect(await prisma.physicalEvaluation.findUnique({ where: { id: evaluation.id } })).toMatchObject({ id: evaluation.id, personId: person.id, salaParticipationId: participation.id }); expect(await prisma.physicalTestResult.findFirst({ where: { evaluationId: evaluation.id, testDefinitionId: test.id } })).toMatchObject({ resultText: '25 cm' }); const listed = await sala.listPhysicalEvaluations(person.id); expect(listed).toHaveLength(1); expect(listed[0]?.results).toEqual(expect.arrayContaining([expect.objectContaining({ testDefinitionId: test.id, resultText: '25 cm' })])); await sala.retirePhysicalTest(test.id); await expect(sala.createPhysicalEvaluation({ personId: person.id, salaParticipationId: participation.id, professorId: professor.id, evaluationDate: '2026-08-28', results: [{ testDefinitionId: test.id, resultText: '26 cm' }] }, professor.id)).rejects.toMatchObject({ response: { code: 'SALA_PHYSICAL_TEST_INVALID' } });
  });
  async function paymentFixture(httpApp = app) {
    const authn = await session(Role.ADMINISTRATIVE, httpApp);
    const actor = await prisma.internalUser.findFirstOrThrow({ where: { roles: { some: { role: Role.ADMINISTRATIVE } } } });
    const dni = uniqueDni();
    const person = await prisma.person.create({ data: { firstName: 'Pago', lastName: 'Sintético', dni, normalizedDni: dni, phone: '3515550000', birthDate: new Date('1990-01-01') } });
    const professor = await users.create({ firstName: 'Pago', lastName: 'Profesor', email: `payment-${dni}@test.local`, roles: [Role.PROFESSOR] });
    const plan = await prisma.salaPlan.create({ data: { name: 'Plan de pagos', monthlyAmount: 20000 } });
    const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2020-01-01' });
    const method = await prisma.paymentMethod.create({ data: { name: `Payment-${dni}` } });
    const input = { personId: person.id, planId: plan.id, paidAt: '2026-10-20', paymentMethodId: method.id, amount: '20000', operationId: randomUUID() };
    const post = (body: unknown) => request(httpApp.getHttpServer()).post('/api/sala/payments').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(body);
    return { person, actor, plan, participation, method, input, post, authn };
  }
  describe('rolling payment validity', () => {
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'queueMicrotask', 'hrtime'] });
      jest.setSystemTime(new Date('2026-11-25T12:00:00Z'));
    });
    afterEach(() => jest.useRealTimers());
    it.each([Role.PROFESSOR, Role.ADMINISTRATIVE, Role.GENERAL_ADMIN])('returns only the payment actor identity on creation, retry and history for %s', async role => {
      const f = await paymentFixture();
      const authn = role === Role.ADMINISTRATIVE ? f.authn : await session(role);
      const actor = await prisma.internalUser.update({ where: { normalizedEmail: `${role.toLowerCase()}@sala.test` }, data: { firstName: 'Juan', lastName: 'Profesor' } });
      const expected = { id: actor.id, firstName: 'Juan', lastName: 'Profesor' };
      const post = () => request(app.getHttpServer()).post('/api/sala/payments').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(f.input).expect(201);
      const created = await post();
      const retry = await post();
      const history = await request(app.getHttpServer()).get(`/api/sala/people/${f.person.id}/payments`).set('Cookie', authn.cookie).expect(200);
      for (const payment of [created.body.data, retry.body.data, history.body.data[0]]) {
        expect(payment.registeredBy).toEqual(expected);
        expect(Object.keys(payment.registeredBy).sort()).toEqual(['firstName', 'id', 'lastName']);
        expect(payment).toMatchObject({ id: created.body.data.id, planId: f.plan.id, planName: f.plan.name });
      }
    });
    it('preserves different payment and reversal actors in history and an idempotent retry', async () => {
      const f = await paymentFixture();
      const professorSession = await session(Role.PROFESSOR);
      const professor = await prisma.internalUser.findUniqueOrThrow({ where: { normalizedEmail: 'professor@sala.test' } });
      const post = () => request(app.getHttpServer()).post('/api/sala/payments').set('Cookie', professorSession.cookie).set('x-csrf-token', professorSession.csrf).send(f.input).expect(201);
      const created = await post();
      await request(app.getHttpServer()).post(`/api/sala/payments/${created.body.data.id}/reverse`).set('Cookie', f.authn.cookie).set('x-csrf-token', f.authn.csrf).send({ reason: 'Corrección de pago', operationId: randomUUID() }).expect(201);
      const history = await request(app.getHttpServer()).get(`/api/sala/people/${f.person.id}/payments`).set('Cookie', professorSession.cookie).expect(200);
      const retry = await post();
      expect(professor.id).not.toBe(f.actor.id);
      for (const payment of [history.body.data[0], retry.body.data]) {
        expect(payment.registeredBy).toEqual({ id: professor.id, firstName: professor.firstName, lastName: professor.lastName });
        expect(payment.reversal.reason).toBe('Corrección de pago');
        expect(payment.reversal.registeredBy).toEqual({ id: f.actor.id, firstName: f.actor.firstName, lastName: f.actor.lastName });
        expect(Object.keys(payment.registeredBy).sort()).toEqual(['firstName', 'id', 'lastName']);
        expect(Object.keys(payment.reversal.registeredBy).sort()).toEqual(['firstName', 'id', 'lastName']);
      }
    });
    it('leaves a historical payment without a Plan reference unchanged when listing history', async () => {
      const f = await paymentFixture();
      const historical = await prisma.salaPayment.create({ data: {
        personId: f.person.id, planId: null, planNameSnapshot: null,
        year: 2026, month: 10, paidAt: new Date('2026-10-15'),
        coverageStartDate: new Date('2026-10-15'), coverageEndDate: new Date('2026-11-15'),
        amount: 20000, paymentMethodId: f.method.id, registeredById: f.actor.id, operationId: randomUUID(),
      } });
      const history = await request(app.getHttpServer()).get(`/api/sala/people/${f.person.id}/payments`).set('Cookie', f.authn.cookie).expect(200);
      expect(history.body.data[0]).toMatchObject({ id: historical.id, planId: null, planName: null });
      expect(await prisma.salaPayment.findUniqueOrThrow({ where: { id: historical.id } })).toEqual(historical);
    });
    it('chains multiple early renewals, including two payments in the same cash month', async () => {
      const f = await paymentFixture();
      const first = await f.post(f.input).expect(201);
      expect(first.body.data).toMatchObject({ coverageStartDate: '2026-10-20', coverageEndDate: '2026-11-20', planId: f.plan.id, planName: f.plan.name });
      const second = await f.post({ ...f.input, paidAt: '2026-11-10', operationId: randomUUID() }).expect(201);
      expect(second.body.data).toMatchObject({ coverageStartDate: '2026-11-21', coverageEndDate: '2026-12-20' });
      const third = await f.post({ ...f.input, paidAt: '2026-11-15', operationId: randomUUID() }).expect(201);
      expect(third.body.data).toMatchObject({ coverageStartDate: '2026-12-21', coverageEndDate: '2027-01-20' });
      expect(await sala.validity(f.person.id, '2026-11-15')).toEqual({ hasValidAccess: true, validUntil: '2027-01-20' });
      const persisted = await prisma.salaPayment.findMany({ where: { personId: f.person.id }, orderBy: { paidAt: 'asc' } });
      expect(persisted.map(payment => [payment.year, payment.month])).toEqual([[2026, 10], [2026, 11], [2026, 11]]);
    });
    it('starts expired validity at the cash date without filling gaps', async () => {
      const f = await paymentFixture();
      await f.post(f.input).expect(201);
      const renewed = await f.post({ ...f.input, paidAt: '2026-11-25', operationId: randomUUID() }).expect(201);
      expect(renewed.body.data).toMatchObject({ coverageStartDate: '2026-11-25', coverageEndDate: '2026-12-25' });
      expect(await sala.validity(f.person.id, '2026-11-21')).toEqual({ hasValidAccess: false, validUntil: null });
    });
    it.each([['2026-01-31', '2026-02-28'], ['2028-01-31', '2028-02-29'], ['2026-02-28', '2026-03-28'], ['2026-01-30', '2026-02-28']])('clamps %s to %s without timezone overflow', async (paidAt, end) => {
      jest.setSystemTime(new Date('2028-03-01T12:00:00Z'));
      const f = await paymentFixture();
      expect((await f.post({ ...f.input, paidAt }).expect(201)).body.data).toMatchObject({ coverageStartDate: paidAt, coverageEndDate: end });
    });
    it('updates the operational Plan and preserves financial snapshots while validating adjustments', async () => {
      const f = await paymentFixture();
      const other = await prisma.salaPlan.create({ data: { name: 'Plan B', monthlyAmount: 30000 } });
      const assignments = await prisma.salaPlanAssignment.findMany({ where: { salaParticipationId: f.participation.id } });
      const rejected = await f.post({ ...f.input, planId: other.id }).expect(400);
      expect(rejected.body.code).toBe('SALA_PAYMENT_ADJUSTMENT_REASON_REQUIRED');
      expect(await prisma.salaPayment.count()).toBe(0);
      expect(await prisma.salaPlanAssignment.findMany({ where: { salaParticipationId: f.participation.id } })).toEqual(assignments);
      const saved = await f.post({ ...f.input, planId: other.id, amount: '30000' }).expect(201);
      expect(saved.body.data).toMatchObject({ planId: other.id, planName: 'Plan B', amount: '30000' });
      await prisma.salaPlan.update({ where: { id: other.id }, data: { name: 'Plan B editado', monthlyAmount: 40000, weeklySessions: 5, isSelectable: false } });
      expect((await f.post({ ...f.input, planId: other.id, amount: '30000' }).expect(201)).body.data.id).toBe(saved.body.data.id);
      expect((await sala.listPayments(f.person.id))[0]).toMatchObject({ planName: 'Plan B', amount: '30000' });
      expect(await prisma.salaParticipation.findUniqueOrThrow({ where: { id: f.participation.id } })).toMatchObject({ planId: other.id });
      expect(await prisma.salaPlanAssignment.findMany({ where: { salaParticipationId: f.participation.id } })).toEqual(expect.arrayContaining([...assignments, expect.objectContaining({ planId: other.id, effectiveFrom: new Date('2026-12-01T00:00:00Z') })]));
      expect(await prisma.salaCharge.count()).toBe(0);
    });
    it('retries once under concurrency, rejects incompatible operations and serializes distinct renewals', async () => {
      const f = await paymentFixture();
      const results = await Promise.all([sala.createPayment(f.input, f.actor.id), sala.createPayment(f.input, f.actor.id)]);
      expect(results[0]!.id).toBe(results[1]!.id);
      expect(await prisma.salaPayment.count()).toBe(1);
      for (const changes of [{ amount: '19000', adjustmentReason: 'Ajuste' }, { planId: randomUUID() }, { paidAt: '2026-10-19' }, { paymentMethodId: randomUUID() }]) {
        expect((await f.post({ ...f.input, ...changes }).expect(409)).body.code).toBe('SALA_PAYMENT_OPERATION_CONFLICT');
      }
      const renewals = await Promise.all([sala.createPayment({ ...f.input, operationId: randomUUID() }, f.actor.id), sala.createPayment({ ...f.input, operationId: randomUUID() }, f.actor.id)]);
      expect(renewals.map(payment => payment.coverageEndDate).sort()).toEqual(['2026-12-20', '2027-01-20']);
      expect(await prisma.salaPayment.count()).toBe(3);
    });
    it('reversal invalidates only its immutable coverage and does not move subsequent payments', async () => {
      const f = await paymentFixture();
      const first = await sala.createPayment(f.input, f.actor.id);
      const second = await sala.createPayment({ ...f.input, operationId: randomUUID() }, f.actor.id);
      expect((await sala.validity(f.person.id, '2026-11-20')).hasValidAccess).toBe(true);
      const before = await prisma.salaPayment.findMany({ orderBy: { id: 'asc' } });
      await sala.reversePayment(first.id, 'Error sintético', randomUUID(), f.actor.id);
      expect((await sala.validity(f.person.id, '2026-11-20')).hasValidAccess).toBe(false);
      expect(await sala.validity(f.person.id, '2026-11-21')).toEqual({ hasValidAccess: true, validUntil: '2026-12-20' });
      expect(await prisma.salaPayment.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
      expect((await sala.listPayments(f.person.id)).find(payment => payment.id === first.id)?.reversal).toBeTruthy();
      expect((await sala.listPayments(f.person.id)).find(payment => payment.id === second.id)).toMatchObject({ coverageStartDate: '2026-11-21', coverageEndDate: '2026-12-20' });
    });
    it.each(['participation', 'method', 'plan', 'future', 'adjustment'])('rejects %s without any financial writes', async invalid => {
      const f = await paymentFixture();
      if (invalid === 'participation') await sala.leave(f.participation.id);
      if (invalid === 'method') await prisma.paymentMethod.update({ where: { id: f.method.id }, data: { isSelectable: false } });
      if (invalid === 'plan') await prisma.salaPlan.update({ where: { id: f.plan.id }, data: { isSelectable: false } });
      const result = await f.post({ ...f.input, ...(invalid === 'future' ? { paidAt: '2099-01-01' } : {}), ...(invalid === 'adjustment' ? { amount: '1' } : {}) }).expect(400);
      expect(result.body.code).toBe({ participation: 'SALA_PARTICIPATION_REQUIRED', method: 'PAYMENT_METHOD_NOT_SELECTABLE', plan: 'SALA_PLAN_INVALID', future: 'SALA_PAYMENT_DATE_FUTURE', adjustment: 'SALA_PAYMENT_ADJUSTMENT_REASON_REQUIRED' }[invalid]);
      expect(await prisma.salaPayment.count()).toBe(0);
      expect(await prisma.salaPaymentAllocation.count()).toBe(0);
    });
    it('rolls back payment, coverage, active Plan and assignments when an allocation conflicts', async () => {
      const f = await paymentFixture();
      const charge = await prisma.salaCharge.create({ data: { personId: f.person.id, kind: 'OPENING_BALANCE', chargeDate: new Date('2026-10-01'), concept: 'Saldo histórico', amount: 50000 } });
      const allocation = { chargeId: charge.id, amount: '10000', operationId: randomUUID() };
      const first = await sala.createPayment({ ...f.input, allocations: [allocation] }, f.actor.id);
      const other = await prisma.salaPlan.create({ data: { name: 'Plan Completo', monthlyAmount: 20000 } });
      const assignments = await prisma.salaPlanAssignment.findMany({ where: { salaParticipationId: f.participation.id } });
      await expect(sala.createPayment({ ...f.input, planId: other.id, operationId: randomUUID(), allocations: [allocation] }, f.actor.id)).rejects.toMatchObject({ code: 'P2002' });
      expect(await prisma.salaPayment.count()).toBe(1);
      expect(await prisma.salaPaymentAllocation.count()).toBe(1);
      expect(await prisma.salaParticipation.findUnique({ where: { id: f.participation.id } })).toMatchObject({ planId: f.plan.id });
      expect(await prisma.salaPlanAssignment.findMany({ where: { salaParticipationId: f.participation.id } })).toEqual(assignments);
      expect((await sala.listPayments(f.person.id))[0]).toMatchObject({ id: first.id, coverageEndDate: '2026-11-20' });
    });
    it.each([Role.PROFESSOR, Role.ADMINISTRATIVE, Role.GENERAL_ADMIN])('preserves payment permissions for %s', async role => {
      const f = await paymentFixture(); const authn = role === Role.ADMINISTRATIVE ? f.authn : await session(role);
      await request(app.getHttpServer()).post('/api/sala/payments').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(f.input).expect(201);
      expect(await prisma.salaPayment.count()).toBe(1);
    });
    it('preserves Administrative price adjustments with a reason', async () => {
      const f = await paymentFixture();
      const saved = await f.post({ ...f.input, amount: '15000', adjustmentReason: 'Descuento administrativo' }).expect(201);
      expect(saved.body.data).toMatchObject({ amount: '15000', adjustmentReason: 'Descuento administrativo', planId: f.plan.id });
      expect((await prisma.salaPayment.findUniqueOrThrow({ where: { id: saved.body.data.id } })).amount.toString()).toBe('15000');
    });
    it('registers Professor renewals with the same coverage and persists its actor and Plan snapshot', async () => {
      const f = await paymentFixture(); const authn = await session(Role.PROFESSOR);
      const professor = await prisma.internalUser.findUniqueOrThrow({ where: { normalizedEmail: 'professor@sala.test' } });
      const post = (body: unknown) => request(app.getHttpServer()).post('/api/sala/payments').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(body);
      const first = await post(f.input).expect(201);
      expect(first.body.data).toMatchObject({ planId: f.plan.id, planName: f.plan.name, amount: '20000', coverageStartDate: '2026-10-20', coverageEndDate: '2026-11-20' });
      expect(await prisma.salaPayment.findUnique({ where: { id: first.body.data.id } })).toMatchObject({ registeredById: professor.id, planNameSnapshot: f.plan.name, adjustmentReason: null });
      await post(f.input).expect(201);
      const second = await post({ ...f.input, paidAt: '2026-11-10', operationId: randomUUID() }).expect(201);
      expect(second.body.data).toMatchObject({ coverageStartDate: '2026-11-21', coverageEndDate: '2026-12-20' });
      expect(await prisma.salaPayment.count()).toBe(2);
    });
    it.each([Role.PROFESSOR, Role.ADMINISTRATIVE, Role.GENERAL_ADMIN])('renews with another Plan atomically and idempotently for %s', async role => {
      // Isolate the additional HTTP scenarios without disabling the real rate limiter.
      const paymentApp = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
      paymentApp.use(cookieParser()); paymentApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); paymentApp.setGlobalPrefix('api');
      await paymentApp.init();
      try {
        const f = await paymentFixture(paymentApp); const authn = role === Role.ADMINISTRATIVE ? f.authn : await session(role, paymentApp);
        const other = await prisma.salaPlan.create({ data: { name: 'Plan Completo', monthlyAmount: 30000 } });
        const post = (body: unknown) => request(paymentApp.getHttpServer()).post('/api/sala/payments').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(body);
        const input = { ...f.input, planId: other.id, amount: role === Role.PROFESSOR ? '30000' : '25000', ...(role !== Role.PROFESSOR ? { adjustmentReason: 'Descuento administrativo' } : {}) };
        if (role !== Role.PROFESSOR) {
          const rejected = await post({ ...input, adjustmentReason: undefined }).expect(400);
          expect(rejected.body.code).toBe('SALA_PAYMENT_ADJUSTMENT_REASON_REQUIRED');
        }
        const saved = await post(input).expect(201);
        expect(saved.body.data).toMatchObject({ planId: other.id, planName: other.name, amount: input.amount, coverageStartDate: '2026-10-20', coverageEndDate: '2026-11-20' });
        expect(await prisma.salaPayment.findUnique({ where: { id: saved.body.data.id } })).toMatchObject({ planId: other.id, planNameSnapshot: other.name, amount: new Prisma.Decimal(input.amount) });
        expect(await prisma.salaParticipation.findUnique({ where: { id: f.participation.id } })).toMatchObject({ planId: other.id });
        const assignments = await prisma.salaPlanAssignment.findMany({ where: { salaParticipationId: f.participation.id }, orderBy: { effectiveFrom: 'asc' } });
        expect(assignments).toHaveLength(2);
        expect(assignments[1]).toMatchObject({ planId: other.id, effectiveFrom: new Date('2026-12-01T00:00:00Z') });
        // A retry must not reapply its Plan after another operational Plan change.
        await sala.changePlan(f.participation.id, f.plan.id);
        const beforeRetry = await prisma.salaPlanAssignment.findMany({ where: { salaParticipationId: f.participation.id } });
        await post(input).expect(201);
        expect(await prisma.salaPayment.count()).toBe(1);
        expect(await prisma.salaParticipation.findUnique({ where: { id: f.participation.id } })).toMatchObject({ planId: f.plan.id });
        expect(await prisma.salaPlanAssignment.findMany({ where: { salaParticipationId: f.participation.id } })).toEqual(beforeRetry);
        // Reversal changes coverage only, even after the operational Plan changes again.
        await sala.changePlan(f.participation.id, other.id);
        await sala.reversePayment(saved.body.data.id, 'Error de cobro', randomUUID(), f.actor.id);
        expect(await prisma.salaParticipation.findUnique({ where: { id: f.participation.id } })).toMatchObject({ planId: other.id });
      } finally { await paymentApp.close(); }
    });
    it('rejects Professor adjustments without persisting financial rows or Plan changes', async () => {
      const f = await paymentFixture(); const authn = await session(Role.PROFESSOR);
      const other = await prisma.salaPlan.create({ data: { name: 'Otro Plan', monthlyAmount: 30000 } });
      const assignments = await prisma.salaPlanAssignment.findMany({ where: { salaParticipationId: f.participation.id } });
      for (const [changes, code] of [
        [{ amount: '15000', adjustmentReason: 'Descuento' }, 'SALA_PAYMENT_AMOUNT_ADJUSTMENT_FORBIDDEN'],
        [{ amount: '15000' }, 'SALA_PAYMENT_AMOUNT_ADJUSTMENT_FORBIDDEN'],
        [{ adjustmentReason: 'Motivo sin ajuste' }, 'SALA_PAYMENT_AMOUNT_ADJUSTMENT_FORBIDDEN'],
        [{ planId: other.id, amount: '25000' }, 'SALA_PAYMENT_AMOUNT_ADJUSTMENT_FORBIDDEN'],
        [{ planId: other.id, amount: '25000', adjustmentReason: 'Descuento' }, 'SALA_PAYMENT_AMOUNT_ADJUSTMENT_FORBIDDEN'],
      ] as const) {
        const result = await request(app.getHttpServer()).post('/api/sala/payments').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ ...f.input, ...changes }).expect(403);
        expect(result.body.code).toBe(code);
        expect(await prisma.salaPayment.count()).toBe(0);
        expect(await prisma.salaPaymentAllocation.count()).toBe(0);
        expect(await prisma.salaParticipation.findUnique({ where: { id: f.participation.id } })).toMatchObject({ planId: f.plan.id });
        expect(await prisma.salaPlanAssignment.findMany({ where: { salaParticipationId: f.participation.id } })).toEqual(assignments);
      }
    });
    it('denies Professor reversals, advanced Sala finance operations, expenses and general financial reads', async () => {
      const f = await paymentFixture(); const authn = await session(Role.PROFESSOR);
      const payment = await f.post(f.input).expect(201);
      for (const path of [`/api/sala/payments/${payment.body.data.id}/reverse`, '/api/sala/opening-balances', `/api/sala/charges/${randomUUID()}/adjust`, `/api/sala/charges/${randomUUID()}/reverse`, '/api/finance/expenses']) {
        await request(app.getHttpServer()).post(path).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ reason: 'Intento', operationId: randomUUID() }).expect(403);
      }
      for (const resource of ['income', 'expenses', 'totals', 'executive-totals']) await request(app.getHttpServer()).get(`/api/finance/${resource}`).set('Cookie', authn.cookie).expect(403);
      await request(app.getHttpServer()).get('/api/finance/payment-methods').set('Cookie', authn.cookie).expect(200);
      expect(await prisma.salaPaymentReversal.count()).toBe(0);
      expect(await prisma.salaPayment.count()).toBe(1);
    });
    it('rejects legacy access fields and invalid payment DTOs', async () => {
      const f = await paymentFixture();
      for (const changes of [{ year: 2026, month: 10 }, { amount: '0' }, { amount: '1.5' }, { planId: undefined }, { personId: 'invalid' }, { paidAt: '2026-02-30' }]) await f.post({ ...f.input, ...changes }).expect(400);
      expect(await prisma.salaPayment.count()).toBe(0);
    });
    it('projects uncovered fixed dates before midmonth, renews before start and never reactivates a cancelled date', async () => {
      jest.setSystemTime(new Date('2026-11-05T11:00:00Z')); // 08:00 Buenos Aires
      const f = await paymentFixture();
      const service = await sala.createServiceType({ name: 'Vigencia fija', durationMinutes: 60 });
      await prisma.salaPlanService.create({ data: { planId: f.plan.id, serviceTypeId: service.id } });
      const slot = await sala.createSlot({ weekday: 'THURSDAY', startTime: '09:00', durationMinutes: 60 });
      const booking = await sala.createFixed({ personId: f.person.id, salaParticipationId: f.participation.id, scheduleSlotId: slot.id, serviceTypeId: service.id, startTime: '09:00', startDate: '2026-11-05' });
      const states = () => sala.fixedOccurrenceStates(f.person.id, ['2026-11-05']);
      expect(await states()).toEqual([expect.objectContaining({ status: 'PENDING_PAYMENT' })]);
      expect((await sala.agenda('2026-11-05')).flatMap(block => block.people)).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'PENDING_PAYMENT' })]));
      const payment = await sala.createPayment({ ...f.input, paidAt: '2026-11-05' }, f.actor.id);
      expect(await states()).toEqual([expect.objectContaining({ status: 'RESERVED' })]);
      expect(await prisma.salaOccurrence.count({ where: { fixedSalaBookingId: booking.id } })).toBe(0);
      await sala.reversePayment(payment.id, 'Error', randomUUID(), f.actor.id);
      jest.setSystemTime(new Date('2026-11-05T12:00:00Z'));
      expect(await states()).toEqual([expect.objectContaining({ status: 'CANCELLED', cancelledForNonPayment: true })]);
      const cancelled = await prisma.salaOccurrence.findFirstOrThrow({ where: { fixedSalaBookingId: booking.id } });
      expect(cancelled.cancelledForNonPaymentAt).not.toBeNull();
      jest.setSystemTime(new Date('2026-11-05T12:01:00Z'));
      await sala.createPayment({ ...f.input, paidAt: '2026-11-05', operationId: randomUUID() }, f.actor.id);
      expect(await states()).toEqual([expect.objectContaining({ status: 'CANCELLED', cancelledForNonPayment: true })]);
      expect((await prisma.salaOccurrence.findUniqueOrThrow({ where: { id: cancelled.id } })).cancelledForNonPaymentAt).toEqual(cancelled.cancelledForNonPaymentAt);
      expect(await sala.fixedOccurrenceStates(f.person.id, ['2026-11-12'])).toEqual([expect.objectContaining({ status: 'RESERVED' })]);
    });
    it('includes the last coverage day and preserves historical payment/reversal chronology', async () => {
      jest.setSystemTime(new Date('2026-10-20T10:00:00Z'));
      const f = await paymentFixture();
      const service = await sala.createServiceType({ name: 'Historia fija', durationMinutes: 60 });
      await prisma.salaPlanService.create({ data: { planId: f.plan.id, serviceTypeId: service.id } });
      const slot = await sala.createSlot({ weekday: 'FRIDAY', startTime: '09:00', durationMinutes: 60 });
      await sala.createFixed({ personId: f.person.id, salaParticipationId: f.participation.id, scheduleSlotId: slot.id, serviceTypeId: service.id, startTime: '09:00', startDate: '2026-10-23' });
      const payment = await sala.createPayment(f.input, f.actor.id);
      expect(await sala.fixedOccurrenceStates(f.person.id, ['2026-11-20', '2026-11-27'])).toEqual([expect.objectContaining({ date: '2026-11-20', status: 'RESERVED' }), expect.objectContaining({ date: '2026-11-27', status: 'PENDING_PAYMENT' })]);
      jest.setSystemTime(new Date('2026-11-20T12:01:00Z'));
      const reversal = await sala.reversePayment(payment.id, 'Reversión posterior', randomUUID(), f.actor.id);
      await prisma.salaPaymentReversal.update({ where: { id: reversal.id }, data: { createdAt: new Date('2026-11-20T12:01:00Z') } });
      expect(await sala.fixedOccurrenceStates(f.person.id, ['2026-11-20'])).toEqual([expect.objectContaining({ status: 'RESERVED' })]);
      expect((await sala.validity(f.person.id, '2026-11-20')).hasValidAccess).toBe(false);
      const stored = await prisma.salaPayment.findUniqueOrThrow({ where: { id: payment.id }, include: { reversal: true } });
      const activityStart = new Date('2026-11-20T12:00:00Z');
      expect(sala.paymentCoversDate(stored, new Date('2026-11-20'), activityStart)).toBe(true);
      expect(sala.paymentCoversDate({ ...stored, createdAt: new Date('2026-11-20T12:00:01Z') }, new Date('2026-11-20'), activityStart)).toBe(false);
    });
    it('backfills all historical rows chronologically, including reversed payments, without inferring Plans', async () => {
      const migration = readFileSync(join(__dirname, '../prisma/migrations/20261019120000_sala_rolling_validity/migration.sql'), 'utf8');
      await prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe('CREATE TEMP TABLE sala_plans (id UUID PRIMARY KEY) ON COMMIT DROP');
        await tx.$executeRawUnsafe('CREATE TEMP TABLE sala_payments (id UUID PRIMARY KEY, person_id UUID, paid_at DATE, created_at TIMESTAMPTZ, reversed BOOLEAN) ON COMMIT DROP');
        const person = randomUUID();
        const ids = [1, 2, 3, 4].map(index => `00000000-0000-4000-8000-00000000000${index}`);
        for (const [index, paidAt] of ['2026-10-20', '2026-11-10', '2026-11-10', '2027-01-25'].entries()) {
          await tx.$executeRaw`INSERT INTO sala_payments (id, person_id, paid_at, created_at, reversed) VALUES (${ids[index]}::uuid, ${person}::uuid, ${paidAt}::date, '2026-11-01T00:00:00Z', ${index === 0})`;
        }
        const other = randomUUID();
        await tx.$executeRaw`INSERT INTO sala_payments VALUES (${randomUUID()}::uuid, ${other}::uuid, '2028-01-31', now(), false)`;
        let dollarQuoted = false; let statement = '';
        for (let index = 0; index < migration.length; index++) {
          if (migration.slice(index, index + 2) === '$$') { dollarQuoted = !dollarQuoted; statement += '$$'; index++; continue; }
          statement += migration[index];
          if (migration[index] === ';' && !dollarQuoted) { await tx.$executeRawUnsafe(statement); statement = ''; }
        }
        const rows = await tx.$queryRaw<Array<{ id: string; coverage_start_date: Date; coverage_end_date: Date; plan_id: string | null; plan_name_snapshot: string | null }>>`SELECT * FROM sala_payments WHERE person_id = ${person}::uuid ORDER BY paid_at, created_at, id`;
        expect(rows.map(row => [row.coverage_start_date.toISOString().slice(0, 10), row.coverage_end_date.toISOString().slice(0, 10)])).toEqual([['2026-10-20', '2026-11-20'], ['2026-11-21', '2026-12-20'], ['2026-12-21', '2027-01-20'], ['2027-01-25', '2027-02-25']]);
        expect(rows.every(row => row.plan_id === null && row.plan_name_snapshot === null)).toBe(true);
        const leap = await tx.$queryRaw<Array<{ coverage_end_date: Date }>>`SELECT coverage_end_date FROM sala_payments WHERE person_id = ${other}::uuid`;
        expect(leap[0]!.coverage_end_date.toISOString().slice(0, 10)).toBe('2028-02-29');
        await tx.$executeRawUnsafe('SAVEPOINT invalid_coverage');
        await expect(tx.$executeRawUnsafe("UPDATE sala_payments SET coverage_start_date = coverage_end_date + 1")).rejects.toThrow();
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT invalid_coverage');
        await expect(tx.$executeRawUnsafe('UPDATE sala_payments SET coverage_start_date = NULL')).rejects.toThrow();
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT invalid_coverage');
      });
    });

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
    const changed = await sala.changeFixed({ id: fixed.id, personId: person.id, salaParticipationId: participation.id, scheduleSlotId: window.id, serviceTypeId: service.id, startTime: '10:00', startDate: '2026-08-31' });
    expect(changed.id).toBe(fixed.id);
    expect(changed.startTime?.toISOString().slice(11, 16)).toBe('10:00');
    const persisted = await prisma.fixedSalaBooking.findFirstOrThrow({ where: { id: changed.id } });
    expect({ startTime: persisted.startTime?.toISOString().slice(11, 16), serviceDurationMinutes: persisted.serviceDurationMinutes, scheduleSlotId: persisted.scheduleSlotId }).toEqual({ startTime: '10:00', serviceDurationMinutes: 45, scheduleSlotId: window.id });
  });
  describe('spontaneous attendance with explicit services', () => {
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'queueMicrotask', 'hrtime'] });
      jest.setSystemTime(new Date('2026-10-16T11:00:00Z'));
    });
    afterEach(() => jest.useRealTimers());
    const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
    const shifted = (offset: number) => new Date(new Date(`${today()}T00:00:00Z`).getTime() + offset * 86400000).toISOString().slice(0, 10);
    async function fixture(date = today(), role: Role = Role.PROFESSOR) {
      const authn = await session(role);
      const professor = role === Role.PROFESSOR ? await prisma.internalUser.findFirstOrThrow({ where: { roles: { some: { role: Role.PROFESSOR } } } }) : await users.create({ firstName: 'Profe', lastName: 'Sintético', email: `profe-${randomUUID()}@test.local`, roles: [Role.PROFESSOR] });
      const actor = await prisma.internalUser.findFirstOrThrow({ where: { email: `${role.toLowerCase()}@sala.test` } });
      const service = await sala.createServiceType({ name: 'Funcional', durationMinutes: 45 });
      const other = await sala.createServiceType({ name: 'Calistenia', durationMinutes: 60 });
      const plan = await sala.createPlan({ name: 'Plan Base', monthlyAmount: 1000, weeklySessions: 5, serviceTypeIds: [service.id] });
      const person = await prisma.person.create({ data: { firstName: 'Alumna', lastName: 'Sintética', dni: '30123456', normalizedDni: '30123456', phone: '3515550000', birthDate: new Date('1990-01-01') } });
      const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: shifted(-30) });
      const weekday = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date(`${date}T00:00:00Z`).getUTCDay()] as SalaWeekday;
      const slot = await sala.createSlot({ weekday, startTime: '09:00', durationMinutes: 120, specificCapacity: 1 });
      const input = { personId: person.id, scheduleSlotId: slot.id, date, startTime: '09:00', serviceTypeId: service.id };
      return { authn, actor, professor, person, participation, service, other, plan, slot, input };
    }
    function post(path: string, authn: { cookie: string; csrf: string }, input: object) { return request(app.getHttpServer()).post(`/api/sala/occurrences/spontaneous${path}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(input); }
    it.each(['08:59', '09:00', '09:01'])('protects current operational minute at %s Argentina', async clock => {
      const f = await fixture();
      jest.setSystemTime(new Date(`2026-10-16T${clock}:45-03:00`));
      const result = await post('', f.authn, f.input).expect(clock === '09:01' ? 400 : 201);
      if (clock === '09:01') {
        expect(result.body.code).toBe('SALA_SPONTANEOUS_TIME_PASSED');
        expect(await prisma.salaOccurrence.count()).toBe(0);
      } else expect(await prisma.salaOccurrence.count()).toBe(1);
    });
    it.each(['/join', '/create-student'])('rolls back onboarding when time has passed (%s)', async path => {
      const f = await fixture(today(), Role.ADMINISTRATIVE);
      await sala.leave(f.participation.id);
      jest.setSystemTime(new Date('2026-10-16T12:01:00Z'));
      const input = path === '/join' ? { ...f.input, planId: f.plan.id, mainProfessorId: f.professor.id } : { scheduleSlotId: f.slot.id, date: today(), startTime: '09:00', serviceTypeId: f.service.id, planId: f.plan.id, mainProfessorId: f.professor.id, firstName: 'Nueva', lastName: 'Sintética', dni: '88999111', phone: '1123456789', birthDate: '2000-01-01' };
      const peopleBefore = await prisma.person.count(); const participationsBefore = await prisma.salaParticipation.count();
      const result = await post(path, f.authn, input).expect(400);
      expect(result.body.code).toBe('SALA_SPONTANEOUS_TIME_PASSED');
      expect(await prisma.person.count()).toBe(peopleBefore);
      expect(await prisma.salaParticipation.count()).toBe(participationsBefore);
      expect(await prisma.salaOccurrence.count()).toBe(0);
    });
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
    it('rejects unavailable services and permits general Sala without one', async () => {
      const f = await fixture();
      expect((await post('', f.authn, { ...f.input, serviceTypeId: f.other.id }).expect(400)).body.code).toBe('SALA_SERVICE_NOT_INCLUDED_IN_PLAN');
      await sala.retireServiceType(f.service.id);
      expect((await post('', f.authn, f.input).expect(400)).body.code).toBe('SALA_SERVICE_TYPE_INVALID');
      const missing = { personId: f.input.personId, scheduleSlotId: f.input.scheduleSlotId, date: f.input.date, startTime: f.input.startTime };
      expect(await prisma.salaOccurrence.count()).toBe(0);
      const general = await post('', f.authn, missing).expect(201);
      expect(general.body.data).toMatchObject({ serviceTypeId: null, serviceDurationMinutes: 60, status: 'ATTENDED' });
      expect(await prisma.salaOccurrence.count()).toBe(1);
    });
    it('rejects future attendance', async () => {
      const f = await fixture(shifted(1));
      expect((await post('', f.authn, f.input).expect(400)).body.code).toBe('SALA_SPONTANEOUS_FUTURE_NOT_ALLOWED');
      expect(await prisma.salaOccurrence.count()).toBe(0);
    });
    it('uses the applicable past Plan assignment and returns its selectable services in options', async () => {
      const past = shifted(-7); const f = await fixture(past);
      const later = await sala.createPlan({ name: 'Plan posterior', monthlyAmount: 2000, weeklySessions: 5, serviceTypeIds: [f.other.id] });
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
      expect(await prisma.salaCharge.count({ where: { personId: createdPerson.id } })).toBe(0);
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
      const current = await sala.createPlan({ name: 'Plan actual', monthlyAmount: 1500, weeklySessions: 5, serviceTypeIds: [f.other.id, alphabetical.id] });
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

  describe('Sala dashboard projection', () => {
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'queueMicrotask', 'hrtime'] });
      jest.setSystemTime(new Date('2026-10-13T11:30:00Z'));
    });
    afterEach(() => jest.useRealTimers());
    async function dashboardFixture() {
      const authn = await session(Role.PROFESSOR);
      const professor = await prisma.internalUser.findFirstOrThrow({ where: { normalizedEmail: 'professor@sala.test' } });
      const service = await sala.createServiceType({ name: 'Dashboard funcional', durationMinutes: 30 });
      const plan = await sala.createPlan({ name: 'Dashboard plan', monthlyAmount: 1000, weeklySessions: 5, serviceTypeIds: [service.id] });
      const slot = await sala.createSlot({ weekday: 'TUESDAY', startTime: '09:00', durationMinutes: 240, specificCapacity: 20 });
      const nextSlot = await sala.createSlot({ weekday: 'WEDNESDAY', startTime: '09:00', durationMinutes: 240, specificCapacity: 20 });
      const students: { person: Person; participation: SalaParticipation }[] = [];
      for (let index = 0; index < 7; index++) {
        const dni = `8800000${index}`;
        const person = await prisma.person.create({ data: { firstName: `Alumno ${index}`, lastName: 'Sintético', dni, normalizedDni: dni, phone: '3515550000', birthDate: new Date('1990-01-01') } });
        const participation = await prisma.salaParticipation.create({ data: { personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: new Date('2026-01-01'), ...(index === 6 ? { endDate: new Date('2026-10-01') } : {}) } });
        students.push({ person, participation });
      }
      const time = (hour: number) => new Date(Date.UTC(1970, 0, 1, hour));
      for (const window of [slot, nextSlot]) {
        const date = window.id === slot.id ? '2026-10-13' : '2026-10-14';
        for (let index = 0; index < 6; index++) {
          const student = students[index]!;
          const startTime = time(index < 3 ? 9 : index + 7);
          if (index === 0) {
            await prisma.fixedSalaBooking.create({ data: { personId: student.person.id, salaParticipationId: student.participation.id, scheduleSlotId: window.id, serviceTypeId: service.id, serviceDurationMinutes: 30, startTime, startDate: new Date('2026-01-01') } });
          } else {
            const reservation = await prisma.oneOffReservation.create({ data: { personId: student.person.id, salaParticipationId: student.participation.id, scheduleSlotId: window.id, serviceTypeId: service.id, serviceDurationMinutes: 30, startTime, date: new Date(date), ...(index === 1 ? { cancelledAt: new Date() } : {}) } });
            if (window.id === slot.id && (index === 2 || index === 3)) await prisma.salaOccurrence.create({ data: { personId: student.person.id, scheduleSlotId: window.id, oneOffReservationId: reservation.id, date: new Date(date), startTime, serviceTypeId: service.id, serviceDurationMinutes: 30, origin: 'ONE_OFF', status: index === 2 ? 'ABSENT' : 'ATTENDED' } });
          }
        }
      }
      await prisma.salaOccurrence.create({ data: { personId: students[0]!.person.id, scheduleSlotId: slot.id, date: new Date('2026-10-13'), startTime: new Date('1970-01-01T09:15:00Z'), serviceTypeId: service.id, serviceDurationMinutes: 30, origin: 'SPONTANEOUS', status: 'ATTENDED' } });
      await prisma.routine.create({ data: { personId: students[0]!.person.id, salaParticipationId: students[0]!.participation.id, version: 1, status: 'ACTIVE' } });
      await prisma.routine.create({ data: { personId: students[1]!.person.id, salaParticipationId: students[1]!.participation.id, version: 1, status: 'HISTORICAL' } });
      const method = await prisma.paymentMethod.create({ data: { name: `Dashboard ${randomUUID()}` } });
      const pay = (index: number, month: number) => prisma.salaPayment.create({ data: { personId: students[index]!.person.id, year: 2026, month, coverageStartDate: new Date(Date.UTC(2026, month - 1, 1)), coverageEndDate: new Date(Date.UTC(2026, month, 0)), paidAt: new Date('2026-09-30'), amount: 1000, paymentMethodId: method.id, registeredById: professor.id, operationId: randomUUID() } });
      const payment = await pay(0, 10);
      await pay(1, 9);
      return { authn, professor, students, payment };
    }
    it('authorizes Professor and derives all counters, three upcoming times and minimal personal data from the agenda', async () => {
      const f = await dashboardFixture();
      const result = await request(app.getHttpServer()).get('/api/sala/dashboard?date=2026-10-13').set('Cookie', f.authn.cookie).expect(200);
      expect(result.body.data).toMatchObject({ date: '2026-10-13', expected: 6, attended: 2, cancelledOrAbsent: 2, withoutRoutine: { count: 5 }, withoutValidity: { count: 5 } });
      expect(result.body.data.upcoming.map((slot: { startTime: string }) => slot.startTime)).toEqual(['09:00', '10:00', '11:00']);
      expect(result.body.data.upcoming[0]).toMatchObject({ total: 2 });
      const upcomingPeople = result.body.data.upcoming.flatMap((slot: { people: { id: string }[] }) => slot.people);
      expect(upcomingPeople.map((person: { id: string }) => person.id)).not.toContain(f.students[1]!.person.id);
      expect(Object.keys(upcomingPeople[0]).sort()).toEqual(['firstName', 'id', 'lastName', 'origin']);
      expect(Object.keys(result.body.data).sort()).toEqual(['attended', 'cancelledOrAbsent', 'date', 'expected', 'upcoming', 'withoutRoutine', 'withoutValidity']);
      expect(result.body.data.withoutRoutine.personIds).toContain(f.students[1]!.person.id);
      expect(result.body.data.withoutRoutine.personIds).not.toContain(f.students[0]!.person.id);
      expect(result.body.data.withoutRoutine.personIds).not.toContain(f.students[6]!.person.id);
      expect(result.body.data.withoutValidity.personIds).not.toContain(f.students[0]!.person.id);
      expect(result.body.data.withoutValidity.personIds).toContain(f.students[1]!.person.id);
      expect(result.body.data.withoutValidity.personIds).not.toContain(f.students[6]!.person.id);
      await request(app.getHttpServer()).get('/api/sala/dashboard?date=not-a-date').set('Cookie', f.authn.cookie).expect(400);
      const denied = await session(Role.BROCO_SUPPORT);
      await request(app.getHttpServer()).get('/api/sala/dashboard?date=2026-10-13').set('Cookie', denied.cookie).expect(403);
    });
    it('filters elapsed starts only for today, keeps the first three tomorrow and treats reversed payments as pending', async () => {
      const f = await dashboardFixture();
      jest.setSystemTime(new Date('2026-10-13T12:00:00Z'));
      const exact = await request(app.getHttpServer()).get('/api/sala/dashboard?date=2026-10-13').set('Cookie', f.authn.cookie).expect(200);
      expect(exact.body.data.upcoming[0].startTime).toBe('09:00');
      jest.setSystemTime(new Date('2026-10-13T12:15:00Z'));
      const today = await request(app.getHttpServer()).get('/api/sala/dashboard?date=2026-10-13').set('Cookie', f.authn.cookie).expect(200);
      expect(today.body.data.upcoming.map((slot: { startTime: string }) => slot.startTime)).toEqual(['10:00', '11:00', '12:00']);
      const tomorrow = await request(app.getHttpServer()).get('/api/sala/dashboard?date=2026-10-14').set('Cookie', f.authn.cookie).expect(200);
      expect(tomorrow.body.data.upcoming.map((slot: { startTime: string }) => slot.startTime)).toEqual(['09:00', '10:00', '11:00']);
      await prisma.salaPaymentReversal.create({ data: { paymentId: f.payment.id, operationId: randomUUID(), reason: 'Error sintético', registeredById: f.professor.id } });
      const reversed = await request(app.getHttpServer()).get('/api/sala/dashboard?date=2026-10-14').set('Cookie', f.authn.cookie).expect(200);
      expect(reversed.body.data.withoutValidity.count).toBe(6);
      expect(reversed.body.data.withoutValidity.personIds).toContain(f.students[0]!.person.id);
      // UTC already crossed into November; operational Argentina is still in October.
      jest.setSystemTime(new Date('2026-11-01T02:30:00Z'));
      const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: f.professor.email, password: 'ValidPass1!' }).expect(200);
      f.authn.cookie = login.headers['set-cookie'][0] as string;
      const monthBoundary = await request(app.getHttpServer()).get('/api/sala/dashboard?date=2026-11-01').set('Cookie', f.authn.cookie).expect(200);
      expect(monthBoundary.body.data.withoutValidity.count).toBe(6);
      await prisma.salaPaymentReversal.deleteMany();
      const october = await request(app.getHttpServer()).get('/api/sala/dashboard?date=2026-11-01').set('Cookie', f.authn.cookie).expect(200);
      expect(october.body.data.withoutValidity.count).toBe(5);
      jest.setSystemTime(new Date('2026-11-01T03:00:00Z'));
      const november = await request(app.getHttpServer()).get('/api/sala/dashboard?date=2026-11-01').set('Cookie', f.authn.cookie).expect(200);
      expect(november.body.data.withoutValidity.count).toBe(6);
    });
    it('limits names to three while preserving total expected students and returns zero/empty summaries', async () => {
      const f = await dashboardFixture();
      const window = await prisma.salaScheduleSlot.findFirstOrThrow({ where: { weekday: 'WEDNESDAY' } });
      await prisma.oneOffReservation.updateMany({ where: { scheduleSlotId: window.id }, data: { startTime: new Date('1970-01-01T09:00:00Z') } });
      const result = await request(app.getHttpServer()).get('/api/sala/dashboard?date=2026-10-14').set('Cookie', f.authn.cookie).expect(200);
      expect(result.body.data.upcoming).toHaveLength(1);
      expect(result.body.data.upcoming[0].total).toBe(5);
      expect(result.body.data.upcoming[0].people).toHaveLength(3);
      const empty = await request(app.getHttpServer()).get('/api/sala/dashboard?date=2026-10-15').set('Cookie', f.authn.cookie).expect(200);
      expect(empty.body.data).toMatchObject({ expected: 0, attended: 0, cancelledOrAbsent: 0, upcoming: [] });
    });
  });

  it('denies Professor structural configuration while allowing agenda reads', async () => {
    const authn = await session(Role.PROFESSOR);
    await request(app.getHttpServer()).patch('/api/sala/configuration').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ capacity: 12 }).expect(403);
    await request(app.getHttpServer()).post('/api/sala/schedule').set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send({ weekday: 'MONDAY', startTime: '09:00', durationMinutes: 60 }).expect(403);
    await request(app.getHttpServer()).get('/api/sala/agenda?date=2026-10-13').set('Cookie', authn.cookie).expect(200);
  });

  describe('active Sala students projection', () => {
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'queueMicrotask', 'hrtime'] });
      // UTC November, but still October in operational Argentina.
      jest.setSystemTime(new Date('2026-11-01T02:30:00Z'));
    });
    afterEach(() => jest.useRealTimers());
    async function studentsFixture() {
      const authn = await session(Role.PROFESSOR);
      const professor = await prisma.internalUser.findFirstOrThrow({ where: { normalizedEmail: 'professor@sala.test' } });
      const other = await users.create({ firstName: 'Otro', lastName: 'Profesor sintético', email: 'other@students.test', roles: [Role.PROFESSOR] });
      const plan = await prisma.salaPlan.create({ data: { name: '3 veces', monthlyAmount: 1000 } });
      const names = [['Zoe', 'Zulu'], ['Bruno', 'Alfa'], ['Ana', 'Alfa'], ['Lucía', 'Beta'], ['Finalizado', 'Aardvark']];
      const students: { person: Person; participation: SalaParticipation }[] = [];
      for (const [index, [firstName, lastName]] of names.entries()) {
        const dni = `8700000${index}`;
        const person = await prisma.person.create({ data: { firstName: firstName!, lastName: lastName!, dni, normalizedDni: dni, phone: '3515550000', email: 'synthetic@students.test', birthDate: new Date('1990-01-01') } });
        const participation = await prisma.salaParticipation.create({ data: { personId: person.id, mainProfessorId: index % 2 ? other.id : professor.id, planId: plan.id, startDate: new Date('2026-01-01'), ...(index === 4 ? { endDate: new Date('2026-10-01') } : {}) } });
        students.push({ person, participation });
      }
      await prisma.routine.create({ data: { personId: students[0]!.person.id, salaParticipationId: students[0]!.participation.id, version: 1, status: 'ACTIVE' } });
      await prisma.routine.create({ data: { personId: students[1]!.person.id, salaParticipationId: students[1]!.participation.id, version: 1, status: 'HISTORICAL' } });
      const method = await prisma.paymentMethod.create({ data: { name: `Students ${randomUUID()}` } });
      const pay = (index: number, month: number) => prisma.salaPayment.create({ data: { personId: students[index]!.person.id, year: 2026, month, coverageStartDate: new Date(Date.UTC(2026, month - 1, 1)), coverageEndDate: new Date(Date.UTC(2026, month, 0)), amount: 1000, paidAt: new Date('2026-10-01'), registeredById: professor.id, paymentMethodId: method.id, operationId: randomUUID() } });
      await pay(0, 10);
      const reversed = await pay(1, 10);
      await prisma.salaPaymentReversal.create({ data: { paymentId: reversed.id, registeredById: professor.id, operationId: randomUUID(), reason: 'Reversión sintética' } });
      // Student 2 has no payment at all; student 3 only has a next-month payment.
      await pay(3, 11);
      return { authn, professor, other, plan, students };
    }
    it('returns current validity without monthly query fields', async () => {
      const f = await studentsFixture();
      const rows = await sala.listStudents();
      expect(rows.find(row => row.id === f.students[0]!.person.id)).toMatchObject({ hasValidAccess: true, validUntil: '2026-10-31', lastPaymentPaidAt: '2026-10-01' });
      for (const index of [1, 2, 3]) expect(rows.find(row => row.id === f.students[index]!.person.id)).toMatchObject({ hasValidAccess: false, validUntil: null });
    });
    it('returns every active participant across Professors, in surname/name order and with only the exact DTO fields', async () => {
      const f = await studentsFixture();
      const result = await request(app.getHttpServer()).get('/api/sala/students').set('Cookie', f.authn.cookie).expect(200);
      expect(result.body.data.map((row: { id: string }) => row.id)).toEqual([2, 1, 3, 0].map(index => f.students[index]!.person.id));
      for (const row of result.body.data) {
        const index = f.students.findIndex(student => student.person.id === row.id);
        const professor = index % 2 ? f.other : f.professor;
        expect(row.professor).toEqual({ id: professor.id, firstName: professor.firstName, lastName: professor.lastName });
        expect(row.plan).toEqual({ id: f.plan.id, name: '3 veces' });
        expect(Object.keys(row).sort()).toEqual(['dni', 'firstName', 'hasValidAccess', 'id', 'lastName', 'lastPaymentPaidAt', 'participationId', 'participationStartDate', 'plan', 'professor', 'routineStatus', 'validUntil']);
        expect(row.dni).toBe(f.students[index]!.person.dni);
      }
      expect(Object.keys(result.body)).toEqual(['data']);
    });
    it('counts only ACTIVE routines of that participation and current non-reversed coverage', async () => {
      const f = await studentsFixture();
      const result = await request(app.getHttpServer()).get('/api/sala/students').set('Cookie', f.authn.cookie).expect(200);
      const statuses = new Map<string, { routineStatus: string; hasValidAccess: boolean }>(result.body.data.map((row: { id: string; routineStatus: string; hasValidAccess: boolean }) => [row.id, row]));
      expect(statuses.get(f.students[0]!.person.id)).toMatchObject({ routineStatus: 'ACTIVE', hasValidAccess: true, lastPaymentPaidAt: '2026-10-01' });
      for (const index of [1, 2, 3]) expect(statuses.get(f.students[index]!.person.id)).toMatchObject({ routineStatus: 'MISSING', hasValidAccess: false, lastPaymentPaidAt: index === 3 ? '2026-10-01' : null });
      // An ACTIVE routine tied to a former participation cannot make the current participation active.
      const previous = await prisma.salaParticipation.create({ data: { personId: f.students[2]!.person.id, mainProfessorId: f.professor.id, planId: f.plan.id, startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31') } });
      await prisma.routine.create({ data: { personId: f.students[2]!.person.id, salaParticipationId: previous.id, version: 1, status: 'ACTIVE' } });
      const after = await request(app.getHttpServer()).get('/api/sala/students').set('Cookie', f.authn.cookie).expect(200);
      expect(after.body.data.find((row: { id: string }) => row.id === f.students[2]!.person.id).routineStatus).toBe('MISSING');
    });
    it('returns an empty list and denies clinical relation-only and support actors', async () => {
      const professor = await session(Role.PROFESSOR);
      const result = await request(app.getHttpServer()).get('/api/sala/students').set('Cookie', professor.cookie).expect(200);
      expect(result.body).toEqual({ data: [] });
      for (const role of [Role.KINESIOLOGIST, Role.BROCO_SUPPORT]) {
        const denied = await session(role);
        await request(app.getHttpServer()).get('/api/sala/students').set('Cookie', denied.cookie).expect(403);
      }
    });
  });
  describe('Sala student follow-up and management', () => {
    beforeEach(() => { jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] }); jest.setSystemTime(new Date('2026-11-01T02:30:00Z')); });
    afterEach(() => jest.useRealTimers());
    async function followUpFixture(role: Role = Role.PROFESSOR) {
      const authn = await session(role);
      const actor = await prisma.internalUser.findFirstOrThrow({ where: { email: `${role.toLowerCase()}@sala.test` } });
      const professor = role === Role.PROFESSOR ? actor : await users.create({ firstName: 'Profesor', lastName: 'Sintético', email: 'follow-up-prof@sala.test', roles: [Role.PROFESSOR] });
      const other = await users.create({ firstName: 'Otro', lastName: 'Profesor', email: 'follow-up-other@sala.test', roles: [Role.PROFESSOR] });
      const plan = await prisma.salaPlan.create({ data: { name: 'Seguimiento', monthlyAmount: 1000 } });
      const students: { person: Person; participation: SalaParticipation }[] = [];
      for (let index = 0; index < 3; index++) {
        const dni = `8600000${index}`;
        const person = await prisma.person.create({ data: { firstName: `Alumno ${index}`, lastName: 'Sintético', dni, normalizedDni: dni, phone: '3515550000', birthDate: new Date('1990-01-01') } });
        const participation = await sala.join({ personId: person.id, mainProfessorId: professor.id, planId: plan.id, startDate: index === 0 ? '2026-10-01' : '2026-07-01' });
        students.push({ person, participation });
      }
      const method = await prisma.paymentMethod.create({ data: { name: `Follow-up ${randomUUID()}` } });
      const pay = (index: number, month: number, year = 2026) => prisma.salaPayment.create({ data: { personId: students[index]!.person.id, year, month, coverageStartDate: new Date(Date.UTC(year, month - 1, 1)), coverageEndDate: new Date(Date.UTC(year, month, 0)), amount: 1000, paidAt: new Date('2026-10-01'), registeredById: actor.id, paymentMethodId: method.id, operationId: randomUUID() } });
      const post = (path: string, body: object) => request(app.getHttpServer()).post(`/api/sala/participations/${path}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(body);
      return { authn, actor, professor, other, plan, students, pay, post };
    }
    async function associated(f: Awaited<ReturnType<typeof followUpFixture>>, index: number) {
      const student = f.students[index]!;
      let slot = await prisma.salaScheduleSlot.findFirst();
      slot ??= await sala.createSlot({ weekday: 'MONDAY', startTime: '09:00', durationMinutes: 120 });
      const base = { personId: student.person.id, salaParticipationId: student.participation.id, scheduleSlotId: slot.id };
      const fixed = await prisma.fixedSalaBooking.create({ data: { ...base, startDate: new Date('2026-10-01') } });
      const reservation = await prisma.oneOffReservation.create({ data: { ...base, date: new Date('2026-11-02') } });
      const routine = await prisma.routine.create({ data: { personId: student.person.id, salaParticipationId: student.participation.id, status: 'ACTIVE', version: 1 } });
      const indication = await prisma.salaClinicalIndication.create({ data: { personId: student.person.id, responsibleProfessionalId: f.actor.id, trainingCondition: 'RESTRICTED', affectedArea: 'Dato privado sintético', instructions: 'Instrucción privada sintética' } });
      return { fixed, reservation, routine, indication };
    }
    it('derives access from coverage and removes reversed coverage', async () => {
      const f = await followUpFixture();
      expect((await sala.listStudents()).find(row => row.id === f.students[0]!.person.id)).toMatchObject({ participationId: f.students[0]!.participation.id, hasValidAccess: false, validUntil: null });
      const payment = await f.pay(0, 10);
      expect((await sala.listStudents()).find(row => row.id === f.students[0]!.person.id)).toMatchObject({ hasValidAccess: true, validUntil: '2026-10-31', lastPaymentPaidAt: '2026-10-01' });
      await prisma.salaPaymentReversal.create({ data: { paymentId: payment.id, reason: 'Sintético', registeredById: f.actor.id, operationId: randomUUID() } });
      expect((await sala.listStudents()).find(row => row.id === f.students[0]!.person.id)).toMatchObject({ hasValidAccess: false, validUntil: null, lastPaymentPaidAt: null });
    });
    it.each([Role.PROFESSOR, Role.GENERAL_ADMIN])('%s can save, edit and clear Objective with optional nullable validation', async (role) => {
      const f = await followUpFixture(role); const id = f.students[0]!.participation.id;
      const patch = (body: object) => request(app.getHttpServer()).patch(`/api/sala/participations/${id}/objective`).set('Cookie', f.authn.cookie).set('x-csrf-token', f.authn.csrf).send(body);
      for (const objective of ['  Mejorar fuerza  ', 'Preparar carrera', '', '   ', null, undefined]) {
        const response = await patch(objective === undefined ? {} : { objective }).expect(200);
        expect(response.body.data.objective).toBe(objective?.trim() || null);
        expect((await prisma.salaParticipation.findUniqueOrThrow({ where: { id } })).objective).toBe(objective?.trim() || null);
      }
      await patch({ objective: 'x'.repeat(501) }).expect(400);
      await patch({ objective: 12 }).expect(400);
      await sala.leave(id);
      await patch({ objective: 'Cerrada' }).expect(404);
    });
    it('denies pure Administrative Objective writes but allows combined Professor roles', async () => {
      const f = await followUpFixture(Role.ADMINISTRATIVE); const id = f.students[0]!.participation.id;
      const patch = () => request(app.getHttpServer()).patch(`/api/sala/participations/${id}/objective`).set('Cookie', f.authn.cookie).set('x-csrf-token', f.authn.csrf).send({ objective: 'Mejorar fuerza' });
      const denied = await patch().expect(403); expect(denied.body.code).toBe('SALA_OBJECTIVE_FORBIDDEN');
      expect((await prisma.salaParticipation.findUniqueOrThrow({ where: { id } })).objective).toBeNull();
      await prisma.internalUserRole.create({ data: { internalUserId: f.actor.id, role: Role.PROFESSOR } });
      await patch().expect(200);
      const read = await request(app.getHttpServer()).get(`/api/sala/participations/person/${f.students[0]!.person.id}`).set('Cookie', f.authn.cookie).expect(200);
      expect(read.body.data[0].objective).toBe('Mejorar fuerza');
    });
    it('preserves the historical Objective and starts a new participation empty', async () => {
      const f = await followUpFixture(); const student = f.students[0]!;
      await sala.updateObjective(student.participation.id, 'Mejorar fuerza', f.actor.id);
      await sala.leave(student.participation.id);
      const next = await sala.join({ personId: student.person.id, mainProfessorId: f.professor.id, planId: f.plan.id, startDate: '2026-10-31' });
      expect(next.objective).toBeNull(); expect(next.id).not.toBe(student.participation.id);
      expect((await prisma.salaParticipation.findUniqueOrThrow({ where: { id: student.participation.id } })).objective).toBe('Mejorar fuerza');
    });
    it.each(['leave', 'bulk', 'rollback'] as const)('preserves started activities and cancels only real future starts during %s', async operation => {
      jest.setSystemTime(new Date('2026-10-13T15:00:00Z')); // 12:00 Buenos Aires.
      const f = await followUpFixture(Role.ADMINISTRATIVE);
      const morning = await sala.createSlot({ weekday: 'TUESDAY', startTime: '09:00', durationMinutes: 240 });
      const evening = await sala.createSlot({ weekday: 'TUESDAY', startTime: '17:00', durationMinutes: 120 });
      const selected = f.students.slice(0, operation === 'bulk' ? 2 : 1);
      const fixtures = [];
      for (const student of selected) {
        const base = { personId: student.person.id, salaParticipationId: student.participation.id };
        const fixed = [];
        for (const [slot, startTime] of [[morning, null], [evening, null], [morning, new Date('1970-01-01T12:00:00Z')]] as const) {
          fixed.push(await prisma.fixedSalaBooking.create({ data: { ...base, scheduleSlotId: slot.id, startDate: new Date('2026-10-01'), startTime } }));
        }
        const reservations = [];
        for (const [slot, date, startTime] of [[morning, '2026-10-13', null], [evening, '2026-10-13', new Date('1970-01-01T17:30:00Z')], [morning, '2026-10-14', null], [morning, '2026-10-13', new Date('1970-01-01T12:00:00Z')]] as const) {
          reservations.push(await prisma.oneOffReservation.create({ data: { ...base, scheduleSlotId: slot.id, date: new Date(date), startTime } }));
        }
        const occurrences = [];
        for (const [slot, date, startTime, marker] of [[morning, '2026-10-13', null, null], [evening, '2026-10-13', new Date('1970-01-01T18:00:00Z'), new Date('2026-10-01')], [morning, '2026-10-14', null, null], [morning, '2026-10-13', new Date('1970-01-01T12:00:00Z'), null]] as const) {
          occurrences.push(await prisma.salaOccurrence.create({ data: { personId: student.person.id, scheduleSlotId: slot.id, date: new Date(date), startTime, origin: 'SPONTANEOUS', status: 'RESERVED', cancelledForNonPaymentAt: marker } }));
        }
        const futureFixed = await prisma.salaOccurrence.create({ data: { personId: student.person.id, scheduleSlotId: morning.id, date: new Date('2026-10-20'), fixedSalaBookingId: fixed[0]!.id, origin: 'FIXED', status: 'RESERVED' } });
        expect(await sala.leaveImpact(student.participation.id)).toMatchObject({ fixedBookings: 3, futureReservations: 2 });
        fixtures.push({ student, fixed, reservations, occurrences, futureFixed });
      }
      if (operation === 'rollback') await expect(sala.leave(selected[0]!.participation.id, true, f.actor.id)).rejects.toThrow('SIMULATED_LEAVE_FAILURE');
      else if (operation === 'bulk') expect(await sala.bulkLeave(selected.map(item => item.participation.id), f.actor.id)).toEqual({ affected: 2 });
      else await sala.leave(selected[0]!.participation.id, false, f.actor.id);
      for (const { student, fixed, reservations, occurrences, futureFixed } of fixtures) {
        const rolledBack = operation === 'rollback';
        expect((await prisma.salaOccurrence.findUniqueOrThrow({ where: { id: futureFixed.id } })).status).toBe(rolledBack ? 'RESERVED' : 'CANCELLED');
        expect((await prisma.salaParticipation.findUniqueOrThrow({ where: { id: student.participation.id } })).endDate).toEqual(rolledBack ? null : new Date('2026-10-13'));
        for (const booking of fixed) expect((await prisma.fixedSalaBooking.findUniqueOrThrow({ where: { id: booking.id } })).endDate).toEqual(rolledBack ? null : new Date('2026-10-13'));
        for (const [index, booking] of fixed.entries()) {
          const materialized = await prisma.salaOccurrence.findUnique({ where: { fixedSalaBookingId_date: { fixedSalaBookingId: booking.id, date: new Date('2026-10-13') } } });
          if (index === 1 && !rolledBack) expect(materialized).toMatchObject({ status: 'CANCELLED', cancelledForNonPaymentAt: null });
          else expect(materialized).toBeNull();
        }
        for (const [index, reservation] of reservations.entries()) expect((await prisma.oneOffReservation.findUniqueOrThrow({ where: { id: reservation.id } })).cancelledAt).toEqual(!rolledBack && (index === 1 || index === 2) ? new Date('2026-10-13T15:00:00Z') : null);
        for (const [index, occurrence] of occurrences.entries()) {
          const stored = await prisma.salaOccurrence.findUniqueOrThrow({ where: { id: occurrence.id } });
          if (!rolledBack && (index === 1 || index === 2)) expect(stored).toMatchObject({ status: 'CANCELLED', cancelledForNonPaymentAt: occurrence.cancelledForNonPaymentAt });
          else expect(stored).toEqual(occurrence);
        }
        if (!rolledBack) {
          const corrected = await sala.commandOccurrence({ personId: student.person.id, scheduleSlotId: morning.id, date: '2026-10-13', sourceId: fixed[0]!.id, status: 'ATTENDED' }, f.actor.id);
          expect(corrected).toMatchObject({ status: 'ATTENDED', fixedSalaBookingId: fixed[0]!.id });
        }
      }
    });
    it('reports only operational counts for the same elements LeaveSala affects', async () => {
      const f = await followUpFixture(Role.ADMINISTRATIVE); await associated(f, 0);
      const id = f.students[0]!.participation.id;
      const result = await request(app.getHttpServer()).get(`/api/sala/participations/${id}/leave-impact`).set('Cookie', f.authn.cookie).expect(200);
      expect(result.body).toEqual({ data: { fixedBookings: 1, futureReservations: 1, activeRoutines: 1, activeClinicalIndications: 1 } });
      await sala.leave(id); await request(app.getHttpServer()).get(`/api/sala/participations/${id}/leave-impact`).set('Cookie', f.authn.cookie).expect(404);
    });
    it('changes exactly selected professors with deduplication and preserves other records', async () => {
      const f = await followUpFixture(); const records = await associated(f, 0); await f.pay(0, 10);
      const ids = f.students.slice(0, 2).map(item => item.participation.id);
      const before = await prisma.salaParticipation.findMany({ orderBy: { id: 'asc' } });
      const routines = await prisma.routine.findMany(); const payments = await prisma.salaPayment.findMany(); const fixed = await prisma.fixedSalaBooking.findMany();
      expect((await f.post('bulk-change-professor', { participationIds: [...ids, ids[0]], mainProfessorId: f.other.id }).expect(200)).body).toEqual({ data: { affected: 2 } });
      const after = await prisma.salaParticipation.findMany({ orderBy: { id: 'asc' } });
      for (const prior of before) expect(after.find(row => row.id === prior.id)).toMatchObject({ ...prior, mainProfessorId: ids.includes(prior.id) ? f.other.id : f.professor.id, updatedAt: expect.any(Date) });
      expect(await prisma.routine.findMany()).toEqual(routines); expect(await prisma.salaPayment.findMany()).toEqual(payments); expect(await prisma.fixedSalaBooking.findMany()).toEqual(fixed);
      expect((await prisma.routine.findUniqueOrThrow({ where: { id: records.routine.id } })).status).toBe('ACTIVE');
    });
    it('rejects invalid or ended selections and invalid/inactive professors without updates', async () => {
      const f = await followUpFixture(); const ids = f.students.slice(0, 2).map(item => item.participation.id);
      await f.post('bulk-change-professor', { participationIds: [ids[0], randomUUID()], mainProfessorId: f.other.id }).expect(404);
      for (const mainProfessorId of [randomUUID(), f.other.id, f.actor.id]) {
        if (mainProfessorId === f.other.id) await prisma.internalUser.update({ where: { id: f.other.id }, data: { status: 'INACTIVE' } });
        if (mainProfessorId === f.actor.id) await prisma.internalUserRole.deleteMany({ where: { internalUserId: f.actor.id } });
        await expect(sala.bulkChangeProfessor(ids, mainProfessorId)).rejects.toThrow('Professor is not eligible');
      }
      expect(await prisma.salaParticipation.count({ where: { mainProfessorId: f.professor.id } })).toBe(3);
      await sala.leave(ids[1]!);
      await prisma.internalUser.update({ where: { id: f.other.id }, data: { status: 'ACTIVE' } });
      await expect(sala.bulkChangeProfessor(ids, f.other.id)).rejects.toThrow('Active participation not found');
      expect((await prisma.salaParticipation.findUniqueOrThrow({ where: { id: ids[0]! } })).mainProfessorId).toBe(f.professor.id);
    });
    it('bulk leaves atomically with the individual lifecycle and preserves history', async () => {
      const f = await followUpFixture(); const records = [await associated(f, 0), await associated(f, 1)];
      const ids = f.students.slice(0, 2).map(item => item.participation.id);
      await f.post('bulk-leave', { participationIds: [ids[0], randomUUID()] }).expect(404);
      for (const id of ids) expect((await prisma.salaParticipation.findUniqueOrThrow({ where: { id } })).endDate).toBeNull();
      await expect(sala.bulkLeave(ids, randomUUID())).rejects.toThrow(); // invalid actor fails after booking/routine mutations
      for (const record of records) {
        expect((await prisma.fixedSalaBooking.findUniqueOrThrow({ where: { id: record.fixed.id } })).endDate).toBeNull();
        expect((await prisma.oneOffReservation.findUniqueOrThrow({ where: { id: record.reservation.id } })).cancelledAt).toBeNull();
        expect((await prisma.routine.findUniqueOrThrow({ where: { id: record.routine.id } })).status).toBe('ACTIVE');
      }
      expect((await f.post('bulk-leave', { participationIds: [...ids, ids[0]] }).expect(200)).body).toEqual({ data: { affected: 2 } });
      for (const id of ids) expect((await prisma.salaParticipation.findUniqueOrThrow({ where: { id } })).endDate).toEqual(new Date('2026-10-31'));
      for (const record of records) {
        expect((await prisma.fixedSalaBooking.findUniqueOrThrow({ where: { id: record.fixed.id } })).endDate).toEqual(new Date('2026-10-31'));
        expect((await prisma.oneOffReservation.findUniqueOrThrow({ where: { id: record.reservation.id } })).cancelledAt).not.toBeNull();
        expect((await prisma.routine.findUniqueOrThrow({ where: { id: record.routine.id } })).status).toBe('HISTORICAL');
        expect(await prisma.salaClinicalIndication.findUniqueOrThrow({ where: { id: record.indication.id } })).toMatchObject({ status: 'CLOSED', closedById: f.actor.id, instructions: 'Instrucción privada sintética' });
      }
      expect((await prisma.salaParticipation.findUniqueOrThrow({ where: { id: f.students[2]!.participation.id } })).endDate).toBeNull();
      expect(await prisma.person.count()).toBe(3);
    });
    it.each([{ participationIds: [] }, { participationIds: ['invalid'] }, { participationIds: [12] }])('validates bulk UUID arrays $participationIds', async ({ participationIds }) => {
      const f = await followUpFixture();
      await f.post('bulk-leave', { participationIds }).expect(400);
      await f.post('bulk-change-professor', { participationIds, mainProfessorId: f.other.id }).expect(400);
    });
  });
  async function physicalFixture() {
    const dni = uniqueDni();
    const person = await prisma.person.create({ data: { firstName: 'Evaluación', lastName: 'Sintética', dni, normalizedDni: dni, phone: '351', birthDate: new Date('1991-01-01') } });
    const plan = await prisma.salaPlan.create({ data: { name: `Eval-${dni}`, monthlyAmount: 1000 } });
    const professor = await users.create({ firstName: 'Profesor', lastName: 'Sintético', email: `eval-${dni}@sala.test`, roles: [Role.PROFESSOR] });
    const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' });
    const a = await sala.createPhysicalTest({ name: `A-${dni}`, type: 'MOBILITY' });
    const b = await sala.createPhysicalTest({ name: `B-${dni}`, type: 'OTHER' });
    return { professor, a, b, input: { personId: person.id, salaParticipationId: participation.id, professorId: professor.id, evaluationDate: '2026-08-20', observation: ' Inicial ', results: [{ testDefinitionId: a.id, resultText: ' 40 cm ' }] } };
  }
  it.each([Role.PROFESSOR, Role.GENERAL_ADMIN])('completes catalog and evaluations via HTTP for %s', async role => {
    const authn = await session(role); const f = await physicalFixture();
    const call = (method: 'post' | 'patch', path: string, body: object) => request(app.getHttpServer())[method](`/api/sala/${path}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(body);
    for (const type of ['STRENGTH', 'MOBILITY', 'OTHER']) {
      await call('post', 'physical-test-definitions', { name: type, type }).expect(201);
    }
    await call('post', 'physical-test-definitions', { name: 'Invalid', type: 'NUMERIC' }).expect(400);
    await call('patch', `physical-test-definitions/${f.a.id}`, { name: 'Nombre B', type: 'STRENGTH', description: ' Descripción B ' }).expect(200).expect(({ body }: { body: { data: { isActive?: boolean }; code?: string } }) => expect(body.data).toEqual({ id: f.a.id, name: 'Nombre B', type: 'STRENGTH', description: 'Descripción B', isActive: true }));
    await call('patch', `physical-test-definitions/${f.a.id}`, { name: f.b.name, type: 'MOBILITY' }).expect(409).expect(({ body }: { body: { data: { isActive?: boolean }; code?: string } }) => expect(body.code).toBe('SALA_PHYSICAL_TEST_DUPLICATE'));
    await call('patch', `physical-test-definitions/${randomUUID()}`, { name: 'Missing', type: 'OTHER' }).expect(404);
    await call('post', 'physical-test-definitions', { name: f.b.name, type: 'OTHER' }).expect(409).expect(({ body }: { body: { data: { isActive?: boolean }; code?: string } }) => expect(body.code).toBe('SALA_PHYSICAL_TEST_DUPLICATE'));
    await call('post', 'physical-evaluations', { ...f.input, results: [] }).expect(400);
    const created = await call('post', 'physical-evaluations', { ...f.input, results: [{ testDefinitionId: f.a.id, resultText: '170° derecho' }, { testDefinitionId: f.a.id, resultText: '160° izquierdo' }, { testDefinitionId: f.b.id, resultText: '48 cm' }] }).expect(201);
    const id: string = created.body.data.id;
    expect(created.body.data).toMatchObject({ evaluationDate: '2026-08-20', professorId: f.professor.id, observation: 'Inicial', professor: { id: f.professor.id } });
    expect(created.body.data).not.toHaveProperty('createdBy');
    const original = await prisma.physicalEvaluation.findUniqueOrThrow({ where: { id } });
    const originalResults = await prisma.physicalTestResult.findMany({ where: { evaluationId: id } });
    expect(originalResults).toHaveLength(3); expect(new Set(originalResults.map(result => result.testDefinitionId)).size).toBe(2);
    const corrected = await call('patch', `physical-evaluations/${id}`, { observation: ' Revisado ', results: [{ testDefinitionId: f.a.id, resultText: '42 cm' }, { testDefinitionId: f.b.id, resultText: 'Positivo' }] }).expect(200);
    expect(corrected.body.data).toMatchObject({ id, evaluationDate: '2026-08-20', professorId: f.professor.id, observation: 'Revisado' });
    expect(await prisma.physicalEvaluation.count({ where: { personId: f.input.personId } })).toBe(1);
    expect(await prisma.physicalEvaluation.findUniqueOrThrow({ where: { id } })).toMatchObject({ createdBy: original.createdBy, evaluationDate: original.evaluationDate, professorId: original.professorId });
    expect(await prisma.physicalTestResult.count({ where: { id: { in: originalResults.map(result => result.id) } } })).toBe(0);
    await call('patch', `physical-evaluations/${id}`, { results: [], observation: 'Invalid' }).expect(400);
    for (const extra of [{ evaluationDate: '2026-10-14' }, { professorId: f.professor.id }, { personId: f.input.personId }]) await call('patch', `physical-evaluations/${id}`, { results: [{ testDefinitionId: f.a.id, resultText: '42 cm' }], ...extra }).expect(400);
    await call('post', `physical-test-definitions/${f.a.id}/retire`, {}).expect(201).expect(({ body }: { body: { data: { isActive?: boolean }; code?: string } }) => expect(body.data.isActive).toBe(false));
    expect((await sala.listPhysicalTests()).some(test => test.id === f.a.id)).toBe(false);
    await call('patch', `physical-evaluations/${id}`, { observation: null, results: [{ testDefinitionId: f.a.id, resultText: '44 cm' }] }).expect(200);
    const other = await sala.createPhysicalEvaluation({ ...f.input, results: [{ testDefinitionId: f.b.id, resultText: 'Positivo' }] }, f.professor.id);
    await call('patch', `physical-evaluations/${other.id}`, { results: [{ testDefinitionId: f.a.id, resultText: 'Introducción inválida' }] }).expect(400).expect(({ body }: { body: { data: { isActive?: boolean }; code?: string } }) => expect(body.code).toBe('SALA_PHYSICAL_TEST_INVALID'));
    await call('post', 'physical-evaluations', f.input).expect(400);
    // A failed correction leaves both observation and results persisted unchanged.
    const before = await prisma.physicalEvaluation.findUniqueOrThrow({ where: { id }, include: { results: true } });
    await expect(sala.correctPhysicalEvaluation(id, { observation: 'No persistir', results: [{ testDefinitionId: f.a.id, resultText: 'x'.repeat(501) }] })).rejects.toThrow();
    expect(await prisma.physicalEvaluation.findUniqueOrThrow({ where: { id }, include: { results: true } })).toEqual(before);
    await prisma.salaParticipation.update({ where: { id: f.input.salaParticipationId }, data: { endDate: new Date('2026-09-01') } });
    const historical = await request(app.getHttpServer()).get(`/api/sala/people/${f.input.personId}/physical-evaluations`).set('Cookie', authn.cookie).expect(200);
    expect(historical.body.data.find((item: { id: string }) => item.id === id).results[0]).toMatchObject({ resultText: '44 cm', testDefinition: { id: f.a.id, isActive: false } });
    await call('patch', `physical-test-definitions/${f.a.id}`, { name: 'Retirado editado', type: 'OTHER' }).expect(200).expect(({ body }: { body: { data: { isActive?: boolean }; code?: string } }) => expect(body.data.isActive).toBe(false));
    await call('patch', `physical-evaluations/${id}`, { results: [{ testDefinitionId: f.a.id, resultText: '46 cm' }] }).expect(200);
  });
  it('keeps administrative physical evaluation access read-only', async () => {
    const authn = await session(Role.ADMINISTRATIVE); const f = await physicalFixture(); const e = await sala.createPhysicalEvaluation(f.input, f.professor.id);
    for (const path of ['physical-test-definitions', `people/${f.input.personId}/physical-evaluations`]) await request(app.getHttpServer()).get(`/api/sala/${path}`).set('Cookie', authn.cookie).expect(200);
    for (const [method, path, body] of [
      ['post', 'physical-test-definitions', { name: 'No', type: 'OTHER' }], ['patch', `physical-test-definitions/${f.a.id}`, { name: 'No', type: 'OTHER' }], ['post', `physical-test-definitions/${f.a.id}/retire`, {}], ['post', 'physical-evaluations', f.input], ['patch', `physical-evaluations/${e.id}`, { results: f.input.results }],
    ] as const) await request(app.getHttpServer())[method](`/api/sala/${path}`).set('Cookie', authn.cookie).set('x-csrf-token', authn.csrf).send(body).expect(403);
  });

  it('enforces movement pattern permissions and validates normalized names over HTTP', async () => {
    const manager = await session(Role.GENERAL_ADMIN);
    const reader = await session(Role.ADMINISTRATIVE);
    const base = '/api/sala/movement-patterns';
    await request(app.getHttpServer()).get(base).expect(401);
    await request(app.getHttpServer()).get(base).set('Cookie', reader.cookie).expect(200);
    await request(app.getHttpServer()).post(base).set('Cookie', reader.cookie).set('x-csrf-token', reader.csrf).send({ name: 'Empuje' }).expect(403);
    for (const name of ['', '   ', 'x'.repeat(121)]) await request(app.getHttpServer()).post(base).set('Cookie', manager.cookie).set('x-csrf-token', manager.csrf).send({ name }).expect(400);
    const created = await request(app.getHttpServer()).post(base).set('Cookie', manager.cookie).set('x-csrf-token', manager.csrf).send({ name: ' Empuje ' }).expect(201);
    await request(app.getHttpServer()).post(base).set('Cookie', manager.cookie).set('x-csrf-token', manager.csrf).send({ name: 'empuje' }).expect(409);
    await request(app.getHttpServer()).patch(base + '/' + created.body.data.id).set('Cookie', reader.cookie).set('x-csrf-token', reader.csrf).send({ name: 'No permitido' }).expect(403);
    await request(app.getHttpServer()).patch(base + '/' + created.body.data.id).set('Cookie', manager.cookie).set('x-csrf-token', manager.csrf).send({ name: 'Empuje superior' }).expect(200);
  });
  it('creates and clears optional exercise muscles without changing the catalog identity', async () => {
    const a = await session(Role.GENERAL_ADMIN);
    const call = (method: 'post' | 'patch', path: string, body: object) => request(app.getHttpServer())[method](`/api/sala/exercise-definitions${path}`).set('Cookie', a.cookie).set('x-csrf-token', a.csrf).send(body);
    const plank = await call('post', '', { name: 'Plancha' }).expect(201);
    expect(plank.body.data).toMatchObject({ name: 'Plancha', primaryMuscle: null, description: null, isActive: true });
    const row = await call('post', '', { name: 'Remo', primaryMuscle: ' Espalda ' }).expect(201);
    expect(row.body.data.primaryMuscle).toBe('Espalda');
    for (const primaryMuscle of ['', null]) {
      const updated = await call('patch', `/${row.body.data.id}`, { name: 'Remo', primaryMuscle }).expect(200);
      expect(updated.body.data).toMatchObject({ id: row.body.data.id, primaryMuscle: null });
      expect((await prisma.exerciseDefinition.findUniqueOrThrow({ where: { id: row.body.data.id } })).primaryMuscle).toBeNull();
    }
    const list = await request(app.getHttpServer()).get('/api/sala/exercise-definitions').set('Cookie', a.cookie).expect(200);
    expect(list.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: plank.body.data.id, primaryMuscle: null })]));
  });
  it('accepts optional physical test type and validates every supplied type on create and edit', async () => {
    const a = await session(Role.GENERAL_ADMIN);
    const call = (method: 'post' | 'patch', path: string, body: object) => request(app.getHttpServer())[method](`/api/sala/physical-test-definitions${path}`).set('Cookie', a.cookie).set('x-csrf-token', a.csrf).send(body);
    const created = await call('post', '', { name: 'Salto vertical' }).expect(201);
    expect(created.body.data).toMatchObject({ type: null, description: null });
    for (const type of ['STRENGTH', 'MOBILITY', 'OTHER', null]) {
      const updated = await call('patch', `/${created.body.data.id}`, { name: 'Salto vertical', type }).expect(200);
      expect(updated.body.data).toMatchObject({ id: created.body.data.id, type });
      expect((await prisma.physicalTestDefinition.findUniqueOrThrow({ where: { id: created.body.data.id } })).type).toBe(type);
    }
    const invalid = await call('post', '', { name: 'Invalid', type: 'NUMERIC' }).expect(400);
    expect(invalid.body.code).toBe('SALA_PHYSICAL_TEST_TYPE_INVALID');
    const f = await physicalFixture();
    await sala.updatePhysicalTest(f.a.id, { name: f.a.name, type: null });
    const evaluation = await sala.createPhysicalEvaluation(f.input, f.professor.id);
    expect(evaluation.results.find(result => result.testDefinitionId === f.a.id)?.testDefinition.type).toBeNull();
  });

});
