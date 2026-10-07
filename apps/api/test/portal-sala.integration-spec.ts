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
  let paymentMethodId: string;
  let operationalDate: jest.SpyInstance<string, []>;

  beforeEach(() => {
    // A local seam controls only Portal's date rules, leaving sessions and timers alone.
    operationalDate = jest.spyOn(app.get(PortalService) as unknown as { todayOperational(): string }, 'todayOperational').mockReturnValue('2026-10-16');
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
    operationalDate.mockRestore();
    if (personId) {
      await prisma.salaPaymentReversal.deleteMany({ where: { payment: { personId } } });
      await prisma.salaPayment.deleteMany({ where: { personId } });
      await prisma.oneOffReservation.deleteMany({ where: { personId } });
      await prisma.fixedSalaBooking.deleteMany({ where: { personId } });
      await prisma.session.deleteMany({ where: { personId } });
      await prisma.salaCharge.deleteMany({ where: { personId } });
      await prisma.salaParticipation.deleteMany({ where: { personId } });
      await prisma.portalCredential.deleteMany({ where: { personId } });
      await prisma.person.deleteMany({ where: { id: personId } });
    }
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
  function reserve(f: Awaited<ReturnType<typeof fixture>>) {
    return request(app.getHttpServer()).post('/api/portal/sala/reservations').set('Cookie', f.cookie).set('x-csrf-token', f.csrf)
      .send({ date: f.body.date, scheduleSlotId: f.body.scheduleSlotId, startTime: f.body.startTime, serviceTypeId: f.muscle.id });
  }
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
    const registered = await sala.registerPlanPayments({ personId, paidAt: '2020-01-01', paymentMethodId, periods: [{ year: year!, month: month!, operationId: crypto.randomUUID() }] }, professorId);
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
      .send({ ...body, startTime: '09:15' }).expect(201);
    await request(app.getHttpServer()).post(`/api/portal/sala/fixed-bookings/${changed.body.data.id}/end`).set('Cookie', f.cookie).set('x-csrf-token', f.csrf)
      .send({ endDate: f.body.date }).expect(201);
    expect(await prisma.salaPayment.count({ where: { personId } })).toBe(0);
  });

});
