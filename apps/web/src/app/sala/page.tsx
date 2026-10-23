'use client';
import React, { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { WorkspaceShell } from '../../features/auth/workspace-shell';
import { currentSession } from '../../features/auth/auth';
import { SalaNavigation } from '../../features/sala/sala-navigation';
import { FixedBookingsCalendar } from '../../features/sala/fixed-bookings-calendar';
function SalaPageContent(): React.JSX.Element {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false }); const view = useSearchParams()?.get('view') === 'students' ? 'students' : 'agenda';
  const isProfessorOnly = session.data?.roles.length === 1 && session.data.roles.includes('PROFESSOR');
  const hasAdministrativeNavigation = session.data?.roles.some((role) => role === 'ADMINISTRATIVE' || role === 'GENERAL_ADMIN') ?? false;
  const router = useRouter();
  useEffect(() => { if (view === 'students') router.replace('/students'); }, [router, view]);
  if (session.isPending || view === 'students') return <main className="p-6" role="status">Cargando…</main>;
  const pageActive = 'sala-agenda';
  return <WorkspaceShell active={pageActive}><div className="mx-auto max-w-7xl space-y-3">{!hasAdministrativeNavigation && !isProfessorOnly ? <div className="flex flex-wrap items-center justify-between gap-3"><SalaNavigation active={view}/><Link href="/people" className="text-sm font-medium underline">Ver Personas</Link></div> : null}{session.data?.permissions.includes('SALA_RELATION_READ') ? <FixedBookingsCalendar csrfToken={session.data.csrfToken} canManageAgenda={session.data.permissions.includes('SALA_AGENDA_MANAGE')} canManageParticipation={session.data.permissions.includes('SALA_PARTICIPATION_MANAGE')} canCreatePerson={!isProfessorOnly && session.data.permissions.includes('PEOPLE_CREATE')} /> : <p role="alert">No tenés permiso para consultar la agenda.</p>}</div></WorkspaceShell>;
}

export default function SalaPage(): React.JSX.Element { return <Suspense fallback={<main className="p-6">Cargando Sala…</main>}><SalaPageContent /></Suspense>; }
