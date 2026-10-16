'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@athleta/ui';
import { registerSalaPlanPayments, listSalaPlans, listPaymentMethods, listSalaPayments, reverseSalaPayment } from '@athleta/api-client';
import { todayOperational } from '../sala/student-onboarding';

type Payment = { id: string; year: number; month: number; paidAt: string; amount: string; paymentMethod?: { name: string }; adjustmentReason?: string | null; reversal?: { id: string; reason?: string } | null };
type Method = { id: string; name: string; isSelectable: boolean };
type Plan = { id: string; name: string; monthlyAmount: string };
type Period = { year: number; month: number };
type ApiResponse = { status: number; data?: unknown };
const formSchema = z.object({ paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => value <= todayOperational(), 'La fecha de cobro no puede ser futura.'), month: z.string(), paymentMethodId: z.string().min(1, 'Seleccioná un medio de pago.') });
const money = (value: string | number | bigint) => `$${BigInt(value || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
const periodLabel = ({ year, month }: Period) => {
  const label = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1).replace(' de ', ' ');
};
const unwrap = <T,>(value: unknown): T[] => {
  const body = (value as { data?: unknown }).data;
  if (Array.isArray(body)) return body as T[];
  const nested = (body as { data?: unknown } | undefined)?.data;
  return Array.isArray(nested) ? nested as T[] : [];
};
const assertSuccess = (response: ApiResponse): void => {
  if (response.status < 200 || response.status >= 300) {
    const message = (response.data as { message?: string } | undefined)?.message;
    throw new Error(message || 'No pudimos guardar el pago.');
  }
};

export function SalaPaymentPanel({ personId, csrfToken, canManage, activePlan, defaultOpen = false }: { personId: string; csrfToken: string; canManage: boolean; activePlan?: Plan | undefined; defaultOpen?: boolean }): React.JSX.Element {
  const [registerOpen, setRegisterOpen] = useState(defaultOpen);
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof formSchema>>({ resolver: zodResolver(formSchema), defaultValues: { paidAt: todayOperational(), month: todayOperational().slice(0, 7), paymentMethodId: '' } });
  const [selectedPeriods, setSelectedPeriods] = useState<Array<Period & { planId: string; amount: string; adjustmentReason: string }>>([]);
  const [showAdditionalPeriod, setShowAdditionalPeriod] = useState(false);
  const [reversalReason, setReversalReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [confirmation, setConfirmation] = useState('');
  // Keep operation IDs for retries of an unchanged submission.
  const pendingRequest = useRef<Parameters<typeof registerSalaPlanPayments>[0] | null>(null);
  const [paymentToReverse, setPaymentToReverse] = useState<Payment | null>(null);
  const payments = useQuery({ queryKey: ['sala', 'payments', personId], queryFn: async () => { const response = await listSalaPayments(personId, { credentials: 'include' }); assertSuccess(response); return response.data.data; } });
  const methods = useQuery({ queryKey: ['finance', 'payment-methods'], queryFn: async () => unwrap<Method>(await listPaymentMethods({ credentials: 'include' })) });
  const plans = useQuery({ queryKey: ['sala-plans'], enabled: canManage && Boolean(activePlan), queryFn: async () => { const response = await listSalaPlans({ credentials: 'include' }); assertSuccess(response); return response.data.data as unknown as Plan[]; } });
  const referencePlan = (period: { planId: string }) => plans.data?.find(plan => plan.id === period.planId) ?? (!plans.isSuccess && activePlan?.id === period.planId ? activePlan : undefined);
  // Initialize only from refreshed history; ordinary refetches preserve manual choices.
  const initialized = useRef(false);
  const [proposalVersion, setProposalVersion] = useState(0);
  const [year, month] = todayOperational().slice(0, 7).split('-').map(Number);
  const currentMonthPaid = payments.data?.some(item => item.year === year && item.month === month && item.reversal == null);
  useEffect(() => {
    if (initialized.current || !canManage || !activePlan || !payments.isSuccess || payments.isFetching) return;
    initialized.current = true;
    let cursor = year! * 12 + month! - 1;
    const paidPeriods = new Set(payments.data.map(item => item.reversal == null ? item.year * 12 + item.month - 1 : -1));
    while (paidPeriods.has(cursor)) cursor++;
    setSelectedPeriods([{ year: Math.floor(cursor / 12), month: cursor % 12 + 1, planId: activePlan.id, amount: activePlan.monthlyAmount, adjustmentReason: '' }]);
  }, [activePlan, payments.isSuccess, payments.isFetching, payments.data, canManage, currentMonthPaid, year, month, proposalVersion]);
  const selectableMethods = (methods.data ?? []).filter((item) => item.isSelectable);
  const method = form.watch('paymentMethodId');
  const paidAt = form.watch('paidAt');
  const validPeriods = plans.isSuccess && selectedPeriods.every(period => Boolean(referencePlan(period)) && !payments.data?.some(item => item.year === period.year && item.month === period.month && item.reversal == null) && /^\d+$/.test(period.amount) && BigInt(period.amount) > 0n && (BigInt(period.amount) === BigInt(referencePlan(period)?.monthlyAmount ?? '0') || Boolean(period.adjustmentReason.trim())));
  const totalAmount = selectedPeriods.reduce((total, period) => total + (/^\d+$/.test(period.amount) ? BigInt(period.amount) : 0n), 0n);
  const updatePeriod = (index: number, values: { planId?: string; amount?: string; adjustmentReason?: string }) => {
    setSelectedPeriods(current => current.map((period, position) => position === index ? { ...period, ...values } : period));
    pendingRequest.current = null;
  };
  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['sala', 'payments', personId] }),
    queryClient.invalidateQueries({ queryKey: ['sala', 'students'] }),
    queryClient.invalidateQueries({ queryKey: ['finance', 'income'] }),
    queryClient.invalidateQueries({ queryKey: ['finance', 'totals'] }),
    queryClient.invalidateQueries({ queryKey: ['finance', 'executive-totals'] }),
  ]);
  const create = useMutation({
    mutationFn: async () => {
      pendingRequest.current ??= { personId, paidAt, paymentMethodId: method, periods: selectedPeriods.map((period) => ({ ...period, operationId: crypto.randomUUID() })) };
      assertSuccess(await registerSalaPlanPayments(pendingRequest.current, { credentials: 'include', headers: { 'x-csrf-token': csrfToken } }));
    },
    onSuccess: async () => {
      setConfirmation(selectedPeriods.length > 1 ? 'Pagos registrados correctamente.' : 'Pago registrado correctamente.');
      setSelectedPeriods([]); form.setValue('paymentMethodId', ''); pendingRequest.current = null; setFeedback('');
      await invalidate();
      initialized.current = false;
      setProposalVersion(value => value + 1);
      setShowAdditionalPeriod(false);
      setRegisterOpen(false);
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertSuccess(await reverseSalaPayment(id, { reason: reversalReason, operationId: crypto.randomUUID() }, { credentials: 'include', headers: { 'x-csrf-token': csrfToken } }));
    },
    onSuccess: async () => { setPaymentToReverse(null); setReversalReason(''); await invalidate(); },
  });
  const choosePeriod = (value: string, replaceIndex?: number) => {
    if (!/^\d{4}-\d{2}$/.test(value)) { setFeedback('Seleccioná un Mes/Año válido.'); return; }
    const [year, month] = value.split('-').map(Number);
    const period = { year: year!, month: month!, planId: activePlan?.id ?? '', amount: activePlan?.monthlyAmount ?? '0', adjustmentReason: '' };
    if (period.month < 1 || period.month > 12) { setFeedback('Seleccioná un Mes/Año válido.'); return; }
    if (selectedPeriods.some((item, index) => (index !== replaceIndex) && item.year === period.year && item.month === period.month)) { setFeedback('Ese mes ya está seleccionado.'); return; }
    if (payments.data?.some((item) => item.year === period.year && item.month === period.month && item.reversal == null)) { setFeedback('Ese mes ya tiene un pago registrado.'); return; }
    setSelectedPeriods((current) => replaceIndex !== undefined ? current.map((item, index) => index === replaceIndex ? period : item) : [...current, period]); pendingRequest.current = null; setFeedback(''); setConfirmation('');
  };
  const error = create.error ?? remove.error;
  const inputClass = 'mt-1 h-10 w-full rounded border px-2';
  const primaryPeriod = selectedPeriods[0];
  const monthValue = (period: Period) => `${period.year}-${String(period.month).padStart(2, '0')}`;
  const renderAdjustment = (period: typeof selectedPeriods[number], index: number) => (!/^\d+$/.test(period.amount) || BigInt(period.amount) !== BigInt(referencePlan(period)?.monthlyAmount ?? '0')) ? <label className="text-sm">Motivo de ajuste *<input aria-label={`Motivo de ajuste ${periodLabel(period)}`} maxLength={300} required value={period.adjustmentReason} onChange={event => updatePeriod(index, { adjustmentReason: event.target.value })} disabled={create.isPending} className={inputClass}/></label> : null;
  const renderPeriod = (period: typeof selectedPeriods[number], index: number) => <div key={`${period.year}-${period.month}`} className="grid items-end gap-3 border-b border-border pb-4 sm:grid-cols-2">
    {index === 0 ? <label className="text-sm">Mes a pagar<input type="month" aria-label="Mes a pagar" value={monthValue(period)} onChange={event => choosePeriod(event.target.value, 0)} required disabled={create.isPending} className={inputClass}/></label> : <label className="text-sm">{periodLabel(period)}<input type="month" aria-label={`Mes a pagar ${periodLabel(period)}`} value={monthValue(period)} onChange={event => choosePeriod(event.target.value, index)} required disabled={create.isPending} className={inputClass}/></label>}
    <label className="text-sm">Plan<select aria-label={`Plan ${periodLabel(period)}`} className={inputClass} value={period.planId} disabled={create.isPending || !plans.isSuccess} onChange={event => { const plan = plans.data?.find(item => item.id === event.target.value); if (plan) updatePeriod(index, { planId: plan.id, amount: plan.monthlyAmount, adjustmentReason: '' }); }}>
      {!plans.data?.some(plan => plan.id === activePlan?.id) ? <option value={activePlan?.id} disabled>Seleccionar Plan</option> : null}
      {plans.data?.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
    </select></label>
    <label className="text-sm">Precio<input aria-label={`Precio ${periodLabel(period)}`} inputMode="numeric" pattern="[0-9]+" required value={period.amount} onChange={event => updatePeriod(index, { amount: event.target.value })} disabled={create.isPending} className={inputClass}/></label>
    {index > 0 ? renderAdjustment(period, index) : null}
    <div className="sm:col-span-2"><Button type="button" variant="secondary" aria-label={`Quitar ${periodLabel(period)}`} disabled={create.isPending} onClick={() => { setSelectedPeriods(current => current.filter(item => item !== period)); pendingRequest.current = null; }}>Quitar</Button></div>
  </div>;
  return <section className="space-y-5">
    {canManage && !activePlan ? <p className="text-sm text-muted-foreground">Se necesita una participación activa de Sala para registrar pagos.</p> : null}
    {canManage && activePlan ? <Button type="button" variant="secondary" aria-expanded={registerOpen} aria-controls="register-payment-form" onClick={() => setRegisterOpen(value => !value)}>+ Registrar una cuota</Button> : null}
    {canManage && activePlan && registerOpen ? <form id="register-payment-form" className="overflow-hidden rounded border border-border bg-surface" onSubmit={form.handleSubmit(() => { if (validPeriods && paidAt <= todayOperational() && payments.isSuccess && selectedPeriods.length && selectableMethods.some((item) => item.id === method) && !create.isPending) create.mutate(); })}>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-5 p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Registrar una cuota</h2>
          {currentMonthPaid ? <p className="text-sm text-muted-foreground">{periodLabel({ year: year!, month: month! }).replace(' ', ' de ')} ya está pagado y no se puede volver a cobrar.</p> : null}
          {primaryPeriod ? renderPeriod(primaryPeriod, 0) : <p className="text-sm text-muted-foreground">Elegí un período para registrar.</p>}
          <label className="block text-sm">Fecha de cobro<input type="date" max={todayOperational()} aria-label="Fecha de cobro" {...form.register('paidAt', { onChange: () => { pendingRequest.current = null; } })} className={inputClass} disabled={create.isPending} required /></label>
          <fieldset disabled={create.isPending} className="space-y-2"><legend className="mb-2 text-sm font-medium">Medio de pago</legend>
            <div className="flex flex-wrap gap-2">{selectableMethods.map(item => <Button key={item.id} type="button" variant="secondary" aria-pressed={method === item.id} className={method === item.id ? 'border-primary bg-surface-muted ring-1 ring-primary' : ''} onClick={() => { form.setValue('paymentMethodId', item.id, { shouldValidate: true }); pendingRequest.current = null; }}>{item.name}</Button>)}</div>
            {methods.isSuccess && !selectableMethods.length ? <p className="text-sm text-muted-foreground">No hay medios de pago configurados.</p> : null}
          </fieldset>
          {primaryPeriod ? renderAdjustment(primaryPeriod, 0) : null}
          <Button type="button" variant="secondary" disabled={create.isPending} onClick={() => setShowAdditionalPeriod(value => !value)}>+ Agregar otro mes</Button>
          {showAdditionalPeriod ? <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">Mes/Año<input type="month" aria-label="Mes/Año" {...form.register('month')} className={inputClass} disabled={create.isPending} /></label>
            <Button type="button" variant="secondary" onClick={() => choosePeriod(form.getValues('month'))} disabled={create.isPending || !payments.isSuccess}>Agregar mes</Button>
          </div> : null}
          {selectedPeriods.slice(1).map((period, index) => renderPeriod(period, index + 1))}
        </div>
        <aside aria-label="Resumen del cobro" className="flex flex-col gap-5 bg-sidebar p-5 text-sidebar-foreground sm:p-6">
          <span className="text-xs font-semibold tracking-wide">SIN REGISTRAR</span>
          <div><p className="text-lg font-semibold">{selectedPeriods.length > 1 ? `${selectedPeriods.length} períodos` : primaryPeriod ? periodLabel(primaryPeriod).replace(' ', ' de ') : 'Sin período seleccionado'}</p><p className="mt-1 text-sm">Cuota mensual · {primaryPeriod ? referencePlan(primaryPeriod)?.name : activePlan.name}</p></div>
          <div className="mt-auto"><p className="text-sm">Total a cobrar</p><p className="mt-1 text-3xl font-semibold">{money(totalAmount)}</p></div>
          <Button type="submit" disabled={create.isPending || !payments.isSuccess || !validPeriods || !paidAt || paidAt > todayOperational() || !selectedPeriods.length || !selectableMethods.some((item) => item.id === method)}>{create.isPending ? 'Registrando…' : selectedPeriods.length > 1 ? 'Registrar pagos' : primaryPeriod ? `Registrar pago de ${new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(primaryPeriod.year, primaryPeriod.month - 1, 1)))}` : 'Registrar pago'}</Button>
        </aside>
      </div>
      {Object.entries(form.formState.errors).map(([field, error]) => <p role="alert" className="px-5 pb-3 text-sm text-red-700" key={field}>{error.message}</p>)}
    </form> : null}
    {!canManage ? <p className="text-sm text-muted-foreground">Tu rol permite consultar los pagos, sin registrar ni revertir movimientos.</p> : null}
    {feedback ? <p role="alert" className="mt-2 text-sm">{feedback}</p> : null}
    {confirmation ? <p role="status" className="mt-2 text-sm text-emerald-700">{confirmation}</p> : null}
    {error || payments.isError || methods.isError || plans.isError ? <p role="alert" className="mt-2 text-sm text-red-700">{error?.message || 'No pudimos cargar los pagos o los medios de pago.'}</p> : null}
    {paymentToReverse ? <div role="alertdialog" aria-modal="true" aria-labelledby="reverse-payment-title" className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm"><p id="reverse-payment-title">¿Revertir el pago de {periodLabel(paymentToReverse)} por {money(paymentToReverse.amount)}?</p><label className="mt-3 block">Motivo de reversión<input aria-label="Motivo de reversión" maxLength={500} value={reversalReason} onChange={event => setReversalReason(event.target.value)} className={inputClass} disabled={remove.isPending}/></label><div className="mt-3 flex gap-2"><Button type="button" variant="secondary" onClick={() => setPaymentToReverse(null)}>Cancelar</Button><Button type="button" disabled={remove.isPending || !reversalReason.trim()} onClick={() => remove.mutate(paymentToReverse.id)}>{remove.isPending ? 'Revirtiendo…' : 'Revertir pago'}</Button></div></div> : null}
    <section aria-labelledby="payment-history-title" className="rounded border border-border bg-surface p-5">
      <h2 id="payment-history-title" className="mb-4 text-xl font-semibold">Historial de pagos</h2>
      {payments.isPending ? <p role="status">Cargando pagos…</p> : null}
      {payments.isSuccess && !payments.data.length ? <p className="text-sm text-muted-foreground">No hay pagos registrados todavía.</p> : null}
      <table className="block w-full text-left text-sm md:table">
        <thead className="hidden bg-surface-muted md:table-header-group"><tr>{['Período', 'Fecha de cobro', 'Medio de pago', 'Importe', 'Estado', 'Acciones'].map(label => <th key={label} scope="col" className="p-3 font-medium">{label}</th>)}</tr></thead>
        <tbody className="block md:table-row-group">{(payments.data ?? []).map(payment => <tr key={payment.id} className="grid gap-2 border-b border-border py-3 md:table-row md:py-0">
          <td className="md:p-3"><span className="font-medium">{periodLabel(payment)}</span>{payment.adjustmentReason ? <p className="mt-1 text-xs text-muted-foreground">Motivo de ajuste: {payment.adjustmentReason}</p> : null}{payment.reversal?.reason ? <p className="mt-1 text-xs text-muted-foreground">Motivo de reversión: {payment.reversal.reason}</p> : null}</td>
          <td className="md:p-3"><span className="text-muted-foreground md:hidden">Fecha de cobro: </span><time dateTime={payment.paidAt.slice(0, 10)}>{payment.paidAt.slice(0, 10).split('-').reverse().join('/')}</time></td>
          <td className="md:p-3">{payment.paymentMethod?.name ?? 'Medio retirado'}</td>
          <td className="font-semibold md:p-3">{money(payment.amount)}</td>
          <td className="md:p-3">{payment.reversal ? 'Revertido' : 'Pagado'}</td>
          <td className="md:p-3">{canManage && !payment.reversal ? <Button type="button" variant="secondary" onClick={() => { setReversalReason(''); setPaymentToReverse(payment); }}>Revertir</Button> : null}</td>
        </tr>)}</tbody>
      </table>
    </section>
  </section>;
}
