'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@athleta/ui';
import { createSalaPayment, listSalaPlans, listPaymentMethods, listSalaPayments, reverseSalaPayment } from '@athleta/api-client';
import type { SalaPaymentResponseDto } from '@athleta/api-client';
import { todayOperational } from '../sala/student-onboarding';

type Payment = SalaPaymentResponseDto;
type Method = { id: string; name: string; isSelectable: boolean };
type Plan = { id: string; name: string; monthlyAmount: string };
const formSchema = z.object({
  planId: z.string().min(1),
  amount: z.string().regex(/^\d+$/).refine(value => BigInt(value) > 0n, 'El precio debe ser mayor que cero.'),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => value <= todayOperational(), 'La fecha de cobro no puede ser futura.'),
  paymentMethodId: z.string().min(1, 'Seleccioná un medio de pago.'),
  adjustmentReason: z.string().max(300),
});
const money = (value: string | number | bigint) => `$${BigInt(value || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
const formatDate = (value: string) => value.slice(0, 10).split('-').reverse().join('/');
const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`);
const addMonth = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, Math.min(value.getUTCDate(), new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 2, 0)).getUTCDate())));
// UX preview only; the server recalculates coverage under the person's transaction lock.
function validityEnd(payments: Payment[], reference: string): string | null {
  let end: string | null = null;
  for (const payment of payments.filter(item => !item.reversal).sort((a, b) => a.coverageStartDate.localeCompare(b.coverageStartDate))) {
    const start = payment.coverageStartDate.slice(0, 10);
    const finish = payment.coverageEndDate.slice(0, 10);
    if (!end) { if (start <= reference && finish >= reference) end = finish; }
    else if (dateOnly(start).getTime() <= dateOnly(end).getTime() + 86_400_000) { if (finish > end) end = finish; }
    else break;
  }
  return end;
}
const assertSuccess = (response: { status: number; data?: unknown }) => {
  if (response.status < 200 || response.status >= 300) throw new Error((response.data as { message?: string })?.message || 'No pudimos guardar el pago.');
};
export function SalaPaymentPanel({ personId, csrfToken, canRegister, canAdjust, canReverse, activePlan, defaultOpen = false }: { personId: string; csrfToken: string; canRegister: boolean; canAdjust: boolean; canReverse: boolean; activePlan?: Plan | undefined; defaultOpen?: boolean }): React.JSX.Element {
  const [registerOpen, setRegisterOpen] = useState(defaultOpen);
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof formSchema>>({ resolver: zodResolver(formSchema), defaultValues: { planId: activePlan?.id ?? '', amount: activePlan?.monthlyAmount ?? '', paidAt: todayOperational(), paymentMethodId: '', adjustmentReason: '' } });
  const pendingRequest = useRef<Parameters<typeof createSalaPayment>[0] | null>(null);
  useEffect(() => { const subscription = form.watch(() => { pendingRequest.current = null; }); return () => subscription.unsubscribe(); }, [form]);
  const [reversalReason, setReversalReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [paymentToReverse, setPaymentToReverse] = useState<Payment | null>(null);
  const payments = useQuery({ queryKey: ['sala', 'payments', personId], queryFn: async () => { const response = await listSalaPayments(personId, { credentials: 'include' }); assertSuccess(response); return response.data.data; } });
  const methods = useQuery({ queryKey: ['finance', 'payment-methods'], queryFn: async () => { const response = await listPaymentMethods({ credentials: 'include' }); assertSuccess(response); return (response.data as unknown as { data: Method[] }).data; } });
  const plans = useQuery({ queryKey: ['sala-plans'], enabled: canAdjust, queryFn: async () => { const response = await listSalaPlans({ credentials: 'include' }); assertSuccess(response); return response.data.data as unknown as Plan[]; } });
  const values = form.watch();
  const plan = canAdjust ? plans.data?.find(item => item.id === values.planId) : activePlan;
  const needsReason = Boolean(canAdjust && plan && /^\d+$/.test(values.amount) && BigInt(values.amount) !== BigInt(plan.monthlyAmount));
  const selectableMethods = (methods.data ?? []).filter(item => item.isSelectable);
  const currentEnd = validityEnd(payments.data ?? [], todayOperational());
  const renewalEnd = validityEnd(payments.data ?? [], values.paidAt);
  const base = dateOnly(renewalEnd ?? values.paidAt);
  const previewStart = renewalEnd ? new Date(base.getTime() + 86_400_000) : base;
  const previewEnd = addMonth(base);
  const preview = !Number.isNaN(previewEnd.getTime()) ? `${formatDate(previewStart.toISOString())} → ${formatDate(previewEnd.toISOString())}` : 'Elegí una fecha válida.';
  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['sala'] }),
    queryClient.invalidateQueries({ queryKey: ['finance'] }),
    queryClient.invalidateQueries({ queryKey: ['portal', 'sala'] }),
  ]);
  const create = useMutation({
    mutationFn: async () => {
      const { adjustmentReason, ...input } = form.getValues();
      pendingRequest.current ??= { ...input, ...(!canAdjust && activePlan ? { planId: activePlan.id, amount: activePlan.monthlyAmount } : {}), personId, operationId: crypto.randomUUID(), ...(canAdjust && adjustmentReason.trim() ? { adjustmentReason: adjustmentReason.trim() } : {}) };
      assertSuccess(await createSalaPayment(pendingRequest.current, { credentials: 'include', headers: { 'x-csrf-token': csrfToken } }));
    },
    onSuccess: async () => { pendingRequest.current = null; setConfirmation('Pago registrado correctamente.'); setRegisterOpen(false); form.setValue('paymentMethodId', ''); await invalidate(); },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { assertSuccess(await reverseSalaPayment(id, { reason: reversalReason, operationId: crypto.randomUUID() }, { credentials: 'include', headers: { 'x-csrf-token': csrfToken } })); },
    onSuccess: async () => { setPaymentToReverse(null); setReversalReason(''); await invalidate(); },
  });
  const error = create.error ?? remove.error;
  const inputClass = 'mt-1 h-10 w-full rounded border px-2';
  return <section className="space-y-5">
    <p className="text-sm">Vigencia actual: {currentEnd ? `Hasta ${formatDate(currentEnd)}` : 'Sin vigencia'}</p>
    {canRegister && !activePlan ? <p>Se necesita una participación activa de Sala para registrar pagos.</p> : null}
    {canRegister && activePlan ? <Button type="button" variant="secondary" aria-expanded={registerOpen} aria-controls="register-payment-form" onClick={() => setRegisterOpen(value => !value)}>+ Registrar renovación</Button> : null}
    {canRegister && activePlan && registerOpen ? <form id="register-payment-form" className="rounded border border-border bg-surface p-5 sm:p-6" onSubmit={form.handleSubmit(() => { if (plan && (!needsReason || values.adjustmentReason.trim()) && payments.isSuccess && selectableMethods.some(item => item.id === values.paymentMethodId)) create.mutate(); })}>
      <h2 className="mb-5 text-xl font-semibold">Registrar renovación</h2>
      <fieldset disabled={create.isPending} className="grid gap-5 sm:grid-cols-2">
        {canAdjust ? <>
        <label className="text-sm">Plan<select className={inputClass} {...form.register('planId')} onChange={event => { const selected = plans.data?.find(item => item.id === event.target.value); form.setValue('planId', event.target.value); form.setValue('amount', selected?.monthlyAmount ?? ''); form.setValue('adjustmentReason', ''); }}><option value="" disabled>Seleccionar Plan</option>{plans.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-sm">Precio<input className={inputClass} inputMode="numeric" {...form.register('amount')} /></label>
        </> : <><div className="text-sm">Plan<p className="mt-1 font-medium">{activePlan?.name}</p></div><div className="text-sm">Precio<p className="mt-1 font-medium">{money(activePlan?.monthlyAmount ?? '0')}</p></div></>}
        <label className="text-sm sm:col-span-2">Fecha de cobro<input type="date" max={todayOperational()} className={inputClass} {...form.register('paidAt')} /></label>
        <fieldset className="sm:col-span-2"><legend className="mb-2 text-sm">Medio de pago</legend><div className="flex flex-wrap gap-2">{selectableMethods.map(item => <Button key={item.id} type="button" variant="secondary" aria-pressed={values.paymentMethodId === item.id} onClick={() => form.setValue('paymentMethodId', item.id, { shouldValidate: true })}>{item.name}</Button>)}</div>{methods.isSuccess && !selectableMethods.length ? <p>No hay medios de pago configurados.</p> : null}</fieldset>
        {needsReason ? <label className="text-sm sm:col-span-2">Motivo de ajuste *<input className={inputClass} required {...form.register('adjustmentReason')} /></label> : null}
      </fieldset>
      <div className="my-5 rounded bg-surface-muted p-4"><p>Vigencia actual: {currentEnd ? `Hasta ${formatDate(currentEnd)}` : 'Sin vigencia'}</p><p className="mt-2 font-medium">Con este pago: {preview}</p><p className="mt-2 text-sm">Total a cobrar: {/^\d+$/.test(values.amount) ? money(values.amount) : '—'}</p></div>
      <Button type="submit" disabled={create.isPending || !payments.isSuccess || !plan || !selectableMethods.some(item => item.id === values.paymentMethodId) || (needsReason && !values.adjustmentReason.trim())}>{create.isPending ? 'Registrando…' : 'Registrar pago'}</Button>
      {Object.entries(form.formState.errors).map(([field, error]) => <p role="alert" key={field}>{error.message}</p>)}
    </form> : null}
    {!canRegister ? <p className="text-sm text-muted-foreground">Tu rol permite consultar los pagos, sin registrar ni revertir movimientos.</p> : null}
    {confirmation ? <p role="status">{confirmation}</p> : null}
    {error || payments.isError || methods.isError || plans.isError ? <p role="alert">{error?.message || 'No pudimos cargar los pagos o los medios de pago.'}</p> : null}
    {canReverse && paymentToReverse ? <div role="alertdialog" aria-modal="true" aria-labelledby="reverse-payment-title" className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm"><p id="reverse-payment-title">¿Revertir el pago de {formatDate(paymentToReverse.paidAt)} por {money(paymentToReverse.amount)}?</p><label className="mt-3 block">Motivo de reversión<input aria-label="Motivo de reversión" maxLength={500} value={reversalReason} onChange={event => setReversalReason(event.target.value)} className={inputClass} disabled={remove.isPending}/></label><div className="mt-3 flex gap-2"><Button type="button" variant="secondary" onClick={() => setPaymentToReverse(null)}>Cancelar</Button><Button type="button" disabled={remove.isPending || !reversalReason.trim()} onClick={() => remove.mutate(paymentToReverse.id)}>{remove.isPending ? 'Revirtiendo…' : 'Revertir pago'}</Button></div></div> : null}
    <section aria-labelledby="payment-history-title" className="rounded border border-border bg-surface p-5">
      <h2 id="payment-history-title" className="mb-4 text-xl font-semibold">Historial de pagos</h2>
      {payments.isPending ? <p role="status">Cargando pagos…</p> : null}
      {payments.isSuccess && !payments.data.length ? <p className="text-sm text-muted-foreground">No hay pagos registrados todavía.</p> : null}
      <div className="overflow-x-auto"><table className="block w-full text-left text-sm md:table">
        <thead className="hidden bg-surface-muted md:table-header-group"><tr>{['Fecha de cobro', 'Plan', 'Vigencia', 'Medio de pago', 'Importe', 'Estado', ...(canReverse ? ['Acciones'] : [])].map(label => <th key={label} scope="col" className="p-3 font-medium">{label}</th>)}</tr></thead>
        <tbody className="block md:table-row-group">{(payments.data ?? []).map(payment => <tr key={payment.id} className="grid gap-2 border-b border-border py-3 md:table-row md:py-0">
          <td className="md:p-3"><time dateTime={payment.paidAt}>{formatDate(payment.paidAt)}</time>{payment.adjustmentReason ? <p>Motivo de ajuste: {payment.adjustmentReason}</p> : null}{payment.reversal?.reason ? <p>Motivo de reversión: {payment.reversal.reason}</p> : null}</td>
          <td className="md:p-3">{payment.planName ?? 'Plan no registrado'}</td>
          <td className="md:p-3">{formatDate(payment.coverageStartDate)} → {formatDate(payment.coverageEndDate)}</td>
          <td className="md:p-3">{payment.paymentMethod?.name ?? 'Medio retirado'}</td>
          <td className="font-semibold md:p-3">{money(payment.amount)}</td>
          <td className="md:p-3">{payment.reversal ? 'Revertido' : 'Pagado'}</td>
          {canReverse ? <td className="md:p-3">{!payment.reversal ? <Button type="button" variant="secondary" onClick={() => { setReversalReason(''); setPaymentToReverse(payment); }}>Revertir</Button> : null}</td> : null}
        </tr>)}</tbody>
      </table></div>
    </section>
  </section>;
}
