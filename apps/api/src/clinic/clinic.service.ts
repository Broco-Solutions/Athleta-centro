import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ClinicalAppointmentStatus,
  ClinicalCoverage,
  InternalUserStatus,
  Prisma,
  Role,
  TreatmentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AppointmentDto,
  AttendAppointmentDto,
  CorrectAppointmentDto,
  DirectAttentionDto,
  ListClinicalProfessionalsQueryDto,
  ListClinicalAppointmentsQueryDto,
  ListClinicalPatientsOverviewQueryDto,
  RescheduleAppointmentDto,
  SetClinicalAttentionTreatmentDto,
  UpdateClinicalAttentionDto,
} from './clinic.dto';
import { hasTreatmentWithoutRecentAttention } from './treatment-recent-attention';

type ClinicalProfessionalRole = 'KINESIOLOGIST' | 'OSTEOPATH';
const clinicalRoles: Role[] = [Role.KINESIOLOGIST, Role.OSTEOPATH];

const professionalSelect = {
  id: true,
  firstName: true,
  lastName: true,
  roles: { select: { role: true } },
} as const;

const appointmentSelect = {
  id: true,
  personId: true,
  professionalId: true,
  startAt: true,
  durationMinutes: true,
  status: true,
  operationalNote: true,
  person: { select: { id: true, firstName: true, lastName: true, dni: true } },
  professional: { select: professionalSelect },
  attention: {
    select: {
      id: true,
      coverage: true,
      treatmentId: true,
      evolution: { select: { id: true } },
      charge: { select: { id: true } },
      _count: { select: { evaluations: true, clinicalIncomes: true } },
    },
  },
} as const;

const attentionSelect = {
  id: true,
  appointmentId: true,
  personId: true,
  professionalId: true,
  occurredAt: true,
  coverage: true,
  treatmentId: true,
  person: { select: { id: true, firstName: true, lastName: true, dni: true } },
  professional: { select: professionalSelect },
} as const;

const attentionDependencySelect = {
  id: true,
  appointmentId: true,
  treatmentId: true,
  evolution: { select: { id: true } },
  charge: { select: { id: true } },
  _count: { select: { evaluations: true, clinicalIncomes: true } },
} as const;

type AppointmentRow = Prisma.ClinicalAppointmentGetPayload<{ select: typeof appointmentSelect }>;
type AttentionRow = Prisma.ClinicalAttentionGetPayload<{ select: typeof attentionSelect }>;

@Injectable()
export class ClinicService {
  constructor(private readonly prisma: PrismaService) {}

  async registerPatient(personId: string, actorId: string) {
    const person = await this.prisma.person.findUnique({ where: { id: personId } });
    if (!person) throw new NotFoundException({ code: 'PERSON_NOT_FOUND', message: 'Person not found' });
    return this.prisma.clinicalPatient.upsert({ where: { personId }, create: { personId, registeredById: actorId }, update: {} });
  }

  async listPatients() {
    const rows = await this.prisma.clinicalPatient.findMany({
      select: { person: { select: { id: true, firstName: true, lastName: true, dni: true } } },
      orderBy: { person: { lastName: 'asc' } },
    });
    return rows.map((row) => row.person);
  }

