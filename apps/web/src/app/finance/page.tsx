'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { ListPagination, LIST_PAGE_SIZE } from '../../lib/list-pagination';
import { formatArs } from '../../lib/money';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
import { WorkspaceShell } from '../../features/auth/workspace-shell';
import { getPerson, listPersonSalaParticipations, listSalaStudents } from '@athleta/api-client';
import { SalaPaymentPanel } from '../../features/finance/sala-payment-panel';
import { ExpenseRegistration } from '../../features/finance/expense-registration';
import { todayOperational } from '../../features/sala/student-onboarding';
import { currentSession } from '../../features/auth/auth';

type Method = { id: string; name: string; isSelectable: boolean };
type IncomeStatusTab = 'pending' | 'paid';
type FinanceView = 'summary' | 'income' | 'expenses';
type Period = 'current-month' | 'previous-month' | 'current-year' | 'all' | 'custom';
type DateRange = { from?: string; to?: string };
const get = async (path: string) => { const response = await fetch(`/api/finance/${path}`, { credentials: 'include' }); const body = await response.json(); if (!response.ok) throw new Error(body.message ?? 'No pudimos cargar Finanzas'); return body.data?.data ?? body.data; };

export default function FinancePage(): React.JSX.Element {
  return <Suspense fallback={<main className="p-6">Cargando Finanzas…</main>}><FinancePageContent /></Suspense>;
}

