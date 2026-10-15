import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Role, type SalaWeekday } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { InternalUserService } from '../src/team/internal-user.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { PortalService } from '../src/portal/portal.service';
import { SalaService } from '../src/sala/sala.service';

describe('Portal Sala services from the current plan', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: InternalUserService;
  let sala: SalaService;
  let personId: string;
  let professorId: string;
  let planId: string;
  let windowId: string;
  let serviceIds: string[] = [];
  let exerciseDefinitionIds: string[] = [];
  let paymentMethodId: string;
  let physicalTestIds: string[] = [];
  let reservationNow: jest.SpyInstance<Date, []>;
  let operationalDate: jest.SpyInstance<string, []>;

  beforeEach(() => {
    // A local seam controls only Portal's date rules, leaving sessions and timers alone.
    operationalDate = jest.spyOn(app.get(PortalService) as unknown as { todayOperational(): string }, 'todayOperational').mockReturnValue('2026-10-16');
    reservationNow = jest.spyOn(app.get(PortalService) as unknown as { reservationNow(): Date }, 'reservationNow').mockImplementation(() => new Date(`${operationalDate.getMockImplementation()?.()}T11:00:00Z`));
  });

  beforeAll(async () => {
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    users = app.get(InternalUserService);
    sala = app.get(SalaService);
  });
  afterEach(async () => {
    jest.useRealTimers();
    operationalDate.mockRestore();
    reservationNow.mockRestore();
    if (personId) {
      await prisma.salaOccurrence.deleteMany({ where: { personId } });
      await prisma.salaPaymentReversal.deleteMany({ where: { payment: { personId } } });
      await prisma.salaPayment.deleteMany({ where: { personId } });
      await prisma.oneOffReservation.deleteMany({ where: { personId } });
      await prisma.fixedSalaBooking.deleteMany({ where: { personId } });
      await prisma.session.deleteMany({ where: { personId } });
      await prisma.salaCharge.deleteMany({ where: { personId } });
      await prisma.routine.deleteMany({ where: { personId } });
      await prisma.physicalTestResult.deleteMany({ where: { evaluation: { personId } } });
      await prisma.physicalEvaluation.deleteMany({ where: { personId } });
      await prisma.salaParticipation.deleteMany({ where: { personId } });
      await prisma.portalCredential.deleteMany({ where: { personId } });
      await prisma.person.deleteMany({ where: { id: personId } });
    }
    await prisma.exerciseDefinition.deleteMany({ where: { id: { in: exerciseDefinitionIds } } });
    exerciseDefinitionIds = [];
    await prisma.physicalTestDefinition.deleteMany({ where: { id: { in: physicalTestIds } } });
    physicalTestIds = [];
    if (paymentMethodId) await prisma.paymentMethod.deleteMany({ where: { id: paymentMethodId } });
    if (planId) await prisma.salaPlan.deleteMany({ where: { id: planId } });
    await prisma.salaServiceType.deleteMany({ where: { id: { in: serviceIds } } });
    if (windowId) await prisma.salaScheduleSlot.deleteMany({ where: { id: windowId } });
    if (professorId) {
      await prisma.session.deleteMany({ where: { internalUserId: professorId } });
      await prisma.internalCredential.deleteMany({ where: { internalUserId: professorId } });
      await prisma.internalUserRole.deleteMany({ where: { internalUserId: professorId } });
      await prisma.internalUser.deleteMany({ where: { id: professorId } });
    }
  });
  afterAll(() => app.close());

  async function fixture(date = '2026-10-20') {
    const suffix = crypto.randomUUID();
    const professor = await users.create({ firstName: 'Portal', lastName: 'Profesor', email: `portal-sala-${suffix}@test.local`, roles: [Role.PROFESSOR] });
    professorId = professor.id;
    const muscle = await sala.createServiceType({ name: 'Musculación', durationMinutes: 60 });
    const calisthenics = await sala.createServiceType({ name: 'Calistenia', durationMinutes: 60 });
    serviceIds = [muscle.id, calisthenics.id];
    const plan = await sala.createPlan({ name: `Plan Base ${suffix}`, monthlyAmount: 20000, serviceTypeIds: [muscle.id] });
    planId = plan.id;
    const dni = `${Date.now()}`.slice(-10);
    const person = await prisma.person.create({ data: { firstName: 'Portal', lastName: 'Alumno sintético', dni, normalizedDni: dni, phone: '3515550000', birthDate: new Date('1990-01-01'), portalCredential: { create: { pinHash: await argon2.hash('1111', { type: argon2.argon2id }), mustChangePin: false } } } });
    personId = person.id;
    const participation = await sala.join({ personId: person.id, mainProfessorId: professor.id, planId: plan.id, startDate: '2020-01-01' });
    const day = new Date(`${date}T00:00:00.000Z`);
    const weekday = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][day.getUTCDay()] as SalaWeekday;
    const window = await sala.createSlot({ weekday, startTime: '09:00', durationMinutes: 120, specificCapacity: 5 });
    windowId = window.id;
    await prisma.salaScheduleSlot.update({ where: { id: windowId }, data: { startsAt: new Date('2020-01-01') } });
    const login = await request(app.getHttpServer()).post('/api/portal/auth/login').send({ dni, pin: '1111' }).expect(200);
    return { muscle, calisthenics, participation, cookie: login.headers['set-cookie'][0] as string, csrf: login.body.data.csrfToken as string,
      body: { date, startDate: date, scheduleSlotId: window.id, startTime: '09:00' } };
  }

  it('returns all physical results chronologically with only the Portal projection', async () => {
    const f = await fixture();
    const a = await sala.createPhysicalTest({ name: `Fuerza-${personId}`, type: 'STRENGTH' });
    const b = await sala.createPhysicalTest({ name: `Movilidad-${personId}`, type: 'MOBILITY' });
    physicalTestIds = [a.id, b.id];
    for (const date of ['2026-10-01', '2026-08-01', '2026-09-01']) await sala.createPhysicalEvaluation({ personId, salaParticipationId: f.participation.id, professorId, evaluationDate: date, observation: 'Nota interna del Profesor', results: [{ testDefinitionId: a.id, resultText: '80 kg' }, { testDefinitionId: a.id, resultText: '85 kg' }, { testDefinitionId: b.id, resultText: '35°' }] }, professorId);
    // No arbitrary twenty-evaluation truncation.
    for (let index = 0; index < 20; index++) await sala.createPhysicalEvaluation({ personId, salaParticipationId: f.participation.id, professorId, evaluationDate: '2026-10-14', results: [{ testDefinitionId: a.id, resultText: '90 kg' }] }, professorId);
    await sala.retirePhysicalTest(a.id);
    const response = await request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', f.cookie).expect(200);
    const evaluations = response.body.data.evaluations;
    expect(evaluations).toHaveLength(23);
    expect(evaluations.slice(0, 3).map((item: { evaluationDate: string }) => item.evaluationDate.slice(0, 10))).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
    expect(evaluations[0].results).toHaveLength(3);
    expect(evaluations[0].results).toEqual(expect.arrayContaining([expect.objectContaining({ resultText: '80 kg', testDefinition: { id: a.id, name: a.name } }), expect.objectContaining({ resultText: '35°', testDefinition: { id: b.id, name: b.name } })]));
    for (const evaluation of evaluations) {
      expect(Object.keys(evaluation).sort()).toEqual(['evaluationDate', 'id', 'results']);
      for (const result of evaluation.results) expect(Object.keys(result).sort()).toEqual(['resultText', 'testDefinition']);
    }
    for (const forbidden of ['observation', 'createdBy', 'professorId', 'Nota interna del Profesor']) expect(JSON.stringify(evaluations)).not.toContain(forbidden);
  });

  it('returns exercise definitions and all routine details in persisted position order', async () => {
    const f = await fixture();
    const squat = await sala.createExerciseDefinition({ name: `Sentadilla ${crypto.randomUUID()}`, primaryMuscle: 'Cuádriceps', description: 'Descenso controlado' });
    exerciseDefinitionIds.push(squat.id);
    const plank = await sala.createExerciseDefinition({ name: `Plancha ${crypto.randomUUID()}`, primaryMuscle: 'Abdominales' });
    exerciseDefinitionIds.push(plank.id);
    const timed = { exerciseDefinitionId: plank.id, series: '3', duration: '45 s', rest: '30 s' };
    const repetitions = { exerciseDefinitionId: squat.id, series: '3', repetitions: '10', load: '40 kg', rest: '60 s', notes: 'Controlar técnica' };
    const routine = await sala.replaceRoutine({ personId, salaParticipationId: f.participation.id, days: [
      { name: 'Día 2', exercises: [timed] },
      { name: 'Día 1', exercises: [timed, repetitions] },
    ] });
    // Persist an order different from insertion order for both days and exercises.
    await prisma.routineDay.update({ where: { id: routine.days[0]!.id }, data: { position: 3 } });
    await prisma.routineExercise.update({ where: { id: routine.days[1]!.exercises[0]!.id }, data: { position: 3 } });

    const portal = await request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', f.cookie).expect(200);
    expect(portal.body.data.routine).toMatchObject({ id: routine.id, status: 'ACTIVE', days: [
      { name: 'Día 1', position: 2, exercises: [
        { position: 2, exerciseDefinition: { name: squat.name, description: 'Descenso controlado' }, series: '3', repetitions: '10', duration: null, load: '40 kg', rest: '60 s', notes: 'Controlar técnica' },
        { position: 3, exerciseDefinition: { name: plank.name, description: null }, series: '3', repetitions: null, duration: '45 s', load: null, rest: '30 s', notes: null },
      ] },
      { name: 'Día 2', position: 3, exercises: [
        { position: 1, exerciseDefinition: { name: plank.name, description: null }, series: '3', duration: '45 s', rest: '30 s' },
      ] },
    ] });
  });

  async function payment(date: string) {
    const method = await prisma.paymentMethod.create({ data: { name: `Portal efectivo ${crypto.randomUUID()}` } });
    paymentMethodId = method.id;
    const day = new Date(`${date}T00:00:00.000Z`);
    // A different cash date and amount prove that only the monthly period enables Portal reservations.
    return prisma.salaPayment.create({ data: {
      personId, year: day.getUTCFullYear(), month: day.getUTCMonth() + 1,
      paidAt: new Date('2000-01-01'), amount: 1, paymentMethodId, registeredById: professorId, operationId: crypto.randomUUID(),
    } });
  }
  async function reverse(paymentId: string) {
    return prisma.salaPaymentReversal.create({ data: { paymentId, reason: 'Reversión sintética', registeredById: professorId, operationId: crypto.randomUUID() } });
  }
  it('derives each fixed occurrence from the matching payment period and counts pending capacity', async () => {
    const f = await fixture('2026-10-20');
    await prisma.salaScheduleSlot.update({ where: { id: windowId }, data: { specificCapacity: 1 } });
    const fixed = await sala.createFixed({ personId, salaParticipationId: f.participation.id, scheduleSlotId: windowId, serviceTypeId: f.muscle.id, startTime: '09:00', startDate: '2026-10-13' });
    expect(await sala.fixedOccurrenceStates(personId, ['2026-10-13', '2026-10-20'])).toEqual(expect.arrayContaining([
      expect.objectContaining({ fixedSalaBookingId: fixed.id, date: '2026-10-13', status: 'RESERVED' }),
      expect.objectContaining({ fixedSalaBookingId: fixed.id, date: '2026-10-20', status: 'PENDING_PAYMENT' }),
    ]));
    expect((await sala.availability('2026-10-20')).find((item) => item.startTime === '09:00')).toMatchObject({ reserved: 1, available: 0 });
    const portal = await request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', f.cookie).expect(200);
    expect(portal.body.data.fixedOccurrences).toEqual(expect.arrayContaining([expect.objectContaining({ date: '2026-10-20', status: 'PENDING_PAYMENT' })]));
    await payment('2026-11-20');
    expect(await sala.fixedOccurrenceStates(personId, ['2026-10-20'])).toEqual([expect.objectContaining({ status: 'PENDING_PAYMENT' })]);
    const paid = await prisma.salaPayment.create({ data: { personId, year: 2026, month: 10, paidAt: new Date('2026-10-08'), amount: 1, paymentMethodId, registeredById: professorId, operationId: crypto.randomUUID() } });
    expect(await sala.fixedOccurrenceStates(personId, ['2026-10-20'])).toEqual([expect.objectContaining({ status: 'RESERVED' })]);
    await reverse(paid.id);
    expect(await sala.fixedOccurrenceStates(personId, ['2026-10-20'])).toEqual([expect.objectContaining({ status: 'PENDING_PAYMENT' })]);
  });
  it('cancels only an expired unpaid occurrence and never reactivates it after late payment', async () => {
    const f = await fixture('2026-10-20');
    const fixed = await sala.createFixed({ personId, salaParticipationId: f.participation.id, scheduleSlotId: windowId, serviceTypeId: f.muscle.id, startTime: '09:00', startDate: '2026-09-29' });
    await prisma.fixedSalaBooking.update({ where: { id: fixed.id }, data: { createdAt: new Date('2026-09-01T00:00:00Z') } });
    const first = await sala.fixedOccurrenceStates(personId, ['2026-09-29', '2026-10-20']);
    expect(first).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: '2026-09-29', status: 'CANCELLED', cancelledForNonPayment: true }),
      expect.objectContaining({ date: '2026-10-20', status: 'PENDING_PAYMENT' }),
    ]));
    expect((await sala.availability('2026-09-29')).find((item) => item.startTime === '09:00')?.reserved).toBe(0);
    await sala.fixedOccurrenceStates(personId, ['2026-09-29']);
    expect(await prisma.salaOccurrence.count({ where: { fixedSalaBookingId: fixed.id, date: new Date('2026-09-29') } })).toBe(1);
    await payment('2026-09-29');
    expect(await sala.fixedOccurrenceStates(personId, ['2026-09-29'])).toEqual([expect.objectContaining({ status: 'CANCELLED' })]);
    expect((await prisma.fixedSalaBooking.findUniqueOrThrow({ where: { id: fixed.id } })).endDate).toBeNull();
  });
  function reserve(f: Awaited<ReturnType<typeof fixture>>) {
    return request(app.getHttpServer()).post('/api/portal/sala/reservations').set('Cookie', f.cookie).set('x-csrf-token', f.csrf)
      .send({ date: f.body.date, scheduleSlotId: f.body.scheduleSlotId, startTime: f.body.startTime, serviceTypeId: f.muscle.id });
  }
  it.each(['reservations', 'fixed-bookings'].flatMap(path => ['09:00', '09:30', '09:15', '09:45'].map(startTime => [path, startTime])))('validates planned Portal %s starts at %s in SalaService', async (path, startTime) => {
    const f = await fixture();
    await payment(f.body.date);
    const valid = ['09:00', '09:30'].includes(startTime!);
    const response = await request(app.getHttpServer()).post(`/api/portal/sala/${path}`).set('Cookie', f.cookie).set('x-csrf-token', f.csrf)
      .send({ scheduleSlotId: windowId, serviceTypeId: f.muscle.id, startTime, ...(path === 'reservations' ? { date: f.body.date } : { startDate: f.body.startDate }) }).expect(valid ? 201 : 409);
    if (valid) expect(response.body.data.startTime).toContain(`T${startTime}:00`);
    else {
      expect(response.body.code).toBe('SALA_REQUIRED_SLOTS_UNAVAILABLE');
      expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(0);
      expect(await prisma.fixedSalaBooking.count({ where: { personId } })).toBe(0);
    }
  });
  it.each(['09:15', '09:45'])('rejects a forged Portal fixed change to %s without altering the existing booking', async startTime => {
    const f = await fixture();
    const body = { scheduleSlotId: windowId, serviceTypeId: f.muscle.id, startTime: '09:00', startDate: f.body.startDate };
    const created = await request(app.getHttpServer()).post('/api/portal/sala/fixed-bookings').set('Cookie', f.cookie).set('x-csrf-token', f.csrf).send(body).expect(201);
    const before = await prisma.fixedSalaBooking.findUniqueOrThrow({ where: { id: created.body.data.id } });
    const denied = await request(app.getHttpServer()).post(`/api/portal/sala/fixed-bookings/${before.id}/change`).set('Cookie', f.cookie).set('x-csrf-token', f.csrf).send({ ...body, startTime }).expect(409);
    expect(denied.body.code).toBe('SALA_REQUIRED_SLOTS_UNAVAILABLE');
    expect(await prisma.fixedSalaBooking.findUnique({ where: { id: before.id } })).toEqual(before);
  });
  it('uses Portal CSRF for reservations and fixed bookings when an internal session coexists', async () => {
    const f = await fixture();
    const auth = app.get(AuthService);
    await auth.provisionCredential(professorId, 'ValidPass1!');
    await prisma.internalCredential.update({ where: { internalUserId: professorId }, data: { mustChangePassword: false } });
    const user = await prisma.internalUser.findUniqueOrThrow({ where: { id: professorId } });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(200);
    const internalCookie = (login.headers['set-cookie'][0] as string).split(';')[0]!;
    const portalCookie = f.cookie.split(';')[0]!;
    const bothCookies = `${internalCookie}; ${portalCookie}`;
    expect(f.csrf).not.toBe(login.body.data.csrfToken);
    await payment(f.body.date);
    const body = { date: f.body.date, scheduleSlotId: f.body.scheduleSlotId, startTime: f.body.startTime, serviceTypeId: f.muscle.id };
    const denied = await request(app.getHttpServer()).post('/api/portal/sala/reservations').set('Cookie', bothCookies).set('x-csrf-token', 'invalid-portal-csrf').send(body).expect(403);
    expect(denied.body.code).toBe('CSRF_INVALID');
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(0);
    const reserved = await request(app.getHttpServer()).post('/api/portal/sala/reservations').set('Cookie', bothCookies).set('x-csrf-token', f.csrf).send(body).expect(201);
    expect(reserved.body.data).toMatchObject({ personId, serviceTypeId: f.muscle.id });
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(1);
    const fixedBody = { startDate: f.body.startDate, scheduleSlotId: f.body.scheduleSlotId, startTime: '10:00', serviceTypeId: f.muscle.id };
    const fixed = await request(app.getHttpServer()).post('/api/portal/sala/fixed-bookings').set('Cookie', bothCookies).set('x-csrf-token', f.csrf).send(fixedBody).expect(201);
    expect(fixed.body.data).toMatchObject({ personId, serviceTypeId: f.muscle.id });
    const id = fixed.body.data.id as string;
    await request(app.getHttpServer()).post(`/api/portal/sala/fixed-bookings/${id}/end`).set('Cookie', bothCookies).set('x-csrf-token', f.csrf).send({ endDate: f.body.date }).expect(201);
    expect((await prisma.fixedSalaBooking.findUniqueOrThrow({ where: { id } })).endDate?.toISOString().slice(0, 10)).toBe(f.body.date);
  });
  it('lists only services from the authenticated person plan and rejects a forged reservation with a valid payment', async () => {
    const f = await fixture();
    await payment(f.body.date);
    const listed = await request(app.getHttpServer()).get('/api/portal/sala/services').set('Cookie', f.cookie).expect(200);
    expect(listed.body.data).toEqual([{ id: f.muscle.id, name: 'Musculación', durationMinutes: 60 }]);
    await request(app.getHttpServer()).get('/api/portal/sala/services').expect(401);
    const body = { date: f.body.date, scheduleSlotId: f.body.scheduleSlotId, startTime: f.body.startTime };
    const denied = await request(app.getHttpServer()).post('/api/portal/sala/reservations').set('Cookie', f.cookie).set('x-csrf-token', f.csrf)
      .send({ ...body, serviceTypeId: f.calisthenics.id }).expect(400);
    expect(denied.body.code).toBe('SALA_SERVICE_NOT_INCLUDED_IN_PLAN');
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(0);
    const allowed = await request(app.getHttpServer()).post('/api/portal/sala/reservations').set('Cookie', f.cookie).set('x-csrf-token', f.csrf)
      .send({ ...body, serviceTypeId: f.muscle.id }).expect(201);
    expect(allowed.body.data).toMatchObject({ personId, serviceTypeId: f.muscle.id });
    expect(await prisma.salaPayment.count({ where: { personId } })).toBe(1);
  });
  it('protects fixed creation and changes and preserves the old fixed booking after plan composition changes', async () => {
    const f = await fixture();
    const body = { startDate: f.body.startDate, scheduleSlotId: f.body.scheduleSlotId, startTime: f.body.startTime };
    const denied = await request(app.getHttpServer()).post('/api/portal/sala/fixed-bookings').set('Cookie', f.cookie).set('x-csrf-token', f.csrf)
      .send({ ...body, serviceTypeId: f.calisthenics.id }).expect(400);
    expect(denied.body.code).toBe('SALA_SERVICE_NOT_INCLUDED_IN_PLAN');
    const created = await request(app.getHttpServer()).post('/api/portal/sala/fixed-bookings').set('Cookie', f.cookie).set('x-csrf-token', f.csrf)
      .send({ ...body, serviceTypeId: f.muscle.id }).expect(201);
    const id = created.body.data.id as string;
    const before = await prisma.fixedSalaBooking.findUnique({ where: { id } });
    await sala.updatePlan(planId, { name: 'Plan actualizado', monthlyAmount: 20000, serviceTypeIds: [f.calisthenics.id] });
    const updated = await request(app.getHttpServer()).post(`/api/portal/sala/fixed-bookings/${id}/change`).set('Cookie', f.cookie).set('x-csrf-token', f.csrf)
      .send({ ...body, serviceTypeId: f.muscle.id }).expect(400);
    expect(updated.body.code).toBe('SALA_SERVICE_NOT_INCLUDED_IN_PLAN');
    expect(await prisma.fixedSalaBooking.findUnique({ where: { id } })).toEqual(before);
    const listed = await request(app.getHttpServer()).get('/api/portal/sala/fixed-bookings').set('Cookie', f.cookie).expect(200);
    expect(listed.body.data).toEqual([expect.objectContaining({ id, serviceType: expect.objectContaining({ id: f.muscle.id }) })]);
  });
  it('requires a service and returns no options for a legacy plan or inactive participation', async () => {
    const f = await fixture();
    await payment(f.body.date);
    const body = { date: f.body.date, scheduleSlotId: f.body.scheduleSlotId, startTime: f.body.startTime };
    const denied = await request(app.getHttpServer()).post('/api/portal/sala/reservations').set('Cookie', f.cookie).set('x-csrf-token', f.csrf).send(body).expect(400);
    expect(denied.body.code).toBe('SALA_SERVICE_REQUIRED');
    await prisma.salaPlanService.deleteMany({ where: { planId } });
    const legacy = await request(app.getHttpServer()).get('/api/portal/sala/services').set('Cookie', f.cookie).expect(200);
    expect(legacy.body.data).toEqual([]);
    await prisma.salaParticipation.update({ where: { id: f.participation.id }, data: { endDate: new Date() } });
    const inactive = await request(app.getHttpServer()).get('/api/portal/sala/services').set('Cookie', f.cookie).expect(200);
    expect(inactive.body.data).toEqual([]);
  });
  it.each([
    ['2026-10-15', '09:00', '12:49:00Z', 400, 'PORTAL_DATE_OUT_OF_RANGE'],
    ['2026-10-16', '09:00', '12:49:00Z', 400, 'PORTAL_SALA_TIME_PASSED'],
    ['2026-10-16', '09:30', '12:54:59.999Z', 201, null],
    ['2026-10-16', '09:30', '12:55:00Z', 201, null],
    ['2026-10-16', '09:30', '12:55:00.001Z', 400, 'PORTAL_SALA_TIME_PASSED'],
    ['2026-10-16', '10:00', '12:49:00Z', 201, null],
    ['2026-11-15', '09:00', '12:49:00Z', 201, null],
    ['2026-11-16', '09:00', '12:49:00Z', 400, 'PORTAL_DATE_OUT_OF_RANGE'],
  ])('applies Portal time bounds to %s at %s with current UTC time %s', async (date, startTime, now, status, code) => {
    const f = await fixture(date as string);
    await prisma.salaServiceType.update({ where: { id: f.muscle.id }, data: { durationMinutes: 45 } });
    // 09:30–10:15 Buenos Aires: 12:55 UTC leaves exactly 20 minutes.
    reservationNow.mockReturnValue(new Date(`2026-10-16T${now}`));
    await payment(f.body.date);
    f.body.startTime = startTime as string;
    const result = await reserve(f).expect(status as number);
    if (code) expect(result.body.code).toBe(code);
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(status === 201 ? 1 : 0);
    if (status !== 201) expect(await prisma.salaOccurrence.count({ where: { personId } })).toBe(0);
    if (status === 201) expect(result.body.data.serviceDurationMinutes).toBe(45);
  });
  it.each([
    ['12:40:00Z', 201],
    ['12:40:00.001Z', 400],
    ['13:00:00Z', 400],
  ])('applies the 20-minute minimum to the legacy start fallback at %s', async (now, status) => {
    const f = await fixture('2026-10-16');
    await payment(f.body.date);
    // The fallback resolves to 09:00–10:00 Buenos Aires.
    reservationNow.mockReturnValue(new Date(`2026-10-16T${now}`));
    const result = await request(app.getHttpServer()).post('/api/portal/sala/reservations').set('Cookie', f.cookie).set('x-csrf-token', f.csrf)
      .send({ date: f.body.date, scheduleSlotId: windowId, serviceTypeId: f.muscle.id }).expect(status as number);
    if (status === 400) {
      expect(result.body.code).toBe('PORTAL_SALA_TIME_PASSED');
      expect(result.body.message).toBe('Ese horario ya no admite reservas porque quedan menos de 20 minutos de actividad. Elegí otro horario.');
      expect(await prisma.salaOccurrence.count({ where: { personId } })).toBe(0);
    }
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(status === 201 ? 1 : 0);
  });
  it('rejects past Portal availability while preserving internal retrospective availability', async () => {
    const f = await fixture('2026-10-15');
    const result = await request(app.getHttpServer()).get('/api/portal/sala/availability?date=2026-10-15').set('Cookie', f.cookie).expect(400);
    expect(result.body.code).toBe('PORTAL_DATE_OUT_OF_RANGE');
    expect(await sala.availability('2026-10-15')).not.toHaveLength(0);
  });
  it('keeps future active and cancelled reservations until their actual start, with historical fallback', async () => {
    const f = await fixture('2026-10-16');
    const active = await sala.createReservation({ personId, salaParticipationId: f.participation.id, scheduleSlotId: windowId, date: f.body.date, serviceTypeId: f.muscle.id, startTime: '10:00' });
    const cancelled = await sala.createReservation({ personId, salaParticipationId: f.participation.id, scheduleSlotId: windowId, date: f.body.date, serviceTypeId: f.muscle.id, startTime: '09:00' });
    await sala.cancelReservation(cancelled.id);
    // The real activity start differs from the window start.
    await prisma.oneOffReservation.update({ where: { id: cancelled.id }, data: { startTime: new Date('1970-01-01T09:30:00Z') } });
    reservationNow.mockReturnValue(new Date('2026-10-16T12:15:00Z'));
    const visible = await request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', f.cookie).expect(200);
    expect(visible.body.data.reservations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: active.id, cancelledAt: null }),
      expect.objectContaining({ id: cancelled.id, cancelledAt: expect.any(String) }),
    ]));
    reservationNow.mockReturnValue(new Date('2026-10-16T12:30:00Z'));
    const expired = await request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', f.cookie).expect(200);
    expect(expired.body.data.reservations.map((item: { id: string }) => item.id)).toEqual([active.id]);
    await prisma.oneOffReservation.update({ where: { id: cancelled.id }, data: { startTime: null } });
    reservationNow.mockReturnValue(new Date('2026-10-16T11:59:00Z'));
    const legacy = await request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', f.cookie).expect(200);
    expect(legacy.body.data.reservations).toEqual(expect.arrayContaining([expect.objectContaining({ id: cancelled.id, startTime: expect.stringContaining('T09:00:00') })]));
    expect((await prisma.oneOffReservation.findUniqueOrThrow({ where: { id: cancelled.id } })).cancelledAt).not.toBeNull();
  });
  it('uses Argentina midnight for the operational day and month', () => {
    operationalDate.mockRestore();
    const portal = app.get(PortalService) as unknown as { todayOperational(): string };
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-10-16T02:59:59Z'));
      expect(portal.todayOperational()).toBe('2026-10-15');
      jest.setSystemTime(new Date('2026-10-16T03:00:00Z'));
      expect(portal.todayOperational()).toBe('2026-10-16');
      jest.setSystemTime(new Date('2026-11-01T02:59:59Z'));
      expect(portal.todayOperational()).toBe('2026-10-31');
    } finally {
      jest.useRealTimers();
    }
  });
  it.each(['2026-10-01', '2026-10-10', '2026-10-15'])('allows the unpaid reserved date %s in the first fortnight', async date => {
    operationalDate.mockReturnValue(date === '2026-10-01' ? date : '2026-10-05');
    const f = await fixture(date);
    await reserve(f).expect(201);
    expect(await prisma.salaPayment.count({ where: { personId } })).toBe(0);
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(1);
  });
  it.each(['2026-10-16', '2026-10-20', '2026-10-25', '2026-10-31'])('blocks the unpaid reserved date %s even when today is October 5', async date => {
    operationalDate.mockReturnValue('2026-10-05');
    const f = await fixture(date);
    const denied = await reserve(f).expect(403);
    expect(denied.body).toMatchObject({
      statusCode: 403, code: 'PORTAL_SALA_PAYMENT_REQUIRED', details: { year: 2026, month: 10 },
      message: 'Para reservar en octubre necesitás tener registrado el pago de octubre.',
    });
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(0);
  });
  it.each(['2026-10-05', '2026-10-15', '2026-10-16', '2026-10-20', '2026-10-25', '2026-10-31'])('allows the paid reserved date %s when today is October 5', async date => {
    operationalDate.mockReturnValue('2026-10-05');
    const f = await fixture(date);
    await payment(date);
    await reserve(f).expect(201);
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(1);
  });
  it.each(['2026-11-05', '2026-11-15'])('allows an unpaid future-month date %s in the first fortnight', async date => {
    operationalDate.mockReturnValue('2026-10-20');
    const f = await fixture(date);
    await reserve(f).expect(201);
    expect(await prisma.salaPayment.count({ where: { personId } })).toBe(0);
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(1);
  });
  it.each(['2026-11-16', '2026-11-20'])('blocks an unpaid future-month date %s in the second fortnight', async date => {
    operationalDate.mockReturnValue('2026-10-25');
    const f = await fixture(date);
    const denied = await reserve(f).expect(403);
    expect(denied.body).toMatchObject({ code: 'PORTAL_SALA_PAYMENT_REQUIRED', details: { year: 2026, month: 11 } });
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(0);
  });
  it('allows a paid future-month date in the second fortnight', async () => {
    operationalDate.mockReturnValue('2026-10-25');
    const f = await fixture('2026-11-20');
    await payment(f.body.date);
    await reserve(f).expect(201);
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(1);
  });
  it.each([
    ['2026-10-16', 201], ['2026-11-15', 201],
    ['2026-10-15', 400], ['2026-11-16', 400],
  ])('keeps the operational 30-day window inclusive for %s', async (date, status) => {
    const f = await fixture(date);
    await payment(date);
    const result = await reserve(f).expect(status);
    if (status === 400) expect(result.body.code).toBe('PORTAL_DATE_OUT_OF_RANGE');
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(status === 201 ? 1 : 0);
  });

  it('allows the same Portal reservation after registering its month from the active Plan', async () => {
    const f = await fixture();
    const denied = await reserve(f).expect(403);
    expect(denied.body.code).toBe('PORTAL_SALA_PAYMENT_REQUIRED');
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(0);
    const method = await prisma.paymentMethod.create({ data: { name: `Portal manual ${crypto.randomUUID()}` } });
    paymentMethodId = method.id;
    const [year, month] = f.body.date.split('-').map(Number);
    const registered = await sala.registerPlanPayments({ personId, paidAt: '2020-01-01', paymentMethodId, periods: [{ year: year!, month: month!, amount: '20000', operationId: crypto.randomUUID() }] }, professorId);
    expect(registered.payments[0]!.amount.toString()).toBe('20000');
    await reserve(f).expect(201);
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(1);
  });
  it('requires payment for the requested month and creates no reservation without it', async () => {
    const f = await fixture();
    const denied = await reserve(f).expect(403);
    const day = new Date(f.body.date);
    expect(denied.body).toMatchObject({ code: 'PORTAL_SALA_PAYMENT_REQUIRED', details: { year: day.getUTCFullYear(), month: day.getUTCMonth() + 1 } });
    const month = new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: 'UTC' }).format(day);
    expect(denied.body.message).toBe(`Para reservar en ${month} necesitás tener registrado el pago de ${month}.`);
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(0);
  });
  it('accepts the matching period regardless of cash date or amount and preserves a reservation after reversal', async () => {
    const f = await fixture();
    const paid = await payment(f.body.date);
    const created = await reserve(f).expect(201);
    const id = created.body.data.id as string;
    const before = await prisma.oneOffReservation.findUniqueOrThrow({ where: { id } });
    await reverse(paid.id);
    expect(await prisma.oneOffReservation.findUniqueOrThrow({ where: { id } })).toEqual(before);
    await reserve(f).expect(403);
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(1);
    // Availability remains available even after reversal.
    await request(app.getHttpServer()).get(`/api/portal/sala/availability?date=${f.body.date}`).set('Cookie', f.cookie).expect(200);
  });
  it('still allows cancellation after reversal', async () => {
    // Cancellation uses the real instant; keep its booking future while controlling payment eligibility.
    const future = new Date();
    future.setUTCMonth(future.getUTCMonth() + 1, 20);
    const date = future.toISOString().slice(0, 10);
    operationalDate.mockReturnValue(`${date.slice(0, 7)}-16`);
    const f = await fixture(date);
    const paid = await payment(date);
    const created = await reserve(f).expect(201);
    await reverse(paid.id);
    await request(app.getHttpServer()).post(`/api/portal/sala/reservations/${created.body.data.id}/cancel`).set('Cookie', f.cookie).set('x-csrf-token', f.csrf).expect(200);
    expect((await prisma.oneOffReservation.findUniqueOrThrow({ where: { id: created.body.data.id } })).cancelledAt).not.toBeNull();
  });
  it('rejects a valid payment for another month', async () => {
    const f = await fixture();
    const other = new Date(f.body.date); other.setUTCMonth(other.getUTCMonth() + 1, 1);
    await payment(other.toISOString().slice(0, 10));
    const denied = await reserve(f).expect(403);
    expect(denied.body.code).toBe('PORTAL_SALA_PAYMENT_REQUIRED');
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(0);
  });
  it.each([['2026-11-10', 201], ['2026-11-20', 403]])('treats reversed payment as pending for reserved date %s', async (date, status) => {
    operationalDate.mockReturnValue('2026-10-25');
    const f = await fixture(date);
    const paid = await payment(f.body.date);
    await reverse(paid.id);
    expect(await prisma.salaPayment.findUniqueOrThrow({ where: { id: paid.id } })).toEqual(paid);
    const result = await reserve(f).expect(status);
    if (status === 403) expect(result.body).toMatchObject({ code: 'PORTAL_SALA_PAYMENT_REQUIRED', details: { year: 2026, month: 11 } });
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(status === 201 ? 1 : 0);
  });
  it.each(['2026-10-05', '2026-10-15', '2026-10-16', '2026-10-25'])('reports current-month payment state independently of operational day %s', async today => {
    operationalDate.mockReturnValue(today);
    const f = await fixture();
    const pending = await request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', f.cookie).expect(200);
    expect(pending.body.data.paymentState).toBe('PENDING');
    const paid = await payment('2026-10-01');
    const before = await request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', f.cookie).expect(200);
    expect(before.body.data.paymentState).toBe('PAID');
    await reverse(paid.id);
    const after = await request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', f.cookie).expect(200);
    expect(after.body.data.paymentState).toBe('PENDING');
  });
  it.each([Role.PROFESSOR, Role.ADMINISTRATIVE, Role.GENERAL_ADMIN])('allows an internal reservation as %s without any monthly payment', async role => {
    const f = await fixture();
    const auth = app.get(AuthService);
    if (role !== Role.PROFESSOR) await prisma.internalUserRole.create({ data: { internalUserId: professorId, role } });
    await auth.provisionCredential(professorId, 'ValidPass1!');
    await prisma.internalCredential.update({ where: { internalUserId: professorId }, data: { mustChangePassword: false } });
    const user = await prisma.internalUser.findUniqueOrThrow({ where: { id: professorId } });
    await prisma.internalUserRole.deleteMany({ where: { internalUserId: professorId, role: { not: role } } });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'ValidPass1!' }).expect(200);
    const created = await request(app.getHttpServer()).post('/api/sala/reservations').set('Cookie', login.headers['set-cookie'][0] as string).set('x-csrf-token', login.body.data.csrfToken as string)
      .send({ personId, salaParticipationId: f.participation.id, date: f.body.date, scheduleSlotId: f.body.scheduleSlotId, startTime: f.body.startTime, serviceTypeId: f.muscle.id }).expect(201);
    expect(created.body.data).toMatchObject({ personId, serviceTypeId: f.muscle.id });
    expect(await prisma.salaPayment.count({ where: { personId } })).toBe(0);
  });

  it('allows Portal fixed creation, modification and ending without payment', async () => {
    const f = await fixture();
    const body = { startDate: f.body.startDate, scheduleSlotId: f.body.scheduleSlotId, startTime: f.body.startTime, serviceTypeId: f.muscle.id };
    const created = await request(app.getHttpServer()).post('/api/portal/sala/fixed-bookings').set('Cookie', f.cookie).set('x-csrf-token', f.csrf).send(body).expect(201);
    const changed = await request(app.getHttpServer()).post(`/api/portal/sala/fixed-bookings/${created.body.data.id}/change`).set('Cookie', f.cookie).set('x-csrf-token', f.csrf)
      .send({ ...body, startTime: '09:30' }).expect(201);
    await request(app.getHttpServer()).post(`/api/portal/sala/fixed-bookings/${changed.body.data.id}/end`).set('Cookie', f.cookie).set('x-csrf-token', f.csrf)
      .send({ endDate: f.body.date }).expect(201);
    expect(await prisma.salaPayment.count({ where: { personId } })).toBe(0);
  });

  async function fixedFixture(date = '2026-10-20') {
    // Freeze Sala's unpaid projection too; Portal start boundaries use reservationNow.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    jest.setSystemTime(new Date('2026-10-16T11:00:00Z'));
    const f = await fixture(date);
    const fixed = await sala.createFixed({ personId, salaParticipationId: f.participation.id, scheduleSlotId: windowId, serviceTypeId: f.muscle.id, startTime: '10:00', startDate: date });
    const cancelDate = (target = date, id = fixed.id) => request(app.getHttpServer()).post(`/api/portal/sala/fixed-bookings/${id}/occurrences/${target}/cancel`).set('Cookie', f.cookie).set('x-csrf-token', f.csrf);
    return { ...f, fixed, cancelDate };
  }
  it.each([false, true])('cancels one future fixed date, preserves recurrence and releases only its capacity (paid=%s)', async paid => {
    const f = await fixedFixture();
    if (paid) await payment('2026-10-20');
    const before = await prisma.fixedSalaBooking.findUniqueOrThrow({ where: { id: f.fixed.id } });
    expect(await sala.fixedOccurrenceStates(personId, ['2026-10-20'])).toEqual([expect.objectContaining({ status: paid ? 'RESERVED' : 'PENDING_PAYMENT' })]);
    const occupied = (date: string) => sala.availability(date).then(rows => rows.filter(row => row.startTime >= '10:00' && row.startTime < '11:00').map(row => row.reserved));
    expect(await occupied('2026-10-20')).toEqual([1, 1, 1, 1]);
    const response = await f.cancelDate().expect(200);
    expect(response.body.data).toEqual({ id: expect.any(String), fixedSalaBookingId: f.fixed.id, date: '2026-10-20', status: 'CANCELLED' });
    expect(await prisma.fixedSalaBooking.findUniqueOrThrow({ where: { id: f.fixed.id } })).toEqual(before);
    expect(await occupied('2026-10-20')).toEqual([0, 0, 0, 0]);
    expect(await occupied('2026-10-27')).toEqual([1, 1, 1, 1]);
    expect(await sala.fixedOccurrenceStates(personId, ['2026-10-20', '2026-10-27'])).toEqual([
      expect.objectContaining({ date: '2026-10-20', status: 'CANCELLED', cancelledForNonPayment: false }),
      expect.objectContaining({ date: '2026-10-27', status: paid ? 'RESERVED' : 'PENDING_PAYMENT' }),
    ]);
    expect((await f.cancelDate().expect(200)).body).toEqual(response.body);
    expect(await prisma.salaOccurrence.count({ where: { fixedSalaBookingId: f.fixed.id } })).toBe(1);
    expect(await prisma.salaOccurrence.findFirstOrThrow({ where: { fixedSalaBookingId: f.fixed.id } })).toMatchObject({ createdBy: null, lastModifiedBy: null, cancelledForNonPaymentAt: null });
  });
  it.each(['12:59:59Z', '13:00:00Z', '13:00:01Z'])('enforces the exact fixed occurrence start at UTC %s', async time => {
    const f = await fixedFixture('2026-10-16');
    reservationNow.mockReturnValue(new Date(`2026-10-16T${time}`));
    const allowed = time === '12:59:59Z';
    const result = await f.cancelDate().expect(allowed ? 200 : 409);
    if (!allowed) expect(result.body.code).toBe('PORTAL_FIXED_OCCURRENCE_STARTED');
    expect(await prisma.salaOccurrence.count({ where: { personId } })).toBe(allowed ? 1 : 0);
  });
  it.each(['2026-10-21', '2026-10-13', '2026-11-03', '2026-02-30', 'invalid'])('rejects invalid fixed occurrence date %s without materialization', async date => {
    const f = await fixedFixture();
    await prisma.fixedSalaBooking.update({ where: { id: f.fixed.id }, data: { endDate: new Date('2026-10-27') } });
    expect((await f.cancelDate(date).expect(400)).body.code).toBe('PORTAL_FIXED_OCCURRENCE_INVALID');
    expect(await prisma.salaOccurrence.count({ where: { personId } })).toBe(0);
  });
  it('checks ownership and CSRF without altering the booking', async () => {
    const f = await fixedFixture();
    const other = await prisma.person.create({ data: { firstName: 'Otra', lastName: 'Sintética', dni: '88990011', normalizedDni: '88990011', phone: '3515550000', birthDate: new Date('1990-01-01') } });
    try {
      await prisma.fixedSalaBooking.update({ where: { id: f.fixed.id }, data: { personId: other.id } });
      const before = await prisma.fixedSalaBooking.findUniqueOrThrow({ where: { id: f.fixed.id } });
      expect((await f.cancelDate().expect(403)).body.code).toBe('PORTAL_RESOURCE_FORBIDDEN');
      expect(await prisma.fixedSalaBooking.findUniqueOrThrow({ where: { id: f.fixed.id } })).toEqual(before);
      expect(await prisma.salaOccurrence.count({ where: { fixedSalaBookingId: f.fixed.id } })).toBe(0);
      await request(app.getHttpServer()).post(`/api/portal/sala/fixed-bookings/${f.fixed.id}/occurrences/2026-10-20/cancel`).set('Cookie', f.cookie).expect(403);
    } finally {
      await prisma.fixedSalaBooking.update({ where: { id: f.fixed.id }, data: { personId } });
      await prisma.person.delete({ where: { id: other.id } });
    }
  });
  it.each(['RESERVED', 'ATTENDED', 'ABSENT', 'CANCELLED'] as const)('handles materialized %s without losing provenance or correcting attendance', async status => {
    const f = await fixedFixture();
    const occurrence = await prisma.salaOccurrence.create({ data: { personId, scheduleSlotId: windowId, fixedSalaBookingId: f.fixed.id, date: new Date('2026-10-20'), origin: 'FIXED', status, createdBy: professorId, lastModifiedBy: professorId, cancelledForNonPaymentAt: status === 'CANCELLED' ? new Date('2026-10-01') : null } });
    const allowed = status === 'RESERVED' || status === 'CANCELLED';
    const result = await f.cancelDate().expect(allowed ? 200 : 409);
    if (!allowed) expect(result.body.code).toBe('PORTAL_FIXED_OCCURRENCE_NOT_CANCELLABLE');
    const stored = await prisma.salaOccurrence.findUniqueOrThrow({ where: { id: occurrence.id } });
    if (status === 'RESERVED') expect(stored).toMatchObject({ status: 'CANCELLED', createdBy: professorId, lastModifiedBy: null, cancelledForNonPaymentAt: null });
    else expect(stored).toEqual(occurrence);
  });
  it('serializes simultaneous cancellation requests into a single occurrence', async () => {
    const f = await fixedFixture();
    const results = await Promise.all([f.cancelDate(), f.cancelDate()]);
    expect(results.map(result => result.status)).toEqual([200, 200]);
    expect(results[0]!.body).toEqual(results[1]!.body);
    expect(await prisma.salaOccurrence.count({ where: { fixedSalaBookingId: f.fixed.id } })).toBe(1);
  });
  it('projects a cancelled future fixed date until its exact start and keeps the recurring configuration', async () => {
    const f = await fixedFixture('2026-10-16');
    await f.cancelDate().expect(200);
    const projection = () => request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', f.cookie).expect(200);
    reservationNow.mockReturnValue(new Date('2026-10-16T12:59:59Z'));
    expect((await projection()).body.data.fixedOccurrences).toEqual(expect.arrayContaining([expect.objectContaining({ date: '2026-10-16', status: 'CANCELLED' })]));
    for (const time of ['13:00:00Z', '13:00:01Z']) {
      reservationNow.mockReturnValue(new Date(`2026-10-16T${time}`));
      const result = (await projection()).body.data;
      expect(result.fixedOccurrences.some((item: { date: string }) => item.date === '2026-10-16')).toBe(false);
      expect(result.fixed).toEqual([expect.objectContaining({ id: f.fixed.id, endDate: null })]);
    }
  });

  it.each([
    ['09:59:59', 200], ['10:00:00', 403], ['10:00:01', 403],
  ])('cancels a same-day reservation only before the actual start: %s', async (time, status) => {
    operationalDate.mockReturnValue('2026-10-20');
    const f = await fixture('2026-10-20');
    const row = await sala.createReservation({ personId, salaParticipationId: f.participation.id, scheduleSlotId: windowId, serviceTypeId: f.muscle.id, date: '2026-10-20', startTime: '10:00' });
    reservationNow.mockReturnValue(new Date(`2026-10-20T${time}-03:00`));
    const response = await request(app.getHttpServer()).post(`/api/portal/sala/reservations/${row.id}/cancel`).set('Cookie', f.cookie).set('x-csrf-token', f.csrf).expect(status);
    const persisted = await prisma.oneOffReservation.findUniqueOrThrow({ where: { id: row.id } });
    if (status === 200) expect(persisted.cancelledAt).not.toBeNull();
    else { expect(response.body.code).toBe('PORTAL_RESOURCE_FORBIDDEN'); expect(persisted.cancelledAt).toBeNull(); }
  });
  it('keeps future reservations cancelable, including historical schedule-time fallback', async () => {
    operationalDate.mockReturnValue('2026-10-20');
    const f = await fixture('2026-10-21');
    const row = await sala.createReservation({ personId, salaParticipationId: f.participation.id, scheduleSlotId: windowId, serviceTypeId: f.muscle.id, date: '2026-10-21', startTime: '10:00' });
    await prisma.oneOffReservation.update({ where: { id: row.id }, data: { startTime: null } });
    reservationNow.mockReturnValue(new Date('2026-10-20T10:00:00-03:00'));
    await request(app.getHttpServer()).post(`/api/portal/sala/reservations/${row.id}/cancel`).set('Cookie', f.cookie).set('x-csrf-token', f.csrf).expect(200);
    expect((await prisma.oneOffReservation.findUniqueOrThrow({ where: { id: row.id } })).cancelledAt).not.toBeNull();
  });
  it('does not reveal or cancel another person reservation', async () => {
    operationalDate.mockReturnValue('2026-10-20');
    const f = await fixture('2026-10-20');
    const dni = crypto.randomUUID();
    const other = await prisma.person.create({ data: { firstName: 'Otra', lastName: 'Persona sintética', dni, normalizedDni: dni, phone: '3515550000', birthDate: new Date('1990-01-01') } });
    try {
      const participation = await sala.join({ personId: other.id, mainProfessorId: professorId, planId, startDate: '2020-01-01' });
      const row = await sala.createReservation({ personId: other.id, salaParticipationId: participation.id, scheduleSlotId: windowId, serviceTypeId: f.muscle.id, date: '2026-10-20', startTime: '10:00' });
      reservationNow.mockReturnValue(new Date('2026-10-20T09:59:59-03:00'));
      const response = await request(app.getHttpServer()).post(`/api/portal/sala/reservations/${row.id}/cancel`).set('Cookie', f.cookie).set('x-csrf-token', f.csrf).expect(403);
      expect(response.body.code).toBe('PORTAL_RESOURCE_FORBIDDEN');
      expect((await prisma.oneOffReservation.findUniqueOrThrow({ where: { id: row.id } })).cancelledAt).toBeNull();
    } finally {
      await prisma.oneOffReservation.deleteMany({ where: { personId: other.id } });
      await prisma.salaParticipation.deleteMany({ where: { personId: other.id } });
      await prisma.person.delete({ where: { id: other.id } });
    }
  });

});
