'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSalaAgenda, listPeople } from '@athleta/api-client';
import { Button } from '@athleta/ui';
import { currentSession } from '../../features/auth/auth';
import { WorkspaceShell } from '../../features/auth/workspace-shell';
import { ReservationsTimeline } from '../../features/reservations/reservations-timeline';
import { SpontaneousModal } from '../../features/sala/spontaneous-modal';
import type { AgendaGroup, PersonOption } from '../../features/sala/agenda-panel';

function today(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()); }
export default function ReservationsPage(): React.JSX.Element {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const [date, setDate] = useState(today);
  const [spontaneousOpen, setSpontaneousOpen] = useState(false);
  const client = useQueryClient();
  const isProfessorOnly = session.data?.roles.length === 1 && session.data.roles.includes('PROFESSOR');
  const canManageAgenda = session.data?.permissions.includes('SALA_AGENDA_MANAGE') ?? false;
  const agenda = useQuery({ queryKey: ['sala', 'agenda', date], enabled: spontaneousOpen, queryFn: async () => {
    const response = await getSalaAgenda({ date }, { credentials: 'include' });
    if (response.status !== 200) throw new Error('No se pudo cargar la disponibilidad.');
    return response.data.data as AgendaGroup[];
  } });
  const people = useQuery({ queryKey: ['people', 'spontaneous-options'], enabled: spontaneousOpen, queryFn: async () => {
    // Read the existing paginated projection fully so existing people beyond the first page remain selectable.
    const result: PersonOption[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const response = await listPeople({ page, pageSize: 100 }, { credentials: 'include' });
      if (response.status !== 200) throw new Error('No se pudieron cargar las Personas existentes.');
      result.push(...response.data.data);
      totalPages = response.data.meta.totalPages;
      page++;
    } while (page <= totalPages);
    return result;
  } });
  const refresh = async () => {
    setSpontaneousOpen(false);
    await Promise.all([
      client.invalidateQueries({ queryKey: ['reservations', date] }),
      client.invalidateQueries({ queryKey: ['sala', 'agenda', date] }),
      client.invalidateQueries({ queryKey: ['sala-dashboard'] }),
      client.invalidateQueries({ queryKey: ['sala', 'students'] }),
    ]);
  };
  return <WorkspaceShell active="Reservas"><div className="mx-auto max-w-7xl space-y-5">
    <ReservationsTimeline date={date} onDateChange={(next) => { setSpontaneousOpen(false); setDate(next); }} csrfToken={session.data?.csrfToken ?? ''} isProfessorOnly={isProfessorOnly} headerAction={isProfessorOnly && canManageAgenda ? <Button className="w-full sm:w-auto" onClick={() => setSpontaneousOpen(true)}>Incorporación espontánea</Button> : undefined} />
    {spontaneousOpen && (agenda.isPending || people.isPending) ? <p role="status">Cargando incorporación espontánea…</p> : null}
    {spontaneousOpen && (agenda.isError || people.isError) ? <p role="alert">No se pudo preparar la incorporación espontánea. <Button variant="secondary" onClick={() => { void agenda.refetch(); void people.refetch(); }}>Reintentar</Button><Button variant="ghost" onClick={() => setSpontaneousOpen(false)}>Cerrar</Button></p> : null}
    {spontaneousOpen && isProfessorOnly && canManageAgenda && agenda.isSuccess && people.isSuccess ? <SpontaneousModal key={date} date={date} groups={agenda.data} people={people.data} initialSlotId="" csrfToken={session.data?.csrfToken ?? ''} canManageParticipation={session.data?.permissions.includes('SALA_PARTICIPATION_MANAGE') ?? false} canCreatePerson={false} onSaved={() => { void refresh(); }} onClose={() => setSpontaneousOpen(false)} /> : null}
  </div></WorkspaceShell>;
}
