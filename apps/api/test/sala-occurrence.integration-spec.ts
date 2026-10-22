import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role, SalaOccurrenceOrigin, SalaOccurrenceStatus, type SalaWeekday } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReservationsService } from '../src/reservations/reservations.service';
import { ReservationsController } from '../src/reservations/reservations.controller';
import { ClinicService } from '../src/clinic/clinic.service';
import { IndicationService } from '../src/clinic/indication.service';
import { SalaService } from '../src/sala/sala.service';
import { InternalUserService } from '../src/team/internal-user.service';

describe('SalaOccurrence persistence and API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sala: SalaService;
  let users: InternalUserService;
  let auth: AuthService;
  let reservations: ReservationsService;
  let clinic: ClinicService;
  let indications: IndicationService;

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
    reservations = app.get(ReservationsService);
    clinic = app.get(ClinicService);
    indications = app.get(IndicationService);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.salaClinicalIndication.deleteMany();
    await prisma.salaOccurrence.deleteMany();
    await prisma.oneOffReservation.deleteMany();
    await prisma.fixedSalaBooking.deleteMany();
    await prisma.salaServiceType.deleteMany();
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

  async function setup(date = '2026-08-27', weekday: SalaWeekday = 'THURSDAY', windowDuration = 60) {
    const suffix = randomUUID();
    const actor = await users.create({ firstName: 'Agenda', lastName: 'Operator', email: `operator-${suffix}@athleta.test`, roles: [Role.ADMINISTRATIVE] });
    const professor = await users.create({ firstName: 'Professor', lastName: 'Synthetic', email: `professor-${suffix}@athleta.test`, roles: [Role.PROFESSOR] });
    const dni = `${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    const person = await prisma.person.create({ data: { firstName: 'Persona', lastName: 'Occurrence', dni, normalizedDni: dni, phone: '3515550101', birthDate: new Date('1990-01-01T00:00:00Z') } });
    const plan = await prisma.salaPlan.create({ data: { name: `Plan-${suffix}`, monthlyAmount: 1000 } });
    const service = await sala.createServiceType({ name: `Musculación-${suffix}`, durationMinutes: 60 });
    await prisma.salaPlanService.create({ data: { planId: plan.id, serviceTypeId: service.id } });
    const participation = await sala.join({ personId: person.id, planId: plan.id, mainProfessorId: professor.id, startDate: '2026-01-01' });
    const slot = await sala.createSlot({ weekday, startTime: '09:00', durationMinutes: windowDuration, specificCapacity: 5 });
    return { actor, professor, person, participation, slot, service, date };
  }

  it('projects past fixed bookings as RESERVED and materializes manual corrections with audit data', async () => {
    const fixture = await setup();
    const fixed = await sala.createFixed({ personId: fixture.person.id, salaParticipationId: fixture.participation.id, scheduleSlotId: fixture.slot.id, serviceTypeId: fixture.service.id, startDate: '2026-01-01', confirmOverbooking: true });

    expect((await sala.agenda(fixture.date))[0]?.people[0]).toMatchObject({ origin: 'FIXED', status: 'RESERVED', isMaterialized: false });
    const attended = await sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: fixture.date, status: SalaOccurrenceStatus.ATTENDED }, fixture.actor.id);
    expect(attended).toMatchObject({ status: 'ATTENDED', createdBy: fixture.actor.id, lastModifiedBy: fixture.actor.id, fixedSalaBookingId: fixed.id });
    const firstModifiedAt = attended.lastModifiedAt;
    const absent = await sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: fixture.date, status: SalaOccurrenceStatus.ABSENT }, fixture.actor.id);
    expect(absent.status).toBe('ABSENT');
    expect(absent.lastModifiedAt.getTime()).toBeGreaterThanOrEqual(firstModifiedAt.getTime());
    const reference = { personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: fixture.date };
    const correctedAttendance = await sala.commandOccurrence({ ...reference, status: SalaOccurrenceStatus.ATTENDED }, fixture.actor.id);
    expect(correctedAttendance).toMatchObject({ id: attended.id, status: 'ATTENDED', origin: 'FIXED', fixedSalaBookingId: fixed.id });
    const reserved = await sala.commandOccurrence({ ...reference, status: SalaOccurrenceStatus.RESERVED }, fixture.actor.id);
    expect(reserved).toMatchObject({ id: attended.id, status: 'RESERVED', lastModifiedBy: fixture.actor.id });
    expect(await prisma.salaOccurrence.count()).toBe(1);
    expect((await prisma.fixedSalaBooking.findUniqueOrThrow({ where: { id: fixed.id } })).endDate).toBeNull();
    expect((await sala.agenda('2026-09-03'))[0]?.people[0]?.status).toBe('RESERVED');
  });

  it('cancels one fixed occurrence without ending its recurrence', async () => {
    const fixture = await setup();
    const fixed = await sala.createFixed({ personId: fixture.person.id, salaParticipationId: fixture.participation.id, scheduleSlotId: fixture.slot.id, serviceTypeId: fixture.service.id, startDate: '2026-01-01', confirmOverbooking: true });
    await sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: fixture.date, status: SalaOccurrenceStatus.CANCELLED }, fixture.actor.id);
    expect((await sala.agenda(fixture.date))[0]?.people[0]?.status).toBe('CANCELLED');
    const corrected = await sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: fixture.date, status: SalaOccurrenceStatus.ATTENDED }, fixture.actor.id);
    expect(corrected).toMatchObject({ status: 'ATTENDED', origin: 'FIXED', fixedSalaBookingId: fixed.id });
    expect((await sala.agenda(fixture.date))[0]?.people[0]?.status).toBe('ATTENDED');
    expect(await prisma.salaOccurrence.count()).toBe(1);
    expect((await sala.agenda('2026-09-03'))[0]?.people[0]?.status).toBe('RESERVED');
    expect((await prisma.fixedSalaBooking.findUniqueOrThrow({ where: { id: fixed.id } })).endDate).toBeNull();
  });

  it('corrects the exact reservation when one person has two activities in a weekly window', async () => {
    const f = await setup('2026-08-27', 'THURSDAY', 120);
    const first = await sala.createReservation({ personId: f.person.id, salaParticipationId: f.participation.id, scheduleSlotId: f.slot.id, serviceTypeId: f.service.id, date: f.date, startTime: '09:00' });
    const second = await sala.createReservation({ personId: f.person.id, salaParticipationId: f.participation.id, scheduleSlotId: f.slot.id, serviceTypeId: f.service.id, date: f.date, startTime: '10:00' });
    await expect(sala.commandOccurrence({ personId: f.person.id, scheduleSlotId: f.slot.id, date: f.date, status: SalaOccurrenceStatus.ATTENDED }, f.actor.id)).rejects.toMatchObject({ response: { code: 'SALA_OCCURRENCE_AMBIGUOUS' } });
    await sala.commandOccurrence({ personId: f.person.id, scheduleSlotId: f.slot.id, date: f.date, startTime: '09:00', sourceId: first.id, status: SalaOccurrenceStatus.ATTENDED }, f.actor.id);
    await sala.commandOccurrence({ personId: f.person.id, scheduleSlotId: f.slot.id, date: f.date, startTime: '10:00', sourceId: second.id, status: SalaOccurrenceStatus.ABSENT }, f.actor.id);
    expect(await prisma.salaOccurrence.findMany({ where: { personId: f.person.id }, orderBy: { startTime: 'asc' } })).toEqual([
      expect.objectContaining({ oneOffReservationId: first.id, status: 'ATTENDED' }),
      expect.objectContaining({ oneOffReservationId: second.id, status: 'ABSENT' }),
    ]);
    const agenda = await sala.agenda(f.date);
    expect(agenda.flatMap((block) => block.people)).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: first.id, status: 'ATTENDED' }),
      expect.objectContaining({ sourceId: second.id, status: 'ABSENT' }),
    ]));
  });

  it('preserves both exact activities through the shared Reservations projection and HTTP envelope', async () => {
    const f = await setup('2026-08-27', 'THURSDAY', 120);
    const first = await sala.createReservation({ personId: f.person.id, salaParticipationId: f.participation.id, scheduleSlotId: f.slot.id, serviceTypeId: f.service.id, date: f.date, startTime: '09:00' });
    const second = await sala.createReservation({ personId: f.person.id, salaParticipationId: f.participation.id, scheduleSlotId: f.slot.id, serviceTypeId: f.service.id, date: f.date, startTime: '10:00' });
    const timeline = await reservations.list(f.date, f.professor.id);
    const bookings = timeline.rows.flatMap((row) => row.bookings);
    expect(bookings).toHaveLength(2);
    expect(bookings).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: first.id, startTime: '09:00', scheduleSlotId: f.slot.id, origin: 'ONE_OFF', status: 'RESERVED', cancelledForNonPayment: false, hasClinicalIndication: false }),
      expect.objectContaining({ sourceId: second.id, startTime: '10:00', scheduleSlotId: f.slot.id, origin: 'ONE_OFF', status: 'RESERVED' }),
    ]));
    await auth.provisionCredential(f.professor.id, 'ValidPass1!');
    await prisma.internalCredential.update({ where: { internalUserId: f.professor.id }, data: { mustChangePassword: false } });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: f.professor.email, password: 'ValidPass1!' }).expect(200);
    const response = await request(app.getHttpServer()).get(`/api/reservations?date=${f.date}`).set('Cookie', login.headers['set-cookie'][0] as string).expect(200);
    expect(response.body).toEqual({ data: timeline });
  });

  it('serves only Sala and skips clinical/professional queries when Clinic is disabled', async () => {
    const f = await setup();
    await sala.createReservation({ personId: f.person.id, salaParticipationId: f.participation.id, scheduleSlotId: f.slot.id, serviceTypeId: f.service.id, date: f.date, startTime: '09:00' });
    await auth.provisionCredential(f.professor.id, 'ValidPass1!');
    await prisma.internalCredential.update({ where: { internalUserId: f.professor.id }, data: { mustChangePassword: false } });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: f.professor.email, password: 'ValidPass1!' }).expect(200);
    const clinicRead = jest.spyOn(clinic, 'list');
    const teamRead = jest.spyOn(users, 'list');
    const prior = process.env.ATHLETA_CLINIC_ENABLED;
    process.env.ATHLETA_CLINIC_ENABLED = 'false';
    try {
      const direct = await reservations.list(f.date, f.professor.id);
      expect(direct.rows.map((row) => row.kind)).toEqual(['SALA']);
      expect(direct.rows.flatMap((row) => row.bookings).every((booking) => booking.source === 'SALA')).toBe(true);
      const response = await request(app.getHttpServer()).get(`/api/reservations?date=${f.date}`).set('Cookie', login.headers['set-cookie'][0] as string).expect(200);
      expect(response.body.data.rows.map((row: { kind: string }) => row.kind)).toEqual(['SALA']);
      expect(clinicRead).not.toHaveBeenCalled();
      expect(teamRead).not.toHaveBeenCalled();
      await expect(app.get(ReservationsController).list({ date: f.date }, { athletaUserId: f.professor.id, athletaPermissions: ['CLINIC_OPERATIONAL_READ'] })).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    } finally {
      if (prior === undefined) delete process.env.ATHLETA_CLINIC_ENABLED;
      else process.env.ATHLETA_CLINIC_ENABLED = prior;
    }
  });

  it('projects active indications in one bulk call only for authorized Sala readers', async () => {
    const f = await setup('2026-08-27', 'THURSDAY', 120);
    for (const startTime of ['09:00', '10:00']) await sala.createReservation({ personId: f.person.id, salaParticipationId: f.participation.id, scheduleSlotId: f.slot.id, serviceTypeId: f.service.id, date: f.date, startTime });
    await prisma.salaClinicalIndication.createMany({ data: [
      { personId: f.person.id, responsibleProfessionalId: f.professor.id, trainingCondition: 'RESTRICTED', instructions: 'Synthetic private instructions', affectedArea: 'Synthetic area' },
      { personId: f.person.id, responsibleProfessionalId: f.professor.id, trainingCondition: 'NO_RESTRICTIONS' },
    ] });
    const bulk = jest.spyOn(indications, 'activePersonIds');
    const professorBookings = (await reservations.list(f.date, f.professor.id)).rows.flatMap((row) => row.bookings);
    expect(professorBookings).toHaveLength(2);
    expect(professorBookings.every((booking) => 'hasClinicalIndication' in booking && booking.hasClinicalIndication === true)).toBe(true);
    expect(bulk).toHaveBeenCalledTimes(1);
    expect(bulk).toHaveBeenCalledWith([f.person.id]);
    await expect(bulk.mock.results[0]?.value).resolves.toEqual([f.person.id]);
    bulk.mockClear();
    const administrativeBookings = (await reservations.list(f.date, f.actor.id)).rows.flatMap((row) => row.bookings);
    expect(bulk).not.toHaveBeenCalled();
    for (const booking of administrativeBookings) expect(booking).not.toHaveProperty('hasClinicalIndication');
    for (const booking of [...professorBookings, ...administrativeBookings]) {
      for (const field of ['affectedArea', 'instructions', 'treatmentId', 'responsibleProfessional', 'responsibleProfessionalId']) expect(booking).not.toHaveProperty(field);
    }
    expect(JSON.stringify(professorBookings)).not.toContain('Synthetic private instructions');
    await prisma.salaClinicalIndication.updateMany({ data: { status: 'CLOSED' } });
    expect((await reservations.list(f.date, f.professor.id)).rows.flatMap((row) => row.bookings)).toEqual(expect.arrayContaining([expect.objectContaining({ hasClinicalIndication: false })]));
    const clinicalActor = await users.create({ firstName: 'Clinical', lastName: 'Synthetic', email: `clinical-${randomUUID()}@athleta.test`, roles: [Role.KINESIOLOGIST] });
    bulk.mockClear();
    await reservations.list(f.date, clinicalActor.id);
    expect(bulk).not.toHaveBeenCalled();
  });

  it('preserves pending payment and the persisted nonpayment cancellation marker in Reservations', async () => {
    const date = '2099-08-27';
    const weekday = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date(`${date}T00:00:00Z`).getUTCDay()] as SalaWeekday;
    const f = await setup(date, weekday);
    const fixed = await sala.createFixed({ personId: f.person.id, salaParticipationId: f.participation.id, scheduleSlotId: f.slot.id, serviceTypeId: f.service.id, startDate: date });
    const pending = await reservations.list(date, f.professor.id);
    expect(pending.rows[0]?.bookings).toEqual([expect.objectContaining({ sourceId: fixed.id, startTime: '09:00', status: 'PENDING_PAYMENT', cancelledForNonPayment: false })]);
    await prisma.salaOccurrence.create({ data: { personId: f.person.id, scheduleSlotId: f.slot.id, date: new Date(`${date}T00:00:00Z`), startTime: new Date('1970-01-01T09:00:00Z'), fixedSalaBookingId: fixed.id, origin: 'FIXED', status: 'CANCELLED', cancelledForNonPaymentAt: new Date() } });
    const cancelled = await reservations.list(date, f.professor.id);
    expect(cancelled.rows[0]?.bookings).toEqual([expect.objectContaining({ sourceId: fixed.id, startTime: '09:00', status: 'CANCELLED', cancelledForNonPayment: true })]);
  });

  it('avoids a database indication query for an empty list of people', async () => {
    const query = jest.spyOn(prisma.salaClinicalIndication, 'findMany');
    expect(await indications.activePersonIds([])).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('uses explicit occurrence state as the authority over a one-off planning source', async () => {
    const fixture = await setup();
    const reservation = await sala.createReservation({ personId: fixture.person.id, salaParticipationId: fixture.participation.id, scheduleSlotId: fixture.slot.id, serviceTypeId: fixture.service.id, date: fixture.date, confirmOverbooking: true });
    await sala.cancelReservation(reservation.id);
    const cancelledSource = await prisma.oneOffReservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect((await sala.agenda(fixture.date))[0]?.people[0]?.status).toBe('CANCELLED');
    await sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: fixture.date, status: SalaOccurrenceStatus.ATTENDED }, fixture.actor.id);
    expect((await sala.agenda(fixture.date))[0]?.people[0]).toMatchObject({ origin: 'ONE_OFF', status: 'ATTENDED' });
    expect(await prisma.salaOccurrence.findMany()).toEqual([expect.objectContaining({ origin: 'ONE_OFF', status: 'ATTENDED', oneOffReservationId: reservation.id })]);
    await sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: fixture.date, status: SalaOccurrenceStatus.CANCELLED }, fixture.actor.id);
    await sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: fixture.date, status: SalaOccurrenceStatus.RESERVED }, fixture.actor.id);
    expect((await sala.agenda(fixture.date))[0]?.people[0]).toMatchObject({ origin: 'ONE_OFF', status: 'RESERVED' });
    expect(await prisma.salaOccurrence.findMany()).toEqual([expect.objectContaining({ origin: 'ONE_OFF', status: 'RESERVED', oneOffReservationId: reservation.id })]);
    expect(await prisma.oneOffReservation.findUniqueOrThrow({ where: { id: reservation.id } })).toEqual(cancelledSource);
    expect((await prisma.oneOffReservation.findUniqueOrThrow({ where: { id: reservation.id } })).cancelledAt).not.toBeNull();
    expect(await prisma.oneOffReservation.count()).toBe(1);
    expect(await prisma.salaOccurrence.count()).toBe(1);
  });

  it('keeps one persisted occurrence under concurrent corrections', async () => {
    const fixture = await setup();
    await sala.createFixed({ personId: fixture.person.id, salaParticipationId: fixture.participation.id, scheduleSlotId: fixture.slot.id, serviceTypeId: fixture.service.id, startDate: '2026-01-01', confirmOverbooking: true });
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

  it('creates spontaneous attendance at the selected 15-minute start time', async () => {
    const fixture = await setup('2026-08-27', 'THURSDAY', 120);
    const spontaneous = await sala.createSpontaneousOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: fixture.date, startTime: '09:30', serviceTypeId: fixture.service.id }, fixture.actor.id);
    expect(spontaneous).toMatchObject({ origin: 'SPONTANEOUS', status: 'ATTENDED' });
    expect(await prisma.salaOccurrence.findUniqueOrThrow({ where: { id: spontaneous.id } })).toMatchObject({ serviceDurationMinutes: 60, startTime: new Date('1970-01-01T09:30:00.000Z'), serviceTypeId: fixture.service.id });
    expect((await sala.agenda(fixture.date)).find((item) => item.slot.startTime === '09:30')?.people[0]).toMatchObject({ startTime: '09:30', durationMinutes: 60, origin: 'SPONTANEOUS' });
    const corrected = await sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: fixture.date, status: SalaOccurrenceStatus.ABSENT }, fixture.actor.id);
    expect(corrected).toMatchObject({ id: spontaneous.id, origin: 'SPONTANEOUS', status: 'ABSENT', oneOffReservationId: null, fixedSalaBookingId: null, serviceTypeId: fixture.service.id, serviceDurationMinutes: 60, startTime: spontaneous.startTime });
    expect(await prisma.oneOffReservation.count()).toBe(0);
    expect(await prisma.salaOccurrence.count()).toBe(1);
  });

  it('preserves the 60-minute Sala default when projecting historical reservations without a service', async () => {
    const fixture = await setup('2026-08-27', 'THURSDAY', 300);
    const reservation = await prisma.oneOffReservation.create({ data: { personId: fixture.person.id, salaParticipationId: fixture.participation.id, scheduleSlotId: fixture.slot.id, date: new Date(`${fixture.date}T00:00:00Z`) } });
    expect(reservation.serviceTypeId).toBeNull();
    expect(reservation.serviceDurationMinutes).toBeNull();
    expect((await sala.agenda(fixture.date)).find((item) => item.slot.startTime === '09:00')?.people[0]).toMatchObject({ startTime: '09:00', durationMinutes: 60 });
  });

  it('projects closure as CANCELLED while preserving the next fixed occurrence', async () => {
    const fixture = await setup();
    await sala.createFixed({ personId: fixture.person.id, salaParticipationId: fixture.participation.id, scheduleSlotId: fixture.slot.id, serviceTypeId: fixture.service.id, startDate: '2026-01-01', confirmOverbooking: true });
    await sala.addException(fixture.slot.id, { date: fixture.date, type: 'CLOSURE' });
    expect((await sala.agenda(fixture.date))[0]).toMatchObject({ isClosed: true, people: [expect.objectContaining({ status: 'CANCELLED' })] });
    expect((await sala.agenda('2026-09-03'))[0]?.people[0]?.status).toBe('RESERVED');
  });

  it('enforces source and uniqueness constraints directly in PostgreSQL', async () => {
    const fixture = await setup();
    const fixed = await sala.createFixed({ personId: fixture.person.id, salaParticipationId: fixture.participation.id, scheduleSlotId: fixture.slot.id, serviceTypeId: fixture.service.id, startDate: '2026-01-01', confirmOverbooking: true });
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
    await sala.createFixed({ personId: fixture.person.id, salaParticipationId: fixture.participation.id, scheduleSlotId: fixture.slot.id, serviceTypeId: fixture.service.id, startDate: '2026-01-01', confirmOverbooking: true });
    await sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: past.toISOString().slice(0, 10), status: SalaOccurrenceStatus.ATTENDED }, fixture.actor.id);
    await sala.commandOccurrence({ personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: future.toISOString().slice(0, 10), status: SalaOccurrenceStatus.ATTENDED }, fixture.actor.id);
    await sala.leave(fixture.participation.id, false, fixture.actor.id);
    expect((await prisma.salaOccurrence.findFirstOrThrow({ where: { personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: past } })).status).toBe('ATTENDED');
    expect((await prisma.salaOccurrence.findFirstOrThrow({ where: { personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: future } })).status).toBe('CANCELLED');
  });

  it('enforces API authentication and attendance/correction permissions and accepts RESERVED corrections', async () => {
    const fixture = await setup('2026-09-02', 'WEDNESDAY');
    await sala.createFixed({ personId: fixture.person.id, salaParticipationId: fixture.participation.id, scheduleSlotId: fixture.slot.id, serviceTypeId: fixture.service.id, startDate: '2026-01-01', confirmOverbooking: true });
    const payload = { personId: fixture.person.id, scheduleSlotId: fixture.slot.id, date: fixture.date };
    await request(app.getHttpServer()).post('/api/sala/occurrences/attend').send(payload).expect(401);
    const unauthorized = await users.create({ firstName: 'Clinic', lastName: 'Only', email: `clinic-${randomUUID()}@athleta.test`, roles: [Role.KINESIOLOGIST] });
    await auth.provisionCredential(unauthorized.id, 'ValidPass1!');
    await prisma.internalCredential.update({ where: { internalUserId: unauthorized.id }, data: { mustChangePassword: false } });
    const deniedLogin = await request(app.getHttpServer()).post('/api/auth/login').send({ email: unauthorized.email, password: 'ValidPass1!' }).expect(200);
    await request(app.getHttpServer()).post('/api/sala/occurrences/attend').set('Cookie', deniedLogin.headers['set-cookie'][0] as string).set('x-csrf-token', deniedLogin.body.data.csrfToken as string).send(payload).expect(403);
    await request(app.getHttpServer()).post('/api/sala/occurrences/correct').set('Cookie', deniedLogin.headers['set-cookie'][0] as string).set('x-csrf-token', deniedLogin.body.data.csrfToken as string).send({ ...payload, status: 'RESERVED' }).expect(403);
    expect(await prisma.salaOccurrence.count()).toBe(0);
    await auth.provisionCredential(fixture.actor.id, 'ValidPass1!');
    await prisma.internalCredential.update({ where: { internalUserId: fixture.actor.id }, data: { mustChangePassword: false } });
    const allowedLogin = await request(app.getHttpServer()).post('/api/auth/login').send({ email: fixture.actor.email, password: 'ValidPass1!' }).expect(200);
    await request(app.getHttpServer()).post('/api/sala/occurrences/attend').set('Cookie', allowedLogin.headers['set-cookie'][0] as string).set('x-csrf-token', allowedLogin.body.data.csrfToken as string).send(payload).expect(201);
    const correction = await request(app.getHttpServer()).post('/api/sala/occurrences/correct').set('Cookie', allowedLogin.headers['set-cookie'][0] as string).set('x-csrf-token', allowedLogin.body.data.csrfToken as string).send({ ...payload, status: 'RESERVED' }).expect(201);
    expect(correction.body.data).toMatchObject({ status: 'RESERVED', lastModifiedBy: fixture.actor.id });
    expect(await prisma.salaOccurrence.findMany()).toEqual([expect.objectContaining({ id: correction.body.data.id, status: 'RESERVED' })]);
  });
});
