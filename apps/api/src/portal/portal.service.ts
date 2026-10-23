import { HealthDeclarationService } from '../sala/health-declaration/health-declaration.service';
import type { SubmitHealthDeclarationDto } from '../sala/health-declaration/health-declaration.dto';
import { PORTAL_SESSION_TTL_MS } from './portal-session';
import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SalaService } from '../sala/sala.service';
import { PersonActivityService } from '../people/person-activity.service';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
@Injectable()
export class PortalService {
  constructor(private readonly prisma: PrismaService, private readonly salaService: SalaService, private readonly activity: PersonActivityService, private readonly health: HealthDeclarationService) {}
  async login(dni: string, pin: string) { const p = await this.prisma.person.findUnique({ where: { normalizedDni: dni.replace(/\D/g, '') }, include: { portalCredential: true, socialWork: { select: { name: true } } } }); const ok = Boolean(p?.portalCredential && await argon2.verify(p.portalCredential.pinHash, pin)); if (!p || !ok || !(await this.activity.isActive(p.id))) throw new UnauthorizedException({ code: 'PORTAL_INVALID_CREDENTIALS', message: 'No pudimos ingresar con esos datos. Revisalos o comunicate con Athleta.' }); const token = randomBytes(32).toString('base64url'); const csrfToken = randomBytes(32).toString('base64url'); await this.prisma.session.create({ data: { kind: 'PORTAL', personId: p.id, secretHash: digest(token), csrfToken, expiresAt: new Date(Date.now() + PORTAL_SESSION_TTL_MS) } }); return { token, csrfToken, mustChangePin: p.portalCredential?.mustChangePin ?? true, person: this.profile(p) }; }
  async current(token?: string) {
    if (!token) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    const s = await this.prisma.session.findUnique({
      where: { secretHash: digest(token) },
      include: { person: { include: { portalCredential: true, socialWork: { select: { name: true } } } } },
    });
    const now = new Date();
    if (!s || s.kind !== 'PORTAL' || s.revokedAt || s.expiresAt <= now || !s.person) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }
    const renewalThreshold = new Date(now.getTime() + PORTAL_SESSION_TTL_MS - 24 * 60 * 60 * 1000);
    // Renew at most daily; the conditional update also protects against concurrent revocation.
    if (s.expiresAt < renewalThreshold) {
      const expiresAt = new Date(now.getTime() + PORTAL_SESSION_TTL_MS);
      const renewed = await this.prisma.session.updateMany({
        where: { id: s.id, kind: 'PORTAL', revokedAt: null, expiresAt: { gt: now, lt: renewalThreshold } },
        data: { expiresAt, lastActivityAt: now },
      });
      if (renewed.count) {
        s.expiresAt = expiresAt;
        s.lastActivityAt = now;
      } else {
        const valid = await this.prisma.session.findUnique({ where: { id: s.id } });
        if (!valid || valid.revokedAt || valid.expiresAt <= now) {
          throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
        }
        s.expiresAt = valid.expiresAt;
        s.lastActivityAt = valid.lastActivityAt;
      }
    }
    return { session: s, person: s.person };
  }
  private async ready(token?: string) { const current = await this.current(token); if (current.person.portalCredential?.mustChangePin) throw new ForbiddenException({ code: 'PORTAL_PIN_CHANGE_REQUIRED', message: 'Debés cambiar tu PIN antes de continuar.' }); if ((await this.health.status(current.person.id)).required) throw new ForbiddenException({ code: 'PORTAL_HEALTH_DECLARATION_REQUIRED', message: 'Debés completar la declaración de salud antes de continuar.' }); return current; }
  async healthStatus(token?: string) { const { person } = await this.current(token); return this.health.status(person.id); }
  async healthDocument(token?: string) { await this.current(token); return this.health.formDocument(); }
  async healthHistory(token?: string) { const { person } = await this.current(token); return this.health.history(person.id); }
  async healthDetail(token: string | undefined, id: string) { const { person } = await this.current(token); return this.health.detail(person.id, id); }
  async submitHealthDeclaration(token: string | undefined, input: SubmitHealthDeclarationDto) {
    const { person } = await this.current(token);
    if (person.portalCredential?.mustChangePin) throw new ForbiddenException({ code: 'PORTAL_PIN_CHANGE_REQUIRED', message: 'Debés cambiar tu PIN antes de continuar.' });
    return this.health.submit(person, input);
  }
  async logout(token?: string) { if (token) await this.prisma.session.updateMany({ where: { secretHash: digest(token), kind: 'PORTAL', revokedAt: null }, data: { revokedAt: new Date() } }); }
  async assertCsrf(token: string | undefined, csrfToken: string | undefined) { const { session } = await this.current(token); if (!csrfToken || csrfToken !== session.csrfToken) throw new ForbiddenException({ code: 'CSRF_INVALID', message: 'Solicitud inválida.' }); }
  async changePin(token: string | undefined, currentPin: string, nextPin: string) { if (!/^\d{4}$/.test(nextPin)) throw new BadRequestException({ code: 'PIN_POLICY', message: 'El PIN debe tener 4 dígitos.' }); const { person } = await this.current(token); if (!person.portalCredential || !(await argon2.verify(person.portalCredential.pinHash, currentPin))) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'El PIN actual no es válido.' }); await this.prisma.portalCredential.update({ where: { personId: person.id }, data: { pinHash: await argon2.hash(nextPin, { type: argon2.argon2id }), mustChangePin: false, credentialsUpdatedAt: new Date() } }); return { mustChangePin: false }; }
  profile(p: { id: string; firstName: string; lastName: string; dni: string; phone: string; birthDate: Date; email?: string|null; emergencyContactName?: string|null; emergencyContactPhone?: string|null; socialWorkId?: string|null; affiliateNumber?: string|null; socialWork?: { name: string } | null }) { return { id: p.id, firstName: p.firstName, lastName: p.lastName, dni: p.dni, phone: p.phone, birthDate: p.birthDate.toISOString().slice(0, 10), ...(p.email ? { email: p.email } : {}), ...(p.emergencyContactName ? { emergencyContactName: p.emergencyContactName } : {}), ...(p.emergencyContactPhone ? { emergencyContactPhone: p.emergencyContactPhone } : {}), ...(p.socialWorkId ? { socialWorkId: p.socialWorkId } : {}), ...(p.socialWork ? { socialWorkName: p.socialWork.name } : {}), ...(p.affiliateNumber ? { affiliateNumber: p.affiliateNumber } : {}) }; }
  async me(token?: string) { const { person } = await this.current(token); return this.profile(person); }
  async sala(token?: string) {
    const { person } = await this.ready(token);
    const participation = await this.prisma.salaParticipation.findFirst({ where: { personId: person.id, endDate: null } });
    if (!participation) throw new ForbiddenException({ code: 'SALA_NOT_AVAILABLE', message: 'Sala no disponible.' });
    const today = this.todayOperational();
    const candidates = await this.prisma.oneOffReservation.findMany({ where: { personId: person.id, date: { gte: new Date(`${today}T00:00:00.000Z`) } }, include: { serviceType: true, scheduleSlot: { select: { startTime: true } } }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }] });
    const now = this.reservationNow();
    const reservations = candidates.filter(item => this.salaService.operationalStart(item.date.toISOString().slice(0, 10), item.startTime ?? item.scheduleSlot.startTime) > now).slice(0, 20).map(({ scheduleSlot, ...item }) => ({ ...item, startTime: item.startTime ?? scheduleSlot.startTime }));
    const fixed = await this.prisma.fixedSalaBooking.findMany({ where: { personId: person.id }, include: { scheduleSlot: true, serviceType: true }, orderBy: { startDate: 'asc' } });
    const dates = Array.from({ length: 31 }, (_, index) => { const day = new Date(`${today}T00:00:00.000Z`); day.setUTCDate(day.getUTCDate() + index); return day.toISOString().slice(0, 10); });
    const fixedOccurrences = (await this.salaService.fixedOccurrenceStates(person.id, dates)).filter(item => this.salaService.operationalStart(item.date, new Date(`1970-01-01T${item.startTime}:00Z`)) > now);
    const routine = await this.prisma.routine.findFirst({
      where: { personId: person.id, status: 'ACTIVE' },
      include: {
        days: {
          orderBy: { position: 'asc' },
          include: {
            exercises: {
              orderBy: { position: 'asc' },
              include: { exerciseDefinition: { select: { name: true, description: true } } },
            },
          },
        },
      },
    });
    const evaluations = await this.prisma.physicalEvaluation.findMany({ where: { personId: person.id }, select: { id: true, evaluationDate: true, results: { select: { resultText: true, testDefinition: { select: { id: true, name: true } } }, orderBy: { id: 'asc' } } }, orderBy: [{ evaluationDate: 'asc' }, { id: 'asc' }] });
    const validity = await this.salaService.validity(person.id, today);
    const replacementWeeks = await this.salaService.listPortalReplacementWeeks(person.id, today);
    return { reservations, fixed, fixedOccurrences, routine, evaluations, validity, replacementWeeks };
  }
  async salaServices(token?: string) { const { person } = await this.ready(token); return this.salaService.listPersonServiceTypes(person.id); }
  async salaAvailability(token: string|undefined, date: string, excludeFixedBookingId?: string) { const { person } = await this.ready(token); if (date < this.todayOperational()) throw new BadRequestException({ code: 'PORTAL_DATE_OUT_OF_RANGE', message: 'No podés consultar fechas pasadas.' }); if (excludeFixedBookingId) { const owned = await this.prisma.fixedSalaBooking.findFirst({ where: { id: excludeFixedBookingId, personId: person.id }, select: { id: true } }); if (!owned) throw new ForbiddenException({ code: 'PORTAL_RESOURCE_FORBIDDEN', message: 'No podés consultar este turno.' }); } return (await this.salaService.availability(date, this.prisma, excludeFixedBookingId)).map(slot => ({ scheduleSlotId: slot.scheduleSlotId, startTime: slot.startTime, endTime: slot.endTime, available: slot.available > 0 && !slot.isClosed, date: slot.date })); }
  async reserve(token: string|undefined, body: { date: string; scheduleSlotId: string; serviceTypeId?: string; startTime?: string }) { const { person } = await this.ready(token); const p = await this.prisma.salaParticipation.findFirst({ where: { personId: person.id, endDate: null } }); if (!p) throw new ForbiddenException({ code: 'SALA_NOT_AVAILABLE', message: 'Sala no disponible.' }); const date = new Date(`${body.date}T00:00:00.000Z`); const today = new Date(`${this.todayOperational()}T00:00:00.000Z`); const max = new Date(today); max.setUTCDate(max.getUTCDate()+30); if (Number.isNaN(date.getTime()) || date < today || date > max) throw new BadRequestException({ code: 'PORTAL_DATE_OUT_OF_RANGE', message: 'Las reservas están disponibles hasta 30 días.' }); await this.assertSalaReservationValidity(person.id, date); return this.salaService.createReservation({ personId: person.id, salaParticipationId: p.id, scheduleSlotId: body.scheduleSlotId, date: body.date, ...(body.serviceTypeId ? { serviceTypeId: body.serviceTypeId } : {}), ...(body.startTime ? { startTime: body.startTime } : {}) }, resolved => {
      const startsAt = this.salaService.operationalStart(body.date, resolved.startTime);
      if (startsAt.getTime() + resolved.durationMinutes * 60_000 - this.reservationNow().getTime() < 20 * 60_000) throw new BadRequestException({ code: 'PORTAL_SALA_TIME_PASSED', message: 'Ese horario ya no admite reservas porque quedan menos de 20 minutos de actividad. Elegí otro horario.' });
    }, { requirePortalReplacement: true }); }
  private reservationNow(): Date { return new Date(); }
  private todayOperational(): string {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }
  private async assertSalaReservationValidity(personId: string, date: Date): Promise<void> {
    const validity = await this.salaService.validity(personId, date.toISOString().slice(0, 10));
    if (!validity.hasValidAccess) throw new ForbiddenException({
      code: 'PORTAL_SALA_VALIDITY_REQUIRED',
      message: 'Necesitás tener vigencia de Sala para reservar esa fecha.',
    });
  }

  async cancelReservation(token: string | undefined, id: string) {
    const { person } = await this.ready(token);
    const now = this.reservationNow();
    const found = await this.prisma.oneOffReservation.findFirst({ where: { id, personId: person.id, cancelledAt: null }, include: { scheduleSlot: true } });
    if (!found || this.salaService.operationalStart(found.date.toISOString().slice(0, 10), found.startTime ?? found.scheduleSlot.startTime) <= now) {
      throw new ForbiddenException({ code: 'PORTAL_RESOURCE_FORBIDDEN', message: 'No podés cancelar esta reserva.' });
    }
    return this.salaService.cancelReservation(id);
  }
  async cancelFixedOccurrence(token: string | undefined, fixedBookingId: string, date: string) {
    const { person } = await this.ready(token);
    const occurrence = await this.salaService.cancelFixedOccurrenceFromPortal(fixedBookingId, person.id, date, this.reservationNow());
    return { id: occurrence.id, fixedSalaBookingId: occurrence.fixedSalaBookingId!, date: occurrence.date.toISOString().slice(0, 10), status: occurrence.status };
  }
  async fixedBookings(token?: string) { const { person } = await this.ready(token); return this.salaService.listFixed(person.id); }
  async clinicalAppointments(token?: string) { const { person } = await this.ready(token); return this.prisma.clinicalAppointment.findMany({ where: { personId: person.id, startAt: { gte: new Date() }, status: { in: ['SCHEDULED', 'CANCELLED'] } }, select: { id: true, startAt: true, durationMinutes: true, status: true, professional: { select: { firstName: true, lastName: true } }, service: { select: { name: true } } }, orderBy: { startAt: 'asc' } }); }
  async cancelClinical(token: string|undefined, id: string) { const { person } = await this.ready(token); const a = await this.prisma.clinicalAppointment.findFirst({ where: { id, personId: person.id, status: 'SCHEDULED', startAt: { gt: new Date() } } }); if (!a) throw new ForbiddenException({ code: 'PORTAL_RESOURCE_FORBIDDEN', message: 'No podés cancelar este turno.' }); return this.prisma.clinicalAppointment.update({ where: { id }, data: { status: 'CANCELLED' }, select: { id: true, startAt: true, durationMinutes: true, status: true } }); }
}
