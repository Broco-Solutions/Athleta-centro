'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WorkspaceShell } from '../../features/auth/workspace-shell';
import { getPerson, listPersonSalaParticipations, listSalaStudents } from '@athleta/api-client';
import { SalaPaymentPanel } from '../../features/finance/sala-payment-panel';
import { ExpenseRegistration } from '../../features/finance/expense-registration';
import { todayOperational } from '../../features/sala/student-onboarding';
import { currentSession } from '../../features/auth/auth';

type Method = { id: string; name: string; isSelectable: boolean };
type IncomeStatusTab = 'pending' | 'paid';
type ExpenseTab = 'register' | 'records';
type FinanceView = 'summary' | 'income' | 'expenses';
const get = async (path: string) => { const response = await fetch(`/api/finance/${path}`, { credentials: 'include' }); const body = await response.json(); if (!response.ok) throw new Error(body.message ?? 'No pudimos cargar Finanzas'); return body.data?.data ?? body.data; };

export default function FinancePage(): React.JSX.Element {
  return <Suspense fallback={<main className="p-6">Cargando Finanzas…</main>}><FinancePageContent /></Suspense>;
}

function FinancePageContent(): React.JSX.Element {
  const params = useSearchParams();
  const personId = params.get('personId');
  const requestedView = params.get('view');
  const view: FinanceView = requestedView === 'income' || requestedView === 'expenses' ? requestedView : 'summary';
  const active = view === 'income' ? 'finance-income' : view === 'expenses' ? 'finance-expenses' : 'finance-summary';
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const permissions = session.data?.permissions ?? [];
  const read = permissions.includes('FINANCE_OPERATIONAL_READ');
  const canCatalog = permissions.includes('PAYMENT_METHOD_CATALOG_MANAGE');
  const [search, setSearch] = useState('');
  const [incomeTab, setIncomeTab] = useState<IncomeStatusTab>('pending');
  const [expenseTab, setExpenseTab] = useState<ExpenseTab>('register');
  const canCreateExpense = permissions.includes('EXPENSE_CREATE');
  const canReadExpenses = read || permissions.includes('EXPENSE_HISTORY_READ');
  const activeExpenseTab = canCreateExpense ? expenseTab : 'records';
  const operationalMonth = todayOperational().slice(0, 7);
  const period = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${operationalMonth}-01T00:00:00Z`)).replace(' de ', ' ');
  const periodTitle = period.charAt(0).toUpperCase() + period.slice(1);
  const canPay = permissions.includes('SALA_PAYMENT_MANAGE');
  const students = useQuery({ queryKey: ['sala', 'students'], enabled: canPay && (view === 'summary' || (view === 'income' && !personId)), queryFn: async () => {
    const response = await listSalaStudents({ credentials: 'include' });
    if (response.status >= 400) throw new Error('No pudimos cargar los alumnos de Sala.');
    return response.data.data;
  } });
  const term = search.trim().toLocaleLowerCase('es');
  const dniDigits = term.replace(/\D/g, '');
  const pendingStudents = (students.data ?? []).filter(student => student.paymentStatus === 'PENDING');
  const paidStudents = (students.data ?? []).filter(student => student.paymentStatus === 'PAID');
  const tabStudents = incomeTab === 'pending' ? pendingStudents : paidStudents;
  const results = term ? tabStudents.filter(student => `${student.firstName} ${student.lastName}`.toLocaleLowerCase('es').includes(term) || (dniDigits && /^[\d\s.-]+$/.test(term) && student.dni.replace(/\D/g, '').includes(dniDigits))) : tabStudents;
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const methods = useQuery<Method[]>({ queryKey: ['finance', 'payment-methods'], queryFn: () => get('payment-methods'), enabled: view === 'summary' && (read || canCatalog) });
  const totals = useQuery({ queryKey: ['finance', 'totals'], queryFn: () => get(permissions.includes('FINANCE_EXECUTIVE_READ') ? 'executive-totals' : 'totals'), enabled: view === 'summary' && read });
  const income = useQuery({ queryKey: ['finance', 'income', personId], queryFn: () => get(personId ? `income?personId=${encodeURIComponent(personId)}` : 'income'), enabled: view === 'income' && !personId && read });
  const expenses = useQuery({ queryKey: ['finance', 'expenses'], queryFn: () => get('expenses'), enabled: view === 'expenses' && activeExpenseTab === 'records' && canReadExpenses });

  const selectedPaymentContext = view === 'income' && Boolean(personId) && permissions.includes('SALA_PAYMENT_MANAGE');
  const person = useQuery({ queryKey: ['person', personId], enabled: selectedPaymentContext, retry: false, queryFn: async () => {
    const response = await getPerson(personId!, { credentials: 'include' });
    if (response.status >= 400 || !response.data?.data?.id) throw new Error('La Persona seleccionada no existe o no pudo cargarse.');
    return response.data.data;
  } });
  const participations = useQuery({ queryKey: ['sala-participations', personId], enabled: selectedPaymentContext && person.isSuccess, queryFn: async () => {
    const response = await listPersonSalaParticipations(personId!, { credentials: 'include' });
    if (response.status >= 400) throw new Error('No se pudo cargar la participación de Sala.');
    return response.data.data;
  } });

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
  const activePlan = participations.data?.find(item => !item.endDate)?.plan;
  const totalsData = totals.data as Record<string, unknown> | undefined;
  const indicatorRows: Array<[string, string]> = [['Ingresos', 'totalIncome'], ['Sala', 'salaIncome'], ['Gastos', 'expenses'], ['Neto', 'net']];
  return <WorkspaceShell active={active}><main className="mx-auto max-w-6xl space-y-6">
    <header><h1 className="text-3xl font-semibold">Finanzas</h1><p className="text-sm text-muted-foreground">{selectedPaymentContext ? "La cuenta del alumno, sus cuotas y cada pago en un solo lugar." : "Operación económica · ARS"}</p>{selectedPaymentContext ? <Link className="mt-3 inline-block rounded border px-3 py-2 text-sm" href="/finance?view=income">Cambiar alumno</Link> : null}</header>
    {view === 'summary' && read ? <>
      <section aria-label="Indicadores financieros" className="grid gap-4 md:grid-cols-4">{indicatorRows.slice(0, permissions.includes('FINANCE_EXECUTIVE_READ') ? 4 : 3).map(([label, key]) => <article className="rounded border bg-white p-4" key={key}><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">$ {String(totalsData?.[key] ?? '0')}</p></article>)}</section>
    </> : null}
    {view === 'summary' && canPay ? <section aria-labelledby="pending-fees-title" className="space-y-3 rounded border border-border bg-surface p-5">
      <h2 id="pending-fees-title" className="text-xl font-semibold">Cuotas pendientes</h2>
      <p className="text-sm text-muted-foreground">Alumnos sin pago registrado para {periodTitle}</p>
      {students.isPending ? <p role="status">Cargando alumnos…</p> : null}
      {students.isError ? <p role="alert">{students.error.message}</p> : null}
      {students.isSuccess && !pendingStudents.length ? <p>No hay cuotas pendientes para el período actual.</p> : null}
      <ul>{pendingStudents.map(student => <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 text-sm">
        <div><p className="font-semibold">{student.firstName} {student.lastName}</p><p>{student.plan.name} · Pago pendiente</p></div>
        <Link className="rounded border px-3 py-2 font-medium" href={`/finance?view=income&personId=${student.id}`}>Cobrar</Link>
      </li>)}</ul>
    </section> : null}
    {view === 'summary' && (read || canCatalog) ? <>
      <details className="rounded border bg-white p-4"><summary className="cursor-pointer font-semibold">Configuración · Administrar medios de pago</summary><PaymentMethods methods={methods.data ?? []} canCatalog={canCatalog} name={name} editing={editing} message={message} onName={setName} onSave={save} onEdit={(method) => { setEditing(method.id); setName(method.name); }} onRetire={(method) => { void retire(method); }} onCancelEdit={() => { setEditing(null); setName(''); }} /></details>
    </> : null}
    {view === 'income' && canPay && !personId ? <section className="space-y-3 rounded border bg-white p-5">
      <h2 className="text-xl font-semibold">Cuotas de Sala</h2>
      <p className="text-sm text-muted-foreground">{periodTitle}</p>
      <div className="flex gap-4" aria-label="Estado de cuotas">
        <button type="button" aria-pressed={incomeTab === 'pending'} className={tabClass(incomeTab === 'pending')} onClick={() => setIncomeTab('pending')}>Pendientes {pendingStudents.length}</button>
        <button type="button" aria-pressed={incomeTab === 'paid'} className={tabClass(incomeTab === 'paid')} onClick={() => setIncomeTab('paid')}>Pagados {paidStudents.length}</button>
      </div>
      <label className="block text-sm">Nombre, apellido o DNI<input type="search" value={search} onChange={event => setSearch(event.target.value)} className="mt-1 h-10 w-full rounded border px-3" /></label>
      {students.isPending ? <p role="status">Cargando alumnos…</p> : null}
      {students.isError ? <p role="alert">{students.error.message}</p> : null}
      {students.isSuccess && !results.length ? <p>No se encontraron alumnos.</p> : null}
      <ul>{results.map(student => <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm">
        <div><p className="font-semibold">{student.firstName} {student.lastName}</p><p>DNI {student.dni} · {student.plan.name}</p>{incomeTab === 'paid' ? <p>Fecha de cobro: {student.currentPaymentPaidAt ? formatDate(student.currentPaymentPaidAt) : '—'}</p> : null}<p>{student.paymentStatus === 'PAID' ? 'Pagado' : 'Pago pendiente'}</p></div>
        <Link className="rounded border px-3 py-2 font-medium" href={`/finance?view=income&personId=${student.id}`}>{incomeTab === 'pending' ? 'Cobrar' : 'Ver pagos'}</Link>
      </li>)}</ul>
    </section> : null}
    {selectedPaymentContext ? <section className="space-y-3">
      {person.isPending ? <p role="status">Cargando Persona…</p> : null}
      {person.isError || participations.isError ? <p role="alert">{person.error?.message ?? participations.error?.message}</p> : null}
      {person.isSuccess ? <>
        <div className="flex flex-col gap-5 rounded border border-border bg-surface p-5 sm:flex-row sm:items-center">
          <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-surface-muted text-xl font-semibold">{person.data.firstName[0]}{person.data.lastName[0]}</span>
          <div className="flex-1"><h2 className="text-xl font-semibold">{person.data.firstName} {person.data.lastName}</h2><p className="text-sm text-muted-foreground">DNI {person.data.dni}</p>
            <Link className="text-sm underline" href={`/sala/people/${personId}`}>Ver ficha<span aria-hidden="true"> ↗</span></Link>
          </div>
          {activePlan ? <div className="border-border sm:border-l sm:pl-6"><p className="font-semibold">{activePlan.name}</p><p className="text-sm text-muted-foreground">Precio actual: {formatMoney(activePlan.monthlyAmount).replace('$ ', '$')} / mes</p></div> : null}
        </div>
        {participations.isSuccess ? <SalaPaymentPanel key={personId} personId={personId!} csrfToken={session.data?.csrfToken ?? ''} canManage activePlan={activePlan}/> : null}
      </> : null}
    </section> : null}
    {view === 'income' && !personId && income.isError ? <p role="alert">No se pudieron cargar los ingresos para este contexto.</p> : null}
    {view === 'income' && !personId && read ? <Data title="Historial de ingresos" value={income.data} /> : null}
    {view === 'expenses' ? <>
      <div className="flex gap-4" aria-label="Gastos">
        {canCreateExpense ? <button type="button" aria-pressed={activeExpenseTab === 'register'} className={tabClass(activeExpenseTab === 'register')} onClick={() => setExpenseTab('register')}>Registrar gasto</button> : null}
        {canReadExpenses ? <button type="button" aria-pressed={activeExpenseTab === 'records'} className={tabClass(activeExpenseTab === 'records')} onClick={() => setExpenseTab('records')}>Registros</button> : null}
      </div>
      {activeExpenseTab === 'register' && canCreateExpense ? <ExpenseRegistration csrfToken={session.data?.csrfToken ?? ''} canManageCategories={permissions.includes('EXPENSE_CATEGORY_CATALOG_MANAGE')} /> : null}
      {activeExpenseTab === 'records' && expenses.isError ? <p role="alert">No se pudieron cargar los gastos.</p> : null}
      {activeExpenseTab === 'records' && canReadExpenses ? <Data title="Registros de gastos" value={expenses.data} /> : null}
    </> : null}
  </main></WorkspaceShell>;
}

const tabClass = (active: boolean) => `border-b-2 px-1 py-2 text-sm ${active ? 'border-primary font-semibold' : 'border-transparent text-muted-foreground'}`;

function PaymentMethods({ methods, canCatalog, name, editing, message, onName, onSave, onEdit, onRetire, onCancelEdit }: {
  methods: Method[]; canCatalog: boolean; name: string; editing: string | null; message: string;
  onName: (value: string) => void; onSave: (event: React.FormEvent) => void; onEdit: (method: Method) => void; onRetire: (method: Method) => void; onCancelEdit: () => void;
}): React.JSX.Element {
  return <section className="rounded border bg-white p-5"><h2 className="font-semibold">Medios de pago</h2>{methods.map((method) => <div className="flex items-center justify-between border-b py-2 text-sm" key={method.id}><span>{method.name}</span><span className="flex items-center gap-3"><span>{method.isSelectable ? 'Disponible' : 'Retirado'}</span>{canCatalog && <>{method.isSelectable && <button className="underline" onClick={() => onEdit(method)}>Editar</button>}{method.isSelectable && <button className="underline" onClick={() => onRetire(method)}>Retirar</button>}</>}</span></div>)}{canCatalog && <form className="mt-4 flex gap-2" onSubmit={onSave}><input aria-label="Nombre del medio de pago" required value={name} onChange={(event) => onName(event.target.value)} className="h-10 flex-1 rounded border px-3" placeholder={editing ? 'Editar medio de pago' : 'Nuevo medio de pago'} /><button className="rounded bg-[#FCCC05] px-3 py-2 text-sm text-black">{editing ? 'Guardar' : 'Crear'}</button>{editing && <button type="button" className="rounded border px-3" onClick={onCancelEdit}>Cancelar</button>}</form>}{message && <p role="status" className="mt-2 text-sm">{message}</p>}</section>;
}

type Movement = { id: string; cashDate: string; source?: string; area?: string; amount: string; person?: { firstName: string; lastName: string }; category?: { name: string }; paymentMethod?: { name: string }; description?: string | null };
const areaLabel = (area?: string) => ({ SALA: 'Sala', GENERAL: 'General', CLINIC: 'Clínica' })[area ?? ''] ?? area;
const formatDate = (value: string) => value.slice(0, 10).split('-').reverse().join('/');
const formatMoney = (value: string) => `$ ${BigInt(value).toLocaleString('es-AR')}`;

function Data({ title, value }: { title: string; value: unknown }): React.JSX.Element {
  const rows = Array.isArray(value) ? value as Movement[] : [];
  return <section className="rounded border bg-white p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{title}</h2></div>{rows.length ? rows.map(row => <div className="grid gap-2 border-b py-3 text-sm sm:grid-cols-[1fr_2fr_1fr_1fr_auto]" key={`${row.source ?? row.area}-${row.id}`}>
    <time dateTime={row.cashDate.slice(0, 10)}>{formatDate(row.cashDate)}</time>
    <span className="font-medium">{row.person ? `${row.person.firstName} ${row.person.lastName}` : row.category?.name}</span>
    <span>{areaLabel(row.source ?? row.area)}</span><span>{row.paymentMethod?.name}</span><strong className="sm:text-right">{formatMoney(row.amount)}</strong>
    {row.description ? <p className="text-muted-foreground sm:col-span-5">{row.description}</p> : null}
  </div>) : <p className="mt-3 text-sm text-muted-foreground">No hay registros.</p>}</section>;
}
