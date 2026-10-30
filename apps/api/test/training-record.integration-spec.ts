import { createHash, randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Role, Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { InternalUserService } from '../src/team/internal-user.service';
import { SalaService } from '../src/sala/sala.service';
import { TrainingRecordService, trainingOperationalDate } from '../src/sala/training-record.service';
import { HealthDeclarationService } from '../src/sala/health-declaration/health-declaration.service';
import { AuthService } from '../src/auth/auth.service';

describe('Sala training history (isolated PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sala: SalaService;
  let training: TrainingRecordService;
  const people: string[] = [], users: string[] = [], plans: string[] = [], definitions: string[] = [];
  beforeAll(async () => {
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api'); await app.init();
    prisma = app.get(PrismaService); sala = app.get(SalaService); training = app.get(TrainingRecordService);
    jest.spyOn(training as unknown as { today(): string }, 'today').mockReturnValue('2026-10-26');
  });
  afterEach(async () => {
    // Only this suite's synthetic owners; dependent records are removed first.
    await prisma.salaTrainingRecordExercise.deleteMany({ where: { record: { personId: { in: people } } } });
    await prisma.salaTrainingRecord.deleteMany({ where: { personId: { in: people } } });
    await prisma.routine.deleteMany({ where: { personId: { in: people } } });
    await prisma.session.deleteMany({ where: { OR: [{ personId: { in: people } }, { internalUserId: { in: users } }] } });
    await prisma.salaCharge.deleteMany({ where: { personId: { in: people } } });
    await prisma.salaParticipation.deleteMany({ where: { personId: { in: people } } });
    await prisma.paperHealthDeclaration.deleteMany({ where: { personId: { in: people } } });
    await prisma.portalCredential.deleteMany({ where: { personId: { in: people } } });
    await prisma.person.deleteMany({ where: { id: { in: people } } });
    await prisma.exerciseDefinition.deleteMany({ where: { id: { in: definitions } } });
    await prisma.salaPlan.deleteMany({ where: { id: { in: plans } } });
    await prisma.internalCredential.deleteMany({ where: { internalUserId: { in: users } } });
    await prisma.internalUserRole.deleteMany({ where: { internalUserId: { in: users } } });
    await prisma.internalUser.deleteMany({ where: { id: { in: users } } });
    people.length = users.length = plans.length = definitions.length = 0;
  });
  afterAll(async () => { jest.restoreAllMocks(); await app.close(); });
  async function fixture() {
    const suffix = randomUUID();
    const user = await app.get(InternalUserService).create({ firstName: 'Profesor', lastName: 'Sintético', email: `${suffix}@training.test`, roles: [Role.PROFESSOR] }); users.push(user.id);
    const plan = await prisma.salaPlan.create({ data: { name: `Plan ${suffix}`, monthlyAmount: 1000, weeklySessions: 2 } }); plans.push(plan.id);
    const person = await prisma.person.create({ data: { firstName: 'Alumno', lastName: 'Sintético', dni: suffix, normalizedDni: suffix, phone: '0000000000', birthDate: new Date('1990-01-01'), portalCredential: { create: { pinHash: 'unused-test-hash', mustChangePin: false } } } }); people.push(person.id);
    const participation = await prisma.salaParticipation.create({ data: { personId: person.id, mainProfessorId: user.id, planId: plan.id, startDate: new Date('2026-10-01') } });
    await app.get(HealthDeclarationService).registerPaper(person.id, '2026-10-01', user.id);
    const token = randomUUID(), csrf = randomUUID();
    await prisma.session.create({ data: { personId: person.id, kind: 'PORTAL', secretHash: createHash('sha256').update(token).digest('hex'), csrfToken: csrf, expiresAt: new Date(Date.now() + 86_400_000) } });
    const a = await sala.createExerciseDefinition({ name: `Press ${suffix}`, description: 'Original' }); definitions.push(a.id);
    const b = await sala.createExerciseDefinition({ name: `Remo ${suffix}` }); definitions.push(b.id);
    const routine = await sala.replaceRoutine({ personId: person.id, salaParticipationId: participation.id, days: [{ name: 'Fuerza', exercises: [{ exerciseDefinitionId: a.id, series: '3', repetitions: '10', load: '30 kg', rest: '60 s', notes: 'Controlado' }, { exerciseDefinitionId: b.id, duration: '30 s' }, { exerciseDefinitionId: a.id, load: '15 kg' }] }] });
    // 02:00 UTC is still the previous day in Argentina.
    await prisma.routine.update({ where: { id: routine.id }, data: { createdAt: new Date('2026-10-20T02:00:00Z') } });
    const body = { routineId: routine.id, routineDayId: routine.days[0]!.id, date: '2026-10-20', exercises: routine.days[0]!.exercises.map((exercise, i) => ({ id: exercise.id, weightKg: ['32.5', '22', null][i] as string | null })) };
    const cookie = `athleta_portal_session=${token}`;
    return { person, participation, user, routine, a, b, body, csrf, cookie };
  }
  function create(f: Awaited<ReturnType<typeof fixture>>, body = f.body) { return request(app.getHttpServer()).post('/api/portal/sala/training-records').set('Cookie', f.cookie).set('x-csrf-token', f.csrf).send(body); }
  async function internal(role: Role) {
    const user = await app.get(InternalUserService).create({ firstName: 'Lector', lastName: 'Sintético', email: `${randomUUID()}@training.test`, roles: [role] }); users.push(user.id);
    const auth = app.get(AuthService); await auth.provisionCredential(user.id, 'ValidPass1!');
    await prisma.internalCredential.update({ where: { internalUserId: user.id }, data: { mustChangePassword: false } });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(200);
    return login.headers['set-cookie'][0] as string;
  }
  it('stores distinct decimal/null/zero weights and immutable prescriptions without changing Sala operations', async () => {
    const f = await fixture();
    const before = await Promise.all([prisma.salaOccurrence.findMany(), prisma.oneOffReservation.findMany(), prisma.fixedSalaBooking.findMany(), prisma.salaPayment.findMany(), prisma.salaParticipation.findUnique({ where: { id: f.participation.id } }), prisma.salaConfiguration.findMany()]);
    f.body.exercises[0]!.weightKg = '32,5'; f.body.exercises[1]!.weightKg = '0';
    const response = await create(f).expect(201);
    expect(response.body.data).not.toHaveProperty('personId');
    expect(response.body.data.exercises.map((e: { weightKg: string | null }) => e.weightKg)).toEqual(['32.5', '0', null]);
    expect(response.body.data.exercises[0]).toMatchObject({ exerciseName: f.a.name, load: '30 kg', series: '3', repetitions: '10', rest: '60 s', notes: 'Controlado' });
    expect(await Promise.all([prisma.salaOccurrence.findMany(), prisma.oneOffReservation.findMany(), prisma.fixedSalaBooking.findMany(), prisma.salaPayment.findMany(), prisma.salaParticipation.findUnique({ where: { id: f.participation.id } }), prisma.salaConfiguration.findMany()])).toEqual(before);
    // An earlier saved training on the same date is also a previous record;
    // later training dates and other owners must never supply the hint.
    const sameDate = await training.context(f.person.id, f.body.date);
    expect(sameDate.routine!.days[0]!.exercises.map(entry => entry.lastWeightKg)).toEqual(['32.5', '0', '32.5']);
    const earlierDate = await training.context(f.person.id, '2026-10-19');
    expect(earlierDate.routine!.days[0]!.exercises.every(entry => entry.lastWeightKg === null)).toBe(true);
    const saved = await prisma.salaTrainingRecord.findUniqueOrThrow({ where: { id: response.body.data.id }, include: { exercises: true } });
    await expect(prisma.salaTrainingRecordExercise.update({ where: { id: saved.exercises[0]!.id }, data: { weightKg: new Prisma.Decimal(-1) } })).rejects.toThrow();
    expect((await training.detail(f.person.id, saved.id)).exercises[0]!.weightKg).toBe('32.5');
  });
  it('rejects duplicates, including concurrent requests, and exposes the existing owned record', async () => {
    const f = await fixture(); const responses = await Promise.all([create(f), create(f)]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    expect(responses.find(r => r.status === 409)!.body).toMatchObject({ code: 'TRAINING_DUPLICATE', details: { recordId: responses.find(r => r.status === 201)!.body.data.id } });
    expect(await prisma.salaTrainingRecord.count({ where: { personId: f.person.id } })).toBe(1);
    await expect(prisma.salaTrainingRecord.create({ data: { personId: f.person.id, routineId: f.body.routineId, routineDayId: f.body.routineDayId, date: new Date(f.body.date), dayPosition: 1 } })).rejects.toMatchObject({ code: 'P2002' });
  });
  it.each(['2026-10-27', '2026-10-18', '2026-02-30'])('rejects invalid date %s with no partial record', async date => {
    const f = await fixture(); await create(f, { ...f.body, date }).expect(400);
    expect(await prisma.salaTrainingRecord.count({ where: { personId: f.person.id } })).toBe(0);
    expect(await prisma.salaTrainingRecordExercise.count({ where: { record: { personId: f.person.id } } })).toBe(0);
  });
  it('uses the operational assignment date, rather than the UTC date', async () => {
    expect(trainingOperationalDate(new Date('2026-10-20T02:00:00Z'))).toBe('2026-10-19');
    const f = await fixture(); await create(f, { ...f.body, date: '2026-10-19' }).expect(201);
  });
  it.each(['-1', '1e3', '12kg', '', '1,2,3', 'NaN'])('rejects malformed weight %s', async weightKg => {
    const f = await fixture(); f.body.exercises[0]!.weightKg = weightKg; await create(f).expect(400);
    expect(await prisma.salaTrainingRecord.count({ where: { personId: f.person.id } })).toBe(0);
  });
  it('requires at least one weight and exact entry membership, independently of catalog identity', async () => {
    const f = await fixture();
    await create(f, { ...f.body, exercises: f.body.exercises.map(e => ({ ...e, weightKg: null })) }).expect(400);
    await create(f, { ...f.body, routineDayId: randomUUID() }).expect(400);
    await create(f, { ...f.body, exercises: [{ id: randomUUID(), weightKg: '20' }, ...f.body.exercises.slice(1)] }).expect(400);
    await create(f, { ...f.body, exercises: [f.body.exercises[0]!, f.body.exercises[0]!, f.body.exercises[2]!] }).expect(400);
    expect(await prisma.salaTrainingRecord.count({ where: { personId: f.person.id } })).toBe(0);
  });
  it('checks session, CSRF, Portal readiness and owner for reads/corrections', async () => {
    const f = await fixture(), other = await fixture(); const saved = (await create(f).expect(201)).body.data;
    await request(app.getHttpServer()).post('/api/portal/sala/training-records').set('Cookie', f.cookie).send(f.body).expect(403);
    await request(app.getHttpServer()).get('/api/portal/sala/training-records').expect(401);
    await request(app.getHttpServer()).get(`/api/portal/sala/training-records/${saved.id}`).set('Cookie', other.cookie).expect(404);
    await request(app.getHttpServer()).post(`/api/portal/sala/training-records/${saved.id}/correct`).set('Cookie', other.cookie).set('x-csrf-token', other.csrf).send({ exercises: saved.exercises.map((e: { id: string }) => ({ id: e.id, weightKg: '50' })) }).expect(404);
    await create(other, f.body).expect(409);
    await prisma.portalCredential.update({ where: { personId: f.person.id }, data: { mustChangePin: true } });
    await request(app.getHttpServer()).get('/api/portal/sala/training-records').set('Cookie', f.cookie).expect(403);
    expect((await training.detail(f.person.id, saved.id)).exercises[0]!.weightKg).toBe('32.5');
  });
  it('snapshots blocks and preserves them after replacement and weight correction', async () => {
    const f = await fixture();
    const grouped = await sala.replaceRoutine({ personId: f.person.id, salaParticipationId: f.participation.id, days: [{ name: 'Bloques', exercises: [1, 1, 2].map((blockPosition, i) => ({ exerciseDefinitionId: i === 1 ? f.b.id : f.a.id, blockPosition, series: blockPosition === 1 ? '4' : '3', load: '20 kg' })) }] });
    await prisma.routine.update({ where: { id: grouped.id }, data: { createdAt: new Date('2026-10-20T02:00:00Z') } });
    const context = await training.context(f.person.id, f.body.date);
    expect(context.routine!.days[0]!.exercises.map(e => e.blockPosition)).toEqual([1, 1, 2]);
    const body = { ...f.body, routineId: grouped.id, routineDayId: grouped.days[0]!.id, exercises: grouped.days[0]!.exercises.map((e, i) => ({ id: e.id, weightKg: i === 2 ? null : '30' })) };
    const saved = (await create(f, body).expect(201)).body.data;
    expect(saved.exercises.map((e: { blockPosition: number }) => e.blockPosition)).toEqual([1, 1, 2]);
    await sala.replaceRoutine({ personId: f.person.id, salaParticipationId: f.participation.id, days: [{ exercises: [{ exerciseDefinitionId: f.b.id }] }] });
    expect(await training.detail(f.person.id, saved.id)).toEqual(saved);
    const old = await training.detail(f.person.id, saved.id);
    const correction = await request(app.getHttpServer()).post(`/api/portal/sala/training-records/${old.id}/correct`).set('Cookie', f.cookie).set('x-csrf-token', f.csrf).send({ exercises: old.exercises.map(e => ({ id: e.id, weightKg: '42' })) }).expect(200);
    expect(correction.body.data.exercises).toEqual(saved.exercises.map((e: object) => ({ ...e, weightKg: '42' })));
    const legacy = await prisma.routineExercise.findMany({ where: { routineDayId: f.routine.days[0]!.id } });
    expect(legacy.every(e => e.blockPosition === null)).toBe(true);
  });
  it('preserves snapshots after catalog edits/retirement/replacement and corrects only saved weights', async () => {
    const f = await fixture(); const saved = (await create(f).expect(201)).body.data;
    await sala.updateExerciseDefinition(f.a.id, { name: 'Press actualizado' });
    await sala.retireExerciseDefinition(f.a.id, true);
    const replacement = await sala.replaceRoutine({ personId: f.person.id, salaParticipationId: f.participation.id, days: [{ exercises: [{ exerciseDefinitionId: f.b.id, load: '35 kg' }] }] });
    await create(f, { ...f.body, date: '2026-10-21' }).expect(409);
    const old = await training.detail(f.person.id, saved.id); expect(old).toEqual(saved);
    const correction = { exercises: old.exercises.map(e => ({ id: e.id, weightKg: e.position === 1 ? '40.25' : e.weightKg })) };
    const corrected = await request(app.getHttpServer()).post(`/api/portal/sala/training-records/${old.id}/correct`).set('Cookie', f.cookie).set('x-csrf-token', f.csrf).send(correction).expect(200);
    expect(corrected.body.data.createdAt).toBe(saved.createdAt); expect(corrected.body.data.date).toBe(saved.date); expect(corrected.body.data.updatedAt).not.toBe(saved.updatedAt);
    expect(corrected.body.data.exercises[0]).toEqual({ ...saved.exercises[0], weightKg: '40.25' });
    expect(await prisma.routine.findUnique({ where: { id: replacement.id } })).toMatchObject({ status: 'ACTIVE' });
    const context = await training.context(f.person.id, '2026-10-21'); expect(context.routine!.days[0]!.exercises[0]!.lastWeightKg).toBe('22');
    await request(app.getHttpServer()).post(`/api/portal/sala/training-records/${old.id}/correct`).set('Cookie', f.cookie).set('x-csrf-token', f.csrf).send({ ...correction, date: '2026-10-21' }).expect(400);
    const invalid = { exercises: correction.exercises.map((e, i) => i === 1 ? { ...e, id: randomUUID() } : { ...e, weightKg: '60' }) };
    await request(app.getHttpServer()).post(`/api/portal/sala/training-records/${old.id}/correct`).set('Cookie', f.cookie).set('x-csrf-token', f.csrf).send(invalid).expect(400);
    expect((await training.detail(f.person.id, saved.id)).exercises[0]!.weightKg).toBe('40.25');
  });
  it('rolls back every corrected weight if persistence fails after an earlier entry was updated', async () => {
    const f = await fixture(); const saved = (await create(f).expect(201)).body.data;
    const secondId = saved.exercises[1].id as string;
    // A scoped fault inside the isolated DB exercises the real transaction, without
    // adding a test-only failure switch to production code.
    const constraint = Prisma.raw('"training_test_correction_rollback"');
    await prisma.$executeRaw(Prisma.sql`ALTER TABLE sala_training_record_exercises ADD CONSTRAINT ${constraint} CHECK (id <> ${Prisma.raw("'" + secondId + "'::uuid")} OR weight_kg <> 99)`);
    try {
      await request(app.getHttpServer()).post(`/api/portal/sala/training-records/${saved.id}/correct`).set('Cookie', f.cookie).set('x-csrf-token', f.csrf).send({ exercises: saved.exercises.map((entry: { id: string }, index: number) => ({ id: entry.id, weightKg: index === 1 ? '99' : '40' })) }).expect(500);
      expect(await training.detail(f.person.id, saved.id)).toEqual(saved);
    } finally {
      await prisma.$executeRaw(Prisma.sql`ALTER TABLE sala_training_record_exercises DROP CONSTRAINT ${constraint}`);
    }
  });
  it('allows clearing weights on correction without deleting the original training', async () => {
    const f = await fixture(); const saved = (await create(f).expect(201)).body.data;
    const corrected = await request(app.getHttpServer()).post(`/api/portal/sala/training-records/${saved.id}/correct`).set('Cookie', f.cookie).set('x-csrf-token', f.csrf).send({ exercises: saved.exercises.map((entry: { id: string }) => ({ id: entry.id, weightKg: null })) }).expect(200);
    expect(corrected.body.data.exercises.every((entry: { weightKg: string | null }) => entry.weightKg === null)).toBe(true);
    expect(corrected.body.data.createdAt).toBe(saved.createdAt);
    expect(await prisma.salaTrainingRecord.count({ where: { personId: f.person.id } })).toBe(1);
  });
  it('rejects creation when no active routine exists and serializes replacement races', async () => {
    const f = await fixture();
    const race = await Promise.allSettled([training.create(f.person.id, f.body), sala.replaceRoutine({ personId: f.person.id, salaParticipationId: f.participation.id, days: [{ exercises: [{ exerciseDefinitionId: f.b.id }] }] })]);
    expect(race[1]!.status).toBe('fulfilled');
    if (race[0]!.status === 'rejected') expect(race[0]!.reason.getResponse()).toMatchObject({ code: 'TRAINING_ROUTINE_CHANGED' });
    const records = await prisma.salaTrainingRecord.findMany({ where: { personId: f.person.id }, include: { exercises: true } });
    for (const record of records) { expect(record.routineId).toBe(f.routine.id); expect(record.exercises).toHaveLength(3); }
    await prisma.routine.updateMany({ where: { personId: f.person.id }, data: { status: 'HISTORICAL' } });
    await create(f, { ...f.body, date: '2026-10-21' }).expect(409);
    expect((await training.context(f.person.id)).routine).toBeNull();
  });
  it('paginates newest dates, loads details separately, and uses the existing read permission', async () => {
    const f = await fixture(); await create(f).expect(201); await create(f, { ...f.body, date: '2026-10-21' }).expect(201);
    const listed = await request(app.getHttpServer()).get('/api/portal/sala/training-records?pageSize=1').set('Cookie', f.cookie).expect(200);
    expect(listed.body.meta).toMatchObject({ total: 2, totalPages: 2, page: 1 }); expect(listed.body.data[0].date).toBe('2026-10-21'); expect(listed.body.data[0]).not.toHaveProperty('exercises');
    const second = await request(app.getHttpServer()).get('/api/portal/sala/training-records?pageSize=1&page=2').set('Cookie', f.cookie).expect(200); expect(second.body.data[0].date).toBe('2026-10-20');
    for (const role of [Role.PROFESSOR, Role.ADMINISTRATIVE]) {
      const cookie = await internal(role);
      await request(app.getHttpServer()).get(`/api/sala/people/${f.person.id}/training-records`).set('Cookie', cookie).expect(200);
      await request(app.getHttpServer()).get(`/api/sala/people/${f.person.id}/training-records/${listed.body.data[0].id}`).set('Cookie', cookie).expect(200);
    }
    const denied = await internal(Role.KINESIOLOGIST);
    await request(app.getHttpServer()).get(`/api/sala/people/${f.person.id}/training-records`).set('Cookie', denied).expect(403);
    await request(app.getHttpServer()).get(`/api/sala/people/${f.person.id}/training-records/${listed.body.data[0].id}`).set('Cookie', denied).expect(403);
  });
});
