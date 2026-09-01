import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import { ClinicalAppointmentStatus, Prisma, RoutineStatus, SalaOccurrenceStatus, SalaClinicalIndicationStatus, TreatmentFinishReason, TreatmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePersonDto, ListPeopleQueryDto, UpdatePersonDto } from './person.dto';
import { normalizeDni, normalizeEmail } from './person.normalization';
import { PersonActivityService } from './person-activity.service';

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService, private readonly activity: PersonActivityService) {}

  async create(input: CreatePersonDto) {
    const normalizedDni = normalizeDni(input.dni);
    if (!normalizedDni) throw new ConflictException({ code: 'PERSON_DNI_INVALID', message: 'DNI is invalid' });
    const existing = await this.prisma.person.findUnique({ where: { normalizedDni }, select: { id: true } });
    if (existing) this.duplicateDni();
    try {
      const pin = this.generatePin();
      const pinHash = await argon2.hash(pin, { type: argon2.argon2id });
      const person = await this.prisma.$transaction(async (tx) => {
        const created = await tx.person.create({ data: this.createData(input, normalizedDni) });
        await tx.portalCredential.create({ data: { personId: created.id, pinHash, mustChangePin: true } });
        return created;
      });
      return { ...(await this.serialize(person)), initialPin: pin };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') this.duplicateDni();
      throw error;
    }
  }

  async update(id: string, input: UpdatePersonDto) {
    const current = await this.prisma.person.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ code: 'PERSON_NOT_FOUND', message: 'Person not found' });
    try {
      const person = await this.prisma.person.update({ where: { id }, data: {
        ...(input.firstName !== undefined && { firstName: input.firstName.trim() }),
        ...(input.lastName !== undefined && { lastName: input.lastName.trim() }),
        ...(input.dni !== undefined && { dni: input.dni.trim(), normalizedDni: normalizeDni(input.dni) }),
        ...(input.phone !== undefined && { phone: input.phone.trim() }),
        ...(input.birthDate !== undefined && { birthDate: this.date(input.birthDate) }),
        ...(input.email !== undefined && { email: input.email?.trim() || null, normalizedEmail: normalizeEmail(input.email) }),
        ...(input.emergencyContactName !== undefined && { emergencyContactName: input.emergencyContactName?.trim() || null }),
        ...(input.emergencyContactPhone !== undefined && { emergencyContactPhone: input.emergencyContactPhone?.trim() || null }),
        ...(input.socialWorkId !== undefined && { socialWorkId: input.socialWorkId || null }),
        ...(input.affiliateNumber !== undefined && { affiliateNumber: input.affiliateNumber?.trim() || null }),
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
    const today = this.date(new Date().toISOString().slice(0, 10));
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const person = await tx.person.findUnique({ where: { id }, select: { id: true } });
      if (!person) throw new NotFoundException({ code: 'PERSON_NOT_FOUND', message: 'Person not found' });
      const participations = await tx.salaParticipation.findMany({ where: { personId: id, endDate: null }, select: { id: true } });
      for (const participation of participations) {
        await tx.fixedSalaBooking.updateMany({ where: { salaParticipationId: participation.id, OR: [{ endDate: null }, { endDate: { gt: today } }] }, data: { endDate: today } });
        await tx.oneOffReservation.updateMany({ where: { salaParticipationId: participation.id, date: { gte: today }, cancelledAt: null }, data: { cancelledAt: now } });
        await tx.routine.updateMany({ where: { salaParticipationId: participation.id, status: RoutineStatus.ACTIVE }, data: { status: RoutineStatus.HISTORICAL } });
      }
      await tx.salaParticipation.updateMany({ where: { personId: id, endDate: null }, data: { endDate: today } });
      await tx.salaOccurrence.updateMany({ where: { personId: id, date: { gte: today }, status: { not: SalaOccurrenceStatus.CANCELLED } }, data: { status: SalaOccurrenceStatus.CANCELLED, lastModifiedBy: actorId } });
      await tx.salaClinicalIndication.updateMany({ where: { personId: id, status: SalaClinicalIndicationStatus.ACTIVE }, data: { status: SalaClinicalIndicationStatus.CLOSED, closedAt: now, closedById: actorId } });
      await tx.treatment.updateMany({ where: { personId: id, status: TreatmentStatus.IN_PROGRESS }, data: { status: TreatmentStatus.FINISHED, finishDate: today, finishReason: TreatmentFinishReason.INTERRUPTION } });
      await tx.clinicalAppointment.updateMany({ where: { personId: id, status: ClinicalAppointmentStatus.SCHEDULED, startAt: { gt: now } }, data: { status: ClinicalAppointmentStatus.CANCELLED } });
      await tx.session.updateMany({ where: { personId: id, kind: 'PORTAL', revokedAt: null }, data: { revokedAt: now } });
    });
    return this.get(id);
  }

  async get(id: string) {
    const person = await this.prisma.person.findUnique({ where: { id }, include: { clinicalPatient: { select: { personId: true } }, salaParticipations: { where: { endDate: null }, select: { id: true } } } });
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
      this.prisma.person.findMany({ where, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { clinicalPatient: { select: { personId: true } }, salaParticipations: { where: { endDate: null }, select: { id: true } } } }),
      this.prisma.person.count({ where }),
    ]);
    return { data: await Promise.all(rows.map((person) => this.serialize(person))), meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  private createData(input: CreatePersonDto, normalizedDni: string): Prisma.PersonUncheckedCreateInput {
    return { firstName: input.firstName.trim(), lastName: input.lastName.trim(), dni: input.dni.trim(), normalizedDni, phone: input.phone.trim(), birthDate: this.date(input.birthDate), email: input.email?.trim() || null, normalizedEmail: normalizeEmail(input.email), emergencyContactName: input.emergencyContactName?.trim() || null, emergencyContactPhone: input.emergencyContactPhone?.trim() || null, socialWorkId: input.socialWorkId ?? null, affiliateNumber: input.affiliateNumber?.trim() || null };
  }
  private generatePin(): string { return randomInt(0, 10000).toString().padStart(4, '0'); }
  private date(value: string): Date { return new Date(`${value}T00:00:00.000Z`); }
  private async serialize(person: { id: string; firstName: string; lastName: string; dni: string; phone: string; birthDate: Date; email: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null; socialWorkId: string | null; affiliateNumber: string | null; clinicalPatient?: { personId: string } | null; salaParticipations?: { id: string }[] }) {
    const isClinicalPatient = Boolean(person.clinicalPatient);
    const hasSalaParticipation = (person.salaParticipations?.length ?? 0) > 0;
    return { id: person.id, firstName: person.firstName, lastName: person.lastName, dni: person.dni, phone: person.phone, birthDate: person.birthDate.toISOString().slice(0, 10), email: person.email, emergencyContactName: person.emergencyContactName, emergencyContactPhone: person.emergencyContactPhone, socialWorkId: person.socialWorkId, affiliateNumber: person.affiliateNumber, status: await this.activity.isActive(person.id) ? 'ACTIVE' as const : 'INACTIVE' as const, contexts: [hasSalaParticipation ? 'SALA' : '', isClinicalPatient ? 'CLINIC' : ''].filter(Boolean), hasSalaParticipation, isClinicalPatient };
  }
  private duplicateDni(): never { throw new ConflictException({ code: 'PERSON_DNI_ALREADY_EXISTS', message: 'A person with this DNI already exists' }); }
}
