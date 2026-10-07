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

  async function fixture() {
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
    const day = new Date(); day.setUTCDate(day.getUTCDate() + 1);
    const date = day.toISOString().slice(0, 10);
    const weekday = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][day.getUTCDay()] as SalaWeekday;
    const window = await sala.createSlot({ weekday, startTime: '09:00', durationMinutes: 120, specificCapacity: 5 });
    windowId = window.id;
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
    // Cancellation and availability remain available even after reversal.
    await request(app.getHttpServer()).get(`/api/portal/sala/availability?date=${f.body.date}`).set('Cookie', f.cookie).expect(200);
    await request(app.getHttpServer()).post(`/api/portal/sala/reservations/${id}/cancel`).set('Cookie', f.cookie).set('x-csrf-token', f.csrf).expect(200);
  });
  it('rejects a valid payment for another month', async () => {
    const f = await fixture();
    const other = new Date(f.body.date); other.setUTCMonth(other.getUTCMonth() + 1, 1);
    await payment(other.toISOString().slice(0, 10));
    const denied = await reserve(f).expect(403);
    expect(denied.body.code).toBe('PORTAL_SALA_PAYMENT_REQUIRED');
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(0);
  });
  it('rejects a reversed payment for the requested period', async () => {
    const f = await fixture();
    const paid = await payment(f.body.date);
    await reverse(paid.id);
    const denied = await reserve(f).expect(403);
    expect(denied.body.code).toBe('PORTAL_SALA_PAYMENT_REQUIRED');
    expect(await prisma.oneOffReservation.count({ where: { personId } })).toBe(0);
  });
  it('does not show PAID for a reversed payment in the current month', async () => {
    const f = await fixture();
    const paid = await payment(new Date().toISOString().slice(0, 10));
    const before = await request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', f.cookie).expect(200);
    expect(before.body.data.paymentState).toBe('PAID');
    await reverse(paid.id);
    const after = await request(app.getHttpServer()).get('/api/portal/sala').set('Cookie', f.cookie).expect(200);
    expect(after.body.data.paymentState).toBe('PENDING');
  });
  it('allows an internal reservation without any monthly payment', async () => {
    const f = await fixture();
    const auth = app.get(AuthService);
    await prisma.internalUserRole.create({ data: { internalUserId: professorId, role: Role.GENERAL_ADMIN } });
    await auth.provisionCredential(professorId, 'ValidPass1!');
    await prisma.internalCredential.update({ where: { internalUserId: professorId }, data: { mustChangePassword: false } });
    const user = await prisma.internalUser.findUniqueOrThrow({ where: { id: professorId } });
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
