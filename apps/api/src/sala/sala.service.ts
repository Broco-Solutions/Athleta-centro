import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { FinancialAdjustmentKind, Prisma, Role, RoutineStatus, SalaChargeKind, SalaOccurrenceOrigin, SalaOccurrenceStatus, SalaScheduleExceptionType, InternalUserStatus, SalaWeekday } from '@prisma/client';
import { PeopleService } from '../people/people.service';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceCatalogService } from '../finance/finance.service';
import type { CreateSalaStudentDto, ChangeFixedBookingDto, ExerciseDefinitionDto, FixedBookingDto, OneOffReservationDto, OccurrenceReferenceDto, PhysicalEvaluationDto, PhysicalTestDefinitionDto, PlanDto, ReplaceRoutineDto, ReplaceScheduleSlotDto, ReplaceWeeklyScheduleDto, SalaServiceTypeDto, ScheduleExceptionDto, ScheduleSlotDto, SpontaneousOccurrenceDto, UpdateSalaConfigurationDto } from './sala.dto';
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
export class SalaService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SalaService.name);
  private billingTimer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService, private readonly financeCatalog: FinanceCatalogService, private readonly people: PeopleService) {}
  async onApplicationBootstrap(): Promise<void> {
    await this.runScheduledBilling();
    this.billingTimer = setInterval(() => void this.runScheduledBilling(), 24 * 60 * 60 * 1000);
    this.billingTimer.unref();
  }
  onApplicationShutdown(): void { if (this.billingTimer) clearInterval(this.billingTimer); }
  private async runScheduledBilling(): Promise<void> { try { await this.reconcileSalaCharges(); } catch (error) { this.logger.error('Sala charge reconciliation failed', error instanceof Error ? error.stack : undefined); } }
  listPaymentMethods() { return this.financeCatalog.listSelectable(); }
  async listPayments(personId: string) { return this.prisma.salaPayment.findMany({ where: { personId }, include: { paymentMethod: true, allocations: true, reversal: true }, orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }] }); }
  async paymentSummary(personId: string, year: number, month: number) {
    const [charge, participation] = await Promise.all([
      this.prisma.salaCharge.findFirst({ where: { personId, kind: SalaChargeKind.MONTHLY, year, month }, include: { adjustments: true, allocations: { where: { payment: { reversal: null } } } } }),
      this.prisma.salaParticipation.findFirst({ where: { personId, endDate: null }, include: { plan: true } }),
    ]);
    if (!charge) return { status: participation ? 'PENDING' : 'NOT_APPLICABLE', proposedAmount: participation?.plan.monthlyAmount.toString() ?? null, charge: null };
    const total = charge.adjustments.reduce((amount, adjustment) => amount.plus(adjustment.amount), charge.amount);
    const allocated = charge.allocations.reduce((amount, allocation) => amount.plus(allocation.amount), new Prisma.Decimal(0));
    const outstanding = Prisma.Decimal.max(total.minus(allocated), 0);
    return { status: outstanding.isZero() ? 'SETTLED' : allocated.isZero() ? 'PENDING' : 'PARTIAL', proposedAmount: total.toString(), outstanding: outstanding.toString(), charge };
  }
  async createPayment(input: { personId: string; year: number; month: number; paidAt: string; amount: string; paymentMethodId: string; operationId: string; adjustmentReason?: string; allocations?: Array<{ chargeId: string; amount: string; operationId: string }> }, actorId: string) {
    if (input.month < 1 || input.month > 12) throw new BadRequestException({ code: 'SALA_PAYMENT_MONTH_INVALID', message: 'Month is invalid' });
    if (new Date(`${input.paidAt}T00:00:00Z`) > new Date(`${this.todayOperational()}T00:00:00Z`)) throw new BadRequestException({ code: 'SALA_PAYMENT_DATE_FUTURE', message: 'Paid date cannot be future' });
    const paymentAmount = this.positiveMoney(input.amount, 'SALA_PAYMENT_AMOUNT_INVALID');
    const method = await this.prisma.paymentMethod.findUnique({ where: { id: input.paymentMethodId } });
    if (!method || !method.isSelectable) throw new BadRequestException({ code: 'PAYMENT_METHOD_NOT_SELECTABLE', message: 'Payment method is not selectable' });
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.personId}, 0))`;
      const existing = await tx.salaPayment.findUnique({ where: { operationId: input.operationId }, include: { paymentMethod: true, allocations: true, reversal: true } });
      if (existing) return existing;
      const person = await tx.person.findUnique({ where: { id: input.personId }, select: { id: true } });
      if (!person) throw new NotFoundException({ code: 'PERSON_NOT_FOUND', message: 'Person not found' });
      let requested = input.allocations;
      if (!requested?.length) {
        const monthly = await tx.salaCharge.findFirst({ where: { personId: input.personId, kind: SalaChargeKind.MONTHLY, year: input.year, month: input.month }, include: { adjustments: true, allocations: { where: { payment: { reversal: null } } } } });
        if (monthly) {
          const due = monthly.adjustments.reduce((amount, adjustment) => amount.plus(adjustment.amount), monthly.amount).minus(monthly.allocations.reduce((amount, allocation) => amount.plus(allocation.amount), new Prisma.Decimal(0)));
          const automatic = Prisma.Decimal.min(paymentAmount, Prisma.Decimal.max(due, 0));
          if (automatic.greaterThan(0)) requested = [{ chargeId: monthly.id, amount: automatic.toString(), operationId: input.operationId }];
        }
      }
      await this.validateSalaAllocations(tx, input.personId, paymentAmount, requested ?? []);
      return tx.salaPayment.create({ data: { personId: input.personId, year: input.year, month: input.month, paidAt: this.date(input.paidAt), amount: paymentAmount, paymentMethodId: input.paymentMethodId, registeredById: actorId, operationId: input.operationId, adjustmentReason: input.adjustmentReason?.trim() || null, allocations: { create: (requested ?? []).map((allocation) => ({ chargeId: allocation.chargeId, amount: allocation.amount, operationId: allocation.operationId })) } }, include: { paymentMethod: true, allocations: true, reversal: true } });
    });
  }
  async reversePayment(id: string, reason: string, operationId: string, actorId: string) {
    const value = this.requiredReason(reason);
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.salaPaymentReversal.findUnique({ where: { operationId } });
      if (old) return old;
      const payment = await tx.salaPayment.findUnique({ where: { id }, include: { reversal: true } });
      if (!payment) throw new NotFoundException({ code: 'SALA_PAYMENT_NOT_FOUND', message: 'Payment not found' });
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
  async activateBilling(cutoverDate: string): Promise<{ cutoverDate: Date; activatedAt: Date; createdCharges: number }> {
    const cutover = this.date(cutoverDate);
    const existing = await this.prisma.salaBillingConfiguration.findUnique({ where: { id: 'default' } });
    if (existing && existing.cutoverDate.getTime() !== cutover.getTime()) throw new ConflictException({ code: 'SALA_BILLING_ALREADY_ACTIVATED', message: 'Sala billing was already activated with another cutover date' });
    const config = existing ?? await this.prisma.salaBillingConfiguration.create({ data: { id: 'default', cutoverDate: cutover } });
    const createdCharges = await this.reconcileSalaCharges(this.todayOperational());
    return { cutoverDate: config.cutoverDate, activatedAt: config.activatedAt, createdCharges };
  }
  async reconcileSalaCharges(asOf = this.todayOperational()): Promise<number> {
    const config = await this.prisma.salaBillingConfiguration.findUnique({ where: { id: 'default' } });
    if (!config) return 0;
    const through = this.date(asOf);
    if (through < config.cutoverDate) return 0;
    const participations = await this.prisma.salaParticipation.findMany({ where: { startDate: { lte: through }, OR: [{ endDate: null }, { endDate: { gte: config.cutoverDate } }] }, include: { planAssignments: { include: { plan: true }, orderBy: { effectiveFrom: 'asc' } }, plan: true } });
    let created = 0;
    for (const participation of participations) {
      const first = new Date(Math.max(config.cutoverDate.getTime(), participation.startDate.getTime()));
      const last = new Date(Math.min(through.getTime(), participation.endDate?.getTime() ?? through.getTime()));
      for (const period of this.monthsBetween(first, last)) {
        const monthEnd = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 0));
        const assignment = [...participation.planAssignments].reverse().find((item) => item.effectiveFrom <= monthEnd);
        const plan = assignment?.plan ?? participation.plan;
        const chargeDate = new Date(Math.max(period.getTime(), participation.startDate.getTime(), config.cutoverDate.getTime()));
        try {
          await this.prisma.salaCharge.create({ data: { personId: participation.personId, salaParticipationId: participation.id, planId: plan.id, kind: SalaChargeKind.MONTHLY, year: period.getUTCFullYear(), month: period.getUTCMonth() + 1, chargeDate, concept: `Plan de Sala ${plan.name} ${period.getUTCFullYear()}-${String(period.getUTCMonth() + 1).padStart(2, '0')}`, amount: plan.monthlyAmount, planNameSnapshot: plan.name } });
          created += 1;
        } catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error; }
      }
    }
    await this.prisma.salaBillingConfiguration.update({ where: { id: 'default' }, data: { lastRunAt: new Date() } });
    return created;
  }
  async configuration() { return this.prisma.salaConfiguration.findUnique({ where: { id: 'default' } }); }
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
    const plans = await this.prisma.salaPlan.findMany({ include: planServicesInclude, orderBy: { name: 'asc' } });
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
      const billing = await tx.salaBillingConfiguration.findUnique({ where: { id: 'default' } });
      const today = this.date(this.todayOperational());
      if (billing && startDate <= today && startDate >= billing.cutoverDate) await tx.salaCharge.create({ data: { personId: input.personId, salaParticipationId: participation.id, planId: plan.id, kind: SalaChargeKind.MONTHLY, year: startDate.getUTCFullYear(), month: startDate.getUTCMonth() + 1, chargeDate: startDate, concept: `Plan de Sala ${plan.name} ${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}`, amount: plan.monthlyAmount, planNameSnapshot: plan.name } });
      return participation;
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'SALA_ACTIVE_PARTICIPATION_EXISTS', message: 'Person already has an active Sala participation' }); throw error; }
  }
  async listParticipations(personId: string) { return this.prisma.salaParticipation.findMany({ where: { personId }, orderBy: { startDate: 'desc' }, include: { plan: true, mainProfessor: true } }); }
  async leave(id: string, failureAfterMutations = false, actorId?: string) { return this.prisma.$transaction(async (tx) => { const current = await tx.salaParticipation.findFirst({ where: { id, endDate: null } }); if (!current) throw new NotFoundException({ code: 'SALA_ACTIVE_PARTICIPATION_NOT_FOUND', message: 'Active participation not found' }); const now = new Date(); const today = this.date(this.todayOperational()); await tx.fixedSalaBooking.updateMany({ where: { salaParticipationId: id, OR: [{ endDate: null }, { endDate: { gt: today } }] }, data: { endDate: today } }); await tx.oneOffReservation.updateMany({ where: { salaParticipationId: id, date: { gte: today }, cancelledAt: null }, data: { cancelledAt: now } }); await tx.salaOccurrence.updateMany({ where: { personId: current.personId, date: { gte: today }, status: { not: SalaOccurrenceStatus.CANCELLED } }, data: { status: SalaOccurrenceStatus.CANCELLED, ...(actorId ? { lastModifiedBy: actorId } : {}) } }); await tx.routine.updateMany({ where: { salaParticipationId: id, status: RoutineStatus.ACTIVE }, data: { status: RoutineStatus.HISTORICAL } }); await tx.salaClinicalIndication.updateMany({ where: { personId: current.personId, status: 'ACTIVE' }, data: { status: 'CLOSED', closedAt: now, ...(actorId ? { closedById: actorId } : {}) } }); if (failureAfterMutations) throw new Error('SIMULATED_LEAVE_FAILURE'); return tx.salaParticipation.update({ where: { id }, data: { endDate: today }, include: { plan: true, mainProfessor: true } }); }); }
  async changeProfessor(id: string, mainProfessorId: string) { const professor = await this.prisma.internalUser.findUnique({ where: { id: mainProfessorId }, include: { roles: true } }); if (!professor || professor.status !== InternalUserStatus.ACTIVE || !professor.roles.some((role) => role.role === Role.PROFESSOR)) throw new BadRequestException({ code: 'SALA_PROFESSOR_INVALID', message: 'Professor is not eligible' }); return this.prisma.salaParticipation.update({ where: { id }, data: { mainProfessorId }, include: { plan: true, mainProfessor: true } }); }
  async changePlan(id: string, planId: string) {
    const plan = await this.prisma.salaPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isSelectable) throw new BadRequestException({ code: 'SALA_PLAN_INVALID', message: 'Plan is not selectable' });
    const today = this.date(this.todayOperational());
    const effectiveFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
    try { return await this.prisma.salaParticipation.update({ where: { id }, data: { planId, planAssignments: { upsert: { where: { salaParticipationId_effectiveFrom: { salaParticipationId: id, effectiveFrom } }, create: { planId, effectiveFrom }, update: { planId } } } }, include: { plan: true, mainProfessor: true } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException({ code: 'SALA_ACTIVE_PARTICIPATION_NOT_FOUND', message: 'Active participation not found' }); throw error; }
  }
  async hasActiveSalaParticipation(personId: string) { return (await this.prisma.salaParticipation.count({ where: { personId, endDate: null } })) > 0; }
  async availability(date: string, client: Prisma.TransactionClient | PrismaService = this.prisma, excludeFixedBookingId?: string) { const day = this.date(date); const weekday = this.weekday(day); const [windows, config, fixed, oneOff] = await Promise.all([client.salaScheduleSlot.findMany({ where: { weekday, isActive: true, startsAt: { lte: day }, OR: [{ endedAt: null }, { endedAt: { gte: day } }] }, include: { exceptions: { where: { date: day } } }, orderBy: { startTime: 'asc' } }), client.salaConfiguration.findUnique({ where: { id: 'default' } }), client.fixedSalaBooking.findMany({ where: { startDate: { lte: day }, ...(excludeFixedBookingId ? { id: { not: excludeFixedBookingId } } : {}), OR: [{ endDate: null }, { endDate: { gte: day } }] }, include: { serviceType: true } }), client.oneOffReservation.findMany({ where: { date: day, cancelledAt: null }, include: { serviceType: true } })]); const result: Array<{ slotId: string; scheduleSlotId: string; startTime: string; endTime: string; date: string; capacity: number; reserved: number; available: number; isOverbooked: boolean; isClosed: boolean }> = []; for (const window of windows) { const exception = window.exceptions[0]; const isClosed = exception?.type === SalaScheduleExceptionType.CLOSURE; const capacity = exception?.type === SalaScheduleExceptionType.CAPACITY_OVERRIDE ? (exception.capacityOverride ?? 1) : (window.specificCapacity ?? config?.generalCapacity ?? 1); const windowStart = this.minutes(window.startTime); for (let start = windowStart; start < windowStart + window.durationMinutes; start += 15) { const occupying = [...fixed.filter((booking) => booking.scheduleSlotId === window.id), ...oneOff.filter((booking) => booking.scheduleSlotId === window.id)].filter((booking) => { const bookingStart = booking.startTime ? this.minutes(booking.startTime) : windowStart; const duration = booking.serviceDurationMinutes ?? booking.serviceType?.durationMinutes ?? SALA_DEFAULT_DURATION_MINUTES; return bookingStart < start + 15 && start < bookingStart + duration; }); const reserved = new Set(occupying.map((booking) => booking.personId)).size; const startTime = this.formatMinutes(start); result.push({ slotId: `${window.id}:${startTime}`, scheduleSlotId: window.id, startTime, endTime: this.formatMinutes(start + 15), date, capacity, reserved, available: Math.max(capacity - reserved, 0), isOverbooked: reserved > capacity, isClosed }); } } return result; }
  async createFixed(input: FixedBookingDto) { if (input.endDate && input.endDate < input.startDate) throw new BadRequestException({ code: 'SALA_BOOKING_DATE_INVALID', message: 'End date must be on or after start date' }); return this.prisma.$transaction(async (tx) => { const resolved = await this.validateBooking(tx, input, input.startDate); try { return await tx.fixedSalaBooking.create({ data: { personId: input.personId, salaParticipationId: input.salaParticipationId, scheduleSlotId: input.scheduleSlotId, serviceTypeId: input.serviceTypeId ?? null, serviceDurationMinutes: resolved.durationMinutes, startTime: resolved.startTime, startDate: this.date(input.startDate), endDate: input.endDate ? this.date(input.endDate) : null }, include: { scheduleSlot: true, serviceType: true } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'SALA_FIXED_BOOKING_DUPLICATE', message: 'Equivalent fixed booking already exists' }); throw error; } }); }
  async createReservation(input: OneOffReservationDto) { return this.prisma.$transaction(async (tx) => { const resolved = await this.validateBooking(tx, input, input.date); try { return await tx.oneOffReservation.create({ data: { personId: input.personId, salaParticipationId: input.salaParticipationId, scheduleSlotId: input.scheduleSlotId, serviceTypeId: input.serviceTypeId ?? null, serviceDurationMinutes: resolved.durationMinutes, startTime: resolved.startTime, date: this.date(input.date) }, include: { scheduleSlot: true, serviceType: true } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'SALA_RESERVATION_DUPLICATE', message: 'Reservation already exists' }); throw error; } }); }
  async listFixed(personId: string) { return this.prisma.fixedSalaBooking.findMany({ where: { personId }, include: { scheduleSlot: true, serviceType: true }, orderBy: { startDate: 'desc' } }); }
  async changeFixed(input: ChangeFixedBookingDto) { if (input.endDate && input.endDate < input.startDate) throw new BadRequestException({ code: 'SALA_BOOKING_DATE_INVALID', message: 'End date must be on or after start date' }); return this.prisma.$transaction(async (tx) => { const current = await tx.fixedSalaBooking.findUnique({ where: { id: input.id } }); if (!current) throw new NotFoundException({ code: 'SALA_FIXED_BOOKING_NOT_FOUND', message: 'Fixed booking not found' }); const resolved = await this.validateBooking(tx, input, input.startDate, current); const effective = this.date(input.startDate); if (current.startDate.getTime() === effective.getTime()) { return tx.fixedSalaBooking.update({ where: { id: input.id }, data: { scheduleSlotId: input.scheduleSlotId, serviceTypeId: input.serviceTypeId ?? null, serviceDurationMinutes: resolved.durationMinutes, startTime: resolved.startTime, ...(input.endDate !== undefined ? { endDate: input.endDate ? this.date(input.endDate) : null } : {}) }, include: { scheduleSlot: true, serviceType: true } }); } await tx.fixedSalaBooking.update({ where: { id: input.id }, data: { endDate: new Date(effective.getTime() - 86400000) } }); try { return await tx.fixedSalaBooking.create({ data: { personId: input.personId, salaParticipationId: input.salaParticipationId, scheduleSlotId: input.scheduleSlotId, serviceTypeId: input.serviceTypeId ?? null, startTime: resolved.startTime, startDate: effective, endDate: input.endDate ? this.date(input.endDate) : null }, include: { scheduleSlot: true, serviceType: true } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'SALA_FIXED_BOOKING_DUPLICATE', message: 'Equivalent fixed booking already exists' }); throw error; } }); }
  async listReservations(personId: string) { return this.prisma.oneOffReservation.findMany({ where: { personId }, include: { scheduleSlot: true, serviceType: true }, orderBy: { date: 'desc' } }); }
  async endFixed(id: string, endDate: string) { try { return await this.prisma.fixedSalaBooking.update({ where: { id }, data: { endDate: this.date(endDate) } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException({ code: 'SALA_FIXED_BOOKING_NOT_FOUND', message: 'Fixed booking not found' }); throw error; } }
  async cancelReservation(id: string) { try { return await this.prisma.oneOffReservation.update({ where: { id }, data: { cancelledAt: new Date() } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException({ code: 'SALA_RESERVATION_NOT_FOUND', message: 'Reservation not found' }); throw error; } }
  async listExerciseDefinitions(includeInactive = false) { return this.prisma.exerciseDefinition.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: { name: 'asc' } }); }
  async createExerciseDefinition(input: ExerciseDefinitionDto) { try { return await this.prisma.exerciseDefinition.create({ data: { name: input.name.trim(), primaryMuscle: input.primaryMuscle.trim(), description: this.optionalText(input.description) } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'SALA_EXERCISE_DUPLICATE', message: 'Exercise already exists' }); throw error; } }
  async updateExerciseDefinition(id: string, input: ExerciseDefinitionDto) { try { return await this.prisma.exerciseDefinition.update({ where: { id }, data: { name: input.name.trim(), primaryMuscle: input.primaryMuscle.trim(), description: this.optionalText(input.description) } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException({ code: 'SALA_EXERCISE_NOT_FOUND', message: 'Exercise not found' }); if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'SALA_EXERCISE_DUPLICATE', message: 'Exercise already exists' }); throw error; } }
  async retireExerciseDefinition(id: string, confirmActiveRoutineImpact: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const exercise = await tx.exerciseDefinition.findUnique({ where: { id } });
      if (!exercise || !exercise.isActive) throw new NotFoundException({ code: 'SALA_EXERCISE_NOT_FOUND', message: 'Exercise not found' });
      const activeUses = await tx.routineExercise.count({ where: { exerciseDefinitionId: id, routineDay: { routine: { status: RoutineStatus.ACTIVE } } } });
      if (activeUses > 0 && !confirmActiveRoutineImpact) throw new ConflictException({ code: 'SALA_EXERCISE_RETIRE_CONFIRMATION_REQUIRED', message: 'Confirmation is required because active routines are affected', details: { activeRoutineExercises: activeUses } });
      if (activeUses > 0) await tx.routineExercise.deleteMany({ where: { exerciseDefinitionId: id, routineDay: { routine: { status: RoutineStatus.ACTIVE } } } });
      const retired = await tx.exerciseDefinition.update({ where: { id }, data: { isActive: false } });
      return { exercise: retired, affectedActiveRoutineExercises: activeUses };
    });
  }
  async listRoutines(personId: string) { return this.prisma.routine.findMany({ where: { personId }, include: { days: { orderBy: { position: 'asc' }, include: { exercises: { orderBy: { position: 'asc' }, include: { exerciseDefinition: true } } } }, salaParticipation: { select: { id: true, startDate: true, endDate: true } } }, orderBy: { version: 'desc' } }); }
  async replaceRoutine(input: ReplaceRoutineDto, failureAfterArchive = false) {
    this.validateRoutine(input);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM people WHERE id = ${input.personId}::uuid FOR UPDATE`;
      const participation = await tx.salaParticipation.findFirst({ where: { id: input.salaParticipationId, personId: input.personId, endDate: null }, select: { id: true } });
      if (!participation) throw new BadRequestException({ code: 'SALA_ACTIVE_PARTICIPATION_REQUIRED', message: 'An active Sala participation is required' });
      const exerciseIds = [...new Set(input.days.flatMap((day) => day.exercises.map((exercise) => exercise.exerciseDefinitionId)))];
      const validExercises = await tx.exerciseDefinition.count({ where: { id: { in: exerciseIds }, isActive: true } });
      if (validExercises !== exerciseIds.length) throw new BadRequestException({ code: 'SALA_EXERCISE_INVALID', message: 'Every routine exercise must reference an active catalog exercise' });
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
  async listPhysicalTests() { return this.prisma.physicalTestDefinition.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }); }
  async createPhysicalTest(input: PhysicalTestDefinitionDto) { try { return await this.prisma.physicalTestDefinition.create({ data: { name: input.name.trim(), type: input.type.trim(), description: this.optionalText(input.description) } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'SALA_PHYSICAL_TEST_DUPLICATE', message: 'Physical test already exists' }); throw error; } }
  async retirePhysicalTest(id: string) { try { return await this.prisma.physicalTestDefinition.update({ where: { id }, data: { isActive: false } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException({ code: 'SALA_PHYSICAL_TEST_NOT_FOUND', message: 'Physical test not found' }); throw error; } }
  async listPhysicalEvaluations(personId: string) { return this.prisma.physicalEvaluation.findMany({ where: { personId }, include: { professor: { select: { id: true, firstName: true, lastName: true } }, results: { include: { testDefinition: true } } }, orderBy: { evaluationDate: 'desc' } }); }
  async createPhysicalEvaluation(input: PhysicalEvaluationDto, actorId: string) { return this.prisma.$transaction(async (tx) => { const participation = await tx.salaParticipation.findFirst({ where: { id: input.salaParticipationId, personId: input.personId, endDate: null }, select: { id: true } }); if (!participation) throw new BadRequestException({ code: 'SALA_ACTIVE_PARTICIPATION_REQUIRED', message: 'An active Sala participation is required' }); const professor = await tx.internalUser.findUnique({ where: { id: input.professorId }, include: { roles: true } }); if (!professor || professor.status !== InternalUserStatus.ACTIVE || !professor.roles.some((role) => role.role === Role.PROFESSOR)) throw new BadRequestException({ code: 'SALA_PROFESSOR_INVALID', message: 'Professor is not eligible' }); const ids = input.results.map((result) => result.testDefinitionId); const tests = await tx.physicalTestDefinition.count({ where: { id: { in: ids }, isActive: true } }); if (tests !== new Set(ids).size) throw new BadRequestException({ code: 'SALA_PHYSICAL_TEST_INVALID', message: 'Every result must reference an active physical test' }); return tx.physicalEvaluation.create({ data: { personId: input.personId, salaParticipationId: input.salaParticipationId, professorId: input.professorId, evaluationDate: this.date(input.evaluationDate), createdBy: actorId, results: { create: input.results.map((result) => ({ testDefinitionId: result.testDefinitionId, resultText: result.resultText.trim() })) } }, include: { results: { include: { testDefinition: true } } } }); }); }
  async agenda(date: string) {
    const day = this.date(date);
    const personSelect = { id: true, firstName: true, lastName: true, dni: true } as const;
    const [windows, explicit, availability] = await Promise.all([
      this.prisma.salaScheduleSlot.findMany({ where: { weekday: this.weekday(day), startsAt: { lte: day }, OR: [{ endedAt: null }, { endedAt: { gte: day } }] }, include: { fixedBookings: { where: { startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] }, include: { person: { select: personSelect }, serviceType: true, salaParticipation: { include: { mainProfessor: { select: { id: true, firstName: true, lastName: true } } } } } }, reservations: { where: { date: day }, include: { person: { select: personSelect }, serviceType: true, salaParticipation: { include: { mainProfessor: { select: { id: true, firstName: true, lastName: true } } } } } } } }),
      this.prisma.salaOccurrence.findMany({ where: { date: day }, include: { person: { select: personSelect }, fixedSalaBooking: { include: { serviceType: true, salaParticipation: { include: { mainProfessor: { select: { id: true, firstName: true, lastName: true } } } } } }, oneOffReservation: { include: { serviceType: true, salaParticipation: { include: { mainProfessor: { select: { id: true, firstName: true, lastName: true } } } } } } } }),
      this.availability(date),
    ]);
    return availability.map((state) => {
      const window = windows.find((candidate) => candidate.id === state.scheduleSlotId)!;
      const blockStart = this.parseMinutes(state.startTime);
      const occupies = (booking: { startTime: Date | null; serviceDurationMinutes: number | null; serviceType: { durationMinutes: number } | null }): boolean => { const start = booking.startTime ? this.minutes(booking.startTime) : this.minutes(window.startTime); const duration = booking.serviceDurationMinutes ?? booking.serviceType?.durationMinutes ?? SALA_DEFAULT_DURATION_MINUTES; return start < blockStart + 15 && blockStart < start + duration; };
      const startsInBlock = (booking: { startTime: Date | null }): boolean => (booking.startTime ? this.minutes(booking.startTime) : this.minutes(window.startTime)) === blockStart;
      type AgendaDetails = { startTime: string; durationMinutes: number; professional: { id: string; firstName: string; lastName: string } | null; service: { name: string } | null };
      const details = (booking: { startTime: Date | null; serviceDurationMinutes: number | null; serviceType: { name: string; durationMinutes: number } | null; salaParticipation: { mainProfessor: { id: string; firstName: string; lastName: string } } }): AgendaDetails => ({ startTime: this.formatMinutes(booking.startTime ? this.minutes(booking.startTime) : this.minutes(window.startTime)), durationMinutes: booking.serviceDurationMinutes ?? booking.serviceType?.durationMinutes ?? SALA_DEFAULT_DURATION_MINUTES, professional: booking.salaParticipation.mainProfessor, service: booking.serviceType ? { name: booking.serviceType.name } : null });
      const entries = new Map<string, { person: typeof window.fixedBookings[number]['person']; origin: SalaOccurrenceOrigin; status: SalaOccurrenceStatus; fixedSalaBookingId: string | null; oneOffReservationId: string | null; isMaterialized: boolean; details: AgendaDetails }>();
      for (const booking of window.fixedBookings.filter((item) => occupies(item) && startsInBlock(item))) entries.set(booking.personId, { person: booking.person, origin: SalaOccurrenceOrigin.FIXED, status: state.isClosed ? SalaOccurrenceStatus.CANCELLED : SalaOccurrenceStatus.RESERVED, fixedSalaBookingId: booking.id, oneOffReservationId: null, isMaterialized: false, details: details(booking) });
      for (const reservation of window.reservations.filter((item) => occupies(item) && startsInBlock(item))) entries.set(reservation.personId, { person: reservation.person, origin: SalaOccurrenceOrigin.ONE_OFF, status: reservation.cancelledAt || state.isClosed ? SalaOccurrenceStatus.CANCELLED : SalaOccurrenceStatus.RESERVED, fixedSalaBookingId: null, oneOffReservationId: reservation.id, isMaterialized: false, details: details(reservation) });
      for (const occurrence of explicit.filter((item) => item.scheduleSlotId === window.id && (entries.has(item.personId) || (item.origin === SalaOccurrenceOrigin.SPONTANEOUS && this.minutes(item.startTime ?? window.startTime) === blockStart)))) { const source = occurrence.fixedSalaBooking ?? occurrence.oneOffReservation; const fallback = { startTime: occurrence.startTime, serviceDurationMinutes: SALA_DEFAULT_DURATION_MINUTES, serviceType: null, salaParticipation: { mainProfessor: { id: '', firstName: '', lastName: '' } } }; entries.set(occurrence.personId, { person: occurrence.person, origin: occurrence.origin, status: occurrence.status, fixedSalaBookingId: occurrence.fixedSalaBookingId, oneOffReservationId: occurrence.oneOffReservationId, isMaterialized: true, details: details(source ?? fallback) }); }
      const people = [...entries].map(([personId, value]) => ({ personId, person: value.person, origin: value.origin, status: value.status, isMaterialized: value.isMaterialized, ...value.details }));
      return { slot: { id: state.slotId, scheduleSlotId: window.id, weekday: window.weekday, startTime: state.startTime, durationMinutes: 15 }, capacity: state.capacity, reserved: state.reserved, available: state.available, isOverbooked: state.isOverbooked, isClosed: state.isClosed, people };
    });
  }
  async createSpontaneousOccurrence(input: SpontaneousOccurrenceDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const day = this.date(input.date);
      await tx.$queryRaw`SELECT id FROM sala_schedule_slots WHERE id = ${input.scheduleSlotId}::uuid FOR UPDATE`;
      const [slot, person, participation, existing, fixed, oneOff] = await Promise.all([
        tx.salaScheduleSlot.findFirst({ where: { id: input.scheduleSlotId, weekday: this.weekday(day), isActive: true, startsAt: { lte: day }, OR: [{ endedAt: null }, { endedAt: { gte: day } }] }, select: { id: true, startTime: true, durationMinutes: true } }),
        tx.person.findUnique({ where: { id: input.personId }, select: { id: true } }),
        tx.salaParticipation.findFirst({ where: { personId: input.personId, startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] }, select: { id: true } }),
        tx.salaOccurrence.findUnique({ where: { personId_scheduleSlotId_date: { personId: input.personId, scheduleSlotId: input.scheduleSlotId, date: day } }, select: { id: true } }),
        tx.fixedSalaBooking.findFirst({ where: { personId: input.personId, scheduleSlotId: input.scheduleSlotId, startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] }, select: { id: true } }),
        tx.oneOffReservation.findUnique({ where: { personId_scheduleSlotId_date: { personId: input.personId, scheduleSlotId: input.scheduleSlotId, date: day } }, select: { id: true } }),
      ]);
      if (!slot) throw new NotFoundException({ code: 'SALA_OCCURRENCE_SLOT_INVALID', message: 'Schedule occurrence not found' });
      if (!person) throw new NotFoundException({ code: 'PERSON_NOT_FOUND', message: 'Person not found' });
      if (!participation) throw new BadRequestException({ code: 'SALA_PARTICIPATION_REQUIRED', message: 'An active Sala participation is required' });
      if (existing || fixed || oneOff) throw new ConflictException({ code: 'SALA_OCCURRENCE_DUPLICATE', message: 'Person already has an operational presence for this schedule' });
      const startTime = this.time(input.startTime);
      const start = this.minutes(startTime);
      if (start < this.minutes(slot.startTime) || start + SALA_DEFAULT_DURATION_MINUTES > this.minutes(slot.startTime) + slot.durationMinutes) throw new ConflictException({ code: 'SALA_REQUIRED_SLOTS_UNAVAILABLE', message: 'The spontaneous attendance does not fit completely within the opening window' });
      return tx.salaOccurrence.create({ data: { personId: input.personId, scheduleSlotId: input.scheduleSlotId, date: day, startTime, origin: SalaOccurrenceOrigin.SPONTANEOUS, status: SalaOccurrenceStatus.ATTENDED, createdBy: actorId, lastModifiedBy: actorId }, include: { person: { select: { id: true, firstName: true, lastName: true, dni: true } } } });
    });
  }
  async commandOccurrence(input: OccurrenceReferenceDto & { status: SalaOccurrenceStatus; origin?: SalaOccurrenceOrigin }, actorId: string) {
    const day = this.date(input.date);
    const isSpontaneous = input.origin === SalaOccurrenceOrigin.SPONTANEOUS;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM sala_schedule_slots WHERE id = ${input.scheduleSlotId}::uuid FOR UPDATE`;
      const [slot, person, existing, fixed, oneOff] = await Promise.all([
        tx.salaScheduleSlot.findFirst({ where: { id: input.scheduleSlotId, weekday: this.weekday(day), startsAt: { lte: day }, OR: [{ endedAt: null }, { endedAt: { gte: day } }] }, select: { id: true } }),
        tx.person.findUnique({ where: { id: input.personId }, select: { id: true } }),
        tx.salaOccurrence.findUnique({ where: { personId_scheduleSlotId_date: { personId: input.personId, scheduleSlotId: input.scheduleSlotId, date: day } } }),
        tx.fixedSalaBooking.findFirst({ where: { personId: input.personId, scheduleSlotId: input.scheduleSlotId, startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] }, select: { id: true } }),
        tx.oneOffReservation.findUnique({ where: { personId_scheduleSlotId_date: { personId: input.personId, scheduleSlotId: input.scheduleSlotId, date: day } }, select: { id: true } }),
      ]);
      if (!slot) throw new NotFoundException({ code: 'SALA_OCCURRENCE_SLOT_INVALID', message: 'Schedule occurrence not found' });
      if (!person) throw new NotFoundException({ code: 'PERSON_NOT_FOUND', message: 'Person not found' });
      if (isSpontaneous) {
        const participation = await tx.salaParticipation.findFirst({ where: { personId: input.personId, startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] }, select: { id: true } });
        if (!participation) throw new BadRequestException({ code: 'SALA_PARTICIPATION_REQUIRED', message: 'An active Sala participation is required' });
        if (existing || fixed || oneOff) throw new ConflictException({ code: 'SALA_OCCURRENCE_DUPLICATE', message: 'Person already has an operational presence for this schedule' });
      } else if (!existing && !fixed && !oneOff) {
        throw new NotFoundException({ code: 'SALA_OCCURRENCE_NOT_FOUND', message: 'Operational occurrence not found' });
      }
      const origin = isSpontaneous ? SalaOccurrenceOrigin.SPONTANEOUS : (existing?.origin ?? (oneOff ? SalaOccurrenceOrigin.ONE_OFF : SalaOccurrenceOrigin.FIXED));
      return tx.salaOccurrence.upsert({
        where: { personId_scheduleSlotId_date: { personId: input.personId, scheduleSlotId: input.scheduleSlotId, date: day } },
        create: { personId: input.personId, scheduleSlotId: input.scheduleSlotId, date: day, origin, status: input.status, fixedSalaBookingId: fixed?.id ?? null, oneOffReservationId: oneOff?.id ?? null, createdBy: actorId, lastModifiedBy: actorId },
        update: { status: input.status, lastModifiedBy: actorId },
        include: { person: { select: { id: true, firstName: true, lastName: true, dni: true } } },
      });
    });
  }
  private time(value: string): Date { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new BadRequestException({ code: 'SALA_SCHEDULE_TIME_INVALID', message: 'Time must use HH:mm' }); const [hour, minute] = value.split(':').map(Number); return new Date(Date.UTC(1970, 0, 1, hour, minute)); }
  private date(value: string): Date { return new Date(`${value}T00:00:00.000Z`); }
  private weekday(value: Date): SalaWeekday { return ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][value.getUTCDay()] as SalaWeekday; }
  private todayOperational(): string { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
  private positiveMoney(value: string, code: string): Prisma.Decimal { if (!/^\d+$/.test(value)) throw new BadRequestException({ code, message: 'Amount must be a positive whole ARS value' }); const amount = new Prisma.Decimal(value); if (!amount.greaterThan(0)) throw new BadRequestException({ code, message: 'Amount must be positive' }); return amount; }
  private signedMoney(value: string, code: string): Prisma.Decimal { if (!/^-?\d+$/.test(value)) throw new BadRequestException({ code, message: 'Amount must be a non-zero whole ARS value' }); const amount = new Prisma.Decimal(value); if (amount.isZero()) throw new BadRequestException({ code, message: 'Amount must be non-zero' }); return amount; }
  private requiredReason(value: string): string { const reason = value.trim(); if (!reason) throw new BadRequestException({ code: 'FINANCIAL_REASON_REQUIRED', message: 'Reason is required' }); return reason; }
  private monthsBetween(first: Date, last: Date): Date[] { const months: Date[] = []; const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1)); const end = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1)); while (cursor <= end) { months.push(new Date(cursor)); cursor.setUTCMonth(cursor.getUTCMonth() + 1); } return months; }
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
  private async assertPlanNameAvailable(name: string, excludingId?: string): Promise<void> { const plans = await this.prisma.salaPlan.findMany({ select: { id: true, name: true } }); if (plans.some((plan) => plan.id !== excludingId && this.normalizeName(plan.name) === this.normalizeName(name))) throw new ConflictException({ code: 'SALA_PLAN_DUPLICATE', message: 'A plan with this name already exists' }); }
  private validateServiceDuration(durationMinutes: number): void { if (durationMinutes <= 0 || durationMinutes % 15 !== 0) throw new BadRequestException({ code: 'SALA_SERVICE_DURATION_INVALID', message: 'Service duration must be a positive multiple of 15 minutes' }); }
  private validateWindow(startTime: Date, durationMinutes: number): void { if (this.minutes(startTime) % 15 !== 0 || durationMinutes <= 0 || durationMinutes % 15 !== 0) throw new BadRequestException({ code: 'SALA_SCHEDULE_GRID_INVALID', message: 'Opening windows must align to 15-minute slots' }); }
  private validateWeeklyWindows(windows: { weekday: SalaWeekday; start: Date; duration: number }[]): void {
    for (const window of windows) { this.validateWindow(window.start, window.duration); if (this.minutes(window.start) + window.duration > 24 * 60) throw new BadRequestException({ code: 'SALA_SCHEDULE_END_INVALID', message: 'Schedule must end before midnight' }); }
    for (const weekday of Object.values(SalaWeekday)) {
      const day = windows.filter((window) => window.weekday === weekday);
      for (let index = 0; index < day.length; index += 1) for (let other = index + 1; other < day.length; other += 1) if (this.overlaps(this.minutes(day[index]!.start), day[index]!.duration, this.minutes(day[other]!.start), day[other]!.duration)) throw new ConflictException({ code: 'SALA_SCHEDULE_OVERLAP', message: 'Schedule windows cannot overlap' });
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
    const day = 'date' in input ? requestedDay : this.nextWeekday(requestedDay, window.weekday);
    if ('date' in input && this.weekday(day) !== window.weekday) throw new NotFoundException({ code: 'SALA_SCHEDULE_NOT_FOUND', message: 'Opening window not found for this date' });
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
    if (start % 15 !== 0 || start < windowStart || end > windowStart + window.durationMinutes) throw new ConflictException({ code: 'SALA_REQUIRED_SLOTS_UNAVAILABLE', message: 'The service does not fit completely within the opening window' });
    if (exception?.type === SalaScheduleExceptionType.CLOSURE) throw new ConflictException({ code: 'SALA_SCHEDULE_CLOSED', message: 'Schedule is closed' });
    const validationDate = day.toISOString().slice(0, 10);
    const states = (await this.availability(validationDate, tx, excludingFixed?.id)).filter((state) => state.scheduleSlotId === window.id && this.parseMinutes(state.startTime) >= start && this.parseMinutes(state.startTime) < end);
    const requiredSlots = durationMinutes / 15;
    if (states.length !== requiredSlots) throw new ConflictException({ code: 'SALA_REQUIRED_SLOTS_UNAVAILABLE', message: 'Not all required consecutive slots exist' });
    const fullSlots = states.filter((state) => state.reserved >= state.capacity);
    if (fullSlots.length > 0 && !input.confirmOverbooking) throw new ConflictException({ code: 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED', message: `Explicit overbooking confirmation is required for ${fullSlots.length} of ${requiredSlots} slots`, details: { fullSlots: fullSlots.length, requiredSlots } });
    return { startTime: resolvedStartTime, durationMinutes };
  }
  private validateRoutine(input: ReplaceRoutineDto): void { for (const day of input.days) for (const exercise of day.exercises) if (this.optionalText(exercise.repetitions) && this.optionalText(exercise.duration)) throw new BadRequestException({ code: 'SALA_ROUTINE_REPETITIONS_DURATION_EXCLUSIVE', message: 'Repetitions and duration are alternatives' }); }
  private minutes(value: Date): number { return value.getUTCHours() * 60 + value.getUTCMinutes(); }
  private parseMinutes(value: string): number { const [hours, minutes] = value.split(':').map(Number); return (hours ?? 0) * 60 + (minutes ?? 0); }
  private formatMinutes(value: number): string { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
  private nextWeekday(value: Date, weekday: SalaWeekday): Date { const result = new Date(value); const target = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'].indexOf(weekday); result.setUTCDate(result.getUTCDate() + (target - result.getUTCDay() + 7) % 7); return result; }
  private overlaps(a: number, ad: number, b: number, bd: number): boolean { return a < b + bd && b < a + ad; }
}
