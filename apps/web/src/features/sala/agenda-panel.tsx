'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, cn } from '@athleta/ui';
import {
  cancelSalaOccurrence,
  createSpontaneousSalaOccurrence,
  getSalaAgenda,
  markSalaOccurrenceAbsent,
  markSalaOccurrenceAttended,
} from '@athleta/api-client';

type PersonOption = { id: string; firstName: string; lastName: string; dni: string };
type OccurrenceStatus = 'RESERVED' | 'ATTENDED' | 'CANCELLED' | 'ABSENT';
type OccurrenceOrigin = 'FIXED' | 'ONE_OFF' | 'SPONTANEOUS';
type AgendaPerson = {
  personId: string;
  person: PersonOption;
  origin: OccurrenceOrigin;
  status: OccurrenceStatus;
};
type AgendaGroup = {
  slot: { id: string; scheduleSlotId?: string; startTime: string; durationMinutes: number };
  capacity: number;
  reserved: number;
  available: number;
  isOverbooked: boolean;
  isClosed: boolean;
  people: AgendaPerson[];
};

const statusLabels: Record<OccurrenceStatus, string> = { RESERVED: 'Reservado', ATTENDED: 'Asistió', CANCELLED: 'Cancelado', ABSENT: 'Ausente' };
const originLabels: Record<OccurrenceOrigin, string> = { FIXED: 'Turno fijo', ONE_OFF: 'Reserva puntual', SPONTANEOUS: 'Espontáneo' };
const statusClasses: Record<OccurrenceStatus, string> = {
  RESERVED: 'bg-sky-50 text-sky-800',
  ATTENDED: 'bg-emerald-50 text-emerald-800',
  CANCELLED: 'bg-slate-100 text-slate-700',
  ABSENT: 'bg-amber-50 text-amber-900',
};

function unwrapAgenda(value: unknown): AgendaGroup[] {
  const envelope = value as { data?: { data?: AgendaGroup[] } | AgendaGroup[] };
  const body = envelope.data;
  if (Array.isArray(body)) return body;
  return body?.data ?? [];
}

function localDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function timeLabel(value: string): string {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return `${String(parsed.getUTCHours()).padStart(2, '0')}:${String(parsed.getUTCMinutes()).padStart(2, '0')}`;
  return value.slice(0, 5);
}

function mutationOptions(csrfToken: string): RequestInit {
  return { credentials: 'include', headers: { 'x-csrf-token': csrfToken } };
}

