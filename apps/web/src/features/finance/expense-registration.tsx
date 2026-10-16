'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@athleta/ui';
import { todayOperational } from '../sala/student-onboarding';

type CatalogItem = { id: string; name: string; isSelectable: boolean };
const schema = z.object({
  amount: z.string().regex(/^\d+$/, 'Ingresá un importe entero en pesos.').refine(value => /^\d+$/.test(value) && BigInt(value) > 0n, 'El importe debe ser mayor a cero.'),
  cashDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ingresá una fecha válida.').refine(value => value <= todayOperational(), 'La fecha no puede ser futura.'),
  categoryId: z.string().min(1, 'Seleccioná una categoría.'),
  paymentMethodId: z.string().min(1, 'Seleccioná un medio de pago.'),
  area: z.enum(['SALA', 'GENERAL']),
  description: z.string(),
});
type ExpenseValues = z.infer<typeof schema>;
type ExpenseRequest = Omit<ExpenseValues, 'description'> & { description?: string | undefined; operationId: string };

async function request(path: string, options?: RequestInit) {
  const response = await fetch(`/api/finance/${path}`, { ...options, credentials: 'include' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? 'No pudimos guardar los cambios.');
  return body.data;
}

export function ExpenseRegistration({ csrfToken, canManageCategories }: { csrfToken: string; canManageCategories: boolean }): React.JSX.Element {
  const client = useQueryClient();
  const [categoryName, setCategoryName] = useState('');
  const [showCategoryCreator, setShowCategoryCreator] = useState<boolean | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const pendingRequest = useRef<ExpenseRequest | null>(null);
  const form = useForm<ExpenseValues>({ resolver: zodResolver(schema), mode: 'onChange', defaultValues: { amount: '', cashDate: todayOperational(), categoryId: '', paymentMethodId: '', area: 'SALA', description: '' } });
  const categories = useQuery<CatalogItem[]>({ queryKey: ['finance', 'expense-categories'], queryFn: () => request('expense-categories') });
  const methods = useQuery<CatalogItem[]>({ queryKey: ['finance', 'payment-methods'], queryFn: () => request('payment-methods') });
  const selectableCategories = (categories.data ?? []).filter(item => item.isSelectable === true);
  const selectableMethods = (methods.data ?? []).filter(item => item.isSelectable === true);
  const categoryId = form.watch('categoryId');
  const methodId = form.watch('paymentMethodId');
  const headers = { 'content-type': 'application/json', 'x-csrf-token': csrfToken };
  const createCategory = useMutation({
    mutationFn: () => request('expense-categories', { method: 'POST', headers, body: JSON.stringify({ name: categoryName.trim() }) }) as Promise<CatalogItem>,
    onSuccess: async category => {
      pendingRequest.current = null;
      await client.invalidateQueries({ queryKey: ['finance', 'expense-categories'] });
      form.setValue('categoryId', category.id, { shouldValidate: true });
      setCategoryName('');
      setShowCategoryCreator(false);
    },
  });
  const createExpense = useMutation({
    mutationFn: async (values: ExpenseValues) => {
      pendingRequest.current ??= { ...values, description: values.description.trim() || undefined, operationId: crypto.randomUUID() };
      await request('expenses', { method: 'POST', headers, body: JSON.stringify(pendingRequest.current) });
    },
    onSuccess: async () => {
      pendingRequest.current = null;
      form.reset({ amount: '', description: '', cashDate: todayOperational(), area: 'SALA', categoryId: selectableCategories.some(item => item.id === categoryId) ? categoryId : '', paymentMethodId: selectableMethods.some(item => item.id === methodId) ? methodId : '' });
      setConfirmation('Gasto registrado correctamente.');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['finance', 'expenses'] }),
        client.invalidateQueries({ queryKey: ['finance', 'totals'] }),
        client.invalidateQueries({ queryKey: ['finance', 'executive-totals'] }),
      ]);
    },
  });
  const catalogsValid = categories.isSuccess && methods.isSuccess && selectableCategories.some(item => item.id === categoryId) && selectableMethods.some(item => item.id === methodId);
  const categoryCreatorOpen = showCategoryCreator ?? (categories.isSuccess && !selectableCategories.length);
  const inputClass = 'mt-1 h-10 w-full rounded border px-3';
  return <section className="space-y-4 rounded border bg-white p-5">
    <h2 className="text-xl font-semibold">Registrar gasto</h2>
    {categories.isPending || methods.isPending ? <p role="status">Cargando categorías y medios de pago…</p> : null}
    {categories.isError || methods.isError ? <p role="alert">No pudimos cargar las categorías o los medios de pago. Intentá nuevamente.</p> : null}
    {categories.isSuccess && !selectableCategories.length ? <div className="space-y-2 text-sm">
      <p>No hay categorías de gastos configuradas.</p>
      {!canManageCategories ? <p>Solicitá la configuración de una categoría a Administración.</p> : null}
    </div> : null}
    {methods.isSuccess && !selectableMethods.length ? <p className="text-sm">No hay medios de pago configurados. <Link className="underline" href="/finance">Ir a Resumen · Configuración de medios de pago</Link></p> : null}
    <form onChange={() => { pendingRequest.current = null; setConfirmation(''); }} onSubmit={form.handleSubmit(values => { if (catalogsValid && !createExpense.isPending) createExpense.mutate(values); })}>
      <fieldset disabled={createExpense.isPending} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Importe ($ ARS)<input className={inputClass} inputMode="numeric" pattern="[0-9]+" required {...form.register('amount')} /></label>
        <label className="text-sm">Fecha<input className={inputClass} type="date" max={todayOperational()} required {...form.register('cashDate')} /></label>
        <label className="text-sm">Categoría<select className={inputClass} required {...form.register('categoryId')} value={categoryId}><option value="">Seleccionar</option>{selectableCategories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-sm">Medio de pago<select className={inputClass} required {...form.register('paymentMethodId')}><option value="">Seleccionar</option>{selectableMethods.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-sm">Área<select className={inputClass} required {...form.register('area')}><option value="SALA">Sala</option><option value="GENERAL">General</option></select></label>
        <label className="text-sm">Descripción (opcional)<input className={inputClass} {...form.register('description')} /></label>
        {Object.entries(form.formState.errors).map(([field, error]) => <p role="alert" className="text-sm text-red-700" key={field}>{error.message}</p>)}
        <div className="sm:col-span-2"><Button type="submit" disabled={createExpense.isPending || !form.formState.isValid || !catalogsValid}>{createExpense.isPending ? 'Registrando…' : 'Registrar gasto'}</Button></div>
      </fieldset>
    </form>
    {canManageCategories ? <section aria-labelledby="expense-categories-title" className="space-y-3 border-t border-border pt-5">
      <h3 id="expense-categories-title" className="font-semibold">Categorías de gastos</h3>
      <p className="text-sm text-muted-foreground">Agregá una categoría cuando necesites clasificar un nuevo tipo de gasto.</p>
      {!categoryCreatorOpen ? <Button type="button" variant="secondary" disabled={createCategory.isPending} onClick={() => { createCategory.reset(); setShowCategoryCreator(true); }}>+ Agregar categoría</Button> : null}
      {categoryCreatorOpen ? <div className="space-y-2 text-sm" onChange={event => event.stopPropagation()}>
        <label>Nombre de la categoría<input className={inputClass} value={categoryName} onChange={event => setCategoryName(event.target.value)} disabled={createCategory.isPending}/></label>
        <div className="flex gap-2">
          <Button type="button" disabled={!categoryName.trim() || createCategory.isPending} onClick={() => createCategory.mutate()}>{createCategory.isPending ? 'Creando…' : 'Crear'}</Button>
          <Button type="button" variant="secondary" disabled={createCategory.isPending} onClick={() => { setShowCategoryCreator(false); setCategoryName(''); createCategory.reset(); }}>Cancelar</Button>
        </div>
        {createCategory.isError ? <p role="alert">{createCategory.error.message}</p> : null}
      </div> : null}
    </section> : null}
    {createExpense.isError ? <p role="alert">{createExpense.error.message}</p> : null}
    {confirmation ? <p role="status" className="text-sm text-emerald-700">{confirmation}</p> : null}
  </section>;
}
