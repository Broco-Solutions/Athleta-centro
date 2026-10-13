'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardList, Users, UserX, Wallet } from 'lucide-react';
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
    { label: 'Sin rutina activa', value: data?.withoutRoutine.count, icon: ClipboardList },
    { label: 'Pago pendiente', value: data?.pendingPayment.count, icon: Wallet },
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
              <ul className="space-y-3">{slot.people.map((person, index) => <li key={`${person.id}-${person.origin}-${index}`} className="min-w-0"><p className="truncate text-sm font-medium">{person.firstName} {person.lastName}</p><p className="mt-0.5 text-xs text-muted-foreground">{person.origin === 'FIXED' ? 'Turno fijo' : 'Reserva'}</p></li>)}</ul>
              {slot.total > slot.people.length && <p className="mt-3 text-sm text-muted-foreground">+ {slot.total - slot.people.length} alumnos</p>}
            </article>)}
          </div>}
        </div>
        <div className="flex justify-end border-t border-border px-4 py-2 sm:px-5"><Link href="/reservations" className="inline-flex min-h-10 items-center gap-2 text-sm font-medium hover:underline">Ver Reservas <ArrowRight size={16} aria-hidden="true"/></Link></div>
      </section>
      <section aria-labelledby="summary-title"><h2 id="summary-title" className="mb-3 text-lg font-semibold">Resumen del día</h2><div className="grid gap-3 sm:grid-cols-3">{metrics.map(({ label, value, icon: Icon }) => <div key={label} className="min-w-0 rounded-md border border-border bg-surface p-4 sm:p-5"><div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><Icon size={17} aria-hidden="true"/><span>{label}</span></div><p className="text-3xl font-semibold tabular-nums">{value ?? '—'}</p></div>)}</div></section>
      <section aria-labelledby="followup-title"><h2 id="followup-title" className="mb-3 text-lg font-semibold">Seguimiento</h2><div className="grid gap-3 sm:grid-cols-2">{followUp.map(({ label, value, icon: Icon }) => <Link key={label} href="/sala?view=students" className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-surface p-4 hover:bg-surface-muted sm:p-5"><span className="rounded-md bg-primary/15 p-2"><Icon size={18} aria-hidden="true"/></span><span className="min-w-0 flex-1 text-sm font-medium">{label}</span><span className="text-2xl font-semibold tabular-nums">{value ?? '—'}</span><ArrowRight size={16} aria-hidden="true" className="text-muted-foreground"/></Link>)}</div></section>
    </div>}
  </div>;
}

export default function HomePage(): React.JSX.Element {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const isProfessorOnly = session.data?.roles.length === 1 && session.data.roles.includes('PROFESSOR');
  return <WorkspaceShell active="Inicio">{session.isPending ? <p role="status" className="text-sm text-muted-foreground">Cargando…</p> : isProfessorOnly ? <ProfessorHome firstName={session.data!.user.firstName}/> : <><header className="mb-6 sm:mb-8"><p className="mb-1 text-sm font-medium text-muted-foreground">Resumen operativo</p><h1 className="m-0 text-2xl font-semibold tracking-tight sm:text-3xl">Bienvenido a Athleta</h1></header><div className="w-full max-w-3xl rounded-md border bg-surface p-4 sm:p-6"><h2 className="mt-0 text-lg font-semibold">Workspace operativo</h2><p className="mb-0 text-sm leading-6 text-muted-foreground">Gestioná Personas desde la navegación principal.</p></div></>}</WorkspaceShell>;
}