  async listProfessionals(query: ListClinicalProfessionalsQueryDto = {}) {
    const occurredAt = query.occurredAt ? this.date(query.occurredAt, 'CLINIC_ATTENTION_DATE_INVALID') : null;
    if (occurredAt && occurredAt > new Date()) {
      throw new BadRequestException({ code: 'CLINIC_ATTENTION_FUTURE_NOT_ALLOWED', message: 'An attention cannot occur in the future' });
    }
    const includeInactive = occurredAt ? this.isHistoricalAttention(occurredAt) : false;
    const rows = await this.prisma.internalUser.findMany({
      where: {
        ...(includeInactive ? {} : { status: InternalUserStatus.ACTIVE }),
        roles: { some: { role: { in: [...clinicalRoles] } } },
      },
      select: professionalSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return rows.map((row) => this.mapProfessional(row));
  }

  async listPatientOverview(query: ListClinicalPatientsOverviewQueryDto, now = new Date()) {
    const search = query.search?.trim();
    const dni = search?.replace(/[^0-9]/g, '');
    const rows = await this.prisma.clinicalPatient.findMany({
      where: search ? { person: { OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        ...(dni ? [{ normalizedDni: { contains: dni } }] : []),
      ] } } : {},
      orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }, { personId: 'asc' }],
      include: {
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            dni: true,
            sport: true,
            club: true,
            salaParticipations: { where: { endDate: null }, select: { id: true }, take: 1 },
            clinicalAppointments: { where: { status: ClinicalAppointmentStatus.SCHEDULED, startAt: { gt: now } }, orderBy: { startAt: 'asc' }, select: { id: true, startAt: true }, take: 1 },
            clinicalAttentions: { orderBy: { occurredAt: 'desc' }, select: { occurredAt: true }, take: 1 },
            treatments: {
              where: { status: TreatmentStatus.IN_PROGRESS },
              select: {
                startDate: true,
                attentions: { orderBy: { occurredAt: 'desc' }, select: { occurredAt: true }, take: 1 },
              },
            },
          },
        },
      },
    });
    const filtered = rows.filter(({ person }) => {
      const hasTreatmentInProgress = person.treatments.length > 0;
      if (query.treatmentInProgress === 'YES' && !hasTreatmentInProgress) return false;
      if (query.treatmentInProgress === 'NO' && hasTreatmentInProgress) return false;
      return !query.withoutRecentAttentionDays || person.treatments.some((treatment) =>
        hasTreatmentWithoutRecentAttention(treatment, query.withoutRecentAttentionDays!, now),
      );
    });
    const total = filtered.length;
    const pageRows = filtered.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
    return {
      data: pageRows.map(({ person }) => ({
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        dni: person.dni,
        sport: person.sport,
        club: person.club,
        hasSalaParticipation: person.salaParticipations.length > 0,
        nextAppointmentAt: person.clinicalAppointments[0]?.startAt.toISOString() ?? null,
        status: person.salaParticipations.length > 0 || person.treatments.length > 0 || person.clinicalAppointments.length > 0 ? 'ACTIVE' as const : 'INACTIVE' as const,
        lastAttentionAt: person.clinicalAttentions[0]?.occurredAt.toISOString() ?? null,
      })),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }

  async registerDirectAttention(input: DirectAttentionDto) {
    const occurredAt = this.date(input.occurredAt, 'CLINIC_ATTENTION_DATE_INVALID');
    if (occurredAt > new Date()) {
      throw new BadRequestException({ code: 'CLINIC_ATTENTION_FUTURE_NOT_ALLOWED', message: 'A direct attention cannot occur in the future' });
    }
    const [patient] = await Promise.all([
      this.prisma.clinicalPatient.findUnique({ where: { personId: input.personId } }),
      this.validateProfessionalForAttention(input.professionalId, occurredAt),
    ]);
    if (!patient) throw new BadRequestException({ code: 'CLINIC_PATIENT_REQUIRED', message: 'Patient registration required' });
    const attention = await this.prisma.clinicalAttention.create({
      data: {
        personId: input.personId,
        professionalId: input.professionalId,
        occurredAt,
        coverage: input.coverage,
      },
      select: attentionSelect,
    });
    return this.mapAttention(attention);
  }

  async listAttentions(personId?: string) {
    const rows = await this.prisma.clinicalAttention.findMany({
      where: personId ? { personId } : {},
      orderBy: { occurredAt: 'desc' },
      select: attentionSelect,
    });
    return rows.map((row) => this.mapAttention(row));
  }

  async updateAttention(id: string, input: UpdateClinicalAttentionDto) {
    const occurredAt = this.date(input.occurredAt, 'CLINIC_ATTENTION_DATE_INVALID');
    if (occurredAt > new Date()) {
      throw new BadRequestException({ code: 'CLINIC_ATTENTION_FUTURE_NOT_ALLOWED', message: 'An attention cannot occur in the future' });
    }
    await this.validateProfessionalForAttention(input.professionalId, occurredAt);
    const current = await this.prisma.clinicalAttention.findUnique({ where: { id }, select: { id: true } });
    if (!current) throw new NotFoundException({ code: 'CLINIC_ATTENTION_NOT_FOUND', message: 'Attention not found' });
    const attention = await this.prisma.clinicalAttention.update({
      where: { id },
      data: { occurredAt, professionalId: input.professionalId, coverage: input.coverage },
      select: attentionSelect,
    });
    return this.mapAttention(attention);
  }

  async deleteEmptyAttention(id: string) {
    try {
      await this.prisma.$transaction(async (transaction) => {
        const attention = await transaction.clinicalAttention.findUnique({ where: { id }, select: attentionDependencySelect });
        if (!attention) throw new NotFoundException({ code: 'CLINIC_ATTENTION_NOT_FOUND', message: 'Attention not found' });
        if (attention.appointmentId) {
          throw new ConflictException({ code: 'ATTENTION_APPOINTMENT_ORIGIN_DELETE_FORBIDDEN', message: 'An attention created from an appointment must be removed by correcting the appointment' });
        }
        if (this.attentionHasDependencies(attention)) {
          throw new ConflictException({ code: 'ATTENTION_HAS_DEPENDENCIES', message: 'Attention has clinical or economic dependencies' });
        }
        await transaction.clinicalAttention.delete({ where: { id } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2003', 'P2034'].includes(error.code)) {
        throw new ConflictException({ code: 'ATTENTION_HAS_DEPENDENCIES', message: 'Attention has clinical or economic dependencies' });
      }
      throw error;
    }
  }

  async setAttentionTreatment(id: string, input: SetClinicalAttentionTreatmentDto) {
    const attention = await this.prisma.clinicalAttention.findUnique({ where: { id }, select: { id: true, personId: true } });
    if (!attention) throw new NotFoundException({ code: 'CLINIC_ATTENTION_NOT_FOUND', message: 'Attention not found' });
    const treatmentId = input.treatmentId ?? null;
    if (treatmentId) {
      const treatment = await this.prisma.treatment.findUnique({ where: { id: treatmentId }, select: { id: true, personId: true } });
      if (!treatment || treatment.personId !== attention.personId) {
        throw new BadRequestException({ code: 'ATTENTION_TREATMENT_PERSON_MISMATCH', message: 'Treatment does not belong to the attention person' });
      }
    }
    const result = await this.prisma.clinicalAttention.update({ where: { id }, data: { treatmentId }, select: attentionSelect });
    return this.mapAttention(result);
  }

  async create(input: AppointmentDto) {
    const startAt = this.date(input.startAt, 'CLINIC_APPOINTMENT_DATE_INVALID');
    if (startAt <= new Date()) {
      throw new BadRequestException({ code: 'CLINIC_APPOINTMENT_NOT_FUTURE', message: 'Appointment must be future' });
    }
    const [patient] = await Promise.all([
      this.prisma.clinicalPatient.findUnique({ where: { personId: input.personId } }),
      this.validateProfessional(input.professionalId),
    ]);
    if (!patient) throw new BadRequestException({ code: 'CLINIC_PATIENT_REQUIRED', message: 'Patient registration required' });
    const overlapCount = await this.overlapCount(input.professionalId, startAt, input.durationMinutes);
    try {
      const appointment = await this.prisma.clinicalAppointment.create({
        data: {
          personId: input.personId,
          professionalId: input.professionalId,
          startAt,
          durationMinutes: input.durationMinutes,
          operationalNote: input.operationalNote?.trim() || null,
        },
        select: appointmentSelect,
      });
      return this.mapAppointment(appointment, overlapCount);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new NotFoundException({ code: 'CLINIC_APPOINTMENT_REFERENCE_NOT_FOUND', message: 'Reference not found' });
      }
      throw error;
    }
  }

  async list(query: ListClinicalAppointmentsQueryDto, now = new Date()) {
    const from = query.from ? this.date(query.from, 'CLINIC_DATE_RANGE_INVALID') : undefined;
    const to = query.to ? this.date(query.to, 'CLINIC_DATE_RANGE_INVALID') : undefined;
    if (from && to && from >= to) {
      throw new BadRequestException({ code: 'CLINIC_DATE_RANGE_INVALID', message: 'The date range must have a positive duration' });
    }
    const rows = await this.prisma.clinicalAppointment.findMany({
      where: {
        ...(query.personId ? { personId: query.personId } : {}),
        ...(query.professionalId ? { professionalId: query.professionalId } : {}),
        ...(query.pendingPastScheduled === 'YES'
          ? { status: ClinicalAppointmentStatus.SCHEDULED, startAt: { lt: now } }
          : from || to
            ? { startAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
            : {}),
      },
      orderBy: { startAt: 'asc' },
      select: appointmentSelect,
    });
    return rows.map((row) => this.mapAppointment(row));
  }

  async detail(id: string) {
    const appointment = await this.prisma.clinicalAppointment.findUnique({ where: { id }, select: appointmentSelect });
    if (!appointment) throw new NotFoundException({ code: 'CLINIC_APPOINTMENT_NOT_FOUND', message: 'Appointment not found' });
    return this.mapAppointment(appointment);
  }

  async reschedule(id: string, input: RescheduleAppointmentDto) {
    const startAt = this.date(input.startAt, 'CLINIC_APPOINTMENT_DATE_INVALID');
    if (startAt <= new Date()) {
      throw new BadRequestException({ code: 'CLINIC_APPOINTMENT_NOT_FUTURE', message: 'Appointment must be future' });
    }
    await this.validateProfessional(input.professionalId);
    const current = await this.prisma.clinicalAppointment.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ code: 'CLINIC_APPOINTMENT_NOT_FOUND', message: 'Appointment not found' });
    if (current.status !== ClinicalAppointmentStatus.SCHEDULED) {
      this.invalidTransition(current.status, ClinicalAppointmentStatus.SCHEDULED);
    }
    const overlapCount = await this.overlapCount(input.professionalId, startAt, input.durationMinutes, id);
    const appointment = await this.prisma.clinicalAppointment.update({
      where: { id },
      data: {
        startAt,
        professionalId: input.professionalId,
        durationMinutes: input.durationMinutes,
        operationalNote: input.operationalNote?.trim() || null,
      },
      select: appointmentSelect,
    });
    return this.mapAppointment(appointment, overlapCount);
  }

  transition(id: string, status: 'CANCELLED' | 'ABSENT') {
    return this.correct(id, { status });
  }

  async correct(id: string, input: CorrectAppointmentDto) {
    if (input.status === ClinicalAppointmentStatus.ATTENDED && !input.coverage) {
      throw new BadRequestException({ code: 'CLINIC_ATTENTION_COVERAGE_REQUIRED', message: 'Coverage is required when marking an appointment attended' });
    }
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const appointment = await transaction.clinicalAppointment.findUnique({ where: { id }, select: appointmentSelect });
        if (!appointment) throw new NotFoundException({ code: 'CLINIC_APPOINTMENT_NOT_FOUND', message: 'Appointment not found' });
        if (appointment.status === input.status) {
          if (input.status === ClinicalAppointmentStatus.ATTENDED && !appointment.attention) {
            throw new ConflictException({ code: 'CLINIC_ATTENDED_WITHOUT_ATTENTION', message: 'Attended appointment has no attention' });
          }
          return this.mapAppointment(appointment);
        }

        if (appointment.status === ClinicalAppointmentStatus.ATTENDED) {
          const attention = appointment.attention;
          if (!attention) {
            throw new ConflictException({ code: 'CLINIC_ATTENDED_WITHOUT_ATTENTION', message: 'Attended appointment has no attention' });
          }
          const hasDependencies = Boolean(
            attention.treatmentId
            || attention.evolution
            || attention.charge
            || attention._count.evaluations
            || attention._count.clinicalIncomes,
          );
          if (hasDependencies) {
            throw new ConflictException({ code: 'ATTENTION_HAS_DEPENDENCIES', message: 'Attention has clinical or economic dependencies' });
          }
          await transaction.clinicalAttention.delete({ where: { id: attention.id } });
        }

        const changed = await transaction.clinicalAppointment.updateMany({
          where: { id, status: appointment.status },
          data: { status: input.status },
        });
        if (changed.count !== 1) {
          throw new ConflictException({ code: 'CONCURRENT_MODIFICATION', message: 'Appointment was modified concurrently' });
        }

        if (input.status === ClinicalAppointmentStatus.ATTENDED) {
          if (appointment.attention) {
            throw new ConflictException({ code: 'CLINIC_APPOINTMENT_ATTENTION_CONFLICT', message: 'Appointment already has an attention' });
          }
          await transaction.clinicalAttention.create({
            data: {
              appointmentId: id,
              personId: appointment.personId,
              professionalId: appointment.professionalId,
              occurredAt: appointment.startAt,
              coverage: input.coverage as ClinicalCoverage,
            },
          });
        }

        const result = await transaction.clinicalAppointment.findUniqueOrThrow({ where: { id }, select: appointmentSelect });
        return this.mapAppointment(result);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
        throw new ConflictException({ code: 'CONCURRENT_MODIFICATION', message: 'Appointment was modified concurrently' });
      }
      throw error;
    }
  }

  attend(id: string, input: AttendAppointmentDto) {
    return this.correct(id, { status: ClinicalAppointmentStatus.ATTENDED, coverage: input.coverage });
  }

  private async overlapCount(professionalId: string, startAt: Date, durationMinutes: number, excludeId?: string) {
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
    const candidates = await this.prisma.clinicalAppointment.findMany({
      where: {
        professionalId,
        status: ClinicalAppointmentStatus.SCHEDULED,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { startAt: true, durationMinutes: true },
    });
    return candidates.filter((candidate) =>
      candidate.startAt < endAt
      && new Date(candidate.startAt.getTime() + candidate.durationMinutes * 60_000) > startAt,
    ).length;
  }

  private async validateProfessional(id: string) {
    const user = await this.prisma.internalUser.findUnique({ where: { id }, include: { roles: true } });
    if (!user || user.status !== InternalUserStatus.ACTIVE || !user.roles.some((entry) => clinicalRoles.includes(entry.role))) {
      throw new BadRequestException({ code: 'CLINIC_PROFESSIONAL_INVALID', message: 'Professional is not eligible' });
    }
  }

  private async validateProfessionalForAttention(id: string, occurredAt: Date) {
    const user = await this.prisma.internalUser.findUnique({ where: { id }, include: { roles: true } });
    const isClinicalProfessional = user?.roles.some((entry) => clinicalRoles.includes(entry.role));
    if (!user || !isClinicalProfessional || (!this.isHistoricalAttention(occurredAt) && user.status !== InternalUserStatus.ACTIVE)) {
      throw new BadRequestException({ code: 'CLINIC_PROFESSIONAL_INVALID', message: 'Professional is not eligible for this attention date' });
    }
  }

  private isHistoricalAttention(occurredAt: Date, now = new Date()) {
    return this.operationalDate(occurredAt) < this.operationalDate(now);
  }

  private operationalDate(value: Date) {
    const fields = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) => fields.find((field) => field.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  private attentionHasDependencies(attention: Prisma.ClinicalAttentionGetPayload<{ select: typeof attentionDependencySelect }>) {
    return Boolean(attention.treatmentId || attention.evolution || attention.charge || attention._count.evaluations || attention._count.clinicalIncomes);
  }

  private mapAppointment(row: AppointmentRow, overlapCount = 0) {
    return {
      id: row.id,
      personId: row.personId,
      professionalId: row.professionalId,
      startAt: row.startAt.toISOString(),
      durationMinutes: row.durationMinutes,
      status: row.status,
      operationalNote: row.operationalNote,
      person: row.person,
      professional: this.mapProfessional(row.professional),
      hasAttention: Boolean(row.attention),
      hasEvolution: Boolean(row.attention?.evolution),
      coverage: row.attention?.coverage ?? null,
      overlapCount,
    };
  }

  private mapAttention(row: AttentionRow) {
    return {
      id: row.id,
      personId: row.personId,
      professionalId: row.professionalId,
      occurredAt: row.occurredAt.toISOString(),
      coverage: row.coverage,
      origin: row.appointmentId ? 'APPOINTMENT' as const : 'DIRECT' as const,
      person: row.person,
      professional: this.mapProfessional(row.professional),
    };
  }

  private mapProfessional(row: {
    id: string;
    firstName: string;
    lastName: string;
    roles: Array<{ role: Role }>;
  }) {
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      roles: row.roles.map((entry) => entry.role).filter(
        (role): role is ClinicalProfessionalRole => role === Role.KINESIOLOGIST || role === Role.OSTEOPATH,
      ),
    };
  }

  private date(value: string, code: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException({ code, message: 'Invalid date' });
    return date;
  }

  private invalidTransition(from: ClinicalAppointmentStatus, to: ClinicalAppointmentStatus): never {
    throw new ConflictException({ code: 'CLINIC_APPOINTMENT_TRANSITION_NOT_ALLOWED', message: `Appointment cannot transition from ${from} to ${to}` });
  }
}
