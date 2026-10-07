'use client';

import React, { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@athleta/ui';
import { registerSalaPlanPayments, listPaymentMethods, listSalaPayments, reverseSalaPayment } from '@athleta/api-client';
import { todayOperational } from './student-onboarding';

type Payment = { id: string; year: number; month: number; paidAt: string; amount: string; paymentMethod?: { name: string }; reversal?: { id: string } | null };
type Method = { id: string; name: string; isSelectable: boolean };
type Plan = { id: string; name: string; monthlyAmount: string };
type Period = { year: number; month: number };
type ApiResponse = { status: number; data?: unknown };
const formSchema = z.object({ month: z.string(), paymentMethodId: z.string().min(1, 'Seleccioná un medio de pago.') });
const money = (value: string | number) => `$${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
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

export function PaymentPanel({ personId, csrfToken, canManage, activePlan }: { personId: string; csrfToken: string; canManage: boolean; activePlan?: Plan | undefined }): React.JSX.Element {
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof formSchema>>({ resolver: zodResolver(formSchema), defaultValues: { month: todayOperational().slice(0, 7), paymentMethodId: '' } });
  const [selectedPeriods, setSelectedPeriods] = useState<Period[]>([]);
  const [feedback, setFeedback] = useState('');
  const [confirmation, setConfirmation] = useState('');
  // Keep operation IDs for retries of an unchanged submission.
  const pendingRequest = useRef<Parameters<typeof registerSalaPlanPayments>[0] | null>(null);
  const [paymentToReverse, setPaymentToReverse] = useState<Payment | null>(null);
  const payments = useQuery({ queryKey: ['sala', 'payments', personId], queryFn: async () => unwrap<Payment>(await listSalaPayments(personId, { credentials: 'include' })) });
  const methods = useQuery({ queryKey: ['finance', 'payment-methods'], queryFn: async () => unwrap<Method>(await listPaymentMethods({ credentials: 'include' })) });
  const selectableMethods = (methods.data ?? []).filter((item) => item.isSelectable);
  const method = form.watch('paymentMethodId');
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['sala', 'payments', personId] });
  const create = useMutation({
    mutationFn: async () => {
      pendingRequest.current ??= { personId, paidAt: todayOperational(), paymentMethodId: method, periods: selectedPeriods.map((period) => ({ ...period, operationId: crypto.randomUUID() })) };
      assertSuccess(await registerSalaPlanPayments(pendingRequest.current, { credentials: 'include', headers: { 'x-csrf-token': csrfToken } }));
    },
    onSuccess: async () => {
      setConfirmation(selectedPeriods.length > 1 ? 'Pagos registrados correctamente.' : 'Pago registrado correctamente.');
      setSelectedPeriods([]); form.setValue('paymentMethodId', ''); pendingRequest.current = null; setFeedback('');
      await invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertSuccess(await reverseSalaPayment(id, { reason: 'Corrección de pago', operationId: crypto.randomUUID() }, { credentials: 'include', headers: { 'x-csrf-token': csrfToken } }));
    },
    onSuccess: async () => { setPaymentToReverse(null); await invalidate(); },
  });
  const addPeriod = () => {
    const value = form.getValues('month');
    if (!/^\d{4}-\d{2}$/.test(value)) { setFeedback('Seleccioná un Mes/Año válido.'); return; }
    const [year, month] = value.split('-').map(Number);
    const period = { year: year!, month: month! };
    if (selectedPeriods.some((item) => item.year === period.year && item.month === period.month)) { setFeedback('Ese mes ya está seleccionado.'); return; }
    if (payments.data?.some((item) => item.year === period.year && item.month === period.month && item.reversal == null)) { setFeedback('Ese mes ya tiene un pago registrado.'); return; }
    setSelectedPeriods((current) => [...current, period]); pendingRequest.current = null; setFeedback(''); setConfirmation('');
  };
  const error = create.error ?? remove.error;
  const inputClass = 'mt-1 h-10 w-full rounded border px-2';
  return <section className="mt-5 rounded-md border bg-white p-5">
    <h2 className="mb-1 text-lg font-semibold">Pagos de Sala</h2>
    <p className="mb-3 text-sm text-muted-foreground">{payments.data?.length ? 'Pagos registrados para esta Persona.' : 'No hay pagos registrados todavía.'}</p>
    {activePlan ? <div className="mb-3 text-sm"><p>Plan actual: <strong>{activePlan.name}</strong></p><p>Valor mensual: <strong>{money(activePlan.monthlyAmount)}</strong></p></div> : null}
    {canManage && !activePlan ? <p className="text-sm text-muted-foreground">Se necesita una participación activa de Sala para registrar pagos.</p> : null}
    {canManage && activePlan ? <form className="space-y-3" onSubmit={form.handleSubmit(() => { if (selectedPeriods.length && selectableMethods.some((item) => item.id === method) && !create.isPending) create.mutate(); })}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">Mes/Año<input type="month" aria-label="Mes/Año" {...form.register('month')} className={inputClass} disabled={create.isPending} /></label>
        <Button type="button" variant="secondary" onClick={addPeriod} disabled={create.isPending || !payments.isSuccess}>Agregar mes</Button>
      </div>
      {selectedPeriods.length ? <div className="rounded border p-3 text-sm"><p className="font-medium">Meses a abonar</p><ul>{selectedPeriods.map((period) => <li key={`${period.year}-${period.month}`} className="flex items-center gap-3 py-1"><span>{periodLabel(period)}</span><Button type="button" variant="secondary" aria-label={`Quitar ${periodLabel(period)}`} disabled={create.isPending} onClick={() => { setSelectedPeriods((current) => current.filter((item) => item !== period)); pendingRequest.current = null; }}>Quitar</Button></li>)}</ul><p className="mt-2 font-semibold">Total: {selectedPeriods.length} × {money(activePlan.monthlyAmount)} = {money(Number(activePlan.monthlyAmount) * selectedPeriods.length)}</p></div> : null}
      <div className="flex flex-wrap items-end gap-2"><label className="text-sm">Medio de pago<select aria-label="Medio de pago" {...form.register('paymentMethodId', { onChange: () => { pendingRequest.current = null; } })} className={inputClass} disabled={create.isPending}><option value="">Seleccionar</option>{selectableMethods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <Button type="submit" disabled={create.isPending || !selectedPeriods.length || !selectableMethods.some((item) => item.id === method)}>{create.isPending ? 'Registrando…' : 'Registrar pago'}</Button></div>
      {methods.isSuccess && !selectableMethods.length ? <p className="text-sm text-muted-foreground">No hay medios de pago configurados.</p> : null}
    </form> : null}
    {!canManage ? <p className="text-sm text-muted-foreground">Tu rol permite consultar los pagos, sin registrar ni revertir movimientos.</p> : null}
    {feedback ? <p role="alert" className="mt-2 text-sm">{feedback}</p> : null}
    {confirmation ? <p role="status" className="mt-2 text-sm text-emerald-700">{confirmation}</p> : null}
    {error || payments.isError || methods.isError ? <p role="alert" className="mt-2 text-sm text-red-700">{error?.message || 'No pudimos cargar los pagos o los medios de pago.'}</p> : null}
    {paymentToReverse ? <div role="alertdialog" aria-modal="true" aria-labelledby="reverse-payment-title" className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm"><p id="reverse-payment-title">¿Revertir el pago de {periodLabel(paymentToReverse)} por {money(paymentToReverse.amount)}?</p><div className="mt-3 flex gap-2"><Button type="button" variant="secondary" onClick={() => setPaymentToReverse(null)}>Cancelar</Button><Button type="button" disabled={remove.isPending} onClick={() => remove.mutate(paymentToReverse.id)}>{remove.isPending ? 'Revirtiendo…' : 'Revertir pago'}</Button></div></div> : null}
    <div className="mt-4 space-y-2">{(payments.data ?? []).map((payment) => <div key={payment.id} className="flex items-center justify-between gap-3 border-b py-2 text-sm"><span>{periodLabel(payment)} · {money(payment.amount)} · {payment.paymentMethod?.name ?? 'Medio retirado'}{payment.reversal ? ' · Revertido' : ''}</span>{canManage && !payment.reversal ? <Button type="button" variant="secondary" onClick={() => setPaymentToReverse(payment)}>Revertir</Button> : null}</div>)}</div>
  </section>;
}
