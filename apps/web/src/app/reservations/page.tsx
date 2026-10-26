'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { currentSession } from '../../features/auth/auth';
import { WorkspaceShell } from '../../features/auth/workspace-shell';
import { ReservationsTimeline, type InitialSalaSelection } from '../../features/reservations/reservations-timeline';
import { SalaReservationsAgenda } from '../../features/reservations/sala-reservations-agenda';

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}

function ReservationsPageContent(): React.JSX.Element {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryDate = searchParams.get('date') ?? '';
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(queryDate) ? queryDate : today();
  const personId = searchParams.get('personId')?.trim();
  const startTime = searchParams.get('startTime') ?? '';
  const origin = searchParams.get('origin');
  const initialSelection: InitialSalaSelection | undefined = personId && /^\d{2}:\d{2}$/.test(startTime) && (origin === 'FIXED' || origin === 'ONE_OFF')
    ? { personId, startTime, origin } : undefined;
  const [date, setDate] = useState(() => initialDate);
  const roles = session.data?.roles ?? [];
  const isProfessorOnly = roles.length === 1 && roles.includes('PROFESSOR');
  const isAdministrative = roles.includes('ADMINISTRATIVE') || roles.includes('GENERAL_ADMIN');
  const canCreatePerson = session.data?.permissions.includes('PEOPLE_CREATE') ?? false;
  const canManageAgenda = session.data?.permissions.includes('SALA_AGENDA_MANAGE') ?? false;
  const canManageParticipation = session.data?.permissions.includes('SALA_PARTICIPATION_MANAGE') ?? false;

  useEffect(() => {
    if (isAdministrative) router.replace('/sala');
  }, [isAdministrative, router]);

  if (session.isPending || isAdministrative) return <main className="p-6" role="status">Cargando…</main>;
  const content = isProfessorOnly
    ? <SalaReservationsAgenda initialDate={initialDate} {...(initialSelection ? { initialSelection } : {})} csrfToken={session.data?.csrfToken ?? ''} isProfessorOnly canManageAgenda={canManageAgenda} canManageParticipation={canManageParticipation} canCreatePerson={canCreatePerson} title="Reservas" description="Turnos fijos, reservas puntuales y asistencia de Sala." />
    : <ReservationsTimeline canManageSalaAgenda={canManageAgenda} date={date} onDateChange={setDate} csrfToken={session.data?.csrfToken ?? ''} variant="transversal" />;
  return <WorkspaceShell active="reservations"><div className="mx-auto max-w-7xl space-y-5">{content}</div></WorkspaceShell>;
}

export default function ReservationsPage(): React.JSX.Element {
  return <Suspense fallback={<main className="p-6" role="status">Cargando reservas…</main>}><ReservationsPageContent /></Suspense>;
}
