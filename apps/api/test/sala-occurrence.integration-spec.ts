import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role, SalaOccurrenceOrigin, SalaOccurrenceStatus, type SalaWeekday } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SalaService } from '../src/sala/sala.service';
import { InternalUserService } from '../src/team/internal-user.service';

describe('SalaOccurrence persistence and API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sala: SalaService;
  let users: InternalUserService;
  let auth: AuthService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    sala = app.get(SalaService);
    users = app.get(InternalUserService);
    auth = app.get(AuthService);
  });

  afterEach(async () => {
    await prisma.salaOccurrence.deleteMany();
    await prisma.oneOffReservation.deleteMany();
    await prisma.fixedSalaBooking.deleteMany();
    await prisma.salaParticipation.deleteMany();
    await prisma.salaScheduleException.deleteMany();
    await prisma.salaScheduleSlot.deleteMany();
    await prisma.salaPlan.deleteMany();
    await prisma.salaConfiguration.deleteMany();
    await prisma.session.deleteMany();
    await prisma.internalCredential.deleteMany();
    await prisma.internalUserRole.deleteMany();
    await prisma.internalUser.deleteMany();
    await prisma.portalCredential.deleteMany();
    await prisma.person.deleteMany();
  });

  afterAll(() => app.close());

  async function setup(date = '2026-08-27', weekday: SalaWeekday = 'THURSDAY') {
    const suffix = randomUUID();
    const actor = await users.create({ firstName: 'Agenda', lastName: 'Operator', email: `operator-${suffix}@athleta.test`, roles: [Role.ADMINISTRATIVE] });
    const professor = await users.create({ firstName: 'Professor', lastName: 'Synthetic', email: `professor-${suffix}@athleta.test`, roles: [Role.PROFESSOR] });
    const dni = `${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    const person = await prisma.person.create({ data: { firstName: 'Persona', lastName: 'Occurrence', dni, normalizedDni: dni, phone: '3515550101', birthDate: new Date('1990-01-01T00:00:00Z') } });
    const plan = await prisma.salaPlan.create({ data: { name: `Plan-${suffix}`, monthlyAmount: 1000 } });
    const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' });
    const slot = await sala.createSlot({ weekday, startTime: '09:00', durationMinutes: 60, specificCapacity: 5 });
    return { actor, person, participation, slot, date };
  }

  it('projects past fixed bookings as RESERVED and materializes manual corrections with audit data', async () => {
    const fixture = await setup();
    const fixed = await sala.createFixed({ personId: fixture.person.id, salaParticipationId: fixture.participation.id, scheduleSlotId: fixture.slot.id, startDate: '2026-01-01', confirmOverbooking: true });

    expect((await sala.agenda(fixture.date))[0]?.people[0]).toMatchObject({ origin: 'FIXED', status: 'RESERVED', isMaterialized: false });
    const attended = await sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: fixture.date, status: SalaOccurrenceStatus.ATTENDED }, fixture.actor.id);
    expect(attended).toMatchObject({ status: 'ATTENDED', createdBy: fixture.actor.id, lastModifiedBy: fixture.actor.id, fixedSalaBookingId: fixed.id });
    const firstModifiedAt = attended.lastModifiedAt;
    const absent = await sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: fixture.date, status: SalaOccurrenceStatus.ABSENT }, fixture.actor.id);
    expect(absent.status).toBe('ABSENT');
    expect(absent.lastModifiedAt.getTime()).toBeGreaterThanOrEqual(firstModifiedAt.getTime());
    expect((await prisma.fixedSalaBooking.findUniqueOrThrow({ where: { id: fixed.id } })).endDate).toBeNull();
    expect((await sala.agenda('2026-09-03'))[0]?.people[0]?.status).toBe('RESERVED');
  });

  it('cancels one fixed occurrence without ending its recurrence', async () => {
    const fixture = await setup();
    const fixed = await sala.createFixed({ personId: fixture.person.id, salaParticipationId: fixture.participation.id, scheduleSlotId: fixture.slot.id, startDate: '2026-01-01', confirmOverbooking: true });
    await sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: fixture.date, status: SalaOccurrenceStatus.CANCELLED }, fixture.actor.id);
    expect((await sala.agenda(fixture.date))[0]?.people[0]?.status).toBe('CANCELLED');
    expect((await sala.agenda('2026-09-03'))[0]?.people[0]?.status).toBe('RESERVED');
    expect((await prisma.fixedSalaBooking.findUniqueOrThrow({ where: { id: fixed.id } })).endDate).toBeNull();
  });

  it('uses explicit occurrence state as the authority over a one-off planning source', async () => {
    const fixture = await setup();
    const reservation = await sala.createReservation({ personId: fixture.person.id, salaParticipationId: fixture.participation.id, scheduleSlotId: fixture.slot.id, date: fixture.date, confirmOverbooking: true });
    await sala.cancelReservation(reservation.id);
    expect((await sala.agenda(fixture.date))[0]?.people[0]?.status).toBe('CANCELLED');
    await sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: fixture.date, status: SalaOccurrenceStatus.ATTENDED }, fixture.actor.id);
    expect((await sala.agenda(fixture.date))[0]?.people[0]).toMatchObject({ origin: 'ONE_OFF', status: 'ATTENDED', oneOffReservationId: reservation.id });
  });

  it('keeps one persisted occurrence under concurrent corrections', async () => {
    const fixture = await setup();
    await sala.createFixed({ personId: fixture.person.id, salaParticipationId: fixture.participation.id, scheduleSlotId: fixture.slot.id, startDate: '2026-01-01', confirmOverbooking: true });
    await Promise.all([
      sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: fixture.date, status: SalaOccurrenceStatus.ATTENDED }, fixture.actor.id),
      sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: fixture.date, status: SalaOccurrenceStatus.ABSENT }, fixture.actor.id),
    ]);
    expect(await prisma.salaOccurrence.count({ where: { personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: new Date(`${fixture.date}T00:00:00Z`) } })).toBe(1);
  });

  it('creates current spontaneous attendance only for an active participant and rejects duplicates', async () => {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const weekday = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date(`${date}T00:00:00Z`).getUTCDay()] as SalaWeekday;
    const fixture = await setup(date, weekday);
    const spontaneous = await sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date, origin: SalaOccurrenceOrigin.SPONTANEOUS, status: SalaOccurrenceStatus.ATTENDED }, fixture.actor.id);
    expect(spontaneous).toMatchObject({ origin: 'SPONTANEOUS', status: 'ATTENDED' });
    await expect(sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date, origin: SalaOccurrenceOrigin.SPONTANEOUS, status: SalaOccurrenceStatus.ATTENDED }, fixture.actor.id)).rejects.toMatchObject({ response: { code: 'SALA_OCCURRENCE_DUPLICATE' } });
  });

  it('projects closure as CANCELLED while preserving the next fixed occurrence', async () => {
    const fixture = await setup();
    await sala.createFixed({ personId: fixture.person.id, salaParticipationId: fixture.participation.id, scheduleSlotId: fixture.slot.id, startDate: '2026-01-01', confirmOverbooking: true });
    await sala.addException(fixture.slot.id, { date: fixture.date, type: 'CLOSURE' });
    expect((await sala.agenda(fixture.date))[0]).toMatchObject({ isClosed: true, people: [expect.objectContaining({ status: 'CANCELLED' })] });
    expect((await sala.agenda('2026-09-03'))[0]?.people[0]?.status).toBe('RESERVED');
  });

  it('enforces source and uniqueness constraints directly in PostgreSQL', async () => {
    const fixture = await setup();
    const fixed = await sala.createFixed({ personId: fixture.person.id, salaParticipationId: fixture.participation.id, scheduleSlotId: fixture.slot.id, startDate: '2026-01-01', confirmOverbooking: true });
    await prisma.salaOccurrence.create({ data: { personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: new Date(`${fixture.date}T00:00:00Z`), origin: 'FIXED', status: 'RESERVED', fixedSalaBookingId: fixed.id, createdBy: fixture.actor.id, lastModifiedBy: fixture.actor.id } });
    await expect(prisma.salaOccurrence.create({ data: { personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: new Date(`${fixture.date}T00:00:00Z`), origin: 'FIXED', status: 'ATTENDED', fixedSalaBookingId: fixed.id, createdBy: fixture.actor.id, lastModifiedBy: fixture.actor.id } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.salaOccurrence.create({ data: { personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: new Date('2026-09-03T00:00:00Z'), origin: 'SPONTANEOUS', status: 'ATTENDED', fixedSalaBookingId: fixed.id, createdBy: fixture.actor.id, lastModifiedBy: fixture.actor.id } })).rejects.toThrow('sala_occurrences_origin_source_check');
  });

  it('preserves past attendance and cancels future materialized occurrences on LeaveSala', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const current = new Date(`${today}T00:00:00Z`);
    const weekday = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][current.getUTCDay()] as SalaWeekday;
    const past = new Date(current); past.setUTCDate(past.getUTCDate() - 7);
    const future = new Date(current); future.setUTCDate(future.getUTCDate() + 7);
    const fixture = await setup(today, weekday);
    await sala.createFixed({ personId: fixture.person.id, salaParticipationId: fixture.participation.id, scheduleSlotId: fixture.slot.id, startDate: '2026-01-01', confirmOverbooking: true });
    await sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: past.toISOString().slice(0, 10), status: SalaOccurrenceStatus.ATTENDED }, fixture.actor.id);
    await sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: future.toISOString().slice(0, 10), status: SalaOccurrenceStatus.ATTENDED }, fixture.actor.id);
    await sala.leave(fixture.participation.id, false, fixture.actor.id);
    expect((await prisma.salaOccurrence.findUniqueOrThrow({ where: { personId_scheduleSlotId_date: { personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: past } } })).status).toBe('ATTENDED');
    expect((await prisma.salaOccurrence.findUniqueOrThrow({ where: { personId_scheduleSlotId_date: { personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: future } } })).status).toBe('CANCELLED');
  });

  it('enforces API authentication and attendance permissions', async () => {
    const fixture = await setup();
    await sala.createFixed({ personId: fixture.person.id, salaParticipationId: fixture.participation.id, scheduleSlotId: fixture.slot.id, startDate: '2026-01-01', confirmOverbooking: true });
    const payload = { personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: fixture.date };
    await request(app.getHttpServer()).post('/api/sala/occurrences/attend').send(payload).expect(401);
    const unauthorized = await users.create({ firstName: 'Clinic', lastName: 'Only', email: `clinic-${randomUUID()}@athleta.test`, roles: [Role.KINESIOLOGIST] });
    await auth.provisionCredential(unauthorized.id, 'ValidPass1!');
    await prisma.internalCredential.update({ where: { internalUserId: unauthorized.id }, data: { mustChangePassword: false } });
    const deniedLogin = await request(app.getHttpServer()).post('/api/auth/login').send({ email: unauthorized.email, password: 'ValidPass1!' }).expect(200);
    await request(app.getHttpServer()).post('/api/sala/occurrences/attend').set('Cookie', deniedLogin.headers['set-cookie'][0] as string).set('x-csrf-token', deniedLogin.body.data.csrfToken as string).send(payload).expect(403);
    await auth.provisionCredential(fixture.actor.id, 'ValidPass1!');
    await prisma.internalCredential.update({ where: { internalUserId: fixture.actor.id }, data: { mustChangePassword: false } });
    const allowedLogin = await request(app.getHttpServer()).post('/api/auth/login').send({ email: fixture.actor.email, password: 'ValidPass1!' }).expect(200);
    await request(app.getHttpServer()).post('/api/sala/occurrences/attend').set('Cookie', allowedLogin.headers['set-cookie'][0] as string).set('x-csrf-token', allowedLogin.body.data.csrfToken as string).send(payload).expect(201);
  });
});
