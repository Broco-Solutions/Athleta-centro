'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
import { createSalaPayment, listPaymentMethods, listSalaPayments } from '@athleta/api-client';

type Payment = { id: string; year: number; month: number; paidAt: string; amount: string; paymentMethod?: { name: string } };
type Method = { id: string; name: string; isSelectable: boolean };
type ApiResponse = { status: number; data?: unknown };

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

export function PaymentPanel({ personId, csrfToken, canManage }: { personId: string; csrfToken: string; canManage: boolean }): React.JSX.Element {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [paymentToReverse, setPaymentToReverse] = useState<Payment | null>(null);
  const payments = useQuery({ queryKey: ['sala', 'payments', personId], queryFn: async () => unwrap<Payment>(await listSalaPayments(personId, { credentials: 'include' })), initialData: [] });
  const methods = useQuery({ queryKey: ['finance', 'payment-methods'], queryFn: async () => unwrap<Method>(await listPaymentMethods({ credentials: 'include' })), initialData: [] });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['sala', 'payments', personId] });
  const create = useMutation({
    mutationFn: async () => {
      const response = await createSalaPayment({ personId, year: new Date().getFullYear(), month: Number(month), paidAt: new Date().toISOString().slice(0, 10), amount, paymentMethodId: method, operationId: crypto.randomUUID() }, { credentials: 'include', headers: { 'x-csrf-token': csrfToken } });
      assertSuccess(response);
    },
    onSuccess: async () => { setAmount(''); setMethod(''); await invalidate(); },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/sala/payments/${id}/reverse`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ reason: 'Corrección de pago', operationId: crypto.randomUUID() }) });
      if (!response.ok) throw new Error('No pudimos revertir el pago.');
    },
    onSuccess: async () => { setPaymentToReverse(null); await invalidate(); },
  });
  const error = create.error ?? remove.error;

  return <section className="mt-5 rounded-md border bg-white p-5">
    <h2 className="mb-1 text-lg font-semibold">Pagos de Sala</h2>
    <p className="mb-3 text-sm text-muted-foreground">{payments.data.length ? 'Pagos registrados para esta Persona.' : 'No hay pagos registrados todavía.'}</p>
    {canManage ? <form className="grid gap-2 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); if (amount && method) create.mutate(); }}>
      <label className="text-sm">Mes<select aria-label="Mes" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-1 h-10 w-full rounded border px-2">{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>
      <label className="text-sm">Importe<input aria-label="Importe" required inputMode="numeric" pattern="[1-9][0-9]*" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Importe" className="mt-1 h-10 w-full rounded border px-2" /></label>
      <label className="text-sm">Medio de pago<select aria-label="Medio de pago" required value={method} onChange={(event) => setMethod(event.target.value)} className="mt-1 h-10 w-full rounded border px-2"><option value="">Seleccionar</option>{methods.data.filter((item) => item.isSelectable).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <Button type="submit" className="self-end" disabled={create.isPending || !amount || !method}>{create.isPending ? 'Registrando…' : 'Registrar pago'}</Button>
    </form> : <p className="text-sm text-muted-foreground">Tu rol permite consultar los pagos, sin registrar ni eliminar movimientos.</p>}
    {methods.data.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No hay medios de pago configurados.</p> : null}
    {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error.message || 'No se pudo actualizar el pago.'}</p> : null}
    {paymentToReverse ? <div role="alertdialog" aria-modal="true" aria-labelledby="reverse-payment-title" className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm"><p id="reverse-payment-title">¿Revertir el pago de {paymentToReverse.month}/{paymentToReverse.year} por {paymentToReverse.amount}?</p><div className="mt-3 flex gap-2"><Button type="button" variant="secondary" onClick={() => setPaymentToReverse(null)}>Cancelar</Button><Button type="button" disabled={remove.isPending} onClick={() => remove.mutate(paymentToReverse.id)}>{remove.isPending ? 'Revirtiendo…' : 'Revertir pago'}</Button></div></div> : null}
    <div className="mt-4 space-y-2">{payments.data.map((payment) => <div key={payment.id} className="flex items-center justify-between gap-3 border-b py-2 text-sm"><span>{payment.month}/{payment.year} · {payment.amount} · {payment.paymentMethod?.name ?? 'Medio retirado'}</span>{canManage ? <Button type="button" variant="secondary" onClick={() => setPaymentToReverse(payment)}>Revertir</Button> : null}</div>)}</div>
  </section>;
}
