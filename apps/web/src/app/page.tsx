'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardList, Dumbbell, Users, UserX, Wallet } from 'lucide-react';
import { getSalaDashboard } from '@athleta/api-client';
import { WorkspaceShell } from '../features/auth/workspace-shell';
import { currentSession } from '../features/auth/auth';
import { todayOperational } from '../features/sala/student-onboarding';

function ProfessorHome({ firstName }: { firstName: string }): React.JSX.Element {
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const today = todayOperational();
  const next = new Date(`${today}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const date = day === 'today' ? today : next.toISOString().slice(0, 10);
  const dashboard = useQuery({
    queryKey: ['sala-dashboard', date],
    queryFn: async () => {
      const response = await getSalaDashboard({ date }, { credentials: 'include' });
      if (response.status !== 200) throw new Error('Dashboard request failed');
      return response.data.data;
    },
  });
  const data = dashboard.data;
  const metrics = [
    { label: 'Alumnos esperados', value: data?.expected, icon: Users },
    { label: 'Asistencias', value: data?.attended, icon: CheckCircle2 },
    { label: 'Cancelados / Ausentes', value: data?.cancelledOrAbsent, icon: UserX },
  ];
  const followUp = [
    { label: 'Sin rutina activa', href: '/students?filter=without-routine', value: data?.withoutRoutine.count, icon: ClipboardList },
    { label: 'Pago pendiente', href: '/students?filter=pending-payment', value: data?.pendingPayment.count, icon: Wallet },
  ];
  return <div className="mx-auto w-full max-w-6xl space-y-6 text-foreground">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-1 text-sm font-medium text-muted-foreground">Inicio</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Hola, {firstName}</h1><p className="mt-2 text-sm text-muted-foreground">Resumen de la actividad de Sala</p></div>
      <div aria-label="Día de actividad" className="inline-flex gap-1 rounded-md border border-border bg-surface p-1">
        {(['today', 'tomorrow'] as const).map((value) => <button key={value} type="button" aria-pressed={day === value} onClick={() => setDay(value)} className={`min-h-10 rounded-md px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary ${day === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-surface-muted'}`}>{value === 'today' ? 'Hoy' : 'Mañana'}</button>)}
      </div>
    </header>
    {dashboard.isError ? <p role="alert" className="rounded-md border border-border bg-surface p-5 text-sm">No pudimos cargar el resumen de Sala.</p> : <div aria-busy={dashboard.isPending} className="space-y-6">
      <section aria-labelledby="upcoming-title" className="rounded-md border border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border p-4 sm:p-5"><CalendarClock size={20} aria-hidden="true" className="text-muted-foreground"/><h2 id="upcoming-title" className="text-lg font-semibold">Próximos horarios</h2></div>
        <div className="p-4 sm:p-5">
          {dashboard.isPending ? <p role="status" className="py-6 text-sm text-muted-foreground">Cargando resumen de Sala…</p> : !data?.upcoming.length ? <p className="py-6 text-sm text-muted-foreground">No hay alumnos previstos para los próximos horarios.</p> : <div className="grid gap-4 md:grid-cols-3">
            {data.upcoming.map((slot) => <article key={slot.startTime} className="min-w-0 rounded-md border border-border p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="text-xl font-semibold tabular-nums">{slot.startTime}</h3><span className="text-sm text-muted-foreground">{slot.total} {slot.total === 1 ? 'alumno' : 'alumnos'}</span></div>
              <ul className="space-y-3">{slot.people.map((person, index) => <li key={`${person.id}-${person.origin}-${index}`} className="min-w-0"><Link href={`/reservations?${new URLSearchParams({ date, personId: person.id, startTime: slot.startTime, origin: person.origin })}`} className="flex min-h-11 items-center justify-between gap-3 rounded-md p-2 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="min-w-0"><span className="block truncate text-sm font-medium">{person.firstName} {person.lastName}</span><span className="mt-0.5 block text-xs text-muted-foreground">{person.origin === 'FIXED' ? 'Turno fijo' : 'Reserva'}</span></span><span className="shrink-0 text-xs font-medium">Gestionar <span aria-hidden="true">→</span></span></Link></li>)}</ul>
              {slot.total > slot.people.length && <p className="mt-3 text-sm text-muted-foreground">+ {slot.total - slot.people.length} alumnos</p>}
            </article>)}
          </div>}
        </div>
        <div className="flex justify-end border-t border-border px-4 py-2 sm:px-5"><Link href={`/reservations?date=${date}`} className="inline-flex min-h-10 items-center gap-2 text-sm font-medium hover:underline">Ver Reservas <ArrowRight size={16} aria-hidden="true"/></Link></div>
      </section>
      <section aria-labelledby="summary-title"><h2 id="summary-title" className="mb-3 text-lg font-semibold">Resumen del día</h2><div className="grid gap-3 sm:grid-cols-3">{metrics.map(({ label, value, icon: Icon }) => <div key={label} className="min-w-0 rounded-md border border-border bg-surface p-4 sm:p-5"><div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><Icon size={17} aria-hidden="true"/><span>{label}</span></div><p className="text-3xl font-semibold tabular-nums">{value ?? '—'}</p></div>)}</div></section>
      <section aria-labelledby="followup-title"><h2 id="followup-title" className="mb-3 text-lg font-semibold">Seguimiento</h2><div className="grid gap-3 sm:grid-cols-2">{followUp.map(({ label, href, value, icon: Icon }) => <Link key={label} href={href} className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-surface p-4 hover:bg-surface-muted sm:p-5"><span className="rounded-md bg-primary/15 p-2"><Icon size={18} aria-hidden="true"/></span><span className="min-w-0 flex-1 text-sm font-medium">{label}</span><span className="text-2xl font-semibold tabular-nums">{value ?? '—'}</span><ArrowRight size={16} aria-hidden="true" className="text-muted-foreground"/></Link>)}</div></section>
    </div>}
  </div>;
}

type FinanceTotals = { salaIncome: string; clinicalIncome: string; totalIncome: string; expenses: string; net: string };
function monthStart(date: string): string { return `${date.slice(0, 7)}-01`; }
function formatArs(value?: string): string {
  if (value === undefined) return '—';
  try { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(BigInt(value)); }
  catch { return `ARS ${value}`; }
}
async function getExecutiveTotals(from: string, to: string): Promise<FinanceTotals> {
  const params = new URLSearchParams({ from, to });
  const response = await fetch(`/api/finance/executive-totals?${params.toString()}`, { credentials: 'include' });
  if (!response.ok) throw new Error('Finance request failed');
  const body = await response.json() as { data?: FinanceTotals | { data?: FinanceTotals } };
  const result = body.data;
  if (result && 'totalIncome' in result) return result;
  if (result?.data) return result.data;
  throw new Error('Finance response invalid');
}

function GeneralAdminHome({ firstName }: { firstName: string }): React.JSX.Element {
  const date = todayOperational();
  const from = monthStart(date);
  const sala = useQuery({ queryKey: ['sala-dashboard', date], queryFn: async () => {
    const response = await getSalaDashboard({ date }, { credentials: 'include' });
    if (response.status !== 200) throw new Error('Sala request failed');
    return response.data.data;
  } });
  const finance = useQuery({ queryKey: ['finance', 'executive-totals', from, date], queryFn: () => getExecutiveTotals(from, date) });
  return <div className="mx-auto w-full max-w-6xl space-y-6 text-foreground">
    <header><p className="mb-1 text-sm font-medium text-muted-foreground">Resumen general de Athleta</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Hola, {firstName}</h1></header>
    <section aria-labelledby="today-operation-title"><h2 id="today-operation-title" className="mb-3 text-lg font-semibold">Operación de hoy</h2><div className="grid gap-4">
      <article className="rounded-md border border-border bg-surface p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold">Sala</h3><p className="mt-1 text-sm text-muted-foreground">Actividad del día</p></div><Dumbbell size={20} aria-hidden="true" className="text-muted-foreground"/></div>{sala.isError ? <p role="alert" className="mt-4 text-sm text-muted-foreground">No pudimos cargar la actividad de Sala.</p> : <div aria-busy={sala.isPending} className="mt-4 grid grid-cols-3 gap-2">{[['Alumnos esperados', sala.data?.expected], ['Asistencias', sala.data?.attended], ['Cancelados / Ausentes', sala.data?.cancelledOrAbsent]].map(([label, value]) => <div key={String(label)} className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{sala.isPending ? '…' : value}</p></div>)}</div>}<Link href="/sala" className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-medium hover:underline">Ver Agenda <ArrowRight size={16} aria-hidden="true"/></Link></article>
    </div></section>
    <section aria-labelledby="followup-title"><h2 id="followup-title" className="mb-3 text-lg font-semibold">Seguimiento</h2><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-md border border-border bg-surface p-4"><p className="text-sm text-muted-foreground">Sin rutina activa</p>{sala.isError ? <p role="alert" className="mt-2 text-sm text-muted-foreground">No pudimos cargar la actividad de Sala.</p> : <p className="mt-2 text-2xl font-semibold tabular-nums">{sala.isPending ? '…' : sala.data.withoutRoutine.count}</p>}</div><div className="rounded-md border border-border bg-surface p-4"><p className="text-sm text-muted-foreground">Pago pendiente</p>{sala.isError ? <p role="alert" className="mt-2 text-sm text-muted-foreground">No pudimos cargar la actividad de Sala.</p> : <p className="mt-2 text-2xl font-semibold tabular-nums">{sala.isPending ? '…' : sala.data.pendingPayment.count}</p>}</div></div><Link href="/students" className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-medium hover:underline">Ver alumnos de Sala <ArrowRight size={16} aria-hidden="true"/></Link></section>
    <section aria-labelledby="finance-title" className="rounded-md border border-border bg-surface p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="finance-title" className="text-lg font-semibold">Finanzas del mes</h2><p className="mt-1 text-sm text-muted-foreground">Del {from} al {date}</p></div><Wallet size={20} aria-hidden="true" className="text-muted-foreground"/></div>{finance.isError ? <p role="alert" className="mt-4 text-sm text-muted-foreground">No pudimos cargar el resumen financiero.</p> : <div aria-busy={finance.isPending} className="mt-4 grid gap-3 sm:grid-cols-3">{[['Ingresos', finance.data?.totalIncome], ['Gastos', finance.data?.expenses], ['Resultado', finance.data?.net]].map(([label, value]) => <div key={String(label)} className="rounded-md border border-border p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{finance.isPending ? '…' : formatArs(value as string | undefined)}</p></div>)}</div>}<Link href="/finance" className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-medium hover:underline">Ver Finanzas <ArrowRight size={16} aria-hidden="true"/></Link></section>
  </div>;
}

function AdministrativeHome({ firstName }: { firstName: string }): React.JSX.Element {
  const date = todayOperational();
  const sala = useQuery({
    queryKey: ['sala-dashboard', date],
    queryFn: async () => {
      const response = await getSalaDashboard({ date }, { credentials: 'include' });
      if (response.status !== 200) throw new Error('Sala request failed');
      return response.data.data;
    },
  });
  const followUp = [
    { label: 'Sin rutina activa', href: '/students?filter=without-routine', value: sala.data?.withoutRoutine.count, icon: ClipboardList },
    { label: 'Pago pendiente', href: '/students?filter=pending-payment', value: sala.data?.pendingPayment.count, icon: Wallet },
  ];
  const shortcuts = [
    { label: 'Alumnos', href: '/students', description: 'Seguimiento de Sala', icon: Dumbbell },
    { label: 'Personas', href: '/people', description: 'Datos generales', icon: Users },
    { label: 'Ingresos / Pagos', href: '/finance?view=income', description: 'Pagos de Sala e ingresos', icon: Wallet },
    { label: 'Gastos', href: '/finance?view=expenses', description: 'Gestión de gastos', icon: ClipboardList },
  ];
  return <div className="mx-auto w-full max-w-6xl space-y-6 text-foreground">
    <header><p className="mb-1 text-sm font-medium text-muted-foreground">Inicio</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Hola, {firstName}</h1><p className="mt-2 text-sm text-muted-foreground">Operación administrativa de hoy</p></header>
    <section aria-labelledby="today-operation-title"><h2 id="today-operation-title" className="mb-3 text-lg font-semibold">Operación de hoy</h2><div className="grid gap-4">
      <article className="rounded-md border border-border bg-surface p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold">Sala</h3><p className="mt-1 text-sm text-muted-foreground">Actividad del día</p></div><Dumbbell size={20} aria-hidden="true" className="text-muted-foreground"/></div>{sala.isError ? <p role="alert" className="mt-4 text-sm text-muted-foreground">No pudimos cargar la actividad de Sala.</p> : <div aria-busy={sala.isPending} className="mt-4 grid grid-cols-3 gap-2">{[['Alumnos esperados', sala.data?.expected], ['Asistencias', sala.data?.attended], ['Cancelados / Ausentes', sala.data?.cancelledOrAbsent]].map(([label, value]) => <div key={String(label)} className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{sala.isPending ? '…' : value}</p></div>)}</div>}<Link href="/sala" className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-medium hover:underline">Ver Agenda <ArrowRight size={16} aria-hidden="true"/></Link></article>
    </div></section>
    <section aria-labelledby="followup-title">
      <h2 id="followup-title" className="mb-3 text-lg font-semibold">Seguimiento</h2>
      {sala.isError && <p role="alert" className="mb-3 text-sm text-muted-foreground">No pudimos cargar la actividad de Sala.</p>}
      <div aria-busy={sala.isPending} className="grid gap-3 sm:grid-cols-2">
        {followUp.map(({ label, href, value, icon: Icon }) => <Link key={label} href={href} className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-surface p-4 hover:bg-surface-muted sm:p-5">
          <span className="rounded-md bg-primary/15 p-2"><Icon size={18} aria-hidden="true"/></span>
          <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
          <span className="text-2xl font-semibold tabular-nums">{sala.isPending ? '…' : sala.isError ? '—' : value}</span>
          <ArrowRight size={16} aria-hidden="true" className="text-muted-foreground"/>
        </Link>)}
      </div>
    </section>
    <section aria-labelledby="shortcuts-title">
      <h2 id="shortcuts-title" className="mb-3 text-lg font-semibold">Accesos operativos</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {shortcuts.map(({ label, href, description, icon: Icon }) => <Link key={label} href={href} className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-surface p-4 hover:bg-surface-muted">
          <Icon size={20} aria-hidden="true" className="shrink-0 text-muted-foreground"/>
          <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{description}</span></span>
          <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-muted-foreground"/>
        </Link>)}
      </div>
    </section>
  </div>;
}

export default function HomePage(): React.JSX.Element {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const isProfessorOnly = session.data?.roles.length === 1 && session.data.roles.includes('PROFESSOR');
  const isAdministrative = session.data?.roles.includes('ADMINISTRATIVE') ?? false;
  const isGeneralAdmin = session.data?.roles.includes('GENERAL_ADMIN') ?? false;
  return <WorkspaceShell active="home">{session.isPending ? <p role="status" className="text-sm text-muted-foreground">Cargando…</p> : isGeneralAdmin ? <GeneralAdminHome firstName={session.data!.user.firstName}/> : isAdministrative ? <AdministrativeHome firstName={session.data!.user.firstName}/> : isProfessorOnly ? <ProfessorHome firstName={session.data!.user.firstName}/> : <><header className="mb-6 sm:mb-8"><p className="mb-1 text-sm font-medium text-muted-foreground">Resumen operativo</p><h1 className="m-0 text-2xl font-semibold tracking-tight sm:text-3xl">Bienvenido a Athleta</h1></header><div className="w-full max-w-3xl rounded-md border bg-surface p-4 sm:p-6"><h2 className="mt-0 text-lg font-semibold">Workspace operativo</h2><p className="mb-0 text-sm leading-6 text-muted-foreground">Gestioná Personas desde la navegación principal.</p></div></>}</WorkspaceShell>;
}
