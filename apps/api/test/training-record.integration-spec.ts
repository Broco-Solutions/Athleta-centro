import { readFileSync } from 'node:fs';
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
import type { CreateTrainingRecordDto } from '../src/sala/training-record.dto';
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

  it('edits current occurrences with a scheduled successor, preserving monthly identities and retired snapshots', async () => {
    const f = await fixture();
    jest.spyOn(sala as unknown as { todayOperational(): string }, 'todayOperational').mockReturnValue('2026-10-26');
    const before = await training.saveMonthlyWeights(f.person.id, monthly(f));
    const future = await sala.replaceRoutine({ personId: f.person.id, salaParticipationId: f.participation.id, effectiveFrom: '2026-11-15', days: [{ exercises: [{ exerciseDefinitionId: f.b.id }] }] });
    const day = f.routine.days[0]!;
    const retained = day.exercises[0]!;
    const retired = day.exercises[1]!;
    const futureBefore = await prisma.routine.findUnique({ where: { id: future.id }, include: { days: { include: { exercises: true } } } });
    const input = { days: [{ id: day.id, exercises: [{ id: retained.id }, { exerciseDefinitionId: f.b.id, repetitions: '12' }] }] };
    await sala.updateActiveRoutineExercises(f.routine.id, input);
    const updated = (await sala.listRoutines(f.person.id)).find(r => r.id === f.routine.id)!;
    expect(updated).toMatchObject({ version: f.routine.version, effectiveFrom: '2026-10-19' });
    expect(updated.days[0]!.id).toBe(day.id);
    expect(updated.days[0]!.exercises[0]!.id).toBe(retained.id);
    expect(updated.days[0]!.exercises[0]!.load).toBe(retained.load);
    const added = updated.days[0]!.exercises[1]!;
    expect(added.id).not.toBe(retired.id);
    expect(await prisma.routine.count({ where: { personId: f.person.id } })).toBe(2);
    expect(await prisma.routine.findUnique({ where: { id: future.id }, include: { days: { include: { exercises: true } } } })).toEqual(futureBefore);
    expect(await training.listMonth(f.person.id, '2026-10')).toEqual(before);
    const weeks = Array.from({ length: 4 }, (_, index) => ({ weekNumber: index + 1, exercises: [{ id: retained.id, weightKg: before.find(r => r.weekNumber === index + 1)?.exercises.find(e => e.routineExerciseId === retained.id)?.weightKg ?? null }, { id: added.id, weightKg: index === 0 ? '25' : null }] }));
    await training.saveMonthlyWeights(f.person.id, { routineId: f.routine.id, routineDayId: day.id, month: '2026-10', weeks });
    const after = await training.listMonth(f.person.id, '2026-10');
    expect(after.map(r => r.id)).toEqual(before.map(r => r.id));
    const first = after.find(r => r.weekNumber === 1)!;
    expect(first.exercises.find(e => e.routineExerciseId === added.id)?.weightKg).toBe('25');
    for (const record of before) for (const entry of record.exercises) expect(after.find(r => r.id === record.id)!.exercises.find(e => e.id === entry.id)).toEqual(entry);
    await training.saveMonthlyWeights(f.person.id, { routineId: f.routine.id, routineDayId: day.id, month: '2026-10', weeks });
    expect(await training.listMonth(f.person.id, '2026-10')).toEqual(after);
    await expect(training.saveMonthlyWeights(f.person.id, monthly(f))).rejects.toMatchObject({ response: { code: 'TRAINING_EXERCISES_INVALID' } });
    const snapshot = await prisma.routineExercise.findMany({ where: { routineDayId: day.id } });
    await expect(sala.updateActiveRoutineExercises(f.routine.id, { days: [{ id: day.id, exercises: [{ id: retained.id }, { id: future.days[0]!.exercises[0]!.id }] }] })).rejects.toMatchObject({ response: { code: 'SALA_ROUTINE_EXERCISES_INVALID' } });
    expect(await prisma.routineExercise.findMany({ where: { routineDayId: day.id } })).toEqual(snapshot);
  });
  it('updates and cancels future assignments without consuming versions or deleting weights', async () => {
    const f = await fixture();
    jest.spyOn(sala as unknown as { todayOperational(): string }, 'todayOperational').mockReturnValue('2026-10-26');
    const future = await sala.replaceRoutine({ personId: f.person.id, salaParticipationId: f.participation.id, effectiveFrom: '2026-11-15', days: [{ exercises: [{ exerciseDefinitionId: f.b.id }] }] });
    await sala.updateScheduledRoutine(future.id, { effectiveFrom: '2026-11-16' });
    expect((await sala.listRoutines(f.person.id)).find(r => r.id === future.id)).toMatchObject({ version: future.version, effectiveFrom: '2026-11-16' });
    await sala.cancelScheduledRoutine(future.id);
    expect((await training.context(f.person.id)).routine?.id).toBe(f.routine.id);
    expect((await sala.listRoutines(f.person.id)).find(r => r.id === f.routine.id)?.effectiveUntil).toBeNull();
    expect(await prisma.routine.findUnique({ where: { id: future.id } })).toMatchObject({ cancelledAt: expect.any(Date), version: future.version });
    const replacement = await sala.replaceRoutine({ personId: f.person.id, salaParticipationId: f.participation.id, effectiveFrom: '2026-10-26', days: [{ exercises: [{ exerciseDefinitionId: f.b.id }] }] });
    expect(replacement.version).toBe(future.version + 1);
    await expect(sala.updateActiveRoutineExercises(f.routine.id, { days: [] })).rejects.toMatchObject({ response: { code: 'SALA_ROUTINE_NOT_ACTIVE' } });
  });

  it('serializes simultaneous edits and monthly saves without dropping snapshots', async () => {
    const f = await fixture();
    jest.spyOn(sala as unknown as { todayOperational(): string }, 'todayOperational').mockReturnValue('2026-10-26');
    await training.saveMonthlyWeights(f.person.id, monthly(f));
    const day = f.routine.days[0]!;
    const before = await training.listMonth(f.person.id, '2026-10');
    const edit = { days: [{ id: day.id, exercises: day.exercises.slice(0,1).map(e => ({ id: e.id })) }] };
    const results = await Promise.allSettled([sala.updateActiveRoutineExercises(f.routine.id, edit), sala.updateActiveRoutineExercises(f.routine.id, edit), training.saveMonthlyWeights(f.person.id, monthly(f))]);
    expect(results.slice(0,2).every(r => r.status === 'fulfilled')).toBe(true);
    expect(await training.listMonth(f.person.id, '2026-10')).toEqual(before);
    expect(await prisma.routineExercise.count({ where: { routineDayId: day.id } })).toBe(1);
    await sala.updateActiveRoutineExercises(f.routine.id, { days: [{ id: day.id, exercises: [] }] });
    expect((await training.context(f.person.id)).routine!.days[0]!.exercises).toEqual([]);
    expect(await training.listMonth(f.person.id, '2026-10')).toEqual(before);
  });
  it('validates IDs, immutable fields and management permission at the HTTP boundary', async () => {
    const f = await fixture();
    jest.spyOn(sala as unknown as { todayOperational(): string }, 'todayOperational').mockReturnValue('2026-10-26');
    const cookie = await internal(Role.PROFESSOR);
    const session = await request(app.getHttpServer()).get('/api/auth/session').set('Cookie', cookie).expect(200);
    const csrf = session.body.data.csrfToken;
    const path = '/api/sala/routines/' + f.routine.id + '/active-exercises';
    const body = { days: [{ id: f.routine.days[0]!.id, exercises: [{ id: f.routine.days[0]!.exercises[0]!.id }] }] };
    await request(app.getHttpServer()).patch(path).set('Cookie', cookie).set('x-csrf-token', csrf).send({ ...body, version: 99 }).expect(400);
    await request(app.getHttpServer()).patch(path).set('Cookie', cookie).set('x-csrf-token', csrf).send(body).expect(200);
    const denied = await internal(Role.KINESIOLOGIST);
    const deniedSession = await request(app.getHttpServer()).get('/api/auth/session').set('Cookie', denied).expect(200);
    await request(app.getHttpServer()).patch(path).set('Cookie', denied).set('x-csrf-token', deniedSession.body.data.csrfToken).send(body).expect(403);
  });

  it('preserves recorded cancelled versions, activates today and rejects contradictory dates', async () => {
    const f = await fixture();
    jest.spyOn(sala as unknown as { todayOperational(): string }, 'todayOperational').mockReturnValue('2026-10-26');
    const future = await sala.replaceRoutine({ personId: f.person.id, salaParticipationId: f.participation.id, effectiveFrom: '2026-11-15', days: [{ exercises: [{ exerciseDefinitionId: f.b.id }] }] });
    const later = await sala.replaceRoutine({ personId: f.person.id, salaParticipationId: f.participation.id, effectiveFrom: '2026-12-15', days: [{ exercises: [{ exerciseDefinitionId: f.a.id }] }] });
    await sala.updateScheduledRoutine(future.id, { effectiveFrom: '2026-11-14', days: [{ name: 'Corregida', exercises: [{ exerciseDefinitionId: f.a.id, repetitions: '8' }] }] });
    const updated = (await sala.listRoutines(f.person.id)).find(r => r.id === future.id)!;
    const day = updated.days[0]!;
    await training.saveMonthlyWeights(f.person.id, { routineId: future.id, routineDayId: day.id, month: '2026-11', weeks: Array.from({ length: 4 }, (_, i) => ({ weekNumber: i + 1, exercises: day.exercises.map(e => ({ id: e.id, weightKg: i === 0 ? '42' : null })) })) });
    const records = await training.listMonth(f.person.id, '2026-11');
    await expect(sala.updateScheduledRoutine(future.id, { effectiveFrom: '2026-11-14', days: [] })).rejects.toMatchObject({ response: { code: 'SALA_ROUTINE_HAS_RECORDS' } });
    await expect(sala.updateScheduledRoutine(future.id, { effectiveFrom: '2026-12-16' })).rejects.toMatchObject({ response: { code: 'SALA_ROUTINE_DATE_ORDER' } });
    await sala.cancelScheduledRoutine(future.id);
    expect(await training.listMonth(f.person.id, '2026-11')).toEqual(records);
    expect((await sala.listRoutines(f.person.id)).find(r => r.id === future.id)).toMatchObject({ status: 'HISTORICAL', hasTrainingRecords: true });
    expect((await sala.listRoutines(f.person.id)).find(r => r.id === later.id)?.effectiveFrom).toBe('2026-12-15');
    await sala.updateScheduledRoutine(later.id, { effectiveFrom: '2026-10-26' });
    expect((await training.context(f.person.id)).routine?.id).toBe(later.id);
    await expect(sala.cancelScheduledRoutine(later.id)).rejects.toMatchObject({ response: { code: 'SALA_ROUTINE_NOT_SCHEDULED' } });
  });

  it('normalizes empty blocks by occurrence ID and rolls back earlier day changes on a later failure', async () => {
    const f = await fixture();
    jest.spyOn(sala as unknown as { todayOperational(): string }, 'todayOperational').mockReturnValue('2026-10-26');
    const routine = await sala.replaceRoutine({ personId: f.person.id, salaParticipationId: f.participation.id, effectiveFrom: '2026-10-26', days: [{ name: 'Bloques', exercises: [1,2,2].map(blockPosition => ({ exerciseDefinitionId: f.a.id, blockPosition, series: '4' })) }, { name: 'Segundo', exercises: [{ exerciseDefinitionId: f.b.id }] }] });
    const day = routine.days[0]!, second = routine.days[1]!;
    const retained = day.exercises.slice(1);
    const original = await prisma.routineDay.findMany({ where: { routineId: routine.id }, include: { exercises: { orderBy: { position: 'asc' } } }, orderBy: { position: 'asc' } });
    await expect(sala.updateActiveRoutineExercises(routine.id, { days: [{ id: day.id, exercises: retained.map(e => ({ id: e.id })) }, { id: second.id, exercises: [{ exerciseDefinitionId: randomUUID() }] }] })).rejects.toMatchObject({ response: { code: 'SALA_EXERCISE_INVALID' } });
    expect(await prisma.routineDay.findMany({ where: { routineId: routine.id }, include: { exercises: { orderBy: { position: 'asc' } } }, orderBy: { position: 'asc' } })).toEqual(original);
    await sala.updateActiveRoutineExercises(routine.id, { days: [{ id: day.id, exercises: [...retained.map(e => ({ id: e.id })), { exerciseDefinitionId: f.a.id, blockPosition: 2, series: '4' }] }, { id: second.id, exercises: second.exercises.map(e => ({ id: e.id })) }] });
    const exercises = await prisma.routineExercise.findMany({ where: { routineDayId: day.id }, orderBy: { position: 'asc' } });
    expect(exercises.slice(0,2).map(e => e.id)).toEqual(retained.map(e => e.id));
    expect(exercises.map(e => [e.position, e.blockPosition])).toEqual([[1,1],[2,1],[3,1]]);
  });

  it('does not let preexisting zero-length history block an unrelated reschedule', async () => {
    const f = await fixture();
    jest.spyOn(sala as unknown as { todayOperational(): string }, 'todayOperational').mockReturnValue('2026-10-26');
    const history = await training.saveMonthlyWeights(f.person.id, monthly(f));
    await sala.replaceRoutine({ personId: f.person.id, salaParticipationId: f.participation.id, effectiveFrom: '2026-10-19', days: [{ exercises: [{ exerciseDefinitionId: f.a.id }] }] });
    const future = await sala.replaceRoutine({ personId: f.person.id, salaParticipationId: f.participation.id, effectiveFrom: '2026-11-15', days: [{ exercises: [{ exerciseDefinitionId: f.b.id }] }] });
    await sala.updateScheduledRoutine(future.id, { effectiveFrom: '2026-11-16' });
    expect(await training.listMonth(f.person.id, '2026-10')).toEqual(history);
  });
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
    const routine = await sala.replaceRoutine({ effectiveFrom: '2026-10-19', personId: person.id, salaParticipationId: participation.id, days: [{ name: 'Fuerza', exercises: [{ exerciseDefinitionId: a.id, series: '3', repetitions: '10', load: '30 kg', rest: '60 s', notes: 'Controlado' }, { exerciseDefinitionId: b.id, duration: '30 s' }, { exerciseDefinitionId: a.id, load: '15 kg' }] }] });
    // 02:00 UTC is still the previous day in Argentina.
    await prisma.routine.update({ where: { id: routine.id }, data: { createdAt: new Date('2026-10-20T02:00:00Z') } });
    const body = { routineId: routine.id, routineDayId: routine.days[0]!.id, date: '2026-10-20', exercises: routine.days[0]!.exercises.map((exercise, i) => ({ id: exercise.id, weightKg: ['32.5', '22', null][i] as string | null })) };
    const cookie = `athleta_portal_session=${token}`;
    return { person, participation, user, routine, a, b, body, csrf, cookie };
  }
  function create(f: Awaited<ReturnType<typeof fixture>>, body: CreateTrainingRecordDto = f.body) { return request(app.getHttpServer()).post('/api/portal/sala/training-records').set('Cookie', f.cookie).set('x-csrf-token', f.csrf).send(body); }
  async function internal(role: Role) {
    const user = await app.get(InternalUserService).create({ firstName: 'Lector', lastName: 'Sintético', email: `${randomUUID()}@training.test`, roles: [role] }); users.push(user.id);
    const auth = app.get(AuthService); await auth.provisionCredential(user.id, 'ValidPass1!');
    await prisma.internalCredential.update({ where: { internalUserId: user.id }, data: { mustChangePassword: false } });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(200);
    return login.headers['set-cookie'][0] as string;
  }
  function monthly(f: Awaited<ReturnType<typeof fixture>>, month = '2026-10') {
    return { routineId: f.routine.id, routineDayId: f.routine.days[0]!.id, month, weeks: Array.from({ length: 4 }, (_, i) => ({ weekNumber: i + 1, exercises: f.body.exercises.map(e => ({ id: e.id, weightKg: i === 0 ? e.weightKg : null })) })) };
  }
  function saveMonth(f: Awaited<ReturnType<typeof fixture>>, body = monthly(f)) {
    return request(app.getHttpServer()).put('/api/portal/sala/training-records/monthly').set('Cookie', f.cookie).set('x-csrf-token', f.csrf).send(body);
  }
  it('keeps months independent and repeatedly updates the same record, preserving null, zero and snapshots', async () => {
    const f = await fixture();
    const ids: string[] = [];
    for (const [month, weight] of [['2026-10', '40'], ['2026-11', '45'], ['2026-12', '50']]) {
      const body = monthly(f, month); body.weeks[0]!.exercises[0]!.weightKg = weight!;
      const response = await saveMonth(f, body).expect(200); ids.push(response.body.data[0].id);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({ date: null, month, weekNumber: 1 });
    }
    expect(new Set(ids).size).toBe(3);
    const original = (await training.listMonth(f.person.id, '2026-10'))[0]!;
    for (const weight of ['45', '47,5', '0']) {
      const body = monthly(f); body.weeks[0]!.exercises[0]!.weightKg = weight;
      const record = (await saveMonth(f, body).expect(200)).body.data[0];
      expect(record.id).toBe(original.id); expect(record.createdAt).toBe(original.createdAt);
      expect(record.exercises[0]).toMatchObject({ ...original.exercises[0], weightKg: weight.replace(',', '.') });
    }
    const empty = monthly(f); empty.weeks.forEach(w => w.exercises.forEach(e => { e.weightKg = null; }));
    expect((await saveMonth(f, empty).expect(200)).body.data).toHaveLength(1);
    expect(await prisma.routine.count({ where: { personId: f.person.id } })).toBe(1);
    expect((await training.listMonth(f.person.id, '2026-11'))[0]!.exercises[0]!.weightKg).toBe('45');
  });
  it('saves and corrects four weeks while preserving historical weeks five and six in queries', async () => {
    const f = await fixture();
    const body = monthly(f);
    body.weeks.forEach(week => { week.exercises[0]!.weightKg = String(week.weekNumber * 10); });
    await saveMonth(f, body).expect(200);
    const source = await prisma.salaTrainingRecord.findFirstOrThrow({ where: { personId: f.person.id, weekNumber: 1 }, include: { exercises: true } });
    for (const weekNumber of [5, 6]) {
      await prisma.salaTrainingRecord.create({ data: {
        personId: source.personId, routineId: source.routineId, routineDayId: source.routineDayId,
        month: source.month, date: null, weekNumber, dayName: source.dayName, dayPosition: source.dayPosition,
        exercises: { create: source.exercises.map(entry => ({
          routineExerciseId: entry.routineExerciseId, exerciseDefinitionId: entry.exerciseDefinitionId,
          exerciseName: entry.exerciseName, position: entry.position, blockPosition: entry.blockPosition,
          series: entry.series, repetitions: entry.repetitions, duration: entry.duration,
          load: entry.load, rest: entry.rest, notes: entry.notes, weightKg: String(weekNumber * 10),
        })) },
      } });
    }
    const historical = (await training.listMonth(f.person.id, body.month)).filter(record => record.weekNumber! > 4);
    expect(historical.map(record => record.weekNumber).sort()).toEqual([5, 6]);
    body.weeks.forEach(week => { week.exercises[0]!.weightKg = String(week.weekNumber * 10 + 1); });
    await saveMonth(f, body).expect(200);
    const records = (await request(app.getHttpServer()).get('/api/portal/sala/training-records/month').query({ month: body.month }).set('Cookie', f.cookie).expect(200)).body.data;
    expect(records).toHaveLength(6);
    for (const week of body.weeks) expect(records).toEqual(expect.arrayContaining([expect.objectContaining({ weekNumber: week.weekNumber, exercises: expect.arrayContaining([expect.objectContaining({ routineExerciseId: week.exercises[0]!.id, weightKg: week.exercises[0]!.weightKg })]) })]));
    expect(records.filter((record: { weekNumber: number }) => record.weekNumber > 4)).toEqual(historical);
    for (const record of historical) expect(await training.detail(f.person.id, record.id)).toEqual(record);
  });
  it('saves multiple weeks atomically, rejects invalid entries, ownership, month and weeks, and prevents concurrent duplicates', async () => {
    const f = await fixture(); const body = monthly(f);
    body.weeks[3]!.exercises[1]!.weightKg = '60';
    const results = await Promise.all([saveMonth(f, body), saveMonth(f, body)]);
    expect(results.map(r => r.status)).toEqual([200, 200]);
    expect(await prisma.salaTrainingRecord.count({ where: { personId: f.person.id } })).toBe(2);
    const before = await training.listMonth(f.person.id, '2026-10');
    for (const invalid of [
      { ...body, month: '2026-13' }, { ...body, routineId: randomUUID() }, { ...body, routineDayId: randomUUID() },
      { ...body, weeks: body.weeks.slice(0, 3) },
      { ...body, weeks: [...body.weeks, { ...body.weeks[0]!, weekNumber: 5 }] },
      { ...body, weeks: body.weeks.map((w, i) => i === 3 ? { ...w, weekNumber: 1.5 } : w) },
      { ...body, weeks: body.weeks.map((w, i) => i === 3 ? { ...w, weekNumber: 0 } : w) },
      { ...body, weeks: body.weeks.map((w, i) => i === 3 ? { ...w, weekNumber: 5 } : w) },
      { ...body, weeks: body.weeks.map((w, i) => i === 3 ? { ...w, weekNumber: 1 } : w) },
      { ...body, weeks: body.weeks.map((w, i) => i === 3 ? { ...w, exercises: w.exercises.map((e, j) => j === 0 ? { ...e, id: randomUUID() } : e) } : w) },
    ]) await saveMonth(f, invalid).expect(400);
    expect(await training.listMonth(f.person.id, '2026-10')).toEqual(before);
    await request(app.getHttpServer()).put('/api/portal/sala/training-records/monthly').set('Cookie', f.cookie).send(body).expect(403);
    const other = await fixture(); await saveMonth(other, body).expect(400);
    // An invalid final week causes rollback even when the first week changed.
    const bad = monthly(f); bad.weeks[0]!.exercises[0]!.weightKg = '99'; bad.weeks[3]!.exercises[0]!.id = randomUUID();
    await expect(training.saveMonthlyWeights(f.person.id, bad)).rejects.toThrow();
    expect(await training.listMonth(f.person.id, '2026-10')).toEqual(before);
  });
  it('resolves scheduled assignments, rejects backwards assignments, preserves zero-period versions and allows retrospective first months', async () => {
    const f = await fixture();
    await saveMonth(f, monthly(f, '2026-09')).expect(200);
    const future = await sala.replaceRoutine({ personId: f.person.id, salaParticipationId: f.participation.id, effectiveFrom: '2026-12-01', days: [{ exercises: [{ exerciseDefinitionId: f.a.id }] }] });
    expect((await training.context(f.person.id)).routine?.id).toBe(f.routine.id);
    expect((await sala.listRoutines(f.person.id)).find(r => r.id === future.id)?.status).toBe('SCHEDULED');
    await expect(sala.replaceRoutine({ personId: f.person.id, salaParticipationId: f.participation.id, effectiveFrom: '2026-11-30', days: [] })).rejects.toMatchObject({ response: { code: 'SALA_ROUTINE_DATE_ORDER', message: 'Primero editá o eliminá la próxima programación: la nueva rutina no puede comenzar antes de la última asignada.' } });
    const replacement = await sala.duplicateRoutine(future.id, '2026-12-01');
    const saved = { ...monthly(f, '2026-12'), routineId: future.id, routineDayId: future.days[0]!.id, weeks: monthly(f).weeks.map(w => ({ ...w, exercises: future.days[0]!.exercises.map(e => ({ id: e.id, weightKg: '20' })) })) };
    await saveMonth(f, saved).expect(400);
    jest.spyOn(training as unknown as { today(): string }, 'today').mockReturnValue('2026-12-01');
    expect((await training.context(f.person.id)).routine?.id).toBe(replacement.id);
    jest.spyOn(training as unknown as { today(): string }, 'today').mockReturnValue('2026-10-26');
    expect(await prisma.routine.count({ where: { personId: f.person.id } })).toBe(3);
  });
  it('keeps legacy records separate, correctable and unchanged after monthly saves', async () => {
    const f = await fixture(); const legacy = (await create(f).expect(201)).body.data;
    await saveMonth(f).expect(200);
    const records = await training.listMonth(f.person.id, '2026-10'); expect(records).toHaveLength(2);
    expect(records.find(r => r.id === legacy.id)).toEqual(legacy);
    const corrected = await training.correct(f.person.id, legacy.id, { exercises: legacy.exercises.map((e: { id: string }) => ({ id: e.id, weightKg: '0' })) });
    expect(corrected).toMatchObject({ id: legacy.id, date: legacy.date, month: null, weekNumber: null });
    const monthlyRecord = records.find(r => r.date === null)!;
    expect((await training.correct(f.person.id, monthlyRecord.id, { exercises: monthlyRecord.exercises.map(e => ({ id: e.id, weightKg: '42.5' })) })).month).toBe('2026-10');
  });
  it('keeps no-op saves unchanged and uses monthly weights as previous references without leaking future months', async () => {
    const f = await fixture(); const body = monthly(f);
    const saved = (await saveMonth(f, body).expect(200)).body.data;
    expect((await saveMonth(f, body).expect(200)).body.data).toEqual(saved);
    const future = monthly(f, '2026-12'); future.weeks[0]!.exercises[0]!.weightKg = '99'; await saveMonth(f, future).expect(200);
    expect((await training.context(f.person.id, '2026-10-26')).routine?.days[0]?.exercises[0]?.lastWeightKg).toBe('32.5');
    expect((await training.context(f.person.id, '2026-12-01')).routine?.days[0]?.exercises[0]?.lastWeightKg).toBe('99');
  });
  it('keeps four slots of two mid-month prescriptions separate, including advance entries', async () => {
    const f = await fixture();
    const next = await sala.replaceRoutine({ personId: f.person.id, salaParticipationId: f.participation.id, effectiveFrom: '2026-11-15', days: [{ name: 'Segunda', exercises: [{ exerciseDefinitionId: f.a.id }] }] });
    const firstBody = monthly(f, '2026-11'); firstBody.weeks[3]!.exercises[0]!.weightKg = '25';
    await saveMonth(f, firstBody).expect(200);
    const nextBody = { routineId: next.id, routineDayId: next.days[0]!.id, month: '2026-11', weeks: Array.from({ length: 4 }, (_, i) => ({ weekNumber: i + 1, exercises: next.days[0]!.exercises.map(e => ({ id: e.id, weightKg: i === 3 ? '35' : null })) })) };
    await saveMonth(f, nextBody).expect(200);
    const records = await training.listMonth(f.person.id, '2026-11');
    expect(records.filter(r => r.weekNumber === 4).map(r => [r.routineId, r.exercises[0]?.weightKg])).toEqual(expect.arrayContaining([[f.routine.id, '25'], [next.id, '35']]));
    await saveMonth(f, monthly(f, '2026-12')).expect(400);
    const context = (await request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', f.cookie).expect(200)).body.data;
    expect(context.routine).toMatchObject({ id: f.routine.id, status: 'ACTIVE' });
  });
  it('preserves and corrects monthly records of a same-day superseded routine without admitting new monthly writes', async () => {
    const f = await fixture(); const saved = (await saveMonth(f).expect(200)).body.data[0];
    const latest = await sala.duplicateRoutine(f.routine.id, '2026-10-19');
    await saveMonth(f).expect(400);
    expect(await training.detail(f.person.id, saved.id)).toEqual(saved);
    expect((await training.context(f.person.id)).routine?.id).toBe(latest.id);
    expect((await sala.listRoutines(f.person.id)).find(r => r.id === f.routine.id)?.status).toBe('HISTORICAL');
    const corrected = await training.correct(f.person.id, saved.id, { exercises: saved.exercises.map((e: { id: string }) => ({ id: e.id, weightKg: '45' })) });
    expect(corrected).toMatchObject({ id: saved.id, month: '2026-10', weekNumber: 1, date: null });
  });
  it('protects both current and scheduled prescriptions in retirement and participation leave impact', async () => {
    const f = await fixture(); const saved = (await saveMonth(f).expect(200)).body.data[0];
    const future = await sala.replaceRoutine({ personId: f.person.id, salaParticipationId: f.participation.id, effectiveFrom: '2099-12-01', days: [{ exercises: [{ exerciseDefinitionId: f.a.id }] }] });
    expect((await sala.leaveImpact(f.participation.id)).activeRoutines).toBe(2);
    await expect(sala.retireExerciseDefinition(f.a.id, false)).rejects.toMatchObject({ response: { details: { activeRoutines: 2 } } });
    expect((await sala.retireExerciseDefinition(f.a.id, true)).affectedActiveRoutines).toBe(2);
    expect(await training.detail(f.person.id, saved.id)).toEqual(saved);
    expect(await prisma.routineExercise.count({ where: { routineDay: { routineId: future.id } } })).toBe(0);
  });
  it('rolls back every weekly write when persistence fails on the final week', async () => {
    const f = await fixture(); const body = monthly(f); body.weeks[3]!.exercises[0]!.weightKg = '99';
    const name = `training_rollback_${randomUUID().replaceAll('-', '')}`;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.person_id = '${f.person.id}'::uuid AND NEW.week_number = 4 THEN RAISE EXCEPTION 'synthetic final week failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON sala_training_records FOR EACH ROW EXECUTE FUNCTION ${name}()`);
    try {
      await expect(training.saveMonthlyWeights(f.person.id, body)).rejects.toThrow();
      expect(await prisma.salaTrainingRecord.count({ where: { personId: f.person.id } })).toBe(0);
      expect(await prisma.salaTrainingRecordExercise.count({ where: { record: { personId: f.person.id } } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER ${name} ON sala_training_records`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION ${name}()`);
    }
  });
  it('backfills operational effective dates and preserves legacy IDs, dates, weights and snapshots through the migration SQL', async () => {
    const f = await fixture(); await create(f).expect(201);
    const sql = readFileSync('prisma/migrations/20261104120000_routine_periods_monthly_weights/migration.sql', 'utf8');
    await prisma.$transaction(async tx => {
      // Recreate the pre-migration shape in transaction-local tables. PostgreSQL
      // resolves these before public tables; production and other suites are untouched.
      await tx.$executeRaw`CREATE TEMP TABLE routines ON COMMIT DROP AS SELECT * FROM public.routines`;
      await tx.$executeRaw`ALTER TABLE routines DROP COLUMN effective_from`;
      await tx.$executeRaw`CREATE TEMP TABLE sala_training_records ON COMMIT DROP AS SELECT * FROM public.sala_training_records WHERE date IS NOT NULL`;
      await tx.$executeRaw`ALTER TABLE sala_training_records DROP COLUMN month, DROP COLUMN week_number, ALTER COLUMN date SET NOT NULL`;
      await tx.$executeRaw`CREATE TEMP TABLE sala_training_record_exercises ON COMMIT DROP AS SELECT * FROM public.sala_training_record_exercises`;
      const before = await tx.$queryRaw`SELECT to_jsonb(r) AS data FROM sala_training_records r ORDER BY id`;
      const snapshots = await tx.$queryRaw`SELECT to_jsonb(e) AS data FROM sala_training_record_exercises e ORDER BY id`;
      const routines = await tx.$queryRaw`SELECT to_jsonb(r) AS data FROM routines r ORDER BY id`;
      for (const statement of sql.split(';').filter(statement => statement.trim())) await tx.$executeRawUnsafe(statement);
      expect(await tx.$queryRaw`SELECT to_jsonb(r) - 'month' - 'week_number' AS data FROM sala_training_records r ORDER BY id`).toEqual(before);
      expect(await tx.$queryRaw`SELECT to_jsonb(e) AS data FROM sala_training_record_exercises e ORDER BY id`).toEqual(snapshots);
      expect(await tx.$queryRaw`SELECT to_jsonb(r) - 'effective_from' AS data FROM routines r ORDER BY id`).toEqual(routines);
      const dates = await tx.$queryRaw<{ date: string }[]>`SELECT effective_from::text AS date FROM routines WHERE id = ${f.routine.id}::uuid`;
      expect(dates[0]?.date).toBe('2026-10-19');
    });
  });
  it('accepts weekly future references, preserves traditional limits and prevents duplicates across months', async () => {
    const f = await fixture();
    const body = { ...f.body, date: '2026-11-30', allowFuture: true };
    await create(f, { ...f.body, date: body.date }).expect(400);
    const saved = await create(f, body).expect(201);
    await create(f, { ...body, date: '2026-12-01' }).expect(409);
    expect((await training.listMonth(f.person.id, '2026-11')).map(r => r.id)).toEqual([saved.body.data.id]);
    const exercises = saved.body.data.exercises.map((e: { id: string; weightKg: string | null }, i: number) => ({ id: e.id, weightKg: i === 0 ? '45' : e.weightKg }));
    const corrected = await training.correct(f.person.id, saved.body.data.id, { exercises });
    expect(corrected.exercises.map(e => e.weightKg)).toEqual(['45', '22', null]);
    expect(corrected.exercises[0]!.exerciseName).toBe(saved.body.data.exercises[0].exerciseName);
    expect(await prisma.salaTrainingRecord.count({ where: { personId: f.person.id } })).toBe(1);
  });
  it('recovers and repeatedly corrects a retrospective shared week without altering assignment or snapshots', async () => {
    const f = await fixture();
    const assigned = new Date('2026-11-03T12:00:00Z');
    await prisma.routine.update({ where: { id: f.routine.id }, data: { createdAt: assigned, effectiveFrom: new Date('2026-11-03') } });
    const saved = (await create(f, { ...f.body, date: '2026-10-26', allowFuture: true }).expect(201)).body.data;
    expect((await training.listMonth(f.person.id, '2026-10'))[0]!.id).toBe(saved.id);
    await create(f, { ...f.body, date: '2026-11-01', allowFuture: true }).expect(409);
    for (const weight of ['45', '48']) {
      const corrected = await training.correct(f.person.id, saved.id, { exercises: saved.exercises.map((e: { id: string; weightKg: string | null }, i: number) => ({ id: e.id, weightKg: i ? e.weightKg : weight })) });
      expect(corrected).toEqual({ ...saved, updatedAt: corrected.updatedAt, exercises: saved.exercises.map((e: object, i: number) => i ? e : { ...e, weightKg: weight }) });
    }
    expect((await prisma.routine.findUniqueOrThrow({ where: { id: f.routine.id } })).createdAt).toEqual(assigned);
    expect(await prisma.salaTrainingRecord.count({ where: { personId: f.person.id } })).toBe(1);
  });
  it('returns all owned versions without records and validates historical periods including midweek transitions', async () => {
    const f = await fixture(), other = await fixture();
    await prisma.routine.update({ where: { id: f.routine.id }, data: { createdAt: new Date('2026-09-01T12:00:00Z'), effectiveFrom: new Date('2026-09-01') } });
    const second = await sala.replaceRoutine({ effectiveFrom: '2026-10-15', personId: f.person.id, salaParticipationId: f.participation.id, days: [{ name: 'Segunda', exercises: [{ exerciseDefinitionId: f.b.id }] }] });
    await prisma.routine.update({ where: { id: second.id }, data: { createdAt: new Date('2026-10-15T12:00:00Z') } });
    const third = await sala.replaceRoutine({ effectiveFrom: '2026-11-01', personId: f.person.id, salaParticipationId: f.participation.id, days: [{ name: 'Tercera', exercises: [{ exerciseDefinitionId: f.a.id }] }] });
    await prisma.routine.update({ where: { id: third.id }, data: { createdAt: new Date('2026-11-01T12:00:00Z') } });
    const response = await request(app.getHttpServer()).get('/api/portal/sala/training-context').set('Cookie', f.cookie).expect(200);
    expect(response.body.data.routines.map((r: { id: string; version: number; createdOn: string }) => [r.id, r.version, r.createdOn])).toEqual([[f.routine.id, 1, '2026-09-01'], [second.id, 2, '2026-10-15'], [third.id, 3, '2026-11-01']]);
    expect(response.body.data.routines[0]).not.toHaveProperty('personId');
    expect(response.body.data.routines[0]).not.toHaveProperty('salaParticipationId');
    expect(await prisma.salaTrainingRecord.count({ where: { personId: f.person.id } })).toBe(0);
    const own = await request(app.getHttpServer()).get('/api/portal/sala/training-context').set('Cookie', other.cookie).expect(200);
    expect(own.body.data.routines.map((r: { id: string }) => r.id)).toEqual([other.routine.id]);
    await request(app.getHttpServer()).get(`/api/portal/sala/training-context?personId=${f.person.id}`).set('Cookie', other.cookie).expect(400);
    const weekly = { ...f.body, allowFuture: true };
    await create(f, { ...weekly, date: '2026-09-07' }).expect(201);
    await create(f, { ...weekly, date: '2026-10-12' }).expect(201);
    await create(f, { ...weekly, date: '2026-10-15' }).expect(400);
    await create(f, { ...weekly, date: '2026-11-09' }).expect(400);
    const body = { ...weekly, routineId: second.id, routineDayId: second.days[0]!.id, exercises: second.days[0]!.exercises.map(e => ({ id: e.id, weightKg: '35' })) };
    await create(f, { ...body, date: '2026-10-14' }).expect(400);
    await create(f, { ...body, date: '2026-10-15' }).expect(201);
    await create(f, { ...body, date: '2026-11-01' }).expect(400);
    await create(other, { ...body, date: '2026-10-15' }).expect(409);
    const simultaneous = await Promise.all([create(f, { ...body, date: '2026-10-19' }), create(f, { ...body, date: '2026-10-20' })]);
    expect(simultaneous.map(r => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.salaTrainingRecord.count({ where: { personId: f.person.id } })).toBe(4);
  });
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
    const f = await fixture(); const responses = await Promise.all([create(f), create(f, { ...f.body, date: '2026-10-25' })]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    expect(responses.find(r => r.status === 409)!.body).toMatchObject({ code: 'TRAINING_DUPLICATE', details: { recordId: responses.find(r => r.status === 201)!.body.data.id } });
    expect(await prisma.salaTrainingRecord.count({ where: { personId: f.person.id } })).toBe(1);
    const duplicate = await create(f, { ...f.body, date: '2026-10-24' }).expect(409);
    expect(duplicate.body).toMatchObject({ code: 'TRAINING_DUPLICATE', details: { recordId: responses.find(r => r.status === 201)!.body.data.id } });
    const winnerDate = responses.find(r => r.status === 201)!.body.data.date as string;
    await expect(prisma.salaTrainingRecord.create({ data: { personId: f.person.id, routineId: f.body.routineId, routineDayId: f.body.routineDayId, date: new Date(winnerDate), dayPosition: 1 } })).rejects.toMatchObject({ code: 'P2002' });
  });
  it('uses one calendar week across month/year boundaries and allows the next week', async () => {
    const f = await fixture();
    await prisma.routine.update({ where: { id: f.routine.id }, data: { createdAt: new Date('2025-12-01T12:00:00Z'), effectiveFrom: new Date('2025-12-01') } });
    const saved = (await create(f, { ...f.body, date: '2025-12-31' }).expect(201)).body.data;
    const duplicate = await create(f, { ...f.body, date: '2026-01-04' }).expect(409);
    expect(duplicate.body).toMatchObject({ code: 'TRAINING_DUPLICATE', details: { recordId: saved.id } });
    await create(f, { ...f.body, date: '2026-01-05' }).expect(201);
    expect(await prisma.salaTrainingRecord.count({ where: { personId: f.person.id } })).toBe(2);
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
    const grouped = await sala.replaceRoutine({ effectiveFrom: '2026-10-19', personId: f.person.id, salaParticipationId: f.participation.id, days: [{ name: 'Bloques', exercises: [1, 1, 2].map((blockPosition, i) => ({ exerciseDefinitionId: i === 1 ? f.b.id : f.a.id, blockPosition, series: blockPosition === 1 ? '4' : '3', load: '20 kg' })) }] });
    await prisma.routine.update({ where: { id: grouped.id }, data: { createdAt: new Date('2026-10-20T02:00:00Z') } });
    const context = await training.context(f.person.id, f.body.date);
    expect(context.routine!.days[0]!.exercises.map(e => e.blockPosition)).toEqual([1, 1, 2]);
    const body = { ...f.body, routineId: grouped.id, routineDayId: grouped.days[0]!.id, exercises: grouped.days[0]!.exercises.map((e, i) => ({ id: e.id, weightKg: i === 2 ? null : '30' })) };
    const saved = (await create(f, body).expect(201)).body.data;
    expect(saved.exercises.map((e: { blockPosition: number }) => e.blockPosition)).toEqual([1, 1, 2]);
    await sala.replaceRoutine({ effectiveFrom: '2026-10-19', personId: f.person.id, salaParticipationId: f.participation.id, days: [{ exercises: [{ exerciseDefinitionId: f.b.id }] }] });
    expect(await training.detail(f.person.id, saved.id)).toEqual(saved);
    const old = await training.detail(f.person.id, saved.id);
    const correction = await request(app.getHttpServer()).post(`/api/portal/sala/training-records/${old.id}/correct`).set('Cookie', f.cookie).set('x-csrf-token', f.csrf).send({ exercises: old.exercises.map(e => ({ id: e.id, weightKg: '42' })) }).expect(200);
    expect(correction.body.data.exercises).toEqual(saved.exercises.map((e: object) => ({ ...e, weightKg: '42' })));
    const month = await training.listMonth(f.person.id, '2026-10');
    expect(month).toEqual([correction.body.data]);
    const legacy = await prisma.routineExercise.findMany({ where: { routineDayId: f.routine.days[0]!.id } });
    expect(legacy.every(e => e.blockPosition === null)).toBe(true);
  });
  it('preserves snapshots after catalog edits/retirement/replacement and corrects only saved weights', async () => {
    const f = await fixture(); const saved = (await create(f).expect(201)).body.data;
    await sala.updateExerciseDefinition(f.a.id, { name: 'Press actualizado' });
    await sala.retireExerciseDefinition(f.a.id, true);
    const replacement = await sala.replaceRoutine({ effectiveFrom: '2026-10-19', personId: f.person.id, salaParticipationId: f.participation.id, days: [{ exercises: [{ exerciseDefinitionId: f.b.id, load: '35 kg' }] }] });
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
  it('keeps multiple legacy weekly records intact and returns corrected values to Management', async () => {
    const f = await fixture();
    const original = await training.create(f.person.id, f.body);
    const legacy = await prisma.salaTrainingRecord.create({ data: {
      personId: f.person.id, routineId: original.routineId, routineDayId: original.routineDayId,
      date: new Date('2026-10-22'), dayName: original.dayName, dayPosition: original.dayPosition,
      exercises: { create: original.exercises.map(({ id: _id, weightKg, ...snapshot }) => { void _id; return { ...snapshot, weightKg }; }) },
    }, include: { exercises: true } });
    const duplicate = await create(f, { ...f.body, date: '2026-10-23' }).expect(409);
    expect(duplicate.body).toMatchObject({ code: 'TRAINING_DUPLICATE', details: { recordId: legacy.id } });
    const corrected = await training.correct(f.person.id, original.id, { exercises: original.exercises.map((e, i) => ({ id: e.id, weightKg: i ? e.weightKg : '45' })) });
    expect(corrected.exercises.slice(1)).toEqual(original.exercises.slice(1));
    expect(corrected).toMatchObject({ id: original.id, date: original.date, createdAt: original.createdAt });
    const cookie = await internal(Role.PROFESSOR);
    const management = await request(app.getHttpServer()).get(`/api/sala/people/${f.person.id}/training-records/${original.id}`).set('Cookie', cookie).expect(200);
    expect(management.body.data).toEqual(corrected);
    expect(await prisma.salaTrainingRecord.findUnique({ where: { id: legacy.id }, include: { exercises: true } })).toEqual(legacy);
    expect(await prisma.salaTrainingRecord.count({ where: { personId: f.person.id } })).toBe(2);
  });
  it('resolves operational validity independently of compatibility status and serializes replacement races', async () => {
    const f = await fixture();
    const race = await Promise.allSettled([training.create(f.person.id, f.body), sala.replaceRoutine({ effectiveFrom: '2026-10-19', personId: f.person.id, salaParticipationId: f.participation.id, days: [{ exercises: [{ exerciseDefinitionId: f.b.id }] }] })]);
    expect(race[1]!.status).toBe('fulfilled');
    if (race[0]!.status === 'rejected') expect(race[0]!.reason.getResponse()).toMatchObject({ code: 'TRAINING_ROUTINE_CHANGED' });
    const records = await prisma.salaTrainingRecord.findMany({ where: { personId: f.person.id }, include: { exercises: true } });
    for (const record of records) { expect(record.routineId).toBe(f.routine.id); expect(record.exercises).toHaveLength(3); }
    await prisma.routine.updateMany({ where: { personId: f.person.id }, data: { status: 'HISTORICAL' } });
    const latest = await prisma.routine.findFirstOrThrow({ where: { personId: f.person.id }, orderBy: { version: 'desc' } });
    expect(latest.version).toBe(2);
    expect((await training.context(f.person.id)).routine?.id).toBe(latest.id); // Compatibility status does not determine operational validity.
  });
  it('returns every monthly snapshot, including different versions and repeated entries, without pagination or other owners', async () => {
    const f = await fixture(), other = await fixture();
    const saved = (await create(f).expect(201)).body.data;
    await create(other).expect(201);
    // More than the maximum page size. The existing DATE is a UTC container:
    // October 1 must remain October 1, even though its UTC midnight is September in Argentina.
    for (let index = 0; index < 61; index++) {
      await prisma.salaTrainingRecord.create({ data: {
        personId: f.person.id, routineId: f.routine.id, routineDayId: randomUUID(),
        date: new Date(`2026-10-${String(index % 31 + 1).padStart(2, '0')}T00:00:00Z`),
        dayPosition: index + 2, dayName: 'Histórico sintético',
        exercises: { create: [{ routineExerciseId: randomUUID(), exerciseDefinitionId: f.a.id, exerciseName: 'Nombre histórico', position: 1, blockPosition: 2, notes: 'Indicación original', weightKg: '12.5' }] },
      } });
    }
    for (const date of ['2026-09-30', '2026-11-01']) {
      await prisma.salaTrainingRecord.create({ data: { personId: f.person.id, routineId: f.routine.id, routineDayId: randomUUID(), date: new Date(date), dayPosition: 1 } });
    }
    await prisma.routine.updateMany({ where: { personId: f.person.id }, data: { status: 'HISTORICAL' } });
    const before = await prisma.salaTrainingRecord.findMany({ where: { personId: f.person.id }, include: { exercises: true }, orderBy: { id: 'asc' } });
    const response = await request(app.getHttpServer()).get('/api/portal/sala/training-records/month?month=2026-10').set('Cookie', f.cookie).expect(200);
    expect(response.body.data).toHaveLength(62);
    expect(response.body.data.find((r: { id: string }) => r.id === saved.id)).toEqual(saved);
    expect(response.body.data[0].date).toBe('2026-10-01');
    expect(response.body.data.at(-1).date).toBe('2026-10-31');
    expect(response.body.data[0].exercises[0]).toMatchObject({ exerciseName: 'Nombre histórico', blockPosition: 2, notes: 'Indicación original', weightKg: '12.5' });
    expect(response.body).not.toHaveProperty('meta');
    expect(await prisma.salaTrainingRecord.findMany({ where: { personId: f.person.id }, include: { exercises: true }, orderBy: { id: 'asc' } })).toEqual(before);
    const own = await request(app.getHttpServer()).get('/api/portal/sala/training-records/month?month=2026-10').set('Cookie', other.cookie).expect(200);
    expect(own.body.data).toHaveLength(1);
    await request(app.getHttpServer()).get('/api/portal/sala/training-records/month?month=2026-10').expect(401);
    await request(app.getHttpServer()).get(`/api/portal/sala/training-records/month?month=2026-10&personId=${f.person.id}`).set('Cookie', other.cookie).expect(400);
    const empty = await request(app.getHttpServer()).get('/api/portal/sala/training-records/month?month=2026-08').set('Cookie', f.cookie).expect(200);
    expect(empty.body.data).toEqual([]);
  });
  it.each(['', '2026-00', '2026-13', '26-10', '2026-1', '0000-01', '2026-10-01'])('rejects invalid monthly query %s', async month => {
    const f = await fixture();
    await request(app.getHttpServer()).get(`/api/portal/sala/training-records/month?month=${month}`).set('Cookie', f.cookie).expect(400);
    expect(await prisma.salaTrainingRecord.count({ where: { personId: f.person.id } })).toBe(0);
  });
  it('paginates newest dates, loads details separately, and uses the existing read permission', async () => {
    const f = await fixture(); await create(f).expect(201); await create(f, { ...f.body, date: '2026-10-26' }).expect(201);
    const listed = await request(app.getHttpServer()).get('/api/portal/sala/training-records?pageSize=1').set('Cookie', f.cookie).expect(200);
    expect(listed.body.meta).toMatchObject({ total: 2, totalPages: 2, page: 1 }); expect(listed.body.data[0].date).toBe('2026-10-26'); expect(listed.body.data[0]).not.toHaveProperty('exercises');
    const second = await request(app.getHttpServer()).get('/api/portal/sala/training-records?pageSize=1&page=2').set('Cookie', f.cookie).expect(200); expect(second.body.data[0].date).toBe('2026-10-20');
    for (const role of [Role.PROFESSOR, Role.ADMINISTRATIVE]) {
      const cookie = await internal(role);
      await request(app.getHttpServer()).get(`/api/sala/people/${f.person.id}/training-records`).set('Cookie', cookie).expect(200);
      await request(app.getHttpServer()).get(`/api/sala/people/${f.person.id}/training-records/month?month=2026-10`).set('Cookie', cookie).expect(200);
      await request(app.getHttpServer()).get(`/api/sala/people/${f.person.id}/training-records/${listed.body.data[0].id}`).set('Cookie', cookie).expect(200);
    }
    const denied = await internal(Role.KINESIOLOGIST);
    await request(app.getHttpServer()).get(`/api/sala/people/${f.person.id}/training-records`).set('Cookie', denied).expect(403);
    await request(app.getHttpServer()).get(`/api/sala/people/${f.person.id}/training-records/month?month=2026-10`).set('Cookie', denied).expect(403);
    await request(app.getHttpServer()).get(`/api/sala/people/${f.person.id}/training-records/${listed.body.data[0].id}`).set('Cookie', denied).expect(403);
  });
});