function FinancePageContent(): React.JSX.Element {
  const params = useSearchParams();
  const personId = params.get('personId');
  const paymentAction = params.get('action');
  const today = todayOperational();
  const [summaryPeriod, setSummaryPeriod] = useState<Period>('current-month');
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [appliedCustomRange, setAppliedCustomRange] = useState<DateRange | null>(null);
  const [customInitialized, setCustomInitialized] = useState(false);
  const [customError, setCustomError] = useState('');
  const summaryRange = resolvePeriodRange(summaryPeriod, today, appliedCustomRange);
  const summaryPeriodLabel = summaryLabel(summaryPeriod, today, summaryRange);
  const incomePeriod = useHistoryPeriod(today);
  const expensePeriod = useHistoryPeriod(today);
  const [incomeFiltersOpen, setIncomeFiltersOpen] = useState(false);
  const [expenseFiltersOpen, setExpenseFiltersOpen] = useState(false);
  const [incomePersonSearch, setIncomePersonSearch] = useState('');
  const [selectedIncomePerson, setSelectedIncomePerson] = useState<Movement['person']>(undefined);
  const [incomeSource, setIncomeSource] = useState('');
  const [incomeMethod, setIncomeMethod] = useState('');
  const [expenseArea, setExpenseArea] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseMethod, setExpenseMethod] = useState('');
  const [incomePage, setIncomePage] = useState(1);
  const [expensePage, setExpensePage] = useState(1);
  useEffect(() => { setIncomePage(1); }, [incomePeriod.period, incomePeriod.range.from, incomePeriod.range.to, selectedIncomePerson, incomeSource, incomeMethod]);
  useEffect(() => { setExpensePage(1); }, [expensePeriod.period, expensePeriod.range.from, expensePeriod.range.to, expenseArea, expenseCategory, expenseMethod]);
  const requestedView = params.get('view');
  const view: FinanceView = requestedView === 'income' || requestedView === 'expenses' ? requestedView : 'summary';
  const active = view === 'income' ? 'finance-income' : view === 'expenses' ? 'finance-expenses' : 'finance-summary';
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const permissions = session.data?.permissions ?? [];
  const read = permissions.includes('FINANCE_OPERATIONAL_READ');
  const canCatalog = permissions.includes('PAYMENT_METHOD_CATALOG_MANAGE');
  const [search, setSearch] = useState('');
  const [paymentRegistrationOpen, setPaymentRegistrationOpen] = useState(false);
  const [incomeTab, setIncomeTab] = useState<IncomeStatusTab>('pending');
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [expenseConfirmation, setExpenseConfirmation] = useState('');
  const canCreateExpense = permissions.includes('EXPENSE_CREATE');
  const canReadExpenses = read || permissions.includes('EXPENSE_HISTORY_READ');
  const canPay = permissions.includes('SALA_PAYMENT_MANAGE');
  const students = useQuery({ queryKey: ['sala', 'students'], enabled: canPay && view === 'income' && !personId && paymentRegistrationOpen, queryFn: async () => {
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
  const pendingStudents = (students.data ?? []).filter(student => !student.hasValidAccess);
  const paidStudents = (students.data ?? []).filter(student => student.hasValidAccess);
  const tabStudents = incomeTab === 'pending' ? pendingStudents : paidStudents;
  const results = tabStudents.filter(student => matchesStudentSearch(student, search));
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const methods = useQuery<Method[]>({ queryKey: ['finance', 'payment-methods'], queryFn: () => get('payment-methods'), enabled: view === 'summary' && (read || canCatalog) });
  const summaryIncome = useQuery<Movement[]>({ queryKey: ['finance', 'income', 'summary', summaryPeriod, summaryRange.from ?? null, summaryRange.to ?? null], queryFn: () => get(financialQuery('income', summaryRange, { area: 'SALA' })), enabled: view === 'summary' && read });
  const summaryExpenses = useQuery<Movement[]>({ queryKey: ['finance', 'expenses', 'summary', summaryPeriod, summaryRange.from ?? null, summaryRange.to ?? null], queryFn: () => get(financialQuery('expenses', summaryRange)), enabled: view === 'summary' && read });
  const income = useQuery<Movement[]>({ queryKey: ['finance', 'income', 'history', incomePeriod.period, incomePeriod.range.from ?? null, incomePeriod.range.to ?? null], queryFn: () => get(financialQuery('income', incomePeriod.range)), enabled: view === 'income' && !personId && read });
  const expenses = useQuery<Movement[]>({ queryKey: ['finance', 'expenses', 'history', expensePeriod.period, expensePeriod.range.from ?? null, expensePeriod.range.to ?? null], queryFn: () => get(financialQuery('expenses', expensePeriod.range)), enabled: view === 'expenses' && canReadExpenses });
  const incomePeople = uniqueOptions((income.data ?? []).flatMap(row => row.person ? [row.person] : []));
  const personResults = incomePersonSearch.trim() ? incomePeople.filter(person => matchesStudentSearch(person, incomePersonSearch)).slice(0, 10) : [];
  const incomeMethods = uniqueOptions((income.data ?? []).flatMap(row => row.paymentMethod ? [row.paymentMethod] : [])).sort(byName);
  const expenseCategories = uniqueOptions((expenses.data ?? []).flatMap(row => row.category ? [row.category] : [])).sort(byName);
  const expenseMethods = uniqueOptions((expenses.data ?? []).flatMap(row => row.paymentMethod ? [row.paymentMethod] : [])).sort(byName);
  const filteredIncome = (income.data ?? []).filter(row => (!selectedIncomePerson || row.person?.id === selectedIncomePerson.id) && (!incomeSource || row.source === incomeSource) && (!incomeMethod || row.paymentMethod?.id === incomeMethod));
  const filteredExpenses = (expenses.data ?? []).filter(row => (!expenseArea || row.area === expenseArea) && (!expenseCategory || row.category?.id === expenseCategory) && (!expenseMethod || row.paymentMethod?.id === expenseMethod));
  const incomeFilteredTotal = filteredIncome.reduce((total, row) => total + BigInt(row.amount), 0n);
  const expenseFilteredTotal = filteredExpenses.reduce((total, row) => total + BigInt(row.amount), 0n);
  const effectiveIncomePage = Math.min(incomePage, Math.max(1, Math.ceil(filteredIncome.length / LIST_PAGE_SIZE)));
  const effectiveExpensePage = Math.min(expensePage, Math.max(1, Math.ceil(filteredExpenses.length / LIST_PAGE_SIZE)));
  useEffect(() => { if (income.isSuccess) setIncomePage(effectiveIncomePage); }, [income.isSuccess, effectiveIncomePage]);
  useEffect(() => { if (expenses.isSuccess) setExpensePage(effectiveExpensePage); }, [expenses.isSuccess, effectiveExpensePage]);
  const incomeFilterCount = [selectedIncomePerson, incomeSource, incomeMethod].filter(Boolean).length;
  const expenseFilterCount = [expenseArea, expenseCategory, expenseMethod].filter(Boolean).length;

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
  const canUseFinance = permissions.some(permission => ['FINANCE_OPERATIONAL_READ', 'FINANCE_EXECUTIVE_READ', 'FINANCE_EXPORT', 'PAYMENT_METHOD_CATALOG_MANAGE', 'EXPENSE_CREATE', 'EXPENSE_HISTORY_READ', 'EXPENSE_MANAGE', 'EXPENSE_CATEGORY_CATALOG_MANAGE', 'EXCHANGE_RATE_MANAGE', 'CLINIC_INCOME_MANAGE'].includes(permission));
  if (session.isSuccess && !canUseFinance) return <WorkspaceShell active={active}><p>No tenés permisos para acceder a Finanzas.</p></WorkspaceShell>;
  const summaryReady = summaryIncome.isSuccess && summaryExpenses.isSuccess;
  return <WorkspaceShell active={active}><main className="mx-auto max-w-6xl space-y-6">
    <header><h1 className="text-3xl font-semibold">Finanzas</h1><p className="text-sm text-muted-foreground">{selectedPaymentContext ? "La vigencia y cada pago del alumno en un solo lugar." : "Operación económica · ARS"}</p>{selectedPaymentContext ? <Link className="mt-3 inline-block rounded border px-3 py-2 text-sm" href="/finance?view=income">Cambiar alumno</Link> : null}</header>
    {view === 'summary' ? <section aria-label="Período financiero" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Período financiero" className="flex flex-wrap gap-2">
          {([['current-month', 'Este mes'], ['previous-month', 'Mes anterior'], ['current-year', 'Este año'], ['all', 'Total'], ['custom', 'Personalizado']] as const).map(([period, label]) => <Button key={period} type="button" variant={summaryPeriod === period ? 'primary' : 'secondary'} aria-pressed={summaryPeriod === period} onClick={() => {
            setSummaryPeriod(period);
            if (period === 'custom' && !customInitialized) {
              const initialFrom = monthBounds(today.slice(0, 7)).from;
              setDraftFrom(initialFrom); setDraftTo(today);
              setAppliedCustomRange({ from: initialFrom, to: today });
              setCustomInitialized(true);
              setCustomError('');
            }
          }}>{label}</Button>)}
        </div>
        <p className="font-semibold">{summaryPeriodLabel}</p>
      </div>
      {summaryPeriod === 'custom' ? <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">Desde<input type="date" aria-label="Desde" value={draftFrom} max={draftTo || today} onChange={event => setDraftFrom(event.target.value)} className="mt-1 block h-10 rounded border px-3" /></label>
        <label className="block text-sm">Hasta<input type="date" aria-label="Hasta" value={draftTo} min={draftFrom || undefined} max={today} onChange={event => setDraftTo(event.target.value)} className="mt-1 block h-10 rounded border px-3" /></label>
        <Button type="button" onClick={() => {
          if (!draftFrom || !draftTo) { setCustomError('Completá las fechas Desde y Hasta.'); return; }
          if (draftFrom > draftTo) { setCustomError('La fecha Desde no puede ser posterior a Hasta.'); return; }
          if (draftTo > today) { setCustomError('La fecha Hasta no puede ser futura.'); return; }
          setAppliedCustomRange({ from: draftFrom, to: draftTo }); setCustomError('');
        }}>Aplicar</Button>
        {customError ? <p role="alert" className="text-sm text-destructive">{customError}</p> : null}
      </div> : null}
    </section> : null}
    {view === 'summary' && read ? <>
      {summaryIncome.isPending || summaryExpenses.isPending ? <p role="status">Cargando movimientos del período…</p> : null}
      {summaryIncome.isError || summaryExpenses.isError ? <p role="alert">No pudimos cargar los movimientos del período.</p> : null}
      {summaryReady ? <>
        <section aria-label="Indicadores financieros" className="grid gap-4 md:grid-cols-3">{([['Ingresos', incomeTotal], ['Gastos', expenseTotal], ...(executive ? [['Resultado', incomeTotal - expenseTotal] as const] : [])] as const).map(([label, amount]) => <article className="rounded border bg-surface p-4" key={label}><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{formatArs(amount.toString())}</p>{label !== 'Resultado' ? <Link className="mt-3 inline-block rounded border px-3 py-2 text-sm font-medium" href={label === 'Ingresos' ? '/finance?view=income' : '/finance?view=expenses'}>{label === 'Ingresos' ? 'Ver ingresos' : 'Ver gastos'}<span aria-hidden="true"> →</span></Link> : null}</article>)}</section>
        <section className="space-y-3 rounded border border-border bg-surface p-5"><h2 className="text-lg font-semibold">Movimientos por medio de pago</h2><div className="overflow-x-auto"><table aria-label="Movimientos por medio de pago" className="w-full text-sm"><thead><tr><th className="p-2 text-left">Medio de pago</th><th className="p-2 text-right">Ingresos</th><th className="p-2 text-right">Gastos</th>{executive ? <th className="p-2 text-right">Neto</th> : null}</tr></thead><tbody>{[...byMethod.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(row => <tr key={row.id} className="border-t border-border"><th scope="row" className="p-2 text-left font-medium">{row.name}</th><td className="p-2 text-right">{formatArs(row.income.toString())}</td><td className="p-2 text-right">{formatArs(row.expenses.toString())}</td>{executive ? <td className="p-2 text-right">{formatArs((row.income - row.expenses).toString())}</td> : null}</tr>)}</tbody></table></div></section>
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
    {view === 'income' && !personId ? <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">Ingresos</h2>
      {canPay ? <Button type="button" variant={paymentRegistrationOpen ? 'secondary' : 'primary'} aria-expanded={paymentRegistrationOpen} aria-controls="sala-payment-registration" onClick={() => {
        if (paymentRegistrationOpen) {
          setPaymentRegistrationOpen(false); setSearch(''); setIncomeTab('pending');
        } else {
          setPaymentRegistrationOpen(true);
        }
      }}>{paymentRegistrationOpen ? 'Cerrar' : '+ Registrar pago'}</Button> : null}
    </div> : null}
    {view === 'income' && canPay && !personId && paymentRegistrationOpen ? <section id="sala-payment-registration" className="space-y-3 rounded border bg-white p-5">
      <h2 className="text-xl font-semibold">Vigencia de Sala</h2>
      <div className="flex gap-4" aria-label="Estado de cuotas">
        <button type="button" aria-pressed={incomeTab === 'pending'} className={tabClass(incomeTab === 'pending')} onClick={() => setIncomeTab('pending')}>Sin vigencia {pendingStudents.length}</button>
        <button type="button" aria-pressed={incomeTab === 'paid'} className={tabClass(incomeTab === 'paid')} onClick={() => setIncomeTab('paid')}>Vigentes {paidStudents.length}</button>
      </div>
      <label className="block text-sm">Nombre, apellido o DNI<input type="search" value={search} onChange={event => setSearch(event.target.value)} className="mt-1 h-10 w-full rounded border px-3" /></label>
      {students.isSuccess ? <p className="text-sm text-muted-foreground">{results.length} {results.length === 1 ? 'alumno' : 'alumnos'}</p> : null}
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
          {activePlan ? <div className="border-border sm:border-l sm:pl-6"><p className="font-semibold">{activePlan.name}</p><p className="text-sm text-muted-foreground">Precio actual: {formatArs(activePlan.monthlyAmount)} / mes</p></div> : null}
        </div>
        {participations.isSuccess ? <SalaPaymentPanel key={`${personId}-${paymentAction}`} defaultOpen={paymentAction === 'renew'} personId={personId!} csrfToken={session.data?.csrfToken ?? ''} canRegister={permissions.includes('SALA_PAYMENT_REGISTER')} canSelectPlan={permissions.includes('SALA_PAYMENT_REGISTER')} canAdjust={permissions.includes('SALA_PAYMENT_MANAGE')} canReverse={permissions.includes('SALA_PAYMENT_MANAGE')} activePlan={activePlan}/> : null}
      </> : null}
    </section> : null}
    {view === 'income' && !personId && read ? <section aria-label="Filtros de ingresos" className="space-y-3">
      <HistoryPeriodControls state={incomePeriod} filtersOpen={incomeFiltersOpen} onToggleFilters={() => setIncomeFiltersOpen(!incomeFiltersOpen)} filterCount={incomeFilterCount} panelId="income-history-filters" />
      {incomeFiltersOpen ? <div id="income-history-filters" className="grid gap-3 rounded border bg-white p-3 md:grid-cols-3">
        <div className="text-sm">
          {selectedIncomePerson ? <><p>Persona</p><div className="mt-1 flex h-10 items-center justify-between gap-2 rounded border px-3"><span>{selectedIncomePerson.firstName} {selectedIncomePerson.lastName}</span><button type="button" aria-label="Quitar filtro de Persona" onClick={() => setSelectedIncomePerson(undefined)} className="rounded px-2 py-1 focus-visible:outline focus-visible:outline-2">×</button></div></> : <>
            <label className="block">Persona<input type="search" placeholder="Buscar por nombre, apellido o DNI..." value={incomePersonSearch} onChange={event => setIncomePersonSearch(event.target.value)} className="mt-1 block h-10 w-full rounded border px-3" /></label>
            {personResults.length ? <ul className="mt-1 rounded border">{personResults.map(person => <li key={person.id}><button type="button" aria-label={`${person.firstName} ${person.lastName}${person.dni ? ` DNI ${person.dni}` : ''}`} className="w-full px-3 py-2 text-left hover:bg-surface-muted focus-visible:outline focus-visible:outline-2" onClick={() => { setSelectedIncomePerson(person); setIncomePersonSearch(''); }}><span className="block font-medium">{person.firstName} {person.lastName}</span>{person.dni ? <span className="block text-muted-foreground">DNI {person.dni}</span> : null}</button></li>)}</ul> : null}
          </>}
        </div>
        <HistorySelect label="Origen" value={incomeSource} onChange={setIncomeSource} options={[{ id: 'SALA', name: 'Sala' }]} />
        <HistorySelect label="Medio de pago" value={incomeMethod} onChange={setIncomeMethod} options={incomeMethods} />
        {incomePeriod.changed || incomeFilterCount || incomePersonSearch ? <div className="md:col-span-3 md:text-right"><Button type="button" variant="secondary" onClick={() => { incomePeriod.reset(); setSelectedIncomePerson(undefined); setIncomePersonSearch(''); setIncomeSource(''); setIncomeMethod(''); }}>Limpiar filtros</Button></div> : null}
      </div> : null}
      {income.isSuccess ? <p className="text-sm text-muted-foreground">{filteredIncome.length} {filteredIncome.length === 1 ? 'ingreso' : 'ingresos'}</p> : null}
    </section> : null}
    {view === 'income' && !personId && income.isError ? <p role="alert">No se pudieron cargar los ingresos para este contexto.</p> : null}
    {view === 'income' && !personId && read ? <Data title="Historial de ingresos" value={filteredIncome} total={incomeFilteredTotal} page={effectiveIncomePage} onPage={setIncomePage} showRegisteredBy /> : null}
    {view === 'expenses' ? <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Gastos</h2>
        {canCreateExpense ? <Button type="button" variant={expenseFormOpen ? 'secondary' : 'primary'} aria-expanded={expenseFormOpen} aria-controls="expense-registration-form" onClick={() => { setExpenseFormOpen(!expenseFormOpen); setExpenseConfirmation(''); }}>{expenseFormOpen ? 'Cerrar formulario' : '+ Registrar gasto'}</Button> : null}
      </div>
      {expenseFormOpen && canCreateExpense ? <div id="expense-registration-form"><ExpenseRegistration csrfToken={session.data?.csrfToken ?? ''} canManageCategories={permissions.includes('EXPENSE_CATEGORY_CATALOG_MANAGE')} onRegistered={() => { setExpenseFormOpen(false); setExpenseConfirmation('Gasto registrado correctamente.'); }} /></div> : null}
      {expenseConfirmation ? <p role="status" className="text-sm text-emerald-700">{expenseConfirmation}</p> : null}
      {canReadExpenses ? <section aria-label="Filtros de gastos" className="space-y-3">
        <HistoryPeriodControls state={expensePeriod} filtersOpen={expenseFiltersOpen} onToggleFilters={() => setExpenseFiltersOpen(!expenseFiltersOpen)} filterCount={expenseFilterCount} panelId="expense-history-filters" />
        {expenseFiltersOpen ? <div id="expense-history-filters" className="grid gap-3 rounded border bg-white p-3 md:grid-cols-3">
          <HistorySelect label="Área" allLabel="Todas" value={expenseArea} onChange={setExpenseArea} options={[{ id: 'SALA', name: 'Sala' }, { id: 'GENERAL', name: 'General' }]} />
          <HistorySelect label="Categoría" allLabel="Todas" value={expenseCategory} onChange={setExpenseCategory} options={expenseCategories} />
          <HistorySelect label="Medio de pago" value={expenseMethod} onChange={setExpenseMethod} options={expenseMethods} />
          {expensePeriod.changed || expenseFilterCount ? <div className="md:col-span-3 md:text-right"><Button type="button" variant="secondary" onClick={() => { expensePeriod.reset(); setExpenseArea(''); setExpenseCategory(''); setExpenseMethod(''); }}>Limpiar filtros</Button></div> : null}
        </div> : null}
        {expenses.isSuccess ? <p className="text-sm text-muted-foreground">{filteredExpenses.length} {filteredExpenses.length === 1 ? 'gasto' : 'gastos'}</p> : null}
      </section> : null}
      {canReadExpenses && expenses.isError ? <p role="alert">No se pudieron cargar los gastos.</p> : null}
      {canReadExpenses ? <Data title="Registros de gastos" value={filteredExpenses} total={expenseFilteredTotal} page={effectiveExpensePage} onPage={setExpensePage} /> : null}
    </> : null}
  </main></WorkspaceShell>;
}

const periods = [['current-month', 'Este mes'], ['previous-month', 'Mes anterior'], ['current-year', 'Este año'], ['all', 'Total'], ['custom', 'Personalizado']] as const;

function useHistoryPeriod(today: string) {
  const [period, setPeriod] = useState<Period>('current-month');
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [appliedCustomRange, setAppliedCustomRange] = useState<DateRange | null>(null);
  const [customError, setCustomError] = useState('');
  return {
    period, draftFrom, draftTo, customError, today, setDraftFrom, setDraftTo,
    range: resolvePeriodRange(period, today, appliedCustomRange),
    changed: period !== 'current-month' || Boolean(draftFrom || draftTo || appliedCustomRange || customError),
    select(next: Period) {
      setPeriod(next);
      if (next === 'custom' && !appliedCustomRange) {
        const initial = { from: monthBounds(today.slice(0, 7)).from, to: today };
        setDraftFrom(initial.from); setDraftTo(initial.to); setAppliedCustomRange(initial); setCustomError('');
      }
    },
    apply() {
      if (!draftFrom || !draftTo) { setCustomError('Completá las fechas Desde y Hasta.'); return; }
      if (draftFrom > draftTo) { setCustomError('La fecha Desde no puede ser posterior a Hasta.'); return; }
      if (draftTo > today) { setCustomError('La fecha Hasta no puede ser futura.'); return; }
      setAppliedCustomRange({ from: draftFrom, to: draftTo }); setCustomError('');
    },
    reset() {
      setPeriod('current-month'); setDraftFrom(''); setDraftTo(''); setAppliedCustomRange(null); setCustomError('');
    },
  };
}

function HistoryPeriodControls({ state, filtersOpen, onToggleFilters, filterCount, panelId }: {
  state: ReturnType<typeof useHistoryPeriod>; filtersOpen: boolean; onToggleFilters: () => void; filterCount: number; panelId: string;
}): React.JSX.Element {
  return <>
    <div className="flex flex-wrap items-center gap-2">
      {periods.map(([period, label]) => <Button key={period} type="button" variant={state.period === period ? 'primary' : 'secondary'} aria-pressed={state.period === period} onClick={() => state.select(period)}>{label}</Button>)}
      <Button type="button" variant="secondary" aria-expanded={filtersOpen} aria-controls={panelId} onClick={onToggleFilters}>Filtros{filterCount ? ` (${filterCount})` : ''}<span aria-hidden="true" className="ml-2">{filtersOpen ? '▴' : '▾'}</span></Button>
    </div>
    {state.period === 'custom' ? <div className="flex flex-wrap items-end gap-2">
      <label className="block text-sm">Desde<input type="date" value={state.draftFrom} max={state.draftTo || state.today} onChange={event => state.setDraftFrom(event.target.value)} className="mt-1 block h-10 rounded border px-3" /></label>
      <label className="block text-sm">Hasta<input type="date" value={state.draftTo} min={state.draftFrom || undefined} max={state.today} onChange={event => state.setDraftTo(event.target.value)} className="mt-1 block h-10 rounded border px-3" /></label>
      <Button type="button" onClick={state.apply}>Aplicar</Button>
      {state.customError ? <p role="alert" className="text-sm text-destructive">{state.customError}</p> : null}
    </div> : null}
  </>;
}

function uniqueOptions<T extends { id: string }>(options: T[]): T[] {
  return [...new Map(options.map(option => [option.id, option])).values()];
}
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'es');

function HistorySelect({ label, allLabel = 'Todos', value, onChange, options }: {
  label: string; allLabel?: string; value: string; onChange: (value: string) => void; options: { id: string; name: string }[];
}): React.JSX.Element {
  return <label className="block text-sm">{label}<select value={value} onChange={event => onChange(event.target.value)} className="mt-1 block h-10 w-full rounded border bg-white px-3">
    <option value="">{allLabel}</option>
    {value && !options.some(option => option.id === value) ? <option value={value}>Selección fuera del período</option> : null}
    {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
  </select></label>;
}

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
  const title = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`));
  return title.charAt(0).toUpperCase() + title.slice(1);
}
function resolvePeriodRange(period: Period, today: string, appliedCustomRange: DateRange | null): DateRange {
  if (period === 'all') return {};
  if (period === 'current-year') return { from: `${today.slice(0, 4)}-01-01`, to: today };
  if (period === 'custom') return appliedCustomRange ?? {};
  const month = period === 'previous-month' ? shiftMonth(today.slice(0, 7), -1) : today.slice(0, 7);
  return monthBounds(month);
}
function financialQuery(path: string, range: DateRange, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value);
  const query = params.toString();
  return `${path}${query ? `?${query}` : ''}`;
}
function summaryLabel(period: Period, today: string, range: DateRange): string {
  if (period === 'all') return 'Todo el historial';
  if (period === 'current-year') return today.slice(0, 4);
  if (period === 'custom') return range.from && range.to ? `${formatDate(range.from)} — ${formatDate(range.to)}` : 'Rango personalizado';
  return monthTitle(period === 'previous-month' ? shiftMonth(today.slice(0, 7), -1) : today.slice(0, 7));
}

const tabClass = (active: boolean) => `border-b-2 px-1 py-2 text-sm ${active ? 'border-primary font-semibold' : 'border-transparent text-muted-foreground'}`;

function PaymentMethods({ methods, canCatalog, name, editing, message, onName, onSave, onEdit, onRetire, onCancelEdit }: {
  methods: Method[]; canCatalog: boolean; name: string; editing: string | null; message: string;
  onName: (value: string) => void; onSave: (event: React.FormEvent) => void; onEdit: (method: Method) => void; onRetire: (method: Method) => void; onCancelEdit: () => void;
}): React.JSX.Element {
  return <section className="rounded border bg-white p-5"><h2 className="font-semibold">Medios de pago</h2>{methods.map((method) => <div className="flex items-center justify-between border-b py-2 text-sm" key={method.id}><span>{method.name}</span><span className="flex items-center gap-3"><span>{method.isSelectable ? 'Disponible' : 'Retirado'}</span>{canCatalog && <>{method.isSelectable && <button className="underline" onClick={() => onEdit(method)}>Editar</button>}{method.isSelectable && <button className="underline" onClick={() => onRetire(method)}>Retirar</button>}</>}</span></div>)}{canCatalog && <form className="mt-4 flex gap-2" onSubmit={onSave}><input aria-label="Nombre del medio de pago" required value={name} onChange={(event) => onName(event.target.value)} className="h-10 flex-1 rounded border px-3" placeholder={editing ? 'Editar medio de pago' : 'Nuevo medio de pago'} /><button className="rounded bg-[#FCCC05] px-3 py-2 text-sm text-black">{editing ? 'Guardar' : 'Crear'}</button>{editing && <button type="button" className="rounded border px-3" onClick={onCancelEdit}>Cancelar</button>}</form>}{message && <p role="status" className="mt-2 text-sm">{message}</p>}</section>;
}

type Movement = { id: string; cashDate: string; source?: string; area?: string; amount: string; person?: { id: string; firstName: string; lastName: string; dni?: string }; category?: { id: string; name: string }; paymentMethod?: { id: string; name: string }; description?: string | null; registeredBy?: { id: string; firstName: string; lastName: string } };
const areaLabel = (area?: string) => ({ SALA: 'Sala', GENERAL: 'General', CLINIC: 'Clínica' })[area ?? ''] ?? area;
const formatDate = (value: string) => value.slice(0, 10).split('-').reverse().join('/');

function Data({ title, value, total, page, onPage, showRegisteredBy = false }: {
  title: string; value: Movement[]; total: bigint; page: number; onPage: (page: number) => void; showRegisteredBy?: boolean;
}): React.JSX.Element {
  const rows = value.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE);
  const columns = showRegisteredBy ? 'lg:grid-cols-[1fr_2fr_1fr_1fr_2fr_1fr]' : 'lg:grid-cols-[1fr_2fr_1fr_1fr_1fr]';
  const headers = showRegisteredBy ? ['Fecha', 'Persona', 'Origen', 'Medio de pago', 'Registrado por', 'Importe'] : ['Fecha', 'Categoría', 'Área', 'Medio de pago', 'Importe'];
  return <section aria-label={title} className="rounded border bg-white p-5">
    <h2 className="font-semibold">{title}</h2>
    <div role="table" aria-label={title} className="mt-3">
      <div role="row" className={`hidden gap-2 bg-surface-muted py-3 text-sm font-semibold text-foreground lg:grid ${columns}`}>
        {headers.map((label, index) => <span role="columnheader" key={label} className={index === headers.length - 1 ? 'text-right' : ''}>{label}</span>)}
      </div>
      {rows.map(row => <div role="row" className={`grid gap-2 border-b py-3 text-sm sm:grid-cols-2 ${columns}`} key={`${row.source ?? row.area}-${row.id}`}>
        <span role="cell"><time dateTime={row.cashDate.slice(0, 10)}>{formatDate(row.cashDate)}</time></span>
        <span role="cell" className="min-w-0 break-words font-medium">{showRegisteredBy && row.source === 'SALA' && row.person?.id ? <Link href={`/finance?view=income&personId=${row.person.id}`} className="underline">{row.person.firstName} {row.person.lastName}</Link> : row.person ? `${row.person.firstName} ${row.person.lastName}` : row.category?.name}</span>
        <span role="cell">{areaLabel(row.source ?? row.area)}</span><span role="cell">{row.paymentMethod?.name}</span>
        {showRegisteredBy ? <span role="cell" className="min-w-0 break-words"><span className="lg:hidden">Registrado por: </span>{row.registeredBy ? `${row.registeredBy.firstName} ${row.registeredBy.lastName}` : '—'}</span> : null}
        <strong role="cell" className="tabular-nums lg:text-right">{formatArs(row.amount)}</strong>
        {row.description ? <p role="cell" className={`text-muted-foreground sm:col-span-2 ${showRegisteredBy ? 'lg:col-span-6' : 'lg:col-span-5'}`}>{row.description}</p> : null}
      </div>)}
    </div>
    {!value.length ? <p className="mt-3 text-sm text-muted-foreground">No hay registros.</p> : <>
      <p aria-label="Total filtrado" className="flex justify-end gap-6 border-b py-3 text-sm font-semibold tabular-nums"><span>Total</span><span>{formatArs(total)}</span></p>
      <ListPagination total={value.length} page={page} onPage={onPage} />
    </>}
  </section>;
}

function matchesStudentSearch(student: { firstName: string; lastName: string; dni?: string }, search: string): boolean {
  const term = search.trim().toLocaleLowerCase('es');
  const dniDigits = term.replace(/\D/g, '');
  return !term || `${student.firstName} ${student.lastName}`.toLocaleLowerCase('es').includes(term)
    || Boolean(dniDigits && /^[\d\s.-]+$/.test(term) && student.dni?.replace(/\D/g, '').includes(dniDigits));
}
