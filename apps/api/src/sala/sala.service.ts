import { BadRequestException, ForbiddenException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FinancialAdjustmentKind, Prisma, Role, RoutineStatus, SalaChargeKind, SalaOccurrenceOrigin, SalaOccurrenceStatus, SalaScheduleExceptionType, InternalUserStatus, SalaWeekday } from '@prisma/client';
import { PeopleService } from '../people/people.service';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceCatalogService } from '../finance/finance.service';
import type { SalaStudentListItemDto, SalaDashboardDto, SalaDashboardPersonDto, JoinSpontaneousSalaDto, CreateSpontaneousSalaStudentDto, SalaPaymentDto, CreateSalaStudentDto, ChangeFixedBookingDto, ExerciseDefinitionDto, FixedBookingDto, OneOffReservationDto, OccurrenceReferenceDto, CorrectPhysicalEvaluationDto, PhysicalTestResultDto, PhysicalEvaluationDto, PhysicalTestDefinitionDto, PlanDto, RoutineTemplateDto, RoutineDayDto, ReplaceRoutineDto, ReplaceScheduleSlotDto, ReplaceWeeklyScheduleDto, SalaServiceTypeDto, ScheduleExceptionDto, ScheduleSlotDto, SpontaneousOccurrenceDto, UpdateSalaConfigurationDto } from './sala.dto';
const paymentActorSelect = { id: true, firstName: true, lastName: true } satisfies Prisma.InternalUserSelect;
const paymentResponseInclude = {
  paymentMethod: true,
  allocations: true,
  registeredBy: { select: paymentActorSelect },
  reversal: { include: { registeredBy: { select: paymentActorSelect } } },
} satisfies Prisma.SalaPaymentInclude;
const physicalTestSelect = { id: true, name: true, type: true, description: true, isActive: true } satisfies Prisma.PhysicalTestDefinitionSelect;
const physicalEvaluationSelect = {
  id: true, personId: true, salaParticipationId: true, professorId: true, evaluationDate: true, observation: true,
  professor: { select: { id: true, firstName: true, lastName: true } },
  results: { select: { id: true, testDefinitionId: true, resultText: true, testDefinition: { select: physicalTestSelect } }, orderBy: { id: 'asc' } },
} satisfies Prisma.PhysicalEvaluationSelect;
const SALA_DEFAULT_DURATION_MINUTES = 60;
const eligibleProfessorWhere = { status: InternalUserStatus.ACTIVE, roles: { some: { role: Role.PROFESSOR } } } satisfies Prisma.InternalUserWhereInput;
const planServicesInclude = {
  services: {
    include: { serviceType: { select: { id: true, name: true, durationMinutes: true, isSelectable: true } } },
    orderBy: { serviceType: { name: 'asc' } },
  },
} satisfies Prisma.SalaPlanInclude;
type PlanWithServices = Prisma.SalaPlanGetPayload<{ include: typeof planServicesInclude }>;
@Injectable()
export class SalaService {
  constructor(private readonly prisma: PrismaService, private readonly financeCatalog: FinanceCatalogService, private readonly people: PeopleService) {}

  addCalendarMonthClamped(date: Date): Date {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
  }

  paymentCoversDate(payment: { coverageStartDate: Date; coverageEndDate: Date; createdAt: Date; reversal?: { createdAt: Date } | null }, date: Date, activityStart?: Date): boolean {
    if (payment.coverageStartDate > date || payment.coverageEndDate < date) return false;
    if (activityStart && activityStart <= new Date()) {
      return payment.createdAt <= activityStart && (!payment.reversal || payment.reversal.createdAt > activityStart);
    }
    return !payment.reversal;
  }

  continuousValidityEnd(payments: Array<{ coverageStartDate: Date; coverageEndDate: Date; reversal?: unknown }>, referenceDate: Date): Date | null {
    const ordered = payments.filter(payment => !payment.reversal).sort((a, b) => a.coverageStartDate.getTime() - b.coverageStartDate.getTime());
    let end: Date | null = null;
    for (const payment of ordered) {
      if (!end) {
        if (payment.coverageStartDate <= referenceDate && referenceDate <= payment.coverageEndDate) end = payment.coverageEndDate;
      } else if (payment.coverageStartDate.getTime() <= end.getTime() + 86_400_000) {
        if (payment.coverageEndDate > end) end = payment.coverageEndDate;
      } else break;
    }
    return end;
  }

