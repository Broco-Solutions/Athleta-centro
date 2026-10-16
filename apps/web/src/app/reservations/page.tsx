'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { currentSession } from '../../features/auth/auth';
import { WorkspaceShell } from '../../features/auth/workspace-shell';
import { ReservationsTimeline } from '../../features/reservations/reservations-timeline';
import { SalaReservationsAgenda } from '../../features/reservations/sala-reservations-agenda';

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}

export default function ReservationsPage(): React.JSX.Element {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const router = useRouter();
  const [date, setDate] = useState(today);
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
    ? <SalaReservationsAgenda csrfToken={session.data?.csrfToken ?? ''} isProfessorOnly canManageAgenda={canManageAgenda} canManageParticipation={canManageParticipation} canCreatePerson={canCreatePerson} title="Reservas" description="Turnos fijos, reservas puntuales y asistencia de Sala." />
    : <ReservationsTimeline canManageSalaAgenda={canManageAgenda} date={date} onDateChange={setDate} csrfToken={session.data?.csrfToken ?? ''} variant="transversal" />;
  return <WorkspaceShell active="reservations"><div className="mx-auto max-w-7xl space-y-5">{content}</div></WorkspaceShell>;
}
