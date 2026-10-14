'use client';
import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { listPeople } from '@athleta/api-client';
import { WorkspaceShell } from '../../features/auth/workspace-shell';
import { currentSession } from '../../features/auth/auth';
import { SalaNavigation } from '../../features/sala/sala-navigation';
import { AgendaPanel } from '../../features/sala/agenda-panel';
import { SalaReservationsAgenda } from '../../features/reservations/sala-reservations-agenda';
type Person = { id: string; firstName: string; lastName: string; dni: string; status?: string; hasSalaParticipation?: boolean; contexts?: string[] };
const unwrap = <T,>(value: unknown): T[] => { const body = (value as { data?: unknown }).data; if (Array.isArray(body)) return body as T[]; const nested = (body as { data?: unknown } | undefined)?.data; return Array.isArray(nested) ? nested as T[] : []; };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
function SalaPageContent(): React.JSX.Element {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false }); const [date, setDate] = useState(today); const view = useSearchParams()?.get('view') === 'students' ? 'students' : 'agenda';
  const isProfessorOnly = session.data?.roles.length === 1 && session.data.roles.includes('PROFESSOR');
  const hasAdministrativeNavigation = session.data?.roles.some((role) => role === 'ADMINISTRATIVE' || role === 'GENERAL_ADMIN') ?? false;
  const router = useRouter();
  useEffect(() => { if (view === 'students') router.replace('/students'); else if (isProfessorOnly) router.replace('/reservations'); }, [isProfessorOnly, router, view]);
  const people = useQuery({ queryKey: ['people', 'sala-students'], queryFn: async () => unwrap<Person>(await listPeople({ page: 1, pageSize: 100 }, { credentials: 'include' })), initialData: [], enabled: session.isSuccess && !isProfessorOnly });
  if (session.isPending || isProfessorOnly || view === 'students') return <main className="p-6" role="status">Cargando…</main>;
  const pageActive = 'sala-agenda';
  return <WorkspaceShell active={pageActive}><div className="mx-auto max-w-7xl space-y-5"><header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-muted-foreground">Módulo global</p><h1 className="text-3xl font-semibold">Sala</h1><p className="mt-1 text-sm text-muted-foreground">Operación diaria y personas con participación activa.</p></div><Link href="/people" className="text-sm font-medium underline">Ver Personas</Link></header>{!hasAdministrativeNavigation ? <SalaNavigation active={view}/> : null}{hasAdministrativeNavigation ? <SalaReservationsAgenda csrfToken={session.data?.csrfToken ?? ''} isProfessorOnly={false} canManageAgenda={session.data?.permissions.includes('SALA_AGENDA_MANAGE') ?? false} canManageParticipation={session.data?.permissions.includes('SALA_PARTICIPATION_MANAGE') ?? false} canCreatePerson={session.data?.permissions.includes('PEOPLE_CREATE') ?? false} title="Agenda" description="Turnos fijos, reservas puntuales e incorporaciones espontáneas de Sala." /> : <AgendaPanel canManageAgenda={session.data?.permissions.includes('SALA_AGENDA_MANAGE') ?? false} canManageParticipation={session.data?.permissions.includes('SALA_PARTICIPATION_MANAGE') ?? false} canCreatePerson={!isProfessorOnly && (session.data?.permissions.includes('PEOPLE_CREATE') ?? false)} date={date} onDateChange={setDate} csrfToken={session.data?.csrfToken ?? ''} people={people.data.map((person) => ({ ...person, hasSalaParticipation: person.hasSalaParticipation === true }))}/>}</div></WorkspaceShell>;
}

export default function SalaPage(): React.JSX.Element { return <Suspense fallback={<main className="p-6">Cargando Sala…</main>}><SalaPageContent /></Suspense>; }
