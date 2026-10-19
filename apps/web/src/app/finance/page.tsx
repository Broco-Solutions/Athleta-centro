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
  const paymentAction = params.get('action');
  const [summaryMonth, setSummaryMonth] = useState(todayOperational().slice(0, 7));
  const bounds = monthBounds(summaryMonth);
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
  const canPay = permissions.includes('SALA_PAYMENT_MANAGE');
  const students = useQuery({ queryKey: ['sala', 'students'], enabled: canPay && view === 'income' && !personId, queryFn: async () => {
    const response = await listSalaStudents({ credentials: 'include' });
    if (response.status >= 400) throw new Error('No pudimos cargar los alumnos de Sala.');
    return response.data.data;
  } });
  const summaryStudents = useQuery({ queryKey: ['sala', 'students'], enabled: canPay && view === 'summary', queryFn: async () => {
    const response = await listSalaStudents({ credentials: 'include' });
    if (response.status !== 200) throw new Error('No pudimos cargar los alumnos de Sala.');
    return response.data.data;
  } });
  const withoutValidity = (summaryStudents.data ?? []).filter(student => !student.hasValidAccess);
  const term = search.trim().toLocaleLowerCase('es');
  const dniDigits = term.replace(/\D/g, '');
  const pendingStudents = (students.data ?? []).filter(student => !student.hasValidAccess);
  const paidStudents = (students.data ?? []).filter(student => student.hasValidAccess);
  const tabStudents = incomeTab === 'pending' ? pendingStudents : paidStudents;
  const results = term ? tabStudents.filter(student => `${student.firstName} ${student.lastName}`.toLocaleLowerCase('es').includes(term) || (dniDigits && /^[\d\s.-]+$/.test(term) && student.dni.replace(/\D/g, '').includes(dniDigits))) : tabStudents;
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const methods = useQuery<Method[]>({ queryKey: ['finance', 'payment-methods'], queryFn: () => get('payment-methods'), enabled: view === 'summary' && (read || canCatalog) });
  const summaryIncome = useQuery<Movement[]>({ queryKey: ['finance', 'income', 'summary', summaryMonth], queryFn: () => get(`income?from=${bounds.from}&to=${bounds.to}&area=SALA`), enabled: view === 'summary' && read });
  const summaryExpenses = useQuery<Movement[]>({ queryKey: ['finance', 'expenses', 'summary', summaryMonth], queryFn: () => get(`expenses?from=${bounds.from}&to=${bounds.to}`), enabled: view === 'summary' && read });
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
  const executive = permissions.includes('FINANCE_EXECUTIVE_READ');
  const incomeTotal = (summaryIncome.data ?? []).reduce((total, row) => total + BigInt(row.amount), 0n);
  const expenseTotal = (summaryExpenses.data ?? []).reduce((total, row) => total + BigInt(row.amount), 0n);
  const byMethod = new Map<string, { id: string; name: string; income: bigint; expenses: bigint }>();
  for (const method of methods.data ?? []) byMethod.set(method.id, { ...method, income: 0n, expenses: 0n });
  for (const [kind, rows] of [['income', summaryIncome.data ?? []], ['expenses', summaryExpenses.data ?? []]] as const) for (const row of rows) {
    if (!row.paymentMethod) continue;
    const method = row.paymentMethod;
    const group = byMethod.get(method.id) ?? { id: method.id, name: method.name, income: 0n, expenses: 0n };
    group[kind] += BigInt(row.amount);
    byMethod.set(method.id, group);
  }
  const summaryReady = summaryIncome.isSuccess && summaryExpenses.isSuccess;
  return <WorkspaceShell active={active}><main className="mx-auto max-w-6xl space-y-6">
    <header><h1 className="text-3xl font-semibold">Finanzas</h1><p className="text-sm text-muted-foreground">{selectedPaymentContext ? "La vigencia y cada pago del alumno en un solo lugar." : "Operación económica · ARS"}</p>{selectedPaymentContext ? <Link className="mt-3 inline-block rounded border px-3 py-2 text-sm" href="/finance?view=income">Cambiar alumno</Link> : null}</header>
    {view === 'summary' ? <section aria-label="Finanzas del mes" className="space-y-3">
      <h2 className="text-xl font-semibold">Finanzas del mes</h2>
      <div className="flex items-center gap-4"><button type="button" aria-label="Mes anterior" onClick={() => setSummaryMonth(previousMonth(summaryMonth))} className="rounded border px-3 py-2">‹</button><p className="font-semibold">{monthTitle(summaryMonth)}</p><button type="button" aria-label="Mes siguiente" onClick={() => setSummaryMonth(nextMonth(summaryMonth))} className="rounded border px-3 py-2">›</button></div>
      <label className="block text-sm">Mes<input type="month" aria-label="Mes" value={summaryMonth} onChange={event => { if (/^\d{4}-\d{2}$/.test(event.target.value)) setSummaryMonth(event.target.value); }} className="ml-3 h-10 rounded border px-3" /></label>
    </section> : null}
    {view === 'summary' && read ? <>
      {summaryIncome.isPending || summaryExpenses.isPending ? <p role="status">Cargando movimientos del mes…</p> : null}
      {summaryIncome.isError || summaryExpenses.isError ? <p role="alert">No pudimos cargar los movimientos del mes.</p> : null}
      {summaryReady ? <>
        <section aria-label="Indicadores financieros" className="grid gap-4 md:grid-cols-3">{([['Ingresos', incomeTotal], ['Gastos', expenseTotal], ...(executive ? [['Resultado', incomeTotal - expenseTotal] as const] : [])] as const).map(([label, amount]) => <article className="rounded border bg-surface p-4" key={label}><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{formatMoney(amount.toString())}</p></article>)}</section>
        <section className="space-y-3 rounded border border-border bg-surface p-5"><h2 className="text-lg font-semibold">Movimientos por medio de pago</h2><div className="overflow-x-auto"><table aria-label="Movimientos por medio de pago" className="w-full text-sm"><thead><tr><th className="p-2 text-left">Medio de pago</th><th className="p-2 text-right">Ingresos</th><th className="p-2 text-right">Gastos</th>{executive ? <th className="p-2 text-right">Neto</th> : null}</tr></thead><tbody>{[...byMethod.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(row => <tr key={row.id} className="border-t border-border"><th scope="row" className="p-2 text-left font-medium">{row.name}</th><td className="p-2 text-right">{formatMoney(row.income.toString())}</td><td className="p-2 text-right">{formatMoney(row.expenses.toString())}</td>{executive ? <td className="p-2 text-right">{formatMoney((row.income - row.expenses).toString())}</td> : null}</tr>)}</tbody></table></div></section>
      </> : null}
    </> : null}
    {view === 'summary' && canPay ? <section aria-labelledby="pending-fees-title" className="space-y-3 rounded border border-border bg-surface p-5">
      <h2 id="pending-fees-title" className="text-xl font-semibold">Estado actual de Sala</h2>
      <p className="text-sm text-muted-foreground">Alumnos sin vigencia: {withoutValidity.length}</p>
      {summaryStudents.isPending ? <p role="status">Cargando alumnos…</p> : null}
      {summaryStudents.isError ? <p role="alert">{summaryStudents.error.message}</p> : null}
      {summaryStudents.isSuccess && !withoutValidity.length ? <p>Todos los alumnos tienen vigencia actualmente.</p> : null}
      <ul>{withoutValidity.map(student => <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 text-sm">
        <div><p className="font-semibold">{student.firstName} {student.lastName}</p><p>{student.plan.name} · Sin vigencia</p></div>
        <Link className="rounded border px-3 py-2 font-medium" href={`/finance?view=income&personId=${student.id}&action=renew`}>Renovar</Link>
      </li>)}</ul>
    </section> : null}
    {view === 'summary' && (read || canCatalog) ? <>
      <details className="rounded border bg-white p-4"><summary className="cursor-pointer font-semibold">Configuración · Administrar medios de pago</summary><PaymentMethods methods={methods.data ?? []} canCatalog={canCatalog} name={name} editing={editing} message={message} onName={setName} onSave={save} onEdit={(method) => { setEditing(method.id); setName(method.name); }} onRetire={(method) => { void retire(method); }} onCancelEdit={() => { setEditing(null); setName(''); }} /></details>
    </> : null}
    {view === 'income' && canPay && !personId ? <section className="space-y-3 rounded border bg-white p-5">
      <h2 className="text-xl font-semibold">Vigencia de Sala</h2>
      <div className="flex gap-4" aria-label="Estado de cuotas">
        <button type="button" aria-pressed={incomeTab === 'pending'} className={tabClass(incomeTab === 'pending')} onClick={() => setIncomeTab('pending')}>Sin vigencia {pendingStudents.length}</button>
        <button type="button" aria-pressed={incomeTab === 'paid'} className={tabClass(incomeTab === 'paid')} onClick={() => setIncomeTab('paid')}>Vigentes {paidStudents.length}</button>
      </div>
      <label className="block text-sm">Nombre, apellido o DNI<input type="search" value={search} onChange={event => setSearch(event.target.value)} className="mt-1 h-10 w-full rounded border px-3" /></label>
      {students.isPending ? <p role="status">Cargando alumnos…</p> : null}
      {students.isError ? <p role="alert">{students.error.message}</p> : null}
      {students.isSuccess && !results.length ? <p>No se encontraron alumnos.</p> : null}
      <ul>{results.map(student => <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm">
        <div><p className="font-semibold">{student.firstName} {student.lastName}</p><p>DNI {student.dni} · {student.plan.name}</p>{incomeTab === 'paid' ? <p>Fecha de cobro: {student.lastPaymentPaidAt ? formatDate(student.lastPaymentPaidAt) : '—'}</p> : null}<p>{student.hasValidAccess ? `Vigente hasta ${student.validUntil ? formatDate(student.validUntil) : '—'}` : 'Sin vigencia'}</p></div>
        <Link className="rounded border px-3 py-2 font-medium" href={`/finance?view=income&personId=${student.id}${incomeTab === 'pending' ? '&action=renew' : ''}`}>{incomeTab === 'pending' ? 'Renovar' : 'Ver pagos'}</Link>{incomeTab === 'paid' ? <Link className="rounded border px-3 py-2 font-medium" href={`/finance?view=income&personId=${student.id}&action=renew`}>Renovar</Link> : null}
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
        {participations.isSuccess ? <SalaPaymentPanel key={`${personId}-${paymentAction}`} defaultOpen={paymentAction === 'renew'} personId={personId!} csrfToken={session.data?.csrfToken ?? ''} canManage activePlan={activePlan}/> : null}
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

function previousMonth(value: string): string { return shiftMonth(value, -1); }
function nextMonth(value: string): string { return shiftMonth(value, 1); }
function shiftMonth(value: string, delta: number): string {
  const [year = 2000, month = 1] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
function monthBounds(value: string): { from: string; to: string } {
  const [year = 2000, month = 1] = value.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${value}-01`, to: `${value}-${String(lastDay).padStart(2, '0')}` };
}
function monthTitle(value: string): string {
  const title = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`)).replace(' de ', ' ');
  return title.charAt(0).toUpperCase() + title.slice(1);
}

const tabClass = (active: boolean) => `border-b-2 px-1 py-2 text-sm ${active ? 'border-primary font-semibold' : 'border-transparent text-muted-foreground'}`;

function PaymentMethods({ methods, canCatalog, name, editing, message, onName, onSave, onEdit, onRetire, onCancelEdit }: {
  methods: Method[]; canCatalog: boolean; name: string; editing: string | null; message: string;
  onName: (value: string) => void; onSave: (event: React.FormEvent) => void; onEdit: (method: Method) => void; onRetire: (method: Method) => void; onCancelEdit: () => void;
}): React.JSX.Element {
  return <section className="rounded border bg-white p-5"><h2 className="font-semibold">Medios de pago</h2>{methods.map((method) => <div className="flex items-center justify-between border-b py-2 text-sm" key={method.id}><span>{method.name}</span><span className="flex items-center gap-3"><span>{method.isSelectable ? 'Disponible' : 'Retirado'}</span>{canCatalog && <>{method.isSelectable && <button className="underline" onClick={() => onEdit(method)}>Editar</button>}{method.isSelectable && <button className="underline" onClick={() => onRetire(method)}>Retirar</button>}</>}</span></div>)}{canCatalog && <form className="mt-4 flex gap-2" onSubmit={onSave}><input aria-label="Nombre del medio de pago" required value={name} onChange={(event) => onName(event.target.value)} className="h-10 flex-1 rounded border px-3" placeholder={editing ? 'Editar medio de pago' : 'Nuevo medio de pago'} /><button className="rounded bg-[#FCCC05] px-3 py-2 text-sm text-black">{editing ? 'Guardar' : 'Crear'}</button>{editing && <button type="button" className="rounded border px-3" onClick={onCancelEdit}>Cancelar</button>}</form>}{message && <p role="status" className="mt-2 text-sm">{message}</p>}</section>;
}

type Movement = { id: string; cashDate: string; source?: string; area?: string; amount: string; person?: { firstName: string; lastName: string }; category?: { name: string }; paymentMethod?: { id: string; name: string }; description?: string | null };
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
