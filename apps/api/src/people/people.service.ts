import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import { ClinicalAppointmentStatus, Prisma, RoutineStatus, SalaOccurrenceOrigin, SalaOccurrenceStatus, SalaClinicalIndicationStatus, TreatmentFinishReason, TreatmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePersonDto, ListPeopleQueryDto, UpdatePersonDto } from './person.dto';
import { normalizeDni, normalizeEmail, normalizePhone } from './person.normalization';
import { PersonActivityService } from './person-activity.service';

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService, private readonly activity: PersonActivityService) {}

  async create(input: CreatePersonDto) {
    const { personId, initialPin } = await this.prisma.$transaction((tx) => this.createWithinTransaction(input, tx));
    return { ...(await this.get(personId)), initialPin };
  }

  async createWithinTransaction(input: CreatePersonDto, tx: Prisma.TransactionClient) {
    const normalizedDni = this.validateDni(input.dni);
    const phone = this.validatePhone(input.phone);
    const emergencyContactPhone = this.emergencyPhone(input.emergencyContactPhone);
    const existing = await tx.person.findUnique({ where: { normalizedDni }, select: { id: true } });
    if (existing) this.duplicateDni();
    this.validateBirthDate(input.birthDate);
    if (input.socialWorkId) await this.validateSelectableSocialWork(input.socialWorkId, tx);
    try {
      const initialPin = this.generatePin();
      const pinHash = await argon2.hash(initialPin, { type: argon2.argon2id });
      const person = await tx.person.create({ data: this.createData(input, normalizedDni, phone, emergencyContactPhone) });
      await tx.portalCredential.create({ data: { personId: person.id, pinHash, mustChangePin: true } });
      return { personId: person.id, initialPin };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') this.duplicateDni();
      throw error;
    }
  }

  async update(id: string, input: UpdatePersonDto) {
    const current = await this.prisma.person.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ code: 'PERSON_NOT_FOUND', message: 'Person not found' });
    if (input.birthDate !== undefined) this.validateBirthDate(input.birthDate);
    const dni = input.dni !== undefined ? this.validateDni(input.dni) : undefined;
    const phone = input.phone !== undefined ? this.validatePhone(input.phone) : undefined;
    const emergencyContactPhone = input.emergencyContactPhone !== undefined ? this.emergencyPhone(input.emergencyContactPhone) : undefined;
    const socialWorkId = input.socialWorkId === undefined ? current.socialWorkId : input.socialWorkId;
    if (socialWorkId && socialWorkId !== current.socialWorkId) await this.validateSelectableSocialWork(socialWorkId);
    try {
      const person = await this.prisma.person.update({ where: { id }, data: {
        ...(input.sport !== undefined && { sport: input.sport?.trim() || null }),
        ...(input.club !== undefined && { club: input.club?.trim() || null }),
        ...(input.firstName !== undefined && { firstName: input.firstName.trim() }),
        ...(input.lastName !== undefined && { lastName: input.lastName.trim() }),
        ...(dni !== undefined && { dni, normalizedDni: dni }),
        ...(phone !== undefined && { phone }),
        ...(input.birthDate !== undefined && { birthDate: this.date(input.birthDate) }),
        ...(input.email !== undefined && { email: input.email?.trim() || null, normalizedEmail: normalizeEmail(input.email) }),
        ...(input.emergencyContactName !== undefined && { emergencyContactName: input.emergencyContactName?.trim() || null }),
        ...(emergencyContactPhone !== undefined && { emergencyContactPhone }),
        ...(input.socialWorkId !== undefined && { socialWorkId: input.socialWorkId || null }),
        ...(!socialWorkId ? { affiliateNumber: null } : input.affiliateNumber !== undefined ? { affiliateNumber: input.affiliateNumber?.trim() || null } : {}),
      } });
      return this.serialize(person);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') this.duplicateDni();
      throw error;
    }
  }

  async resetPortalPin(id: string) {
    const pin = this.generatePin();
    const pinHash = await argon2.hash(pin, { type: argon2.argon2id });
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.person.findUniqueOrThrow({ where: { id }, select: { id: true } });
        await tx.portalCredential.upsert({ where: { personId: id }, create: { personId: id, pinHash, mustChangePin: true }, update: { pinHash, mustChangePin: true, credentialsUpdatedAt: new Date() } });
        await tx.session.updateMany({ where: { personId: id, kind: 'PORTAL', revokedAt: null }, data: { revokedAt: new Date() } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException({ code: 'PERSON_NOT_FOUND', message: 'Person not found' });
      throw error;
    }
    return pin;
  }

  async inactivate(id: string, actorId: string) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const today = this.date(`${values.year}-${values.month}-${values.day}`);
    await this.prisma.$transaction(async (tx) => {
      const person = await tx.person.findUnique({ where: { id }, select: { id: true } });
      if (!person) throw new NotFoundException({ code: 'PERSON_NOT_FOUND', message: 'Person not found' });
      const participations = await tx.salaParticipation.findMany({ where: { personId: id, endDate: null }, select: { id: true } });
      for (const participation of participations) {
        const fixed = await tx.fixedSalaBooking.findMany({ where: { salaParticipationId: participation.id, startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gte: today } }] }, include: { scheduleSlot: true } });
        const weekday = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][today.getUTCDay()];
        for (const booking of fixed) {
          const startTime = booking.startTime ?? booking.scheduleSlot.startTime;
          if (booking.scheduleSlot.weekday !== weekday || this.operationalStart(today.toISOString().slice(0, 10), startTime) <= now) continue;
          await tx.salaOccurrence.upsert({
            where: { fixedSalaBookingId_date: { fixedSalaBookingId: booking.id, date: today } },
            create: { personId: id, scheduleSlotId: booking.scheduleSlotId, date: today, startTime, serviceTypeId: booking.serviceTypeId, serviceDurationMinutes: booking.serviceDurationMinutes, fixedSalaBookingId: booking.id, origin: SalaOccurrenceOrigin.FIXED, status: SalaOccurrenceStatus.CANCELLED, createdBy: actorId, lastModifiedBy: actorId },
            update: {},
          });
        }
        await tx.fixedSalaBooking.updateMany({ where: { salaParticipationId: participation.id, OR: [{ endDate: null }, { endDate: { gt: today } }] }, data: { endDate: today } });
        const reservations = await tx.oneOffReservation.findMany({ where: { salaParticipationId: participation.id, date: { gte: today }, cancelledAt: null }, include: { scheduleSlot: true } });
        const future = reservations.filter(item => this.operationalStart(item.date.toISOString().slice(0, 10), item.startTime ?? item.scheduleSlot.startTime) > now);
        await tx.oneOffReservation.updateMany({ where: { id: { in: future.map(item => item.id) }, cancelledAt: null }, data: { cancelledAt: now } });
        await tx.routine.updateMany({ where: { salaParticipationId: participation.id, status: RoutineStatus.ACTIVE }, data: { status: RoutineStatus.HISTORICAL } });
      }
      await tx.salaParticipation.updateMany({ where: { personId: id, endDate: null }, data: { endDate: today } });
      const occurrences = await tx.salaOccurrence.findMany({ where: { personId: id, date: { gte: today }, status: { not: SalaOccurrenceStatus.CANCELLED } }, include: { scheduleSlot: true } });
      const future = occurrences.filter(item => this.operationalStart(item.date.toISOString().slice(0, 10), item.startTime ?? item.scheduleSlot.startTime) > now);
      await tx.salaOccurrence.updateMany({ where: { id: { in: future.map(item => item.id) } }, data: { status: SalaOccurrenceStatus.CANCELLED, lastModifiedBy: actorId } });
      await tx.salaClinicalIndication.updateMany({ where: { personId: id, status: SalaClinicalIndicationStatus.ACTIVE }, data: { status: SalaClinicalIndicationStatus.CLOSED, closedAt: now, closedById: actorId } });
      await tx.treatment.updateMany({ where: { personId: id, status: TreatmentStatus.IN_PROGRESS }, data: { status: TreatmentStatus.FINISHED, finishDate: this.date(now.toISOString().slice(0, 10)), finishReason: TreatmentFinishReason.INTERRUPTION } });
      await tx.clinicalAppointment.updateMany({ where: { personId: id, status: ClinicalAppointmentStatus.SCHEDULED, startAt: { gt: now } }, data: { status: ClinicalAppointmentStatus.CANCELLED } });
      await tx.session.updateMany({ where: { personId: id, kind: 'PORTAL', revokedAt: null }, data: { revokedAt: now } });
    });
    return this.get(id);
  }

  private operationalStart(date: string, time: Date): Date {
    const [year, month, day] = date.split('-').map(Number);
    const utc = Date.UTC(year!, month! - 1, day!, time.getUTCHours(), time.getUTCMinutes());
    const zone = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', timeZoneName: 'shortOffset' })
      .formatToParts(new Date(utc)).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT-3';
    const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(zone);
    const offset = match ? (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : -180;
    return new Date(utc - offset * 60_000);
  }

  async get(id: string) {
    const person = await this.prisma.person.findUnique({ where: { id }, include: { clinicalPatient: { select: { personId: true } }, salaParticipations: { where: { endDate: null }, select: { id: true } }, treatments: { where: { status: TreatmentStatus.IN_PROGRESS }, select: { id: true } }, clinicalAppointments: { where: { status: ClinicalAppointmentStatus.SCHEDULED, startAt: { gt: new Date() } }, orderBy: { startAt: 'asc' }, take: 1, select: { id: true, startAt: true } } } });
    if (!person) throw new NotFoundException({ code: 'PERSON_NOT_FOUND', message: 'Person not found' });
    return this.serialize(person);
  }

  async list(query: ListPeopleQueryDto) {
    const search = query.search?.trim();
    const normalized = search ? normalizeDni(search) : '';
    const where: Prisma.PersonWhereInput = search ? { OR: [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      ...(normalized ? [{ normalizedDni: { contains: normalized } } satisfies Prisma.PersonWhereInput] : []),
    ] } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.person.findMany({ where, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { clinicalPatient: { select: { personId: true } }, salaParticipations: { where: { endDate: null }, select: { id: true } }, treatments: { where: { status: TreatmentStatus.IN_PROGRESS }, select: { id: true } }, clinicalAppointments: { where: { status: ClinicalAppointmentStatus.SCHEDULED, startAt: { gt: new Date() } }, orderBy: { startAt: 'asc' }, take: 1, select: { id: true, startAt: true } } } }),
      this.prisma.person.count({ where }),
    ]);
    return { data: await Promise.all(rows.map((person) => this.serialize(person))), meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  private createData(input: CreatePersonDto, normalizedDni: string, phone: string, emergencyContactPhone: string | null): Prisma.PersonUncheckedCreateInput {
    return { sport: input.sport?.trim() || null, club: input.club?.trim() || null, firstName: input.firstName.trim(), lastName: input.lastName.trim(), dni: normalizedDni, normalizedDni, phone, birthDate: this.date(input.birthDate), email: input.email?.trim() || null, normalizedEmail: normalizeEmail(input.email), emergencyContactName: input.emergencyContactName?.trim() || null, emergencyContactPhone, socialWorkId: input.socialWorkId ?? null, affiliateNumber: input.socialWorkId ? input.affiliateNumber?.trim() || null : null };
  }
  private async validateSelectableSocialWork(id: string, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    const socialWork = await tx.socialWork.findUnique({ where: { id }, select: { isSelectable: true } });
    if (!socialWork?.isSelectable) throw new BadRequestException({ code: 'SOCIAL_WORK_NOT_SELECTABLE', message: 'Social work is not selectable' });
  }
  private validateDni(value: string): string {
    const normalized = typeof value === 'string' ? normalizeDni(value) : '';
    if (typeof value !== 'string' || /[^0-9 .-]/.test(value) || !/^\d{6,8}$/.test(normalized)) {
      throw new BadRequestException({ code: 'PERSON_DNI_INVALID', message: 'DNI must contain between 6 and 8 digits' });
    }
    return normalized;
  }
  private validatePhone(value: string, emergency = false): string {
    const normalized = typeof value === 'string' ? normalizePhone(value) : '';
    if (typeof value !== 'string' || /[^0-9 ().-]/.test(value) || !/^[1-9]\d{9}$/.test(normalized)) {
      throw new BadRequestException(emergency
        ? { code: 'PERSON_EMERGENCY_PHONE_INVALID', message: 'Emergency contact phone must contain 10 national digits' }
        : { code: 'PERSON_PHONE_INVALID', message: 'Phone must contain 10 national digits' });
    }
    return normalized;
  }
  private emergencyPhone(value: string | undefined): string | null {
    return value?.trim() ? this.validatePhone(value, true) : null;
  }
  private generatePin(): string { return randomInt(0, 10000).toString().padStart(4, '0'); }
  private validateBirthDate(value: string): void {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const today = `${values.year}-${values.month}-${values.day}`;
    if (value > today) throw new BadRequestException({ code: 'PERSON_BIRTH_DATE_FUTURE', message: 'Birth date cannot be future' });
  }
  private date(value: string): Date { return new Date(`${value}T00:00:00.000Z`); }
  private async serialize(person: { sport: string | null; club: string | null; id: string; firstName: string; lastName: string; dni: string; phone: string; birthDate: Date; email: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null; socialWorkId: string | null; affiliateNumber: string | null; clinicalPatient?: { personId: string } | null; salaParticipations?: { id: string }[]; treatments?: { id: string }[]; clinicalAppointments?: { id: string; startAt: Date }[] }) {
    const isClinicalPatient = Boolean(person.clinicalPatient);
    const hasSalaParticipation = (person.salaParticipations?.length ?? 0) > 0;
    return { sport: person.sport, club: person.club, id: person.id, firstName: person.firstName, lastName: person.lastName, dni: person.dni, phone: person.phone, birthDate: person.birthDate.toISOString().slice(0, 10), email: person.email, emergencyContactName: person.emergencyContactName, emergencyContactPhone: person.emergencyContactPhone, socialWorkId: person.socialWorkId, affiliateNumber: person.affiliateNumber, status: await this.activity.isActive(person.id) ? 'ACTIVE' as const : 'INACTIVE' as const, contexts: [hasSalaParticipation ? 'SALA' : '', isClinicalPatient ? 'CLINIC' : ''].filter(Boolean), hasSalaParticipation, isClinicalPatient, activeTreatmentCount: person.treatments?.length ?? 0, nextClinicalAppointment: person.clinicalAppointments?.[0]?.startAt?.toISOString() ?? null };
  }
  private duplicateDni(): never { throw new ConflictException({ code: 'PERSON_DNI_ALREADY_EXISTS', message: 'A person with this DNI already exists' }); }
}
