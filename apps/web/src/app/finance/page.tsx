'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WorkspaceShell } from '../../features/auth/workspace-shell';
import { currentSession } from '../../features/auth/auth';

type Method = { id: string; name: string; isSelectable: boolean };
type FinanceView = 'summary' | 'income' | 'expenses';
const get = async (path: string) => { const response = await fetch(`/api/finance/${path}`, { credentials: 'include' }); const body = await response.json(); if (!response.ok) throw new Error(body.message ?? 'No pudimos cargar Finanzas'); return body.data?.data ?? body.data; };

export default function FinancePage(): React.JSX.Element {
  return <Suspense fallback={<main className="p-6">Cargando Finanzas…</main>}><FinancePageContent /></Suspense>;
}

function FinancePageContent(): React.JSX.Element {
  const params = useSearchParams();
  const requestedView = params.get('view');
  const view: FinanceView = requestedView === 'income' || requestedView === 'expenses' ? requestedView : 'summary';
  const active = view === 'income' ? 'finance-income' : view === 'expenses' ? 'finance-expenses' : 'finance-summary';
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const permissions = session.data?.permissions ?? [];
  const read = permissions.includes('FINANCE_OPERATIONAL_READ');
  const canCatalog = permissions.includes('PAYMENT_METHOD_CATALOG_MANAGE');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const methods = useQuery<Method[]>({ queryKey: ['finance', 'payment-methods'], queryFn: () => get('payment-methods'), enabled: view === 'summary' && (read || canCatalog) });
  const totals = useQuery({ queryKey: ['finance', 'totals'], queryFn: () => get(permissions.includes('FINANCE_EXECUTIVE_READ') ? 'executive-totals' : 'totals'), enabled: view === 'summary' && read });
  const income = useQuery({ queryKey: ['finance', 'income'], queryFn: () => get('income'), enabled: view === 'income' && read });
  const expenses = useQuery({ queryKey: ['finance', 'expenses'], queryFn: () => get('expenses'), enabled: view === 'expenses' && (read || permissions.includes('EXPENSE_HISTORY_READ')) });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const url = editing ? `/api/finance/payment-methods/${editing}` : '/api/finance/payment-methods';
    const response = await fetch(url, { method: editing ? 'PATCH' : 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': session.data?.csrfToken ?? '' }, body: JSON.stringify({ name, isSelectable: true }) });
    if (!response.ok) { const body = await response.json(); setMessage(body.message ?? 'No se pudo guardar'); return; }
    setName(''); setEditing(null); setMessage('Medio de pago guardado'); await qc.invalidateQueries({ queryKey: ['finance', 'payment-methods'] });
  }
  async function retire(method: Method) {
    if (!window.confirm(`Retirar ${method.name}?`)) return;
    const response = await fetch(`/api/finance/payment-methods/${method.id}`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': session.data?.csrfToken ?? '' }, body: JSON.stringify({ name: method.name, isSelectable: false }) });
    if (response.ok) await qc.invalidateQueries({ queryKey: ['finance', 'payment-methods'] });
  }
  const totalsData = totals.data as Record<string, unknown> | undefined;
  const indicatorRows: Array<[string, string]> = [['Ingresos', 'totalIncome'], ['Sala', 'salaIncome'], ['Clínica', 'clinicalIncome'], ['Gastos', 'expenses'], ['Neto', 'net']];
  return <WorkspaceShell active={active}><main className="mx-auto max-w-6xl space-y-6">
    <header><h1 className="text-3xl font-semibold">Finanzas</h1><p className="text-sm text-muted-foreground">Operación económica · ARS</p></header>
    {view === 'summary' && read ? <>
      <section aria-label="Indicadores financieros" className="grid gap-4 md:grid-cols-5">{indicatorRows.slice(0, permissions.includes('FINANCE_EXECUTIVE_READ') ? 5 : 4).map(([label, key]) => <article className="rounded border bg-white p-4" key={key}><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">$ {String(totalsData?.[key] ?? '0')}</p></article>)}</section>
      <PaymentMethods methods={methods.data ?? []} canCatalog={canCatalog} name={name} editing={editing} message={message} onName={setName} onSave={save} onEdit={(method) => { setEditing(method.id); setName(method.name); }} onRetire={(method) => { void retire(method); }} onCancelEdit={() => { setEditing(null); setName(''); }} />
    </> : null}
    {view === 'income' && read ? <Data title="Ingresos" value={income.data} action={<Link className="text-sm underline" href="/finance/clinical-income/new">Nuevo ingreso clínico</Link>} /> : null}
    {view === 'expenses' && (read || permissions.includes('EXPENSE_HISTORY_READ')) ? <Data title="Gastos" value={expenses.data} /> : null}
  </main></WorkspaceShell>;
}

function PaymentMethods({ methods, canCatalog, name, editing, message, onName, onSave, onEdit, onRetire, onCancelEdit }: {
  methods: Method[]; canCatalog: boolean; name: string; editing: string | null; message: string;
  onName: (value: string) => void; onSave: (event: React.FormEvent) => void; onEdit: (method: Method) => void; onRetire: (method: Method) => void; onCancelEdit: () => void;
}): React.JSX.Element {
  return <section className="rounded border bg-white p-5"><h2 className="font-semibold">Medios de pago</h2>{methods.map((method) => <div className="flex items-center justify-between border-b py-2 text-sm" key={method.id}><span>{method.name}</span><span className="flex items-center gap-3"><span>{method.isSelectable ? 'Disponible' : 'Retirado'}</span>{canCatalog && <>{method.isSelectable && <button className="underline" onClick={() => onEdit(method)}>Editar</button>}{method.isSelectable && <button className="underline" onClick={() => onRetire(method)}>Retirar</button>}</>}</span></div>)}{canCatalog && <form className="mt-4 flex gap-2" onSubmit={onSave}><input aria-label="Nombre del medio de pago" required value={name} onChange={(event) => onName(event.target.value)} className="h-10 flex-1 rounded border px-3" placeholder={editing ? 'Editar medio de pago' : 'Nuevo medio de pago'} /><button className="rounded bg-[#FCCC05] px-3 py-2 text-sm text-black">{editing ? 'Guardar' : 'Crear'}</button>{editing && <button type="button" className="rounded border px-3" onClick={onCancelEdit}>Cancelar</button>}</form>}{message && <p role="status" className="mt-2 text-sm">{message}</p>}</section>;
}

function Data({ title, value, action }: { title: string; value: unknown; action?: React.ReactNode }): React.JSX.Element {
  const rows = Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
  return <section className="rounded border bg-white p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{title}</h2>{action}</div>{rows.length ? rows.map((row) => <div className="flex justify-between border-b py-2 text-sm" key={String(row.id)}><span>{String(row.cashDate ?? '')} · {String(row.source ?? row.area ?? '')}</span><strong>$ {String(row.amount ?? '0')}</strong></div>) : <p className="mt-3 text-sm text-muted-foreground">No hay registros.</p>}</section>;
}