export function AgendaPanel({ date, onDateChange, csrfToken, people }: { date: string; onDateChange: (date: string) => void; csrfToken: string; people: PersonOption[] }): React.JSX.Element {
  const queryClient = useQueryClient();
  const [spontaneousPersonId, setSpontaneousPersonId] = useState('');
  const [spontaneousSlotId, setSpontaneousSlotId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const agenda = useQuery({ queryKey: ['sala', 'agenda', date], queryFn: async () => unwrapAgenda(await getSalaAgenda({ date }, { credentials: 'include' })) });

  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['sala', 'agenda', date] }), queryClient.invalidateQueries({ queryKey: ['sala', 'availability', date] })]); };
  const update = useMutation({
    mutationFn: async ({ personId, scheduleSlotId, status }: { personId: string; scheduleSlotId: string; status: Exclude<OccurrenceStatus, 'RESERVED'> }) => {
      const reference = { personId, scheduleSlotId, date };
      const options = mutationOptions(csrfToken);
      const response = status === 'ATTENDED' ? await markSalaOccurrenceAttended(reference, options) : status === 'ABSENT' ? await markSalaOccurrenceAbsent(reference, options) : await cancelSalaOccurrence(reference, options);
      if (response.status >= 400) throw new Error('No se pudo actualizar la asistencia.');
    },
    onSuccess: async () => { setMessage(null); await refresh(); },
    onError: () => setMessage('No se pudo actualizar la asistencia.'),
  });
  const spontaneous = useMutation({
    mutationFn: async () => {
      const response = await createSpontaneousSalaOccurrence({ personId: spontaneousPersonId, scheduleSlotId: spontaneousSlotId, date }, mutationOptions(csrfToken));
      if (response.status >= 400) throw new Error('No se pudo incorporar a la Persona.');
    },
    onSuccess: async () => { setMessage(null); setSpontaneousPersonId(''); await refresh(); },
    onError: () => setMessage('La Persona ya posee una presencia o no tiene una participación activa.'),
  });

  const groups = agenda.data ?? [];
  return (
    <section aria-labelledby="daily-agenda-heading" className="mt-5 rounded-md border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 id="daily-agenda-heading" className="text-lg font-semibold">Agenda y asistencia</h2><p className="text-sm text-muted-foreground">Estado operativo por horario. Las ausencias se registran únicamente de forma manual.</p></div>
        <label className="grid gap-1 text-sm font-medium">Fecha<input aria-label="Fecha de agenda" className="h-10 rounded-md border px-3" type="date" value={date} onChange={(event) => onDateChange(event.target.value)} /></label>
      </div>
      {agenda.isLoading ? <p role="status" className="mt-5 text-sm text-muted-foreground">Cargando agenda…</p> : null}
      {agenda.isError ? <p role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">No se pudo cargar la agenda.</p> : null}
      {!agenda.isLoading && !agenda.isError && groups.length === 0 ? <p className="mt-5 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No hay horarios configurados para esta fecha.</p> : null}
      <div className="mt-5 grid gap-4">
        {groups.map((group) => (
          <article key={group.slot.id} className="rounded-md border">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
              <div><h3 className="font-semibold">{timeLabel(group.slot.startTime)}</h3><p className="text-xs text-muted-foreground">Capacidad {group.capacity} · Reservados {group.reserved} · Disponibles {group.available}</p></div>
              <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', group.isClosed ? 'bg-slate-200 text-slate-800' : group.isOverbooked ? 'bg-red-50 text-red-800' : group.available === 0 ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800')}>{group.isClosed ? 'Cerrado' : group.isOverbooked ? 'Sobrecupo' : group.available === 0 ? 'Completo' : 'Disponible'}</span>
            </header>
            {group.people.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Sin Personas registradas.</p> : <ul className="divide-y">{group.people.map((entry) => (
              <li key={entry.personId} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div><p className="font-medium">{entry.person.lastName}, {entry.person.firstName}</p><p className="text-xs text-muted-foreground">DNI {entry.person.dni} · {originLabels[entry.origin]}</p></div>
                <div className="flex flex-wrap items-center gap-2"><span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', statusClasses[entry.status])}>{statusLabels[entry.status]}</span><Button type="button" variant="secondary" disabled={update.isPending} onClick={() => update.mutate({ personId: entry.personId, scheduleSlotId: group.slot.scheduleSlotId ?? group.slot.id, status: 'ATTENDED' })}>Asistió</Button><Button type="button" variant="secondary" disabled={update.isPending} onClick={() => update.mutate({ personId: entry.personId, scheduleSlotId: group.slot.scheduleSlotId ?? group.slot.id, status: 'ABSENT' })}>Ausente</Button><Button type="button" variant="secondary" disabled={update.isPending} onClick={() => update.mutate({ personId: entry.personId, scheduleSlotId: group.slot.scheduleSlotId ?? group.slot.id, status: 'CANCELLED' })}>Cancelar</Button></div>
              </li>
            ))}</ul>}
          </article>
        ))}
      </div>
      <div className="mt-5 rounded-md border bg-slate-50 p-4"><h3 className="font-semibold">Incorporación espontánea actual</h3><p className="mb-3 text-xs text-muted-foreground">Disponible únicamente para la fecha operativa actual.</p><div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><select aria-label="Persona espontánea" className="h-10 rounded-md border bg-white px-3" value={spontaneousPersonId} onChange={(event) => setSpontaneousPersonId(event.target.value)} disabled={date !== localDate()}><option value="">Seleccionar Persona</option>{people.map((person) => <option key={person.id} value={person.id}>{person.lastName}, {person.firstName} · {person.dni}</option>)}</select><select aria-label="Horario espontáneo" className="h-10 rounded-md border bg-white px-3" value={spontaneousSlotId} onChange={(event) => setSpontaneousSlotId(event.target.value)} disabled={date !== localDate()}><option value="">Seleccionar horario</option>{groups.filter((group) => !group.isClosed).map((group) => <option key={group.slot.id} value={group.slot.scheduleSlotId ?? group.slot.id}>{timeLabel(group.slot.startTime)}</option>)}</select><Button type="button" disabled={date !== localDate() || !spontaneousPersonId || !spontaneousSlotId || spontaneous.isPending} onClick={() => spontaneous.mutate()}>Incorporar</Button></div></div>
      {message ? <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</p> : null}
    </section>
  );
}
