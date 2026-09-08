import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ClinicalAppointmentStatus, InternalUserStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentDto, AttendAppointmentDto, DirectAttentionDto, RescheduleAppointmentDto } from './clinic.dto';

const appointmentInclude = {
  person: { select: { id: true, firstName: true, lastName: true, dni: true } },
  professional: { select: { id: true, firstName: true, lastName: true } },
  service: { select: { id: true, name: true, discipline: true, durationMinutes: true, feeArs: true } },
} as const;

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
      include: { person: { select: { id: true, firstName: true, lastName: true, dni: true } } },
      orderBy: { person: { lastName: 'asc' } },
    });
    return rows.map((row) => row.person);
  }

  async registerDirectAttention(input: DirectAttentionDto) {
    const occurredAt = this.date(input.occurredAt, 'CLINIC_ATTENTION_DATE_INVALID');
    if (occurredAt > new Date()) throw new BadRequestException({ code: 'CLINIC_ATTENTION_FUTURE_NOT_ALLOWED', message: 'A direct attention cannot occur in the future' });
    const [patient, service] = await Promise.all([
      this.prisma.clinicalPatient.findUnique({ where: { personId: input.personId } }),
      this.prisma.clinicalService.findFirst({ where: { id: input.serviceId, isAvailable: true } }),
      this.validateProfessional(input.professionalId),
    ]);
    if (!patient) throw new BadRequestException({ code: 'CLINIC_PATIENT_REQUIRED', message: 'Patient registration required' });
    if (!service) throw new BadRequestException({ code: 'CLINIC_SERVICE_NOT_AVAILABLE', message: 'Selected service is not available' });
    const split = this.directChargeSplit(input, service.feeArs);
    await this.validateSocialWork(input.socialWorkId, input.socialWorkOrderId, input.personId);

    return this.prisma.$transaction(async (transaction) => {
      const attention = await transaction.clinicalAttention.create({
        data: { personId: input.personId, professionalId: input.professionalId, serviceId: service.id, occurredAt },
      });
      if (split) {
        await transaction.clinicalCharge.create({
          data: {
            attentionId: attention.id,
            personId: input.personId,
            serviceId: service.id,
            concept: service.name,
            totalAmount: service.feeArs,
            patientAmount: split.patientAmount,
            socialWorkAmount: split.socialWorkAmount,
            socialWorkId: input.socialWorkId ?? null,
            socialWorkOrderId: input.socialWorkOrderId ?? null,
          },
        });
      }
      return transaction.clinicalAttention.findUniqueOrThrow({
        where: { id: attention.id },
        include: { service: true, charge: true, professional: { select: { id: true, firstName: true, lastName: true } } },
      });
    });
  }

  listAttentions(personId?: string) {
    return this.prisma.clinicalAttention.findMany({
      where: personId ? { personId } : {},
      orderBy: { occurredAt: 'desc' },
      include: {
        professional: { select: { id: true, firstName: true, lastName: true } },
        service: { select: { id: true, name: true, discipline: true, durationMinutes: true, feeArs: true } },
        charge: true,
      },
    });
  }

  async listServices() {
    return this.prisma.clinicalService.findMany({
      where: { isAvailable: true },
      select: { id: true, name: true, discipline: true, durationMinutes: true, feeArs: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(input: AppointmentDto) {
    const startAt = this.date(input.startAt, 'CLINIC_APPOINTMENT_DATE_INVALID');
    if (startAt <= new Date()) throw new BadRequestException({ code: 'CLINIC_APPOINTMENT_NOT_FUTURE', message: 'Appointment must be future' });
    const [patient, service] = await Promise.all([
      this.prisma.clinicalPatient.findUnique({ where: { personId: input.personId } }),
      this.prisma.clinicalService.findFirst({ where: { id: input.serviceId, isAvailable: true } }),
      this.validateProfessional(input.professionalId),
    ]);
    if (!patient) throw new BadRequestException({ code: 'CLINIC_PATIENT_REQUIRED', message: 'Patient registration required' });
    if (!service) throw new BadRequestException({ code: 'CLINIC_SERVICE_NOT_AVAILABLE', message: 'Selected service is not available' });
    const overlapCount = await this.overlapCount(input.professionalId, startAt, service.durationMinutes);
    try {
      const appointment = await this.prisma.clinicalAppointment.create({
        data: {
          personId: input.personId,
          serviceId: service.id,
          professionalId: input.professionalId,
          startAt,
          durationMinutes: service.durationMinutes,
          operationalNote: input.operationalNote?.trim() || null,
        },
        include: appointmentInclude,
      });
      return { ...appointment, overlapCount };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new NotFoundException({ code: 'CLINIC_APPOINTMENT_REFERENCE_NOT_FOUND', message: 'Reference not found' });
      }
      throw error;
    }
  }

  list(from?: string, to?: string, personId?: string) {
    return this.prisma.clinicalAppointment.findMany({
      where: {
        ...(personId ? { personId } : {}),
        ...(from || to ? { startAt: { ...(from ? { gte: this.date(from, 'CLINIC_DATE_RANGE_INVALID') } : {}), ...(to ? { lt: this.date(to, 'CLINIC_DATE_RANGE_INVALID') } : {}) } } : {}),
      },
      orderBy: { startAt: 'asc' },
      include: appointmentInclude,
    });
  }

  async detail(id: string) {
    const appointment = await this.prisma.clinicalAppointment.findUnique({ where: { id }, include: appointmentInclude });
    if (!appointment) throw new NotFoundException({ code: 'CLINIC_APPOINTMENT_NOT_FOUND', message: 'Appointment not found' });
    return appointment;
  }

  async reschedule(id: string, input: RescheduleAppointmentDto) {
    const startAt = this.date(input.startAt, 'CLINIC_APPOINTMENT_DATE_INVALID');
    if (startAt <= new Date()) throw new BadRequestException({ code: 'CLINIC_APPOINTMENT_NOT_FUTURE', message: 'Appointment must be future' });
    await this.validateProfessional(input.professionalId);
    const current = await this.prisma.clinicalAppointment.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ code: 'CLINIC_APPOINTMENT_NOT_FOUND', message: 'Appointment not found' });
    if (current.status !== ClinicalAppointmentStatus.SCHEDULED) this.invalidTransition(current.status, ClinicalAppointmentStatus.SCHEDULED);
    const overlapCount = await this.overlapCount(input.professionalId, startAt, current.durationMinutes, id);
    const appointment = await this.prisma.clinicalAppointment.update({
      where: { id },
      data: { startAt, professionalId: input.professionalId, operationalNote: input.operationalNote?.trim() || null },
      include: appointmentInclude,
    });
    return { ...appointment, overlapCount };
  }

  async transition(id: string, status: 'CANCELLED' | 'ABSENT') {
    const changed = await this.prisma.clinicalAppointment.updateMany({ where: { id, status: ClinicalAppointmentStatus.SCHEDULED }, data: { status } });
    if (changed.count === 0) {
      const current = await this.prisma.clinicalAppointment.findUnique({ where: { id } });
      if (!current) throw new NotFoundException({ code: 'CLINIC_APPOINTMENT_NOT_FOUND', message: 'Appointment not found' });
      if (current.status !== status) this.invalidTransition(current.status, status);
    }
    return this.prisma.clinicalAppointment.findUniqueOrThrow({ where: { id }, include: appointmentInclude });
  }

  async correct(id: string, status: ClinicalAppointmentStatus) {
    return this.prisma.$transaction(async (transaction) => {
      const appointment = await transaction.clinicalAppointment.findUnique({
        where: { id },
        include: {
          attention: {
            select: {
              id: true,
              treatmentId: true,
              evolution: { select: { id: true } },
              charge: { select: { id: true } },
              _count: { select: { evaluations: true, clinicalIncomes: true } },
            },
          },
        },
      });
      if (!appointment) throw new NotFoundException({ code: 'CLINIC_APPOINTMENT_NOT_FOUND', message: 'Appointment not found' });
      if (appointment.status === status) return appointment;
      if (appointment.status !== ClinicalAppointmentStatus.ATTENDED || status === ClinicalAppointmentStatus.ATTENDED) {
        this.invalidTransition(appointment.status, status);
      }
      const attention = appointment.attention;
      if (!attention) throw new ConflictException({ code: 'CLINIC_ATTENDED_WITHOUT_ATTENTION', message: 'Attended appointment has no attention' });
      const hasDependencies = Boolean(attention.treatmentId || attention.evolution || attention.charge || attention._count.evaluations || attention._count.clinicalIncomes);
      if (hasDependencies) throw new ConflictException({ code: 'ATTENTION_HAS_DEPENDENCIES', message: 'Attention has clinical or economic dependencies' });
      await transaction.clinicalAttention.delete({ where: { id: attention.id } });
      return transaction.clinicalAppointment.update({ where: { id }, data: { status }, include: appointmentInclude });
    });
  }

  async attend(id: string, splitInput: AttendAppointmentDto, actorId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const appointment = await transaction.clinicalAppointment.findUnique({
        where: { id },
        include: { service: true },
      });
      if (!appointment) throw new NotFoundException({ code: 'CLINIC_APPOINTMENT_NOT_FOUND', message: 'Appointment not found' });
      if (appointment.status !== ClinicalAppointmentStatus.SCHEDULED) this.invalidTransition(appointment.status, ClinicalAppointmentStatus.ATTENDED);
      if (!appointment.service) throw new ConflictException({ code: 'CLINIC_APPOINTMENT_SERVICE_REQUIRED', message: 'Appointment has no billable clinical service' });
      const split = this.chargeSplit(splitInput, appointment.service.feeArs);
      await this.validateSocialWork(splitInput.socialWorkId, splitInput.socialWorkOrderId, appointment.personId, transaction);
      const changed = await transaction.clinicalAppointment.updateMany({
        where: { id, status: ClinicalAppointmentStatus.SCHEDULED },
        data: { status: ClinicalAppointmentStatus.ATTENDED },
      });
      if (changed.count !== 1) throw new ConflictException({ code: 'CONCURRENT_MODIFICATION', message: 'Appointment was modified concurrently' });
      const attention = await transaction.clinicalAttention.create({
        data: {
          appointmentId: id,
          personId: appointment.personId,
          professionalId: appointment.professionalId,
          serviceId: appointment.service.id,
          occurredAt: appointment.startAt,
        },
      });
      await transaction.clinicalCharge.create({
        data: {
          attentionId: attention.id,
          personId: appointment.personId,
          serviceId: appointment.service.id,
          concept: appointment.service.name,
          totalAmount: appointment.service.feeArs,
          patientAmount: split.patientAmount,
          socialWorkAmount: split.socialWorkAmount,
          socialWorkId: splitInput.socialWorkId ?? null,
          socialWorkOrderId: splitInput.socialWorkOrderId ?? null,
          createdById: actorId,
        },
      });
      return transaction.clinicalAppointment.findUniqueOrThrow({ where: { id }, include: appointmentInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async overlapCount(professionalId: string, startAt: Date, durationMinutes: number, excludeId?: string) {
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
    const candidates = await this.prisma.clinicalAppointment.findMany({
      where: { professionalId, status: ClinicalAppointmentStatus.SCHEDULED, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { startAt: true, durationMinutes: true },
    });
    return candidates.filter((candidate) => candidate.startAt < endAt && new Date(candidate.startAt.getTime() + candidate.durationMinutes * 60_000) > startAt).length;
  }

  private async validateProfessional(id: string) {
    const user = await this.prisma.internalUser.findUnique({ where: { id }, include: { roles: true } });
    if (!user || user.status !== InternalUserStatus.ACTIVE || !user.roles.some((entry) => entry.role === Role.KINESIOLOGIST || entry.role === Role.OSTEOPATH)) {
      throw new BadRequestException({ code: 'CLINIC_PROFESSIONAL_INVALID', message: 'Professional is not eligible' });
    }
  }

  private async validateSocialWork(
    socialWorkId: string | null | undefined,
    orderId: string | null | undefined,
    personId: string,
    transaction: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (!socialWorkId && !orderId) return;
    if (!socialWorkId) throw new BadRequestException({ code: 'CLINIC_SOCIAL_WORK_REQUIRED', message: 'Social work is required for a social work charge' });
    const socialWork = await transaction.socialWork.findUnique({ where: { id: socialWorkId }, select: { id: true } });
    const order = orderId ? await transaction.socialWorkOrder.findUnique({ where: { id: orderId } }) : null;
    if (!socialWork || (orderId && (!order || order.personId !== personId || order.socialWorkId !== socialWorkId))) {
      throw new BadRequestException({ code: 'CLINIC_SOCIAL_WORK_ORDER_INVALID', message: 'Social work order does not belong to the patient and social work' });
    }
  }

  private directChargeSplit(input: DirectAttentionDto, fee: Prisma.Decimal) {
    const exemptReason = input.exemptReason?.trim();
    if (exemptReason) {
      const patient = input.patientAmountArs ? this.money(input.patientAmountArs) : new Prisma.Decimal(0);
      const socialWork = input.socialWorkAmountArs ? this.money(input.socialWorkAmountArs) : new Prisma.Decimal(0);
      if (!patient.isZero() || !socialWork.isZero() || input.socialWorkOrderId || input.socialWorkId) {
        throw new BadRequestException({ code: 'CLINIC_EXEMPT_ATTENTION_HAS_CHARGE_SPLIT', message: 'An exempt attention cannot have billing amounts or an order' });
      }
      return null;
    }
    if (input.patientAmountArs === undefined || input.socialWorkAmountArs === undefined) {
      throw new BadRequestException({ code: 'CLINIC_CHARGE_SPLIT_REQUIRED', message: 'Patient and social work amounts are required' });
    }
    return this.chargeSplit({ patientAmountArs: input.patientAmountArs, socialWorkAmountArs: input.socialWorkAmountArs }, fee);
  }

  private chargeSplit(input: Pick<AttendAppointmentDto, 'patientAmountArs' | 'socialWorkAmountArs'>, fee: Prisma.Decimal) {
    const patientAmount = this.money(input.patientAmountArs);
    const socialWorkAmount = this.money(input.socialWorkAmountArs);
    if (!patientAmount.plus(socialWorkAmount).equals(fee)) {
      throw new BadRequestException({ code: 'CLINIC_CHARGE_SPLIT_TOTAL_MISMATCH', message: 'Charge split must equal the service fee' });
    }
    return { patientAmount, socialWorkAmount };
  }

  private money(value: string) {
    if (!/^(0|[1-9]\d*)$/.test(value)) throw new BadRequestException({ code: 'CLINIC_MONEY_INVALID', message: 'ARS amounts must be non-negative whole numbers' });
    return new Prisma.Decimal(value);
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