  async validity(personId: string, referenceDate = this.todayOperational()) {
    const payments = await this.prisma.salaPayment.findMany({ where: { personId, reversal: null, coverageEndDate: { gte: this.date(referenceDate) } } });
    const end = this.continuousValidityEnd(payments, this.date(referenceDate));
    return { hasValidAccess: end !== null, validUntil: end?.toISOString().slice(0, 10) ?? null };
  }
  listPaymentMethods() { return this.financeCatalog.listSelectable(); }
  async listPayments(personId: string) {
    const payments = await this.prisma.salaPayment.findMany({ where: { personId }, include: paymentResponseInclude, orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }] });
    return payments.map(payment => this.paymentResponse(payment));
  }
  private paymentResponse(payment: Prisma.SalaPaymentGetPayload<{ include: typeof paymentResponseInclude }>) {
    return { ...payment, paidAt: payment.paidAt.toISOString().slice(0, 10), coverageStartDate: payment.coverageStartDate.toISOString().slice(0, 10), coverageEndDate: payment.coverageEndDate.toISOString().slice(0, 10), amount: payment.amount.toString(), planName: payment.planNameSnapshot };
  }
  async createPayment(input: SalaPaymentDto, actorId: string, { canManagePayment } = { canManagePayment: true }) {
    input = { ...input, personId: input.personId.toLowerCase(), planId: input.planId.toLowerCase(), paymentMethodId: input.paymentMethodId.toLowerCase(), operationId: input.operationId.toLowerCase() };
    this.validatePaidAt(input.paidAt);
    const amount = this.positiveMoney(input.amount, 'SALA_PAYMENT_AMOUNT_INVALID');
    const payment = await this.prisma.$transaction(async (tx) => {
      await this.lockPaymentPerson(tx, input.personId);
      const existing = await tx.salaPayment.findUnique({ where: { operationId: input.operationId }, include: paymentResponseInclude });
      if (existing) {
        const allocations = input.allocations ?? [];
        if (existing.personId !== input.personId || existing.planId !== input.planId || existing.paidAt.toISOString().slice(0, 10) !== input.paidAt || !existing.amount.equals(amount) || existing.paymentMethodId !== input.paymentMethodId || existing.adjustmentReason !== (input.adjustmentReason?.trim() || null) || existing.allocations.length !== allocations.length || allocations.some(allocation => !existing.allocations.some(old => old.chargeId === allocation.chargeId && old.operationId === allocation.operationId && old.amount.equals(allocation.amount)))) {
          throw new ConflictException({ code: 'SALA_PAYMENT_OPERATION_CONFLICT', message: 'El operationId ya pertenece a otro pago.' });
        }
        return existing;
      }
      const participation = await tx.salaParticipation.findFirst({ where: { personId: input.personId, endDate: null } });
      if (!participation) throw new BadRequestException({ code: 'SALA_PARTICIPATION_REQUIRED', message: 'Se necesita una participación activa de Sala para registrar pagos.' });
      await this.assertPaymentMethodSelectable(tx, input.paymentMethodId);
      const plan = await tx.salaPlan.findUnique({ where: { id: input.planId } });
      if (!plan?.isSelectable) throw new BadRequestException({ code: 'SALA_PLAN_INVALID', message: 'El Plan ya no está disponible.' });
      if (!canManagePayment && (!amount.equals(plan.monthlyAmount) || input.adjustmentReason?.trim())) throw new ForbiddenException({ code: 'SALA_PAYMENT_AMOUNT_ADJUSTMENT_FORBIDDEN', message: 'La renovación debe utilizar el precio actual del Plan, sin ajustes.' });
      if (canManagePayment) this.validatePaymentAdjustment(amount, plan.monthlyAmount, input.adjustmentReason);
      const paidAt = this.date(input.paidAt);
      const payments = await tx.salaPayment.findMany({ where: { personId: input.personId, reversal: null, coverageEndDate: { gte: paidAt } } });
      const currentEnd = this.continuousValidityEnd(payments, paidAt);
      const coverageStartDate = currentEnd ? new Date(currentEnd.getTime() + 86_400_000) : paidAt;
      const coverageEndDate = this.addCalendarMonthClamped(currentEnd ?? paidAt);
      await this.validateSalaAllocations(tx, input.personId, amount, input.allocations ?? []);
      if (plan.id !== participation.planId) await this.updateParticipationPlanWithinTransaction(tx, participation.id, plan.id);
      return tx.salaPayment.create({ data: {
        personId: input.personId, planId: plan.id, planNameSnapshot: plan.name,
        paidAt, year: paidAt.getUTCFullYear(), month: paidAt.getUTCMonth() + 1,
        coverageStartDate, coverageEndDate, amount, paymentMethodId: input.paymentMethodId,
        registeredById: actorId, operationId: input.operationId, adjustmentReason: input.adjustmentReason?.trim() || null,
        allocations: { create: input.allocations ?? [] },
      }, include: paymentResponseInclude });
    });
    return this.paymentResponse(payment);
  }
  private validatePaymentAdjustment(amount: Prisma.Decimal, proposedAmount: Prisma.Decimal, reason?: string): void {
    if (!amount.equals(proposedAmount) && !reason?.trim()) {
      throw new BadRequestException({ code: 'SALA_PAYMENT_ADJUSTMENT_REASON_REQUIRED', message: 'Indicá un motivo de ajuste cuando el importe difiere del precio actual del Plan.' });
    }
  }
  private async lockPaymentPerson(tx: Prisma.TransactionClient, personId: string): Promise<void> {
    const lockPersonId = personId.toLowerCase();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockPersonId}, 0))`;
  }
  private validatePaidAt(paidAt: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt) || Number.isNaN(new Date(`${paidAt}T00:00:00Z`).getTime()) || new Date(`${paidAt}T00:00:00Z`).toISOString().slice(0, 10) !== paidAt) throw new BadRequestException({ code: 'SALA_PAYMENT_DATE_INVALID', message: 'La fecha de cobro es inválida.' });
    if (paidAt > this.todayOperational()) throw new BadRequestException({ code: 'SALA_PAYMENT_DATE_FUTURE', message: 'Paid date cannot be future' });
  }
  private async assertPaymentMethodSelectable(tx: Prisma.TransactionClient, paymentMethodId: string): Promise<void> {
    const method = await tx.paymentMethod.findUnique({ where: { id: paymentMethodId } });
    if (!method || !method.isSelectable) throw new BadRequestException({ code: 'PAYMENT_METHOD_NOT_SELECTABLE', message: 'Payment method is not selectable' });
  }
  async reversePayment(id: string, reason: string, operationId: string, actorId: string) {
    const value = this.requiredReason(reason);
    return this.prisma.$transaction(async (tx) => {
      const reference = await tx.salaPayment.findUnique({ where: { id }, select: { personId: true } });
      if (!reference) throw new NotFoundException({ code: 'SALA_PAYMENT_NOT_FOUND', message: 'Payment not found' });
      await this.lockPaymentPerson(tx, reference.personId);
      const old = await tx.salaPaymentReversal.findUnique({ where: { operationId } });
      if (old) {
        if (old.paymentId !== id || old.reason !== value) throw new ConflictException({ code: 'SALA_PAYMENT_OPERATION_CONFLICT', message: 'El operationId ya pertenece a otra reversión.' });
        return old;
      }
      const payment = await tx.salaPayment.findUniqueOrThrow({ where: { id }, include: { reversal: true } });
      if (payment.reversal) throw new ConflictException({ code: 'SALA_PAYMENT_ALREADY_REVERSED', message: 'Payment was already reversed' });
      return tx.salaPaymentReversal.create({ data: { paymentId: id, reason: value, operationId, registeredById: actorId } });
    });
  }
  async createOpeningBalance(input: { personId: string; chargeDate: string; amount: string; concept?: string; reason: string; operationId: string }, actorId: string) {
    const amount = this.positiveMoney(input.amount, 'SALA_CHARGE_AMOUNT_INVALID');
    const reason = this.requiredReason(input.reason);
    const existing = await this.prisma.salaCharge.findUnique({ where: { operationId: input.operationId }, include: { adjustments: true, allocations: true } });
    if (existing) return existing;
    const person = await this.prisma.person.findUnique({ where: { id: input.personId }, select: { id: true } });
    if (!person) throw new NotFoundException({ code: 'PERSON_NOT_FOUND', message: 'Person not found' });
    return this.prisma.salaCharge.create({ data: { personId: input.personId, kind: SalaChargeKind.OPENING_BALANCE, chargeDate: this.date(input.chargeDate), concept: input.concept?.trim() || `Saldo inicial: ${reason}`, amount, operationId: input.operationId, createdById: actorId }, include: { adjustments: true, allocations: true } });
  }
  async adjustCharge(id: string, input: { amount: string; reason: string; operationId: string }, actorId: string) {
    const amount = this.signedMoney(input.amount, 'SALA_CHARGE_ADJUSTMENT_AMOUNT_INVALID');
    const reason = this.requiredReason(input.reason);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.salaChargeAdjustment.findUnique({ where: { operationId: input.operationId } });
      if (existing) return existing;
      await tx.$queryRaw`SELECT id FROM sala_charges WHERE id = ${id}::uuid FOR UPDATE`;
      const charge = await tx.salaCharge.findUnique({ where: { id }, include: { adjustments: true } });
      if (!charge) throw new NotFoundException({ code: 'SALA_CHARGE_NOT_FOUND', message: 'Charge not found' });
      const resulting = charge.adjustments.reduce((total, adjustment) => total.plus(adjustment.amount), charge.amount).plus(amount);
      if (resulting.lessThan(0)) throw new BadRequestException({ code: 'SALA_CHARGE_ADJUSTMENT_EXCEEDS_CHARGE', message: 'Adjustment cannot make a charge negative' });
      return tx.salaChargeAdjustment.create({ data: { chargeId: id, kind: FinancialAdjustmentKind.ADJUSTMENT, amount, reason, operationId: input.operationId, registeredById: actorId } });
    });
  }
  async reverseCharge(id: string, reason: string, operationId: string, actorId: string) {
    const value = this.requiredReason(reason);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.salaChargeAdjustment.findUnique({ where: { operationId } });
      if (existing) return existing;
      await tx.$queryRaw`SELECT id FROM sala_charges WHERE id = ${id}::uuid FOR UPDATE`;
      const charge = await tx.salaCharge.findUnique({ where: { id }, include: { adjustments: true } });
      if (!charge) throw new NotFoundException({ code: 'SALA_CHARGE_NOT_FOUND', message: 'Charge not found' });
      if (charge.adjustments.some((adjustment) => adjustment.kind === FinancialAdjustmentKind.REVERSAL)) throw new ConflictException({ code: 'SALA_CHARGE_ALREADY_REVERSED', message: 'Charge was already reversed' });
      const current = charge.adjustments.reduce((total, adjustment) => total.plus(adjustment.amount), charge.amount);
      if (current.isZero()) throw new ConflictException({ code: 'SALA_CHARGE_ALREADY_ZERO', message: 'Charge has no amount to reverse' });
      return tx.salaChargeAdjustment.create({ data: { chargeId: id, kind: FinancialAdjustmentKind.REVERSAL, amount: current.negated(), reason: value, operationId, registeredById: actorId } });
    });
  }
  async account(personId: string) {
    const [person, charges, payments] = await Promise.all([
      this.prisma.person.findUnique({ where: { id: personId }, select: { id: true, firstName: true, lastName: true, dni: true } }),
      this.prisma.salaCharge.findMany({ where: { personId }, include: { adjustments: { orderBy: { createdAt: 'asc' } }, allocations: { where: { payment: { reversal: null } }, orderBy: { createdAt: 'asc' } } }, orderBy: [{ chargeDate: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.salaPayment.findMany({ where: { personId }, include: { paymentMethod: true, allocations: true, reversal: true }, orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }] }),
    ]);
    if (!person) throw new NotFoundException({ code: 'PERSON_NOT_FOUND', message: 'Person not found' });
    const chargeRows = charges.map((charge) => {
      const adjustedAmount = charge.adjustments.reduce((total, adjustment) => total.plus(adjustment.amount), charge.amount);
      const allocatedAmount = charge.allocations.reduce((total, allocation) => total.plus(allocation.amount), new Prisma.Decimal(0));
      const outstandingAmount = Prisma.Decimal.max(adjustedAmount.minus(allocatedAmount), 0);
      return { ...charge, amount: charge.amount.toString(), adjustedAmount: adjustedAmount.toString(), allocatedAmount: allocatedAmount.toString(), outstandingAmount: outstandingAmount.toString(), status: adjustedAmount.isZero() ? 'REVERSED' : outstandingAmount.isZero() ? 'SETTLED' : allocatedAmount.isZero() ? 'PENDING' : 'PARTIAL' };
    });
    const paymentRows = payments.map((payment) => {
      const allocatedAmount = payment.reversal ? new Prisma.Decimal(0) : payment.allocations.reduce((total, allocation) => total.plus(allocation.amount), new Prisma.Decimal(0));
      const creditAmount = payment.reversal ? new Prisma.Decimal(0) : payment.amount.minus(allocatedAmount);
      return { ...payment, amount: payment.amount.toString(), allocatedAmount: allocatedAmount.toString(), creditAmount: creditAmount.toString(), status: payment.reversal ? 'REVERSED' : 'ACTIVE' };
    });
    const chargesTotal = chargeRows.reduce((total, charge) => total.plus(charge.adjustedAmount), new Prisma.Decimal(0));
    const paymentsTotal = paymentRows.filter((payment) => payment.status === 'ACTIVE').reduce((total, payment) => total.plus(payment.amount), new Prisma.Decimal(0));
    const allocatedTotal = chargeRows.reduce((total, charge) => total.plus(charge.allocatedAmount), new Prisma.Decimal(0));
    return { person, summary: { charges: chargesTotal.toString(), payments: paymentsTotal.toString(), allocated: allocatedTotal.toString(), credit: Prisma.Decimal.max(paymentsTotal.minus(allocatedTotal), 0).toString(), balance: chargesTotal.minus(paymentsTotal).toString() }, charges: chargeRows, payments: paymentRows };
  }
  async configuration() { return (await this.prisma.salaConfiguration.findUnique({ where: { id: 'default' } })) ?? { id: 'default', generalCapacity: 10 }; }
  async updateConfiguration(input: UpdateSalaConfigurationDto) { return this.prisma.salaConfiguration.upsert({ where: { id: 'default' }, create: { id: 'default', generalCapacity: input.capacity }, update: { generalCapacity: input.capacity } }); }
  async listServiceTypes(includeRetired = false) { return this.prisma.salaServiceType.findMany({ where: includeRetired ? {} : { isSelectable: true }, orderBy: { name: 'asc' } }); }
  async createServiceType(input: SalaServiceTypeDto) { this.validateServiceDuration(input.durationMinutes); try { return await this.prisma.salaServiceType.create({ data: { name: input.name.trim(), normalizedName: this.normalizeName(input.name), durationMinutes: input.durationMinutes, isSelectable: input.isSelectable ?? true } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'SALA_SERVICE_TYPE_DUPLICATE', message: 'A service with this name already exists' }); throw error; } }
  async updateServiceType(id: string, input: SalaServiceTypeDto) { this.validateServiceDuration(input.durationMinutes); try { return await this.prisma.salaServiceType.update({ where: { id }, data: { name: input.name.trim(), normalizedName: this.normalizeName(input.name), durationMinutes: input.durationMinutes, ...(input.isSelectable !== undefined ? { isSelectable: input.isSelectable } : {}) } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException({ code: 'SALA_SERVICE_TYPE_NOT_FOUND', message: 'Service not found' }); if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'SALA_SERVICE_TYPE_DUPLICATE', message: 'A service with this name already exists' }); throw error; } }
  async retireServiceType(id: string) { const service = await this.prisma.salaServiceType.findUnique({ where: { id }, select: { id: true } }); if (!service) throw new NotFoundException({ code: 'SALA_SERVICE_TYPE_NOT_FOUND', message: 'Service not found' }); return this.prisma.salaServiceType.update({ where: { id }, data: { isSelectable: false } }); }
  async listPersonServiceTypes(personId: string) {
    const participation = await this.prisma.salaParticipation.findFirst({
      where: { personId, endDate: null }, select: { planId: true },
    });
    if (!participation) return [];
    return this.prisma.salaServiceType.findMany({
      where: { isSelectable: true, plans: { some: { planId: participation.planId } } },
      select: { id: true, name: true, durationMinutes: true },
      orderBy: { name: 'asc' },
    });
  }
  async listPlans() {
    const plans = await this.prisma.salaPlan.findMany({ where: { isSelectable: true }, include: planServicesInclude, orderBy: { name: 'asc' } });
    return plans.map((plan) => this.mapPlanServices(plan));
  }
  async createPlan(input: PlanDto) {
    await this.assertPlanNameAvailable(input.name);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertPlanServicesAvailable(tx, input.serviceTypeIds);
        const plan = await tx.salaPlan.create({
          data: {
            name: input.name.trim(), monthlyAmount: input.monthlyAmount, isSelectable: input.isSelectable ?? true,
            services: { create: input.serviceTypeIds.map((serviceTypeId) => ({ serviceTypeId })) },
          },
          include: planServicesInclude,
        });
        return this.mapPlanServices(plan);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'SALA_PLAN_DUPLICATE', message: 'A plan with this name already exists' });
      throw error;
    }
  }
  async updatePlan(id: string, input: PlanDto) {
    await this.assertPlanNameAvailable(input.name, id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertPlanServicesAvailable(tx, input.serviceTypeIds);
        const plan = await tx.salaPlan.update({
          where: { id },
          data: {
            name: input.name.trim(), monthlyAmount: input.monthlyAmount,
            ...(input.isSelectable !== undefined ? { isSelectable: input.isSelectable } : {}),
            services: { deleteMany: {}, create: input.serviceTypeIds.map((serviceTypeId) => ({ serviceTypeId })) },
          },
          include: planServicesInclude,
        });
        return this.mapPlanServices(plan);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException({ code: 'SALA_PLAN_NOT_FOUND', message: 'Plan not found' });
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'SALA_PLAN_DUPLICATE', message: 'A plan with this name already exists' });
      throw error;
    }
  }
  async retirePlan(id: string) { const plan = await this.prisma.salaPlan.findUnique({ where: { id }, select: { id: true } }); if (!plan) throw new NotFoundException({ code: 'SALA_PLAN_NOT_FOUND', message: 'Plan not found' }); return this.prisma.salaPlan.update({ where: { id }, data: { isSelectable: false } }); }
  async removeException(id: string) { try { return await this.prisma.salaScheduleException.delete({ where: { id } }); } catch { throw new NotFoundException({ code: 'SALA_EXCEPTION_NOT_FOUND', message: 'Exception not found' }); } }
  async listSlots() { return this.prisma.salaScheduleSlot.findMany({ where: { isActive: true }, include: { exceptions: true }, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] }); }
  async replaceWeeklySchedule(input: ReplaceWeeklyScheduleDto) {
    const desired = input.windows.map((window) => ({ ...window, start: this.time(window.startTime), duration: window.durationMinutes ?? 60 }));
    this.validateWeeklyWindows(desired);
    const effective = this.date(this.todayOperational());
    return this.prisma.$transaction(async (tx) => {
      const active = await tx.salaScheduleSlot.findMany({ where: { isActive: true } });
      const unchanged = new Set(active.filter((slot) => desired.some((window) => window.weekday === slot.weekday && this.minutes(window.start) === this.minutes(slot.startTime) && window.duration === slot.durationMinutes && (window.specificCapacity ?? null) === slot.specificCapacity)).map((slot) => slot.id));
      const retiring = active.filter((slot) => !unchanged.has(slot.id));
      if (retiring.length) {
        const ids = retiring.map((slot) => slot.id);
        await tx.fixedSalaBooking.updateMany({ where: { scheduleSlotId: { in: ids }, OR: [{ endDate: null }, { endDate: { gte: effective } }] }, data: { endDate: new Date(effective.getTime() - 86400000) } });
        await tx.oneOffReservation.updateMany({ where: { scheduleSlotId: { in: ids }, date: { gte: effective }, cancelledAt: null }, data: { cancelledAt: new Date() } });
        await tx.salaScheduleSlot.updateMany({ where: { id: { in: ids } }, data: { isActive: false, endedAt: effective } });
      }
      const created = [];
      for (const window of desired) {
        const isUnchanged = active.some((slot) => unchanged.has(slot.id) && slot.weekday === window.weekday && this.minutes(slot.startTime) === this.minutes(window.start));
        if (!isUnchanged) created.push(await tx.salaScheduleSlot.create({ data: { weekday: window.weekday, startTime: window.start, durationMinutes: window.duration, specificCapacity: window.specificCapacity ?? null, startsAt: effective } }));
      }
      return [...active.filter((slot) => unchanged.has(slot.id)), ...created];
    });
  }
  async updateSlot(id: string, input: ScheduleSlotDto) { const start = this.time(input.startTime); this.validateWindow(start, input.durationMinutes ?? 60); try { return await this.prisma.salaScheduleSlot.update({ where: { id }, data: { durationMinutes: input.durationMinutes ?? 60, specificCapacity: input.specificCapacity ?? null }, include: { exceptions: true } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException({ code: 'SALA_SCHEDULE_NOT_FOUND', message: 'Schedule slot not found' }); throw error; } }
  async replaceSlot(id: string, input: ReplaceScheduleSlotDto, failureAfterMutations = false) { const start = this.time(input.startTime); this.validateWindow(start, input.durationMinutes ?? 60); return this.prisma.$transaction(async (tx) => { const old = await tx.salaScheduleSlot.findUnique({ where: { id } }); if (!old || !old.isActive) throw new NotFoundException({ code: 'SALA_SCHEDULE_NOT_FOUND', message: 'Schedule slot not found' }); const effective = this.date(input.effectiveDate); await tx.fixedSalaBooking.updateMany({ where: { scheduleSlotId: id, OR: [{ endDate: null }, { endDate: { gte: effective } }] }, data: { endDate: new Date(effective.getTime() - 86400000) } }); await tx.oneOffReservation.updateMany({ where: { scheduleSlotId: id, date: { gte: effective }, cancelledAt: null }, data: { cancelledAt: new Date() } }); if (failureAfterMutations) throw new Error('SIMULATED_SCHEDULE_REPLACEMENT_FAILURE'); await tx.salaScheduleSlot.update({ where: { id }, data: { isActive: false, endedAt: effective } }); return tx.salaScheduleSlot.create({ data: { weekday: input.weekday, startTime: start, startsAt: effective, durationMinutes: input.durationMinutes ?? old.durationMinutes, specificCapacity: input.specificCapacity ?? null }, include: { exceptions: true } }); }); }
  async createSlot(input: ScheduleSlotDto) { const start = this.time(input.startTime); const duration = input.durationMinutes ?? 60; this.validateWindow(start, duration); const endMinutes = this.minutes(start) + duration; if (endMinutes > 24 * 60) throw new BadRequestException({ code: 'SALA_SCHEDULE_END_INVALID', message: 'Schedule must end before midnight' }); const existing = await this.prisma.salaScheduleSlot.findMany({ where: { weekday: input.weekday, isActive: true } }); if (existing.some((slot) => this.overlaps(this.minutes(slot.startTime), slot.durationMinutes, this.minutes(start), duration))) throw new ConflictException({ code: 'SALA_SCHEDULE_OVERLAP', message: 'Schedule windows cannot overlap' }); try { return await this.prisma.salaScheduleSlot.create({ data: { weekday: input.weekday, startTime: start, durationMinutes: duration, specificCapacity: input.specificCapacity ?? null } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'SALA_SCHEDULE_DUPLICATE', message: 'Schedule window already exists' }); throw error; } }
  async addException(slotId: string, input: ScheduleExceptionDto) { if (input.type === SalaScheduleExceptionType.CLOSURE && input.capacityOverride != null) throw new BadRequestException({ code: 'SALA_EXCEPTION_CAPACITY_INVALID', message: 'Closure cannot define capacity override' }); if (input.type === SalaScheduleExceptionType.CAPACITY_OVERRIDE && input.capacityOverride == null) throw new BadRequestException({ code: 'SALA_EXCEPTION_CAPACITY_REQUIRED', message: 'Capacity override is required' }); try { const capacityOverride = input.type === SalaScheduleExceptionType.CAPACITY_OVERRIDE ? (input.capacityOverride ?? null) : null; return await this.prisma.salaScheduleException.create({ data: { scheduleSlotId: slotId, date: this.date(input.date), type: input.type, capacityOverride } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'SALA_EXCEPTION_DUPLICATE', message: 'Exception already exists for this date' }); if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw new NotFoundException({ code: 'SALA_SCHEDULE_NOT_FOUND', message: 'Schedule slot not found' }); throw error; } }
  async listProfessors() {
    return this.prisma.internalUser.findMany({
      where: eligibleProfessorWhere,
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async createStudent(input: CreateSalaStudentDto) {
    const { personId, initialPin } = await this.prisma.$transaction(async (tx) => {
      const created = await this.people.createWithinTransaction(input, tx);
      await this.joinWithinTransaction(tx, { personId: created.personId, mainProfessorId: input.mainProfessorId, planId: input.planId, startDate: this.todayOperational() });
      return created;
    });
    return { ...(await this.people.get(personId)), initialPin };
  }

  async join(input: { personId: string; mainProfessorId: string; planId: string; startDate: string }) {
    return this.prisma.$transaction((tx) => this.joinWithinTransaction(tx, input));
  }

  private async joinWithinTransaction(tx: Prisma.TransactionClient, input: { personId: string; mainProfessorId: string; planId: string; startDate: string }) {
    const [person, professor, plan] = await Promise.all([tx.person.findUnique({ where: { id: input.personId }, select: { id: true } }), tx.internalUser.findFirst({ where: { id: input.mainProfessorId, ...eligibleProfessorWhere }, select: { id: true } }), tx.salaPlan.findUnique({ where: { id: input.planId } })]);
    if (!person) throw new NotFoundException({ code: 'PERSON_NOT_FOUND', message: 'Person not found' });
    if (!professor) throw new BadRequestException({ code: 'SALA_PROFESSOR_INVALID', message: 'Professor is not eligible' });
    if (!plan || !plan.isSelectable) throw new BadRequestException({ code: 'SALA_PLAN_INVALID', message: 'Plan is not selectable' });
    try {
      const startDate = this.date(input.startDate);
      const participation = await tx.salaParticipation.create({ data: { personId: input.personId, mainProfessorId: input.mainProfessorId, planId: input.planId, startDate, planAssignments: { create: { planId: input.planId, effectiveFrom: startDate } } }, include: { plan: true, mainProfessor: true } });
      return participation;
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'SALA_ACTIVE_PARTICIPATION_EXISTS', message: 'Person already has an active Sala participation' }); throw error; }
  }
  async listParticipations(personId: string) { return this.prisma.salaParticipation.findMany({ where: { personId }, orderBy: { startDate: 'desc' }, include: { plan: true, mainProfessor: true } }); }
  async leave(id: string, failureAfterMutations = false, actorId?: string) {
    const now = new Date();
    return this.prisma.$transaction((tx) => this.leaveInTransaction(tx, id, failureAfterMutations, actorId, now));
  }
  private async leaveInTransaction(tx: Prisma.TransactionClient, id: string, failureAfterMutations: boolean, actorId: string | undefined, now: Date) {
    await this.lockParticipations(tx, [id]);
    const current = await tx.salaParticipation.findFirst({ where: { id, endDate: null } });
    if (!current) throw new NotFoundException({ code: 'SALA_ACTIVE_PARTICIPATION_NOT_FOUND', message: 'Active participation not found' });
    const today = this.date(this.todayOperational(now));
    const fixed = await tx.fixedSalaBooking.findMany({ where: { salaParticipationId: id, startDate: { lte: today }, scheduleSlot: { weekday: this.weekday(today) }, OR: [{ endDate: null }, { endDate: { gte: today } }] }, include: { scheduleSlot: true } });
    for (const booking of fixed) {
      const startTime = booking.startTime ?? booking.scheduleSlot.startTime;
      if (this.operationalStart(today.toISOString().slice(0, 10), startTime) <= now) continue;
      await tx.salaOccurrence.upsert({
        where: { fixedSalaBookingId_date: { fixedSalaBookingId: booking.id, date: today } },
        create: { personId: current.personId, scheduleSlotId: booking.scheduleSlotId, date: today, startTime, serviceTypeId: booking.serviceTypeId, serviceDurationMinutes: booking.serviceDurationMinutes, fixedSalaBookingId: booking.id, origin: SalaOccurrenceOrigin.FIXED, status: SalaOccurrenceStatus.CANCELLED, createdBy: actorId ?? null, lastModifiedBy: actorId ?? null },
        update: {},
      });
    }
    await tx.fixedSalaBooking.updateMany({ where: { salaParticipationId: id, OR: [{ endDate: null }, { endDate: { gt: today } }] }, data: { endDate: today } });
    const reservations = await tx.oneOffReservation.findMany({ where: { salaParticipationId: id, date: { gte: today }, cancelledAt: null }, include: { scheduleSlot: true } });
    const futureReservations = reservations.filter(item => this.operationalStart(item.date.toISOString().slice(0, 10), item.startTime ?? item.scheduleSlot.startTime) > now);
    await tx.oneOffReservation.updateMany({ where: { id: { in: futureReservations.map(item => item.id) }, cancelledAt: null }, data: { cancelledAt: now } });
    const occurrences = await tx.salaOccurrence.findMany({ where: { personId: current.personId, date: { gte: today }, status: { not: SalaOccurrenceStatus.CANCELLED } }, include: { scheduleSlot: true } });
    const futureOccurrences = occurrences.filter(item => this.operationalStart(item.date.toISOString().slice(0, 10), item.startTime ?? item.scheduleSlot.startTime) > now);
    await tx.salaOccurrence.updateMany({ where: { id: { in: futureOccurrences.map(item => item.id) } }, data: { status: SalaOccurrenceStatus.CANCELLED, ...(actorId ? { lastModifiedBy: actorId } : {}) } });
    await tx.routine.updateMany({ where: { salaParticipationId: id, status: RoutineStatus.ACTIVE }, data: { status: RoutineStatus.HISTORICAL } });
    await tx.salaClinicalIndication.updateMany({ where: { personId: current.personId, status: 'ACTIVE' }, data: { status: 'CLOSED', closedAt: now, ...(actorId ? { closedById: actorId } : {}) } });
    if (failureAfterMutations) throw new Error('SIMULATED_LEAVE_FAILURE');
    return tx.salaParticipation.update({ where: { id }, data: { endDate: today }, include: { plan: true, mainProfessor: true } });
  }

  private async lockParticipations(tx: Prisma.TransactionClient, ids: string[]) {
    if (!ids.length) throw new BadRequestException({ code: 'SALA_PARTICIPATION_IDS_REQUIRED', message: 'Seleccioná al menos una participación.' });
    await tx.$queryRaw`SELECT id FROM sala_participations WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`;
  }
  private async assertActiveParticipations(tx: Prisma.TransactionClient, ids: string[]) {
    const count = await tx.salaParticipation.count({ where: { id: { in: ids }, endDate: null } });
    if (count !== ids.length) throw new NotFoundException({ code: 'SALA_ACTIVE_PARTICIPATION_NOT_FOUND', message: 'Active participation not found' });
  }
  async updateObjective(participationId: string, objective: string | null | undefined, actorId: string) {
    const actor = await this.prisma.internalUser.findUnique({ where: { id: actorId }, select: { roles: true } });
    if (!actor?.roles.some(({ role }) => role === Role.PROFESSOR || role === Role.GENERAL_ADMIN)) {
      throw new ForbiddenException({ code: 'SALA_OBJECTIVE_FORBIDDEN', message: 'No tenés permiso para modificar el Objetivo.' });
    }
    return this.prisma.$transaction(async (tx) => {
      await this.lockParticipations(tx, [participationId]);
      await this.assertActiveParticipations(tx, [participationId]);
      return tx.salaParticipation.update({ where: { id: participationId }, data: { objective: objective?.trim() || null }, select: { objective: true } });
    });
  }
  async leaveImpact(participationId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockParticipations(tx, [participationId]);
      await this.assertActiveParticipations(tx, [participationId]);
      const current = await tx.salaParticipation.findUniqueOrThrow({ where: { id: participationId }, select: { personId: true } });
      const now = new Date();
      const today = this.date(this.todayOperational(now));
      const [fixedBookings, reservations, activeRoutines, activeClinicalIndications] = await Promise.all([
        tx.fixedSalaBooking.count({ where: { salaParticipationId: participationId, OR: [{ endDate: null }, { endDate: { gt: today } }] } }),
        tx.oneOffReservation.findMany({ where: { salaParticipationId: participationId, date: { gte: today }, cancelledAt: null }, include: { scheduleSlot: true } }),
        tx.routine.count({ where: { salaParticipationId: participationId, status: RoutineStatus.ACTIVE } }),
        tx.salaClinicalIndication.count({ where: { personId: current.personId, status: 'ACTIVE' } }),
      ]);
      const futureReservations = reservations.filter(item => this.operationalStart(item.date.toISOString().slice(0, 10), item.startTime ?? item.scheduleSlot.startTime) > now).length;
      return { fixedBookings, futureReservations, activeRoutines, activeClinicalIndications };
    });
  }
  async bulkChangeProfessor(participationIds: string[], mainProfessorId: string) {
    const ids = [...new Set(participationIds.map((id) => id.toLowerCase()))];
    return this.prisma.$transaction(async (tx) => {
      const professor = await tx.internalUser.findFirst({ where: { id: mainProfessorId, ...eligibleProfessorWhere }, select: { id: true } });
      if (!professor) throw new BadRequestException({ code: 'SALA_PROFESSOR_INVALID', message: 'Professor is not eligible' });
      await this.lockParticipations(tx, ids);
      await this.assertActiveParticipations(tx, ids);
      const result = await tx.salaParticipation.updateMany({ where: { id: { in: ids }, endDate: null }, data: { mainProfessorId } });
      return { affected: result.count };
    });
  }
  async bulkLeave(participationIds: string[], actorId: string) {
    const now = new Date();
    const ids = [...new Set(participationIds.map((id) => id.toLowerCase()))].sort();
    return this.prisma.$transaction(async (tx) => {
      await this.lockParticipations(tx, ids);
      await this.assertActiveParticipations(tx, ids);
      for (const id of ids) await this.leaveInTransaction(tx, id, false, actorId, now);
      return { affected: ids.length };
    });
  }
  async changeProfessor(id: string, mainProfessorId: string) { const professor = await this.prisma.internalUser.findUnique({ where: { id: mainProfessorId }, include: { roles: true } }); if (!professor || professor.status !== InternalUserStatus.ACTIVE || !professor.roles.some((role) => role.role === Role.PROFESSOR)) throw new BadRequestException({ code: 'SALA_PROFESSOR_INVALID', message: 'Professor is not eligible' }); return this.prisma.salaParticipation.update({ where: { id }, data: { mainProfessorId }, include: { plan: true, mainProfessor: true } }); }
  async changePlan(id: string, planId: string) {
    const plan = await this.prisma.salaPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isSelectable) throw new BadRequestException({ code: 'SALA_PLAN_INVALID', message: 'Plan is not selectable' });
    return this.prisma.$transaction(tx => this.updateParticipationPlanWithinTransaction(tx, id, planId));
  }
  private async updateParticipationPlanWithinTransaction(tx: Prisma.TransactionClient, id: string, planId: string) {
    const today = this.date(this.todayOperational());
    const effectiveFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
    try { return await tx.salaParticipation.update({ where: { id }, data: { planId, planAssignments: { upsert: { where: { salaParticipationId_effectiveFrom: { salaParticipationId: id, effectiveFrom } }, create: { planId, effectiveFrom }, update: { planId } } } }, include: { plan: true, mainProfessor: true } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException({ code: 'SALA_ACTIVE_PARTICIPATION_NOT_FOUND', message: 'Active participation not found' }); throw error; }
  }
  async hasActiveSalaParticipation(personId: string) { return (await this.prisma.salaParticipation.count({ where: { personId, endDate: null } })) > 0; }
  operationalStart(date: string, time: Date): Date {
    const [year, month, day] = date.split('-').map(Number);
    const utc = Date.UTC(year!, month! - 1, day!, time.getUTCHours(), time.getUTCMinutes());
    const zone = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', timeZoneName: 'shortOffset' })
      .formatToParts(new Date(utc)).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT-3';
    const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(zone);
    const offset = match ? (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : -180;
    return new Date(utc - offset * 60_000);
  }

  async cancelFixedOccurrenceFromPortal(fixedBookingId: string, personId: string, date: string, now: Date) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM fixed_sala_bookings WHERE id = ${fixedBookingId}::uuid FOR UPDATE`;
      const booking = await tx.fixedSalaBooking.findUnique({ where: { id: fixedBookingId }, include: { scheduleSlot: true } });
      if (!booking || booking.personId !== personId) throw new ForbiddenException({ code: 'PORTAL_RESOURCE_FORBIDDEN', message: 'No podés cancelar este turno.' });
      const day = this.date(date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date || day < booking.startDate || (booking.endDate && day > booking.endDate) || this.weekday(day) !== booking.scheduleSlot.weekday) {
        throw new BadRequestException({ code: 'PORTAL_FIXED_OCCURRENCE_INVALID', message: 'La fecha no corresponde a este turno fijo.' });
      }
      const startTime = booking.startTime ?? booking.scheduleSlot.startTime;
      if (this.operationalStart(date, startTime) <= now) throw new ConflictException({ code: 'PORTAL_FIXED_OCCURRENCE_STARTED', message: 'El turno ya comenzó y no se puede cancelar desde Portal.' });
      const existing = await tx.salaOccurrence.findUnique({ where: { fixedSalaBookingId_date: { fixedSalaBookingId: fixedBookingId, date: day } } });
      if (existing?.status === SalaOccurrenceStatus.CANCELLED) return existing;
      if (existing && existing.status !== SalaOccurrenceStatus.RESERVED) throw new ConflictException({ code: 'PORTAL_FIXED_OCCURRENCE_NOT_CANCELLABLE', message: 'El estado del turno no permite cancelarlo desde Portal.' });
      if (existing) return tx.salaOccurrence.update({ where: { id: existing.id }, data: { status: SalaOccurrenceStatus.CANCELLED, lastModifiedBy: null, cancelledForNonPaymentAt: null } });
      return tx.salaOccurrence.create({ data: { personId, scheduleSlotId: booking.scheduleSlotId, date: day, startTime, serviceTypeId: booking.serviceTypeId, serviceDurationMinutes: booking.serviceDurationMinutes, origin: SalaOccurrenceOrigin.FIXED, status: SalaOccurrenceStatus.CANCELLED, fixedSalaBookingId: fixedBookingId, createdBy: null, lastModifiedBy: null, cancelledForNonPaymentAt: null } });
    });
  }

  private async reconcileUnpaidFixed(date: string, client: Prisma.TransactionClient | PrismaService): Promise<void> {
    if (date > this.todayOperational()) return;
    const day = this.date(date);
    const fixed = await client.fixedSalaBooking.findMany({
      where: { startDate: { lte: day }, scheduleSlot: { weekday: this.weekday(day) }, OR: [{ endDate: null }, { endDate: { gte: day } }] },
      include: { scheduleSlot: { select: { startTime: true } } },
    });
    if (!fixed.length) return;
    const [payments, occurrences] = await Promise.all([
      client.salaPayment.findMany({ where: { personId: { in: [...new Set(fixed.map((item) => item.personId))] }, coverageStartDate: { lte: day }, coverageEndDate: { gte: day } }, include: { reversal: true } }),
      client.salaOccurrence.findMany({ where: { date: day, fixedSalaBookingId: { in: fixed.map((item) => item.id) } } }),
    ]);
    const existing = new Map(occurrences.map((item) => [item.fixedSalaBookingId, item]));
    const now = new Date();
    for (const booking of fixed) {
      const startsAt = this.operationalStart(date, booking.startTime ?? booking.scheduleSlot.startTime);
      if (startsAt > now || booking.createdAt > startsAt || payments.some((payment) => payment.personId === booking.personId && this.paymentCoversDate(payment, day, startsAt))) continue;
      const occurrence = existing.get(booking.id);
      if (occurrence) {
        if (occurrence.status === SalaOccurrenceStatus.RESERVED && !occurrence.cancelledForNonPaymentAt) {
          await client.salaOccurrence.updateMany({ where: { id: occurrence.id, status: SalaOccurrenceStatus.RESERVED, cancelledForNonPaymentAt: null }, data: { status: SalaOccurrenceStatus.CANCELLED, cancelledForNonPaymentAt: now } });
        }
      } else {
        await client.salaOccurrence.createMany({ data: [{ personId: booking.personId, scheduleSlotId: booking.scheduleSlotId, date: day, startTime: booking.startTime ?? booking.scheduleSlot.startTime, serviceTypeId: booking.serviceTypeId, serviceDurationMinutes: booking.serviceDurationMinutes, origin: SalaOccurrenceOrigin.FIXED, status: SalaOccurrenceStatus.CANCELLED, fixedSalaBookingId: booking.id, cancelledForNonPaymentAt: now }], skipDuplicates: true });
      }
    }
  }

  async fixedOccurrenceStates(personId: string, dates: string[]) {
    const uniqueDates = [...new Set(dates)];
    const bookings = await this.prisma.fixedSalaBooking.findMany({ where: { personId }, include: { scheduleSlot: true } });
    const relevantDates = uniqueDates.filter((date) => bookings.some((booking) => booking.scheduleSlot.weekday === this.weekday(this.date(date)) && booking.startDate <= this.date(date) && (!booking.endDate || booking.endDate >= this.date(date))));
    for (const date of relevantDates) await this.reconcileUnpaidFixed(date, this.prisma);
    const days = relevantDates.map((date) => this.date(date));
    const [occurrences, payments] = await Promise.all([
      this.prisma.salaOccurrence.findMany({ where: { personId, date: { in: days }, fixedSalaBookingId: { not: null } } }),
      this.prisma.salaPayment.findMany({ where: { personId, OR: days.map(day => ({ coverageStartDate: { lte: day }, coverageEndDate: { gte: day } })) }, include: { reversal: true } }),
    ]);
    return relevantDates.flatMap((date) => bookings.filter((booking) => booking.scheduleSlot.weekday === this.weekday(this.date(date)) && booking.startDate <= this.date(date) && (!booking.endDate || booking.endDate >= this.date(date))).map((booking) => {
      const occurrence = occurrences.find((item) => item.fixedSalaBookingId === booking.id && item.date.getTime() === this.date(date).getTime());
      const startsAt = this.operationalStart(date, booking.startTime ?? booking.scheduleSlot.startTime);
      const paid = payments.some((payment) => this.paymentCoversDate(payment, this.date(date), startsAt));
      const status = occurrence?.status ?? (!paid && (startsAt > new Date() || booking.createdAt <= startsAt) ? 'PENDING_PAYMENT' : 'RESERVED');
      return { fixedSalaBookingId: booking.id, date, startTime: this.formatMinutes(this.minutes(occurrence?.startTime ?? booking.startTime ?? booking.scheduleSlot.startTime)), status, cancelledForNonPayment: Boolean(occurrence?.cancelledForNonPaymentAt) };
    }));
  }

  async availability(date: string, client: Prisma.TransactionClient | PrismaService = this.prisma, excludeFixedBookingId?: string) {
    await this.reconcileUnpaidFixed(date, client);
    const day = this.date(date);
    const weekday = this.weekday(day);
    const [windows, config, fixed, oneOff, explicit] = await Promise.all([
      client.salaScheduleSlot.findMany({ where: { weekday, ...(date < this.todayOperational() ? {} : { isActive: true }), startsAt: { lte: day }, OR: [{ endedAt: null }, { endedAt: { gte: day } }] }, include: { exceptions: { where: { date: day } } }, orderBy: { startTime: 'asc' } }),
      client.salaConfiguration.findUnique({ where: { id: 'default' } }),
      client.fixedSalaBooking.findMany({ where: { startDate: { lte: day }, ...(excludeFixedBookingId ? { id: { not: excludeFixedBookingId } } : {}), OR: [{ endDate: null }, { endDate: { gte: day } }] }, include: { serviceType: true } }),
      client.oneOffReservation.findMany({ where: { date: day, cancelledAt: null }, include: { serviceType: true } }),
      client.salaOccurrence.findMany({ where: { date: day }, include: { serviceType: true } }),
    ]);
    const cancelledFixed = new Set(explicit.filter((item) => item.status === SalaOccurrenceStatus.CANCELLED).map((item) => item.fixedSalaBookingId));
    const cancelledOneOff = new Set(explicit.filter((item) => item.status === SalaOccurrenceStatus.CANCELLED).map((item) => item.oneOffReservationId));
    const result: Array<{ slotId: string; scheduleSlotId: string; startTime: string; endTime: string; date: string; capacity: number; reserved: number; available: number; isOverbooked: boolean; isClosed: boolean }> = [];
    for (const window of windows) {
      const exception = window.exceptions[0];
      const isClosed = exception?.type === SalaScheduleExceptionType.CLOSURE;
      const capacity = exception?.type === SalaScheduleExceptionType.CAPACITY_OVERRIDE ? (exception.capacityOverride ?? 1) : (window.specificCapacity ?? config?.generalCapacity ?? 10);
      const windowStart = this.minutes(window.startTime);
      for (let start = windowStart; start < windowStart + window.durationMinutes; start += 15) {
        const occupying = [
          ...fixed.filter((booking) => booking.scheduleSlotId === window.id && !cancelledFixed.has(booking.id)),
          ...oneOff.filter((booking) => booking.scheduleSlotId === window.id && !cancelledOneOff.has(booking.id)),
          ...explicit.filter((item) => item.scheduleSlotId === window.id && item.status === SalaOccurrenceStatus.ATTENDED && item.origin === SalaOccurrenceOrigin.SPONTANEOUS),
        ].filter((booking) => {
          const bookingStart = booking.startTime ? this.minutes(booking.startTime) : windowStart;
          const duration = booking.serviceDurationMinutes ?? booking.serviceType?.durationMinutes ?? SALA_DEFAULT_DURATION_MINUTES;
          return bookingStart < start + 15 && start < bookingStart + duration;
        });
        const reserved = new Set(occupying.map((booking) => booking.personId)).size;
        const startTime = this.formatMinutes(start);
        result.push({ slotId: `${window.id}:${startTime}`, scheduleSlotId: window.id, startTime, endTime: this.formatMinutes(start + 15), date, capacity, reserved, available: Math.max(capacity - reserved, 0), isOverbooked: reserved > capacity, isClosed });
      }
    }
    return result;
  }
  async createFixed(input: FixedBookingDto) { if (input.endDate && input.endDate < input.startDate) throw new BadRequestException({ code: 'SALA_BOOKING_DATE_INVALID', message: 'End date must be on or after start date' }); return this.prisma.$transaction(async (tx) => { const resolved = await this.validateBooking(tx, input, input.startDate); try { return await tx.fixedSalaBooking.create({ data: { personId: input.personId, salaParticipationId: input.salaParticipationId, scheduleSlotId: input.scheduleSlotId, serviceTypeId: input.serviceTypeId ?? null, serviceDurationMinutes: resolved.durationMinutes, startTime: resolved.startTime, startDate: this.date(input.startDate), endDate: input.endDate ? this.date(input.endDate) : null }, include: { scheduleSlot: true, serviceType: true } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'SALA_FIXED_BOOKING_DUPLICATE', message: 'Equivalent fixed booking already exists' }); throw error; } }); }
  async createReservation(input: OneOffReservationDto, beforeCreate?: (resolved: { startTime: Date; durationMinutes: number }) => void) { return this.prisma.$transaction(async (tx) => { const resolved = await this.validateBooking(tx, input, input.date); beforeCreate?.(resolved); try { return await tx.oneOffReservation.create({ data: { personId: input.personId, salaParticipationId: input.salaParticipationId, scheduleSlotId: input.scheduleSlotId, serviceTypeId: input.serviceTypeId ?? null, serviceDurationMinutes: resolved.durationMinutes, startTime: resolved.startTime, date: this.date(input.date) }, include: { scheduleSlot: true, serviceType: true } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'SALA_RESERVATION_DUPLICATE', message: 'Reservation already exists' }); throw error; } }); }
  async listFixed(personId: string) { return this.prisma.fixedSalaBooking.findMany({ where: { personId }, include: { scheduleSlot: true, serviceType: true }, orderBy: { startDate: 'desc' } }); }
  async changeFixed(input: ChangeFixedBookingDto) { if (input.endDate && input.endDate < input.startDate) throw new BadRequestException({ code: 'SALA_BOOKING_DATE_INVALID', message: 'End date must be on or after start date' }); return this.prisma.$transaction(async (tx) => { const current = await tx.fixedSalaBooking.findUnique({ where: { id: input.id } }); if (!current) throw new NotFoundException({ code: 'SALA_FIXED_BOOKING_NOT_FOUND', message: 'Fixed booking not found' }); const resolved = await this.validateBooking(tx, input, input.startDate, current); const effective = this.date(input.startDate); if (current.startDate.getTime() === effective.getTime()) { return tx.fixedSalaBooking.update({ where: { id: input.id }, data: { scheduleSlotId: input.scheduleSlotId, serviceTypeId: input.serviceTypeId ?? null, serviceDurationMinutes: resolved.durationMinutes, startTime: resolved.startTime, ...(input.endDate !== undefined ? { endDate: input.endDate ? this.date(input.endDate) : null } : {}) }, include: { scheduleSlot: true, serviceType: true } }); } await tx.fixedSalaBooking.update({ where: { id: input.id }, data: { endDate: new Date(effective.getTime() - 86400000) } }); try { return await tx.fixedSalaBooking.create({ data: { personId: input.personId, salaParticipationId: input.salaParticipationId, scheduleSlotId: input.scheduleSlotId, serviceTypeId: input.serviceTypeId ?? null, serviceDurationMinutes: resolved.durationMinutes, startTime: resolved.startTime, startDate: effective, endDate: input.endDate ? this.date(input.endDate) : null }, include: { scheduleSlot: true, serviceType: true } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'SALA_FIXED_BOOKING_DUPLICATE', message: 'Equivalent fixed booking already exists' }); throw error; } }); }
  async listReservations(personId: string) { return this.prisma.oneOffReservation.findMany({ where: { personId }, include: { scheduleSlot: true, serviceType: true }, orderBy: { date: 'desc' } }); }
  async endFixed(id: string, endDate: string) { try { return await this.prisma.fixedSalaBooking.update({ where: { id }, data: { endDate: this.date(endDate) } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException({ code: 'SALA_FIXED_BOOKING_NOT_FOUND', message: 'Fixed booking not found' }); throw error; } }
  async cancelReservation(id: string) { try { return await this.prisma.oneOffReservation.update({ where: { id }, data: { cancelledAt: new Date() } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException({ code: 'SALA_RESERVATION_NOT_FOUND', message: 'Reservation not found' }); throw error; } }
  async listExerciseDefinitions(includeInactive = false) { return this.prisma.exerciseDefinition.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: { name: 'asc' } }); }
  async createExerciseDefinition(input: ExerciseDefinitionDto) { try { return await this.prisma.exerciseDefinition.create({ data: { name: input.name.trim(), primaryMuscle: this.optionalText(input.primaryMuscle), description: this.optionalText(input.description) } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'SALA_EXERCISE_DUPLICATE', message: 'Exercise already exists' }); throw error; } }
  async updateExerciseDefinition(id: string, input: ExerciseDefinitionDto) { try { return await this.prisma.exerciseDefinition.update({ where: { id }, data: { name: input.name.trim(), primaryMuscle: this.optionalText(input.primaryMuscle), description: this.optionalText(input.description) } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException({ code: 'SALA_EXERCISE_NOT_FOUND', message: 'Exercise not found' }); if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'SALA_EXERCISE_DUPLICATE', message: 'Exercise already exists' }); throw error; } }
  async retireExerciseDefinition(id: string, confirmActiveRoutineImpact: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const exercise = await tx.exerciseDefinition.findUnique({ where: { id } });
      if (!exercise || !exercise.isActive) throw new NotFoundException({ code: 'SALA_EXERCISE_NOT_FOUND', message: 'Exercise not found' });
      const affectedDays = await tx.routineDay.findMany({ where: { routine: { status: RoutineStatus.ACTIVE }, exercises: { some: { exerciseDefinitionId: id } } }, select: { routineId: true }, distinct: ['routineId'] });
      const activeRoutines = affectedDays.length;
      if (activeRoutines > 0 && !confirmActiveRoutineImpact) throw new ConflictException({ code: 'SALA_EXERCISE_RETIRE_CONFIRMATION_REQUIRED', message: 'Confirmation is required because active routines are affected', details: { activeRoutines } });
      if (activeRoutines > 0) await tx.routineExercise.deleteMany({ where: { exerciseDefinitionId: id, routineDay: { routine: { status: RoutineStatus.ACTIVE } } } });
      const retired = await tx.exerciseDefinition.update({ where: { id }, data: { isActive: false } });
      return { exercise: retired, affectedActiveRoutines: activeRoutines };
    });
  }
  async listRoutineTemplates() {
    return this.prisma.routineTemplate.findMany({ orderBy: { name: 'asc' }, include: this.routineTemplateInclude() });
  }
  async createRoutineTemplate(input: RoutineTemplateDto) {
    const name = this.validateRoutineTemplate(input);
    return this.prisma.$transaction(async (tx) => {
      await this.validateRoutineExercises(tx, input);
      return tx.routineTemplate.create({ data: { name, days: { create: this.routineContent(input.days) } }, include: this.routineTemplateInclude() });
    });
  }
  async updateRoutineTemplate(id: string, input: RoutineTemplateDto) {
    const name = this.validateRoutineTemplate(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.validateRoutineExercises(tx, input);
        await tx.routineTemplate.update({ where: { id }, data: { name } });
        await tx.routineTemplateDay.deleteMany({ where: { routineTemplateId: id } });
        return tx.routineTemplate.update({ where: { id }, data: { days: { create: this.routineContent(input.days) } }, include: this.routineTemplateInclude() });
      });
    } catch (error) { this.handleRoutineTemplateNotFound(error); throw error; }
  }
  async deleteRoutineTemplate(id: string) {
    try { return await this.prisma.routineTemplate.delete({ where: { id } }); }
    catch (error) { this.handleRoutineTemplateNotFound(error); throw error; }
  }
  private handleRoutineTemplateNotFound(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException({ code: 'SALA_ROUTINE_TEMPLATE_NOT_FOUND', message: 'Routine template not found' });
  }
  private validateRoutineTemplate(input: RoutineTemplateDto): string {
    const name = input.name.trim();
    if (!name || name.length > 120) throw new BadRequestException({ code: 'SALA_ROUTINE_TEMPLATE_NAME_INVALID', message: 'A routine template name of up to 120 characters is required' });
    if (!input.days.length) throw new BadRequestException({ code: 'SALA_ROUTINE_TEMPLATE_DAYS_REQUIRED', message: 'At least one day is required' });
    this.validateRoutine(input);
    return name;
  }
  private async validateRoutineExercises(tx: Prisma.TransactionClient, input: { days: RoutineDayDto[] }): Promise<void> {
      const exerciseIds = [...new Set(input.days.flatMap((day) => day.exercises.map((exercise) => exercise.exerciseDefinitionId)))];
      const validExercises = await tx.exerciseDefinition.count({ where: { id: { in: exerciseIds }, isActive: true } });
      if (validExercises !== exerciseIds.length) throw new BadRequestException({ code: 'SALA_EXERCISE_INVALID', message: 'Every routine exercise must reference an active catalog exercise' });
  }
  private routineTemplateInclude() {
    return { days: { orderBy: { position: 'asc' }, include: { exercises: { orderBy: { position: 'asc' }, include: { exerciseDefinition: true } } } } } as const;
  }
  private routineContent(days: RoutineDayDto[]) {
    return days.map((day, dayIndex) => ({ position: dayIndex + 1, name: this.optionalText(day.name), exercises: { create: day.exercises.map((exercise, exerciseIndex) => ({ exerciseDefinitionId: exercise.exerciseDefinitionId, position: exerciseIndex + 1, series: this.optionalText(exercise.series), repetitions: this.optionalText(exercise.repetitions), duration: this.optionalText(exercise.duration), load: this.optionalText(exercise.load), rest: this.optionalText(exercise.rest), notes: this.optionalText(exercise.notes) })) } }));
  }
  async listRoutines(personId: string) { return this.prisma.routine.findMany({ where: { personId }, include: { days: { orderBy: { position: 'asc' }, include: { exercises: { orderBy: { position: 'asc' }, include: { exerciseDefinition: true } } } }, salaParticipation: { select: { id: true, startDate: true, endDate: true } } }, orderBy: { version: 'desc' } }); }
  async replaceRoutine(input: ReplaceRoutineDto, failureAfterArchive = false) {
    this.validateRoutine(input);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM people WHERE id = ${input.personId}::uuid FOR UPDATE`;
      const participation = await tx.salaParticipation.findFirst({ where: { id: input.salaParticipationId, personId: input.personId, endDate: null }, select: { id: true } });
      if (!participation) throw new BadRequestException({ code: 'SALA_ACTIVE_PARTICIPATION_REQUIRED', message: 'An active Sala participation is required' });
      await this.validateRoutineExercises(tx, input);
      const currentVersion = await tx.routine.aggregate({ where: { personId: input.personId }, _max: { version: true } });
      await tx.routine.updateMany({ where: { personId: input.personId, status: RoutineStatus.ACTIVE }, data: { status: RoutineStatus.HISTORICAL } });
      if (failureAfterArchive) throw new Error('SIMULATED_ROUTINE_REPLACEMENT_FAILURE');
      return tx.routine.create({ data: { personId: input.personId, salaParticipationId: input.salaParticipationId, status: RoutineStatus.ACTIVE, version: (currentVersion._max.version ?? 0) + 1, days: { create: input.days.map((day, dayIndex) => ({ position: dayIndex + 1, name: this.optionalText(day.name), exercises: { create: day.exercises.map((exercise, exerciseIndex) => ({ exerciseDefinitionId: exercise.exerciseDefinitionId, position: exerciseIndex + 1, series: this.optionalText(exercise.series), repetitions: this.optionalText(exercise.repetitions), duration: this.optionalText(exercise.duration), load: this.optionalText(exercise.load), rest: this.optionalText(exercise.rest), notes: this.optionalText(exercise.notes) })) } })) } }, include: { days: { orderBy: { position: 'asc' }, include: { exercises: { orderBy: { position: 'asc' }, include: { exerciseDefinition: true } } } } } });
    });
  }
  async duplicateRoutine(id: string) {
    const source = await this.prisma.routine.findUnique({ where: { id }, include: { days: { orderBy: { position: 'asc' }, include: { exercises: { orderBy: { position: 'asc' } } } } } });
    if (!source) throw new NotFoundException({ code: 'SALA_ROUTINE_NOT_FOUND', message: 'Routine not found' });
    const participation = await this.prisma.salaParticipation.findFirst({ where: { personId: source.personId, endDate: null }, select: { id: true } });
    if (!participation) throw new BadRequestException({ code: 'SALA_ACTIVE_PARTICIPATION_REQUIRED', message: 'An active Sala participation is required' });
    return this.replaceRoutine({ personId: source.personId, salaParticipationId: participation.id, days: source.days.map((day) => ({ name: day.name, exercises: day.exercises.map((exercise) => ({ exerciseDefinitionId: exercise.exerciseDefinitionId, series: exercise.series, repetitions: exercise.repetitions, duration: exercise.duration, load: exercise.load, rest: exercise.rest, notes: exercise.notes })) })) });
  }
  async listPhysicalTests() {
    return this.prisma.physicalTestDefinition.findMany({ where: { isActive: true }, select: physicalTestSelect, orderBy: { name: 'asc' } });
  }
  private physicalTestData(input: PhysicalTestDefinitionDto) {
    if (input.type != null && !['STRENGTH', 'MOBILITY', 'OTHER'].includes(input.type)) throw new BadRequestException({ code: 'SALA_PHYSICAL_TEST_TYPE_INVALID', message: 'Tipo de test inválido.' });
    return { name: input.name.trim(), type: input.type ?? null, description: this.optionalText(input.description) };
  }
  private physicalTestError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new ConflictException({ code: 'SALA_PHYSICAL_TEST_DUPLICATE', message: 'Ya existe un test con ese nombre.' });
      if (error.code === 'P2025') throw new NotFoundException({ code: 'SALA_PHYSICAL_TEST_NOT_FOUND', message: 'No se encontró el test.' });
    }
    throw error;
  }
  async createPhysicalTest(input: PhysicalTestDefinitionDto) {
    const data = this.physicalTestData(input);
    try { return await this.prisma.physicalTestDefinition.create({ data, select: physicalTestSelect }); }
    catch (error) { this.physicalTestError(error); }
  }
  async updatePhysicalTest(id: string, input: PhysicalTestDefinitionDto) {
    const data = this.physicalTestData(input);
    try { return await this.prisma.physicalTestDefinition.update({ where: { id }, data, select: physicalTestSelect }); }
    catch (error) { this.physicalTestError(error); }
  }
  async retirePhysicalTest(id: string) {
    try { return await this.prisma.physicalTestDefinition.update({ where: { id }, data: { isActive: false }, select: physicalTestSelect }); }
    catch (error) { this.physicalTestError(error); }
  }
  private physicalEvaluationResponse(evaluation: Prisma.PhysicalEvaluationGetPayload<{ select: typeof physicalEvaluationSelect }>) {
    return { ...evaluation, evaluationDate: evaluation.evaluationDate.toISOString().slice(0, 10) };
  }
  async listPhysicalEvaluations(personId: string) {
    const evaluations = await this.prisma.physicalEvaluation.findMany({ where: { personId }, select: physicalEvaluationSelect, orderBy: [{ evaluationDate: 'desc' }, { id: 'asc' }] });
    return evaluations.map(evaluation => this.physicalEvaluationResponse(evaluation));
  }
  private async physicalResults(tx: Prisma.TransactionClient, results: PhysicalTestResultDto[], previousIds: string[] = []) {
    if (!results.length || results.some(result => !result.resultText.trim())) throw new BadRequestException({ code: 'SALA_PHYSICAL_RESULTS_REQUIRED', message: 'Ingresá al menos un test con su resultado.' });
    const ids = [...new Set(results.map(result => result.testDefinitionId))];
    const count = await tx.physicalTestDefinition.count({ where: { id: { in: ids }, OR: [{ isActive: true }, { id: { in: previousIds } }] } });
    if (count !== ids.length) throw new BadRequestException({ code: 'SALA_PHYSICAL_TEST_INVALID', message: 'El test no está disponible para esta evaluación.' });
    return results.map(result => ({ testDefinitionId: result.testDefinitionId, resultText: result.resultText.trim() }));
  }
  async createPhysicalEvaluation(input: PhysicalEvaluationDto, actorId: string) {
    return this.prisma.$transaction(async tx => {
      const participation = await tx.salaParticipation.findFirst({ where: { id: input.salaParticipationId, personId: input.personId, endDate: null }, select: { id: true } });
      if (!participation) throw new BadRequestException({ code: 'SALA_ACTIVE_PARTICIPATION_REQUIRED', message: 'An active Sala participation is required' });
      const professor = await tx.internalUser.findUnique({ where: { id: input.professorId }, include: { roles: true } });
      if (!professor || professor.status !== InternalUserStatus.ACTIVE || !professor.roles.some(role => role.role === Role.PROFESSOR)) throw new BadRequestException({ code: 'SALA_PROFESSOR_INVALID', message: 'Professor is not eligible' });
      const results = await this.physicalResults(tx, input.results);
      const evaluation = await tx.physicalEvaluation.create({ data: { personId: input.personId, salaParticipationId: input.salaParticipationId, professorId: input.professorId, evaluationDate: this.date(input.evaluationDate), createdBy: actorId, observation: this.optionalText(input.observation), results: { create: results } }, select: physicalEvaluationSelect });
      return this.physicalEvaluationResponse(evaluation);
    });
  }
  async correctPhysicalEvaluation(id: string, input: CorrectPhysicalEvaluationDto) {
    return this.prisma.$transaction(async tx => {
      const previous = await tx.physicalEvaluation.findUnique({ where: { id }, select: { results: { select: { testDefinitionId: true } } } });
      if (!previous) throw new NotFoundException({ code: 'SALA_PHYSICAL_EVALUATION_NOT_FOUND', message: 'No se encontró la evaluación.' });
      const results = await this.physicalResults(tx, input.results, previous.results.map(result => result.testDefinitionId));
      const evaluation = await tx.physicalEvaluation.update({ where: { id }, data: { observation: this.optionalText(input.observation), results: { deleteMany: {}, create: results } }, select: physicalEvaluationSelect });
      return this.physicalEvaluationResponse(evaluation);
    });
  }
  async listStudents(): Promise<SalaStudentListItemDto[]> {
    const today = this.date(this.todayOperational());
    const participations = await this.prisma.salaParticipation.findMany({
      where: { endDate: null },
      orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
      select: {
        id: true, startDate: true,
        person: { select: {
          id: true, firstName: true, lastName: true, dni: true,
        } },
        plan: { select: { id: true, name: true } },
        mainProfessor: { select: { id: true, firstName: true, lastName: true } },
        routines: { where: { status: RoutineStatus.ACTIVE }, select: { id: true }, take: 1 },
      },
    });
    const payments = await this.prisma.salaPayment.findMany({
      where: { personId: { in: participations.map(item => item.person.id) }, reversal: null },
      select: { personId: true, coverageStartDate: true, coverageEndDate: true, paidAt: true },
      orderBy: { paidAt: 'desc' },
    });
    const byPerson = new Map<string, typeof payments>();
    for (const payment of payments) {
      const rows = byPerson.get(payment.personId) ?? [];
      rows.push(payment);
      byPerson.set(payment.personId, rows);
    }
    return participations.map(({ id, startDate, person, plan, mainProfessor, routines }) => {
      const rows = byPerson.get(person.id) ?? [];
      const end = this.continuousValidityEnd(rows, today);
      return {
        id: person.id, participationId: id, participationStartDate: startDate.toISOString().slice(0, 10),
        firstName: person.firstName, lastName: person.lastName, dni: person.dni, plan, professor: mainProfessor,
        routineStatus: routines.length ? 'ACTIVE' : 'MISSING',
        hasValidAccess: end !== null, validUntil: end?.toISOString().slice(0, 10) ?? null,
        lastPaymentPaidAt: rows[0]?.paidAt.toISOString().slice(0, 10) ?? null,
      };
    });
  }

  async dashboard(date: string): Promise<SalaDashboardDto> {
    const agenda = await this.agenda(date);
    const entries = agenda.flatMap((group) => group.people);
    const today = this.todayOperational();
    const now = new Date();
    const [withoutRoutine, withoutValidity] = await Promise.all([
      this.prisma.salaParticipation.findMany({
        where: { endDate: null, person: { routines: { none: { status: RoutineStatus.ACTIVE } } } },
        select: { personId: true }, orderBy: { personId: 'asc' },
      }),
      this.prisma.salaParticipation.findMany({
        where: { endDate: null, person: { salaPayments: { none: { coverageStartDate: { lte: this.date(today) }, coverageEndDate: { gte: this.date(today) }, reversal: null } } } },
        select: { personId: true }, orderBy: { personId: 'asc' },
      }),
    ]);
    const upcomingByTime = new Map<string, SalaDashboardPersonDto[]>();
    for (const entry of entries) {
      if (entry.origin !== SalaOccurrenceOrigin.FIXED && entry.origin !== SalaOccurrenceOrigin.ONE_OFF) continue;
      if (entry.status === SalaOccurrenceStatus.CANCELLED) continue;
      if (date === today && this.operationalStart(date, this.time(entry.startTime)) < now) continue;
      const people = upcomingByTime.get(entry.startTime) ?? [];
      people.push({ id: entry.person.id, firstName: entry.person.firstName, lastName: entry.person.lastName, origin: entry.origin });
      upcomingByTime.set(entry.startTime, people);
    }
    const followUp = (rows: { personId: string }[]) => ({ count: rows.length, personIds: rows.map((row) => row.personId) });
    return {
      date,
      expected: entries.filter((entry) => entry.origin === SalaOccurrenceOrigin.FIXED || entry.origin === SalaOccurrenceOrigin.ONE_OFF).length,
      attended: entries.filter((entry) => entry.status === SalaOccurrenceStatus.ATTENDED).length,
      cancelledOrAbsent: entries.filter((entry) => entry.status === SalaOccurrenceStatus.CANCELLED || entry.status === SalaOccurrenceStatus.ABSENT).length,
      upcoming: [...upcomingByTime.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 3)
        .map(([startTime, people]) => ({ startTime, total: people.length, people: people.slice(0, 3) })),
      withoutRoutine: followUp(withoutRoutine),
      withoutValidity: followUp(withoutValidity),
    };
  }
  async agenda(date: string) {
    const day = this.date(date);
    const personSelect = { id: true, firstName: true, lastName: true, dni: true } as const;
    const availability = await this.availability(date);
    const [windows, explicit, participations, payments] = await Promise.all([
      this.prisma.salaScheduleSlot.findMany({ where: { weekday: this.weekday(day), startsAt: { lte: day }, OR: [{ endedAt: null }, { endedAt: { gte: day } }] }, include: { fixedBookings: { where: { startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] }, include: { person: { select: personSelect }, serviceType: true, salaParticipation: { include: { mainProfessor: { select: { id: true, firstName: true, lastName: true } } } } } }, reservations: { where: { date: day }, include: { person: { select: personSelect }, serviceType: true, salaParticipation: { include: { mainProfessor: { select: { id: true, firstName: true, lastName: true } } } } } } } }),
      this.prisma.salaOccurrence.findMany({ where: { date: day }, include: { serviceType: true, person: { select: personSelect }, fixedSalaBooking: { include: { serviceType: true, salaParticipation: { include: { mainProfessor: { select: { id: true, firstName: true, lastName: true } } } } } }, oneOffReservation: { include: { serviceType: true, salaParticipation: { include: { mainProfessor: { select: { id: true, firstName: true, lastName: true } } } } } } } }),
      this.prisma.salaParticipation.findMany({ where: { startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] }, include: { mainProfessor: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { startDate: 'desc' } }),
      this.prisma.salaPayment.findMany({ where: { coverageStartDate: { lte: day }, coverageEndDate: { gte: day } }, include: { reversal: true } }),
    ]);
    return availability.map((state) => {
      const window = windows.find((candidate) => candidate.id === state.scheduleSlotId)!;
      const blockStart = this.parseMinutes(state.startTime);
      const occupies = (booking: { startTime: Date | null; serviceDurationMinutes: number | null; serviceType: { durationMinutes: number } | null }): boolean => { const start = booking.startTime ? this.minutes(booking.startTime) : this.minutes(window.startTime); const duration = booking.serviceDurationMinutes ?? booking.serviceType?.durationMinutes ?? SALA_DEFAULT_DURATION_MINUTES; return start < blockStart + 15 && blockStart < start + duration; };
      const startsInBlock = (booking: { startTime: Date | null }): boolean => (booking.startTime ? this.minutes(booking.startTime) : this.minutes(window.startTime)) === blockStart;
      type AgendaDetails = { startTime: string; durationMinutes: number; professional: { id: string; firstName: string; lastName: string } | null; service: { name: string } | null };
      const details = (booking: { startTime: Date | null; serviceDurationMinutes: number | null; serviceType: { name: string; durationMinutes: number } | null; salaParticipation: { mainProfessor: { id: string; firstName: string; lastName: string } } }): AgendaDetails => ({ startTime: this.formatMinutes(booking.startTime ? this.minutes(booking.startTime) : this.minutes(window.startTime)), durationMinutes: booking.serviceDurationMinutes ?? booking.serviceType?.durationMinutes ?? SALA_DEFAULT_DURATION_MINUTES, professional: booking.salaParticipation.mainProfessor, service: booking.serviceType ? { name: booking.serviceType.name } : null });
      const entries = new Map<string, { person: typeof window.fixedBookings[number]['person']; origin: SalaOccurrenceOrigin; status: SalaOccurrenceStatus | 'PENDING_PAYMENT'; sourceId: string; isMaterialized: boolean; cancelledForNonPayment: boolean; details: AgendaDetails }>();
      for (const booking of window.fixedBookings.filter((item) => occupies(item) && startsInBlock(item))) {
        const startsAt = this.operationalStart(date, booking.startTime ?? window.startTime);
        const paid = payments.some((payment) => payment.personId === booking.personId && this.paymentCoversDate(payment, day, startsAt));
        const pending = !paid && (startsAt > new Date() || booking.createdAt <= startsAt);
        entries.set(`fixed:${booking.id}`, { person: booking.person, origin: SalaOccurrenceOrigin.FIXED, status: state.isClosed ? SalaOccurrenceStatus.CANCELLED : pending ? 'PENDING_PAYMENT' : SalaOccurrenceStatus.RESERVED, sourceId: booking.id, isMaterialized: false, cancelledForNonPayment: false, details: details(booking) });
      }
      for (const reservation of window.reservations.filter((item) => occupies(item) && startsInBlock(item))) entries.set(`oneOff:${reservation.id}`, { person: reservation.person, origin: SalaOccurrenceOrigin.ONE_OFF, status: reservation.cancelledAt || state.isClosed ? SalaOccurrenceStatus.CANCELLED : SalaOccurrenceStatus.RESERVED, sourceId: reservation.id, isMaterialized: false, cancelledForNonPayment: false, details: details(reservation) });
      for (const occurrence of explicit.filter((item) => item.scheduleSlotId === window.id)) {
        const key = occurrence.fixedSalaBookingId ? `fixed:${occurrence.fixedSalaBookingId}` : occurrence.oneOffReservationId ? `oneOff:${occurrence.oneOffReservationId}` : `spontaneous:${occurrence.id}`;
        if (!entries.has(key) && (occurrence.origin !== SalaOccurrenceOrigin.SPONTANEOUS || this.minutes(occurrence.startTime ?? window.startTime) !== blockStart)) continue;
        const source = occurrence.fixedSalaBooking ?? occurrence.oneOffReservation;
        const fallback = { startTime: this.formatMinutes(this.minutes(occurrence.startTime ?? window.startTime)), durationMinutes: occurrence.serviceDurationMinutes ?? occurrence.serviceType?.durationMinutes ?? SALA_DEFAULT_DURATION_MINUTES, service: occurrence.serviceType ? { name: occurrence.serviceType.name } : null, professional: participations.find((participation) => participation.personId === occurrence.personId)?.mainProfessor ?? null };
        entries.set(key, { person: occurrence.person, origin: occurrence.origin, status: occurrence.status, sourceId: occurrence.fixedSalaBookingId ?? occurrence.oneOffReservationId ?? occurrence.id, isMaterialized: true, cancelledForNonPayment: Boolean(occurrence.cancelledForNonPaymentAt), details: source ? details(source) : fallback });
      }
      const people = [...entries.values()].map((value) => ({ personId: value.person.id, person: value.person, origin: value.origin, status: value.status, sourceId: value.sourceId, isMaterialized: value.isMaterialized, cancelledForNonPayment: value.cancelledForNonPayment, ...value.details }));
      return { slot: { id: state.slotId, scheduleSlotId: window.id, weekday: window.weekday, startTime: state.startTime, durationMinutes: 15 }, capacity: state.capacity, reserved: state.reserved, available: state.available, isOverbooked: state.isOverbooked, isClosed: state.isClosed, people };
    });
  }
  private async spontaneousParticipation(client: Prisma.TransactionClient | PrismaService, personId: string, date: string) {
    const day = this.date(date);
    const participation = await client.salaParticipation.findFirst({
      where: { personId, startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] },
      include: { plan: true, mainProfessor: { select: { id: true, firstName: true, lastName: true } }, planAssignments: { where: { effectiveFrom: { lte: day } }, orderBy: { effectiveFrom: 'desc' }, take: 1, include: { plan: true } } },
      orderBy: { startDate: 'desc' },
    });
    if (!participation) return null;
    const plan = date < this.todayOperational() ? participation.planAssignments[0]?.plan ?? participation.plan : participation.plan;
    return { participation, plan };
  }
  async getSpontaneousOptions(personId: string, date: string) {
    const resolved = await this.spontaneousParticipation(this.prisma, personId, date);
    if (!resolved) return { eligible: false, services: [] };
    const links = await this.prisma.salaPlanService.findMany({ where: { planId: resolved.plan.id, serviceType: { isSelectable: true } }, include: { serviceType: { select: { id: true, name: true, durationMinutes: true } } }, orderBy: { serviceType: { name: 'asc' } } });
    return { eligible: true, participationId: resolved.participation.id, plan: { id: resolved.plan.id, name: resolved.plan.name }, mainProfessor: resolved.participation.mainProfessor, services: links.map((link) => link.serviceType) };
  }
  async createSpontaneousOccurrence(input: SpontaneousOccurrenceDto, actorId: string) {
    return this.prisma.$transaction((tx) => this.createSpontaneousOccurrenceWithinTransaction(tx, input, actorId));
  }
  private assertSpontaneousOnboardingToday(date: string): void {
    if (date !== this.todayOperational()) throw new BadRequestException({ code: 'SALA_SPONTANEOUS_ONBOARDING_TODAY_ONLY', message: 'El alta desde incorporación espontánea sólo está disponible para hoy.' });
  }
  async joinAndCreateSpontaneousOccurrence(input: JoinSpontaneousSalaDto, actorId: string) {
    this.assertSpontaneousOnboardingToday(input.date);
    return this.prisma.$transaction(async (tx) => {
      await this.joinWithinTransaction(tx, { ...input, startDate: input.date });
      return this.createSpontaneousOccurrenceWithinTransaction(tx, input, actorId);
    });
  }
  async createStudentAndSpontaneousOccurrence(input: CreateSpontaneousSalaStudentDto, actorId: string) {
    this.assertSpontaneousOnboardingToday(input.date);
    const result = await this.prisma.$transaction(async (tx) => {
      const created = await this.people.createWithinTransaction(input, tx);
      await this.joinWithinTransaction(tx, { personId: created.personId, planId: input.planId, mainProfessorId: input.mainProfessorId, startDate: input.date });
      const occurrence = await this.createSpontaneousOccurrenceWithinTransaction(tx, { ...input, personId: created.personId }, actorId);
      return { ...created, occurrence };
    });
    return { person: { ...(await this.people.get(result.personId)), initialPin: result.initialPin }, occurrence: result.occurrence };
  }
  private async createSpontaneousOccurrenceWithinTransaction(tx: Prisma.TransactionClient, input: SpontaneousOccurrenceDto, actorId: string) {
    if (input.date > this.todayOperational()) throw new BadRequestException({ code: 'SALA_SPONTANEOUS_FUTURE_NOT_ALLOWED', message: 'La incorporación espontánea sólo puede registrarse para hoy o una fecha pasada.' });
    const day = this.date(input.date);
    await tx.$queryRaw`SELECT id FROM sala_schedule_slots WHERE id = ${input.scheduleSlotId}::uuid FOR UPDATE`;
    const [slot, person, resolved, service, existing, fixed, oneOff] = await Promise.all([
      tx.salaScheduleSlot.findFirst({ where: { id: input.scheduleSlotId, weekday: this.weekday(day), startsAt: { lte: day }, OR: [{ endedAt: null }, { endedAt: { gte: day } }] } }),
      tx.person.findUnique({ where: { id: input.personId }, select: { id: true } }),
      this.spontaneousParticipation(tx, input.personId, input.date),
      tx.salaServiceType.findUnique({ where: { id: input.serviceTypeId } }),
      tx.salaOccurrence.findMany({ where: { personId: input.personId, date: day, status: { not: SalaOccurrenceStatus.CANCELLED } }, include: { scheduleSlot: true, serviceType: true } }),
      tx.fixedSalaBooking.findMany({ where: { personId: input.personId, startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] }, include: { scheduleSlot: true, serviceType: true } }),
      tx.oneOffReservation.findMany({ where: { personId: input.personId, date: day, cancelledAt: null }, include: { scheduleSlot: true, serviceType: true } }),
    ]);
    if (!slot) throw new NotFoundException({ code: 'SALA_OCCURRENCE_SLOT_INVALID', message: 'Schedule occurrence not found' });
    if (!person) throw new NotFoundException({ code: 'PERSON_NOT_FOUND', message: 'Person not found' });
    if (!resolved) throw new BadRequestException({ code: 'SALA_PARTICIPATION_REQUIRED', message: 'La Persona no tiene una participación válida de Sala para esa fecha.' });
    if (!service || !service.isSelectable) throw new BadRequestException({ code: 'SALA_SERVICE_TYPE_INVALID', message: 'El Servicio ya no está disponible.' });
    const link = await tx.salaPlanService.findUnique({ where: { planId_serviceTypeId: { planId: resolved.plan.id, serviceTypeId: service.id } } });
    if (!link) throw new BadRequestException({ code: 'SALA_SERVICE_NOT_INCLUDED_IN_PLAN', message: 'El Servicio no está incluido en el Plan de la Persona.' });
    const durationMinutes = service.durationMinutes;
    this.validateServiceDuration(durationMinutes);
    const startTime = this.time(input.startTime);
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const clock = Object.fromEntries(parts.map(part => [part.type, part.value]));
    if (input.date === this.todayOperational(now) && this.minutes(startTime) < Number(clock.hour) * 60 + Number(clock.minute)) {
      throw new BadRequestException({ code: 'SALA_SPONTANEOUS_TIME_PASSED', message: 'Ese horario ya pasó. Elegí un horario actual o posterior.' });
    }
    const start = this.minutes(startTime);
    const cancelledFixed = new Set((await tx.salaOccurrence.findMany({ where: { personId: input.personId, date: day, status: SalaOccurrenceStatus.CANCELLED, fixedSalaBookingId: { not: null } }, select: { fixedSalaBookingId: true } })).map((item) => item.fixedSalaBookingId));
    const planned = [...fixed.filter((item) => !cancelledFixed.has(item.id)), ...oneOff];
    const overlapsExisting = [...planned, ...existing.filter((item) => item.origin === SalaOccurrenceOrigin.SPONTANEOUS)].some((item) => this.overlaps(start, durationMinutes, this.minutes(item.startTime ?? item.scheduleSlot.startTime), item.serviceDurationMinutes ?? item.serviceType?.durationMinutes ?? SALA_DEFAULT_DURATION_MINUTES));
    if (overlapsExisting) throw new ConflictException({ code: 'SALA_OCCURRENCE_DUPLICATE', message: 'La Persona ya tiene una presencia registrada para este horario.' });
    if (start % 15 !== 0 || start < this.minutes(slot.startTime) || start + durationMinutes > this.minutes(slot.startTime) + slot.durationMinutes) throw new ConflictException({ code: 'SALA_REQUIRED_SLOTS_UNAVAILABLE', message: 'El Servicio no entra completo en el horario seleccionado.' });
    const exception = await tx.salaScheduleException.findUnique({ where: { scheduleSlotId_date: { scheduleSlotId: slot.id, date: day } } });
    if (exception?.type === SalaScheduleExceptionType.CLOSURE) throw new ConflictException({ code: 'SALA_SCHEDULE_CLOSED', message: 'El horario está cerrado para esa fecha.' });
    const states = (await this.availability(input.date, tx)).filter((state) => state.scheduleSlotId === slot.id && this.parseMinutes(state.startTime) >= start && this.parseMinutes(state.startTime) < start + durationMinutes);
    const requiredSlots = durationMinutes / 15;
    if (states.length !== requiredSlots) throw new ConflictException({ code: 'SALA_REQUIRED_SLOTS_UNAVAILABLE', message: 'El Servicio no entra completo en el horario seleccionado.' });
    const fullSlots = states.filter((state) => state.reserved >= state.capacity).length;
    if (fullSlots && input.confirmOverbooking !== true) throw new ConflictException({ code: 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED', message: 'Confirmá la incorporación en sobrecupo.', details: { fullSlots, requiredSlots } });
    return tx.salaOccurrence.create({ data: { personId: input.personId, scheduleSlotId: slot.id, date: day, startTime, serviceTypeId: service.id, serviceDurationMinutes: durationMinutes, origin: SalaOccurrenceOrigin.SPONTANEOUS, status: SalaOccurrenceStatus.ATTENDED, createdBy: actorId, lastModifiedBy: actorId }, include: { person: { select: { id: true, firstName: true, lastName: true, dni: true } } } });
  }
  async commandOccurrence(input: OccurrenceReferenceDto & { status: SalaOccurrenceStatus; origin?: SalaOccurrenceOrigin }, actorId: string) {
    const day = this.date(input.date);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM sala_schedule_slots WHERE id = ${input.scheduleSlotId}::uuid FOR UPDATE`;
      const [slot, person, occurrences, fixedBookings, reservations] = await Promise.all([
        tx.salaScheduleSlot.findFirst({ where: { id: input.scheduleSlotId, weekday: this.weekday(day), startsAt: { lte: day }, OR: [{ endedAt: null }, { endedAt: { gte: day } }] } }),
        tx.person.findUnique({ where: { id: input.personId }, select: { id: true } }),
        tx.salaOccurrence.findMany({ where: { personId: input.personId, scheduleSlotId: input.scheduleSlotId, date: day } }),
        tx.fixedSalaBooking.findMany({ where: { personId: input.personId, scheduleSlotId: input.scheduleSlotId, startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] } }),
        tx.oneOffReservation.findMany({ where: { personId: input.personId, scheduleSlotId: input.scheduleSlotId, date: day } }),
      ]);
      if (!slot) throw new NotFoundException({ code: 'SALA_OCCURRENCE_SLOT_INVALID', message: 'Schedule occurrence not found' });
      if (!person) throw new NotFoundException({ code: 'PERSON_NOT_FOUND', message: 'Person not found' });
      const candidateStarts = [...fixedBookings.map((item) => this.formatMinutes(this.minutes(item.startTime ?? slot.startTime))), ...reservations.map((item) => this.formatMinutes(this.minutes(item.startTime ?? slot.startTime))), ...occurrences.filter((item) => item.origin === SalaOccurrenceOrigin.SPONTANEOUS).map((item) => this.formatMinutes(this.minutes(item.startTime ?? slot.startTime)))];
      if (!input.startTime && !input.sourceId && new Set(candidateStarts).size > 1) throw new ConflictException({ code: 'SALA_OCCURRENCE_AMBIGUOUS', message: 'Indicá el horario de la actividad que querés corregir.' });
      const startTime = input.startTime ?? candidateStarts[0];
      const matchingFixed = fixedBookings.filter((item) => this.formatMinutes(this.minutes(item.startTime ?? slot.startTime)) === startTime);
      const matchingOneOff = reservations.filter((item) => this.formatMinutes(this.minutes(item.startTime ?? slot.startTime)) === startTime);
      if (!input.sourceId && matchingFixed.length + matchingOneOff.length > 1) throw new ConflictException({ code: 'SALA_OCCURRENCE_AMBIGUOUS', message: 'Indicá la actividad que querés corregir.' });
      const fixed = input.sourceId ? fixedBookings.find((item) => item.id === input.sourceId) : matchingFixed[0];
      const oneOff = input.sourceId ? reservations.find((item) => item.id === input.sourceId) : matchingOneOff[0];
      if (fixed && oneOff) throw new ConflictException({ code: 'SALA_OCCURRENCE_AMBIGUOUS', message: 'Existen dos actividades en ese horario.' });
      const existing = occurrences.find((item) => (fixed && item.fixedSalaBookingId === fixed.id) || (oneOff && item.oneOffReservationId === oneOff.id) || item.origin === SalaOccurrenceOrigin.SPONTANEOUS && (input.sourceId ? item.id === input.sourceId : this.formatMinutes(this.minutes(item.startTime ?? slot.startTime)) === startTime));
      if (!existing && !fixed && !oneOff && input.origin !== SalaOccurrenceOrigin.SPONTANEOUS) throw new NotFoundException({ code: 'SALA_OCCURRENCE_NOT_FOUND', message: 'Operational occurrence not found' });
      if (input.origin === SalaOccurrenceOrigin.SPONTANEOUS && (existing || fixed || oneOff)) throw new ConflictException({ code: 'SALA_OCCURRENCE_DUPLICATE', message: 'Person already has an operational presence for this schedule' });
      const origin = existing?.origin ?? (oneOff ? SalaOccurrenceOrigin.ONE_OFF : fixed ? SalaOccurrenceOrigin.FIXED : SalaOccurrenceOrigin.SPONTANEOUS);
      const occurrence = existing ? await tx.salaOccurrence.update({ where: { id: existing.id }, data: { status: input.status, lastModifiedBy: actorId } }) : await tx.salaOccurrence.create({ data: { personId: input.personId, scheduleSlotId: input.scheduleSlotId, date: day, startTime: fixed?.startTime ?? oneOff?.startTime ?? (startTime ? this.time(startTime) : slot.startTime), origin, status: input.status, fixedSalaBookingId: fixed?.id ?? null, oneOffReservationId: oneOff?.id ?? null, serviceTypeId: fixed?.serviceTypeId ?? oneOff?.serviceTypeId ?? null, serviceDurationMinutes: fixed?.serviceDurationMinutes ?? oneOff?.serviceDurationMinutes ?? null, createdBy: actorId, lastModifiedBy: actorId } });
      return tx.salaOccurrence.findUniqueOrThrow({ where: { id: occurrence.id }, include: { person: { select: { id: true, firstName: true, lastName: true, dni: true } } } });
    });
  }
  private time(value: string): Date { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new BadRequestException({ code: 'SALA_SCHEDULE_TIME_INVALID', message: 'Time must use HH:mm' }); const [hour, minute] = value.split(':').map(Number); return new Date(Date.UTC(1970, 0, 1, hour, minute)); }
  private date(value: string): Date { return new Date(`${value}T00:00:00.000Z`); }
  private weekday(value: Date): SalaWeekday { return ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][value.getUTCDay()] as SalaWeekday; }
  private todayOperational(now = new Date()): string { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
  private positiveMoney(value: string, code: string): Prisma.Decimal { if (!/^\d+$/.test(value)) throw new BadRequestException({ code, message: 'Amount must be a positive whole ARS value' }); const amount = new Prisma.Decimal(value); if (!amount.greaterThan(0)) throw new BadRequestException({ code, message: 'Amount must be positive' }); return amount; }
  private signedMoney(value: string, code: string): Prisma.Decimal { if (!/^-?\d+$/.test(value)) throw new BadRequestException({ code, message: 'Amount must be a non-zero whole ARS value' }); const amount = new Prisma.Decimal(value); if (amount.isZero()) throw new BadRequestException({ code, message: 'Amount must be non-zero' }); return amount; }
  private requiredReason(value: string): string { const reason = value.trim(); if (!reason) throw new BadRequestException({ code: 'FINANCIAL_REASON_REQUIRED', message: 'Reason is required' }); return reason; }

  private async validateSalaAllocations(tx: Prisma.TransactionClient, personId: string, paymentAmount: Prisma.Decimal, allocations: Array<{ chargeId: string; amount: string; operationId: string }>): Promise<void> {
    if (new Set(allocations.map((allocation) => allocation.operationId)).size !== allocations.length) throw new BadRequestException({ code: 'SALA_PAYMENT_ALLOCATION_OPERATION_DUPLICATE', message: 'Allocation operation ids must be unique' });
    const requested = allocations.map((allocation) => ({ ...allocation, value: this.positiveMoney(allocation.amount, 'SALA_PAYMENT_ALLOCATION_AMOUNT_INVALID') }));
    const requestedTotal = requested.reduce((total, allocation) => total.plus(allocation.value), new Prisma.Decimal(0));
    if (requestedTotal.greaterThan(paymentAmount)) throw new BadRequestException({ code: 'SALA_PAYMENT_OVERALLOCATED', message: 'Allocations cannot exceed payment amount' });
    const chargeIds = [...new Set(requested.map((allocation) => allocation.chargeId))];
    if (!chargeIds.length) return;
    await tx.$queryRaw`SELECT id FROM sala_charges WHERE id IN (${Prisma.join(chargeIds)}::uuid) ORDER BY id FOR UPDATE`;
    const charges = await tx.salaCharge.findMany({ where: { id: { in: chargeIds } }, include: { adjustments: true, allocations: { where: { payment: { reversal: null } } } } });
    if (charges.length !== chargeIds.length || charges.some((charge) => charge.personId !== personId)) throw new BadRequestException({ code: 'SALA_PAYMENT_CHARGE_MISMATCH', message: 'Every charge must belong to the payment person' });
    for (const charge of charges) {
      const due = charge.adjustments.reduce((total, adjustment) => total.plus(adjustment.amount), charge.amount).minus(charge.allocations.reduce((total, allocation) => total.plus(allocation.amount), new Prisma.Decimal(0)));
      const value = requested.filter((allocation) => allocation.chargeId === charge.id).reduce((total, allocation) => total.plus(allocation.value), new Prisma.Decimal(0));
      if (value.greaterThan(Prisma.Decimal.max(due, 0))) throw new ConflictException({ code: 'SALA_CHARGE_OVERALLOCATED', message: 'Allocation exceeds charge outstanding amount' });
    }
  }
  private optionalText(value: string | null | undefined): string | null { const normalized = value?.trim(); return normalized ? normalized : null; }
  private normalizeName(value: string): string { return value.trim().normalize('NFKC').toLocaleLowerCase('es-AR'); }
  private async assertPlanServicesAvailable(tx: Prisma.TransactionClient, serviceTypeIds: string[]): Promise<void> {
    const count = await tx.salaServiceType.count({ where: { id: { in: serviceTypeIds }, isSelectable: true } });
    if (serviceTypeIds.length === 0 || count !== serviceTypeIds.length) {
      throw new BadRequestException({ code: 'SALA_PLAN_SERVICE_INVALID', message: 'Plan services must exist and be selectable' });
    }
  }
  private mapPlanServices(plan: PlanWithServices) {
    return { ...plan, services: plan.services.map((link) => link.serviceType) };
  }
  private async assertPlanNameAvailable(name: string, excludingId?: string): Promise<void> { const plans = await this.prisma.salaPlan.findMany({ where: { isSelectable: true }, select: { id: true, name: true } }); if (plans.some((plan) => plan.id !== excludingId && this.normalizeName(plan.name) === this.normalizeName(name))) throw new ConflictException({ code: 'SALA_PLAN_DUPLICATE', message: 'A plan with this name already exists' }); }
  private validateServiceDuration(durationMinutes: number): void { if (durationMinutes <= 0 || durationMinutes % 15 !== 0) throw new BadRequestException({ code: 'SALA_SERVICE_DURATION_INVALID', message: 'Service duration must be a positive multiple of 15 minutes' }); }
  private validateWindow(startTime: Date, durationMinutes: number): void { if (this.minutes(startTime) % 15 !== 0 || durationMinutes <= 0 || durationMinutes % 15 !== 0) throw new BadRequestException({ code: 'SALA_SCHEDULE_GRID_INVALID', message: 'Opening windows must align to 15-minute slots' }); }
  private validateWeeklyWindows(windows: { weekday: SalaWeekday; start: Date; duration: number }[]): void {
    for (const window of windows) { this.validateWindow(window.start, window.duration); if (this.minutes(window.start) + window.duration > 24 * 60) throw new BadRequestException({ code: 'SALA_SCHEDULE_END_INVALID', message: 'Schedule must end before midnight' }); }
    for (const weekday of Object.values(SalaWeekday)) {
      const day = windows.filter((window) => window.weekday === weekday);
      for (let index = 0; index < day.length; index += 1) for (let other = index + 1; other < day.length; other += 1) if (this.overlaps(this.minutes(day[index]!.start), day[index]!.duration, this.minutes(day[other]!.start), day[other]!.duration)) throw new ConflictException({ code: 'SALA_SCHEDULE_OVERLAP', message: 'Schedule windows cannot overlap' });
    }
  }
  private async assertBookingDoesNotOverlap(tx: Prisma.TransactionClient, input: FixedBookingDto | OneOffReservationDto, day: Date, start: number, duration: number, excludingFixed?: { id: string }): Promise<void> {
    const isOneOff = !('startDate' in input);
    const upper = !isOneOff && input.endDate ? this.date(input.endDate) : undefined;
    const [fixed, oneOff, spontaneous, cancellations] = await Promise.all([
      tx.fixedSalaBooking.findMany({ where: { personId: input.personId, ...(excludingFixed ? { id: { not: excludingFixed.id } } : {}), scheduleSlot: { weekday: this.weekday(day) }, ...(upper || isOneOff ? { startDate: { lte: upper ?? day } } : {}), OR: [{ endDate: null }, { endDate: { gte: day } }] }, include: { scheduleSlot: true, serviceType: true } }),
      tx.oneOffReservation.findMany({ where: { personId: input.personId, cancelledAt: null, date: isOneOff ? day : { gte: day, ...(upper ? { lte: upper } : {}) } }, include: { scheduleSlot: true, serviceType: true } }),
      isOneOff ? tx.salaOccurrence.findMany({ where: { personId: input.personId, date: day, origin: SalaOccurrenceOrigin.SPONTANEOUS, status: SalaOccurrenceStatus.ATTENDED }, include: { scheduleSlot: true, serviceType: true } }) : Promise.resolve([]),
      isOneOff ? tx.salaOccurrence.findMany({ where: { personId: input.personId, date: day, status: SalaOccurrenceStatus.CANCELLED, fixedSalaBookingId: { not: null } }, select: { fixedSalaBookingId: true } }) : Promise.resolve([]),
    ]);
    const cancelledIds = new Set(cancellations.map((item) => item.fixedSalaBookingId));
    const existing = [...fixed.filter((item) => !cancelledIds.has(item.id)), ...oneOff.filter((item) => isOneOff || this.weekday(item.date) === this.weekday(day)), ...spontaneous];
    for (const item of existing) {
      const otherStart = this.minutes(item.startTime ?? item.scheduleSlot.startTime);
      const otherDuration = item.serviceDurationMinutes ?? item.serviceType?.durationMinutes ?? SALA_DEFAULT_DURATION_MINUTES;
      if (!this.overlaps(start, duration, otherStart, otherDuration)) continue;
      throw new ConflictException({ code: start === otherStart ? 'SALA_RESERVATION_DUPLICATE' : 'SALA_BOOKING_OVERLAP', message: 'Ya tenés una actividad reservada en ese horario. Elegí otro horario.' });
    }
  }
  private async validateBooking(tx: Prisma.TransactionClient, input: FixedBookingDto | OneOffReservationDto, date: string, excludingFixed?: { id: string }): Promise<{ startTime: Date; durationMinutes: number }> {
    if (!input.serviceTypeId) throw new BadRequestException({ code: 'SALA_SERVICE_REQUIRED', message: 'Se requiere un Servicio para reservar.' });
    const requestedDay = this.date(date);
    await tx.$queryRaw`SELECT id FROM sala_schedule_slots WHERE id = ${input.scheduleSlotId}::uuid FOR UPDATE`;
    const [participation, window, service] = await Promise.all([
      tx.salaParticipation.findFirst({ where: { id: input.salaParticipationId, personId: input.personId, endDate: null } }),
      tx.salaScheduleSlot.findFirst({ where: { id: input.scheduleSlotId, isActive: true } }),
      input.serviceTypeId ? tx.salaServiceType.findFirst({ where: { id: input.serviceTypeId, isSelectable: true } }) : Promise.resolve(null),
    ]);
    if (!participation) throw new BadRequestException({ code: 'SALA_PARTICIPATION_REQUIRED', message: 'An active Sala participation is required' });
    if (!window) throw new NotFoundException({ code: 'SALA_SCHEDULE_NOT_FOUND', message: 'Opening window not found for this date' });
    const day = 'startDate' in input ? this.nextWeekday(requestedDay, window.weekday) : requestedDay;
    if (!('startDate' in input) && this.weekday(day) !== window.weekday) throw new NotFoundException({ code: 'SALA_SCHEDULE_NOT_FOUND', message: 'Opening window not found for this date' });
    if (window.startsAt > day || (window.endedAt && window.endedAt < day)) throw new NotFoundException({ code: 'SALA_SCHEDULE_NOT_FOUND', message: 'Opening window not active for this date' });
    const exception = await tx.salaScheduleException.findUnique({ where: { scheduleSlotId_date: { scheduleSlotId: window.id, date: day } } });
    if (!service) throw new BadRequestException({ code: 'SALA_SERVICE_TYPE_INVALID', message: 'Service is not selectable' });
    const planService = await tx.salaPlanService.findUnique({
      where: { planId_serviceTypeId: { planId: participation.planId, serviceTypeId: input.serviceTypeId } },
      select: { planId: true },
    });
    if (!planService) throw new BadRequestException({
      code: 'SALA_SERVICE_NOT_INCLUDED_IN_PLAN',
      message: 'El servicio no está incluido en el Plan actual de la Persona.',
    });
    const durationMinutes = service.durationMinutes;
    this.validateServiceDuration(durationMinutes);
    const resolvedStartTime = this.time(input.startTime ?? this.formatMinutes(this.minutes(window.startTime)));
    const start = this.minutes(resolvedStartTime);
    const windowStart = this.minutes(window.startTime);
    const end = start + durationMinutes;
    if (start % 30 !== 0 || start < windowStart || end > windowStart + window.durationMinutes) throw new ConflictException({ code: 'SALA_REQUIRED_SLOTS_UNAVAILABLE', message: 'The service does not fit completely within the opening window' });
    if (exception?.type === SalaScheduleExceptionType.CLOSURE) throw new ConflictException({ code: 'SALA_SCHEDULE_CLOSED', message: 'Schedule is closed' });
    const validationDate = day.toISOString().slice(0, 10);
    await this.reconcileUnpaidFixed(validationDate, tx);
    await this.assertBookingDoesNotOverlap(tx, input, day, start, durationMinutes, excludingFixed);
    const states = (await this.availability(validationDate, tx, excludingFixed?.id)).filter((state) => state.scheduleSlotId === window.id && this.parseMinutes(state.startTime) >= start && this.parseMinutes(state.startTime) < end);
    const requiredSlots = durationMinutes / 15;
    if (states.length !== requiredSlots) throw new ConflictException({ code: 'SALA_REQUIRED_SLOTS_UNAVAILABLE', message: 'Not all required consecutive slots exist' });
    const fullSlots = states.filter((state) => state.reserved >= state.capacity);
    if (fullSlots.length > 0 && !input.confirmOverbooking) throw new ConflictException({ code: 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED', message: `Explicit overbooking confirmation is required for ${fullSlots.length} of ${requiredSlots} slots`, details: { fullSlots: fullSlots.length, requiredSlots } });
    if ('startDate' in input && !input.confirmOverbooking) {
      const through = input.endDate ? this.date(input.endDate) : undefined;
      const [reservations, overrides] = await Promise.all([
        tx.oneOffReservation.findMany({ where: { scheduleSlotId: window.id, cancelledAt: null, date: { gt: day, ...(through ? { lte: through } : {}) } }, select: { date: true } }),
        tx.salaScheduleException.findMany({ where: { scheduleSlotId: window.id, type: SalaScheduleExceptionType.CAPACITY_OVERRIDE, date: { gt: day, ...(through ? { lte: through } : {}) } }, select: { date: true } }),
      ]);
      const laterDates = [...new Set([...reservations, ...overrides].map((item) => item.date.toISOString().slice(0, 10)))];
      for (const laterDate of laterDates) {
        if (this.weekday(this.date(laterDate)) !== window.weekday) continue;
        const later = (await this.availability(laterDate, tx, excludingFixed?.id)).filter((state) => state.scheduleSlotId === window.id && this.parseMinutes(state.startTime) >= start && this.parseMinutes(state.startTime) < end);
        const occupied = later.filter((state) => state.reserved >= state.capacity);
        if (occupied.length) throw new ConflictException({ code: 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED', message: 'El Turno fijo supera la capacidad en una de sus ocurrencias.', details: { date: laterDate, fullSlots: occupied.length, requiredSlots } });
      }
    }
    return { startTime: resolvedStartTime, durationMinutes };
  }
  private validateRoutine(input: { days: RoutineDayDto[] }): void { for (const day of input.days) for (const exercise of day.exercises) if (this.optionalText(exercise.repetitions) && this.optionalText(exercise.duration)) throw new BadRequestException({ code: 'SALA_ROUTINE_REPETITIONS_DURATION_EXCLUSIVE', message: 'Repetitions and duration are alternatives' }); }
  private minutes(value: Date): number { return value.getUTCHours() * 60 + value.getUTCMinutes(); }
  private parseMinutes(value: string): number { const [hours, minutes] = value.split(':').map(Number); return (hours ?? 0) * 60 + (minutes ?? 0); }
  private formatMinutes(value: number): string { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
  private nextWeekday(value: Date, weekday: SalaWeekday): Date { const result = new Date(value); const target = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'].indexOf(weekday); result.setUTCDate(result.getUTCDate() + (target - result.getUTCDay() + 7) % 7); return result; }
  private overlaps(a: number, ad: number, b: number, bd: number): boolean { return a < b + bd && b < a + ad; }
}
