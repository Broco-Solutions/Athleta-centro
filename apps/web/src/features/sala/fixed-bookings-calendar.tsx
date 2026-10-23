'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, cn } from '@athleta/ui';
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cancelSalaOccurrence, correctSalaOccurrence, createFixedSalaBooking, getSalaAgenda, listSalaStudents, markSalaOccurrenceAbsent, markSalaOccurrenceAttended } from '@athleta/api-client';
import { BookingModal, buildTimelineBookings, type AgendaGroup, type OccurrenceStatus, type TimelineBooking } from './agenda-panel';
import { SpontaneousModal } from './spontaneous-modal';
import { TemporaryPortalPin, todayOperational, type Notice } from './student-onboarding';

const weekdays = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const readOptions = { credentials: 'include' } as const;
const refreshOptions = { refetchInterval: 30_000, refetchIntervalInBackground: false, refetchOnWindowFocus: 'always' } as const;
type Selection = { date: string; hour: number };
type EditableStatus = Exclude<OccurrenceStatus, 'PENDING_PAYMENT'>;
const assignmentSchema = z.object({ personId: z.string().min(1, 'Seleccioná un alumno.') });

export function addCalendarDays(date: string, days: number): string {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
function monday(date: string): string { return addCalendarDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7)); }
function minutes(time: string): number { const [h = 0, m = 0] = time.split(':').map(Number); return h * 60 + m; }
function clock(value: number): string { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
function dayName(date: string): string { return weekdays[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7]!; }
function shortDate(date: string): string { return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)); }
export function assignmentDate(date: string, today = todayOperational()): string {
  return date < today ? addCalendarDays(date, Math.ceil((Date.parse(today) - Date.parse(date)) / (7 * 86400000)) * 7) : date;
}
async function loadAgenda(date: string): Promise<AgendaGroup[]> {
  const response = await getSalaAgenda({ date }, readOptions);
  if (response.status !== 200) throw new Error('No se pudo cargar la agenda.');
  return response.data.data as AgendaGroup[];
}

// All figures come from the same most restrictive quarter-hour; never add the four blocks.
export function calendarHour(groups: AgendaGroup[], hour: number): AgendaGroup | undefined {
  return groups.filter((group) => minutes(group.slot.startTime) >= hour && minutes(group.slot.startTime) < hour + 60)
    .sort((a, b) => Number(b.isClosed) - Number(a.isClosed) || a.available - b.available || b.reserved - a.reserved)[0];
}
function assignmentSlot(groups: AgendaGroup[], hour: number): AgendaGroup | undefined {
  const first = groups.find((group) => minutes(group.slot.startTime) === hour);
  if (!first) return undefined;
  const scheduleId = first.slot.scheduleSlotId ?? first.slot.id;
  return [0, 15, 30, 45].every((offset) => groups.some((group) => (group.slot.scheduleSlotId ?? group.slot.id) === scheduleId && minutes(group.slot.startTime) === hour + offset && !group.isClosed && group.available > 0)) ? first : undefined;
}
function Occupancy({ group }: { group: AgendaGroup }): React.JSX.Element {
  return <div aria-label={`${group.reserved} de ${group.capacity} ocupados`} className="flex h-2 gap-1" aria-hidden="true">{Array.from({ length: Math.max(1, group.capacity) }, (_, i) => <span key={i} className={cn('min-w-0 flex-1 rounded-sm', i < group.reserved ? 'bg-current' : 'bg-black/10')} />)}</div>;
}
function availabilityLabel(group: AgendaGroup): string { return group.isClosed ? 'Cerrado' : group.available === 0 ? 'Completo · 0 libres' : `${group.available} lugares libres`; }

function AssignmentDialog({ selection, csrfToken, onSaved, onClose }: { selection: Selection; csrfToken: string; onSaved: () => Promise<void>; onClose: () => void }): React.JSX.Element {
  const [search, setSearch] = useState('');
  const startDate = assignmentDate(selection.date);
  const form = useForm<z.infer<typeof assignmentSchema>>({ resolver: zodResolver(assignmentSchema), defaultValues: { personId: '' } });
  const personId = form.watch('personId');
  const students = useQuery({ queryKey: ['sala', 'students'], queryFn: async () => {
    const response = await listSalaStudents(readOptions);
    if (response.status !== 200) throw new Error('No se pudieron buscar los alumnos.');
    return response.data.data;
  } });
  const agenda = useQuery({ queryKey: ['sala', 'agenda', startDate], queryFn: () => loadAgenda(startDate), ...refreshOptions });
  const slot = assignmentSlot(agenda.data ?? [], selection.hour);
  const student = students.data?.find((item) => item.id === personId);
  const term = search.trim().toLocaleLowerCase('es');
  const matches = term ? students.data?.filter((item) => `${item.firstName} ${item.lastName}`.toLocaleLowerCase('es').includes(term) || item.dni.includes(term)) ?? [] : [];
  const create = useMutation({ mutationFn: async () => {
    if (!student || !slot) throw new Error('Seleccioná un alumno y un horario con disponibilidad.');
    const response = await createFixedSalaBooking({ personId: student.id, salaParticipationId: student.participationId, scheduleSlotId: slot.slot.scheduleSlotId ?? slot.slot.id, startTime: clock(selection.hour), startDate }, { ...readOptions, headers: { 'x-csrf-token': csrfToken } });
    if (response.status >= 400) {
      const body = response.data as unknown as { code?: string; message?: string };
      const messages: Record<string, string> = {
        SALA_FIXED_BOOKING_LIMIT_EXCEEDED: 'El alumno alcanzó el máximo de turnos fijos de su Plan.',
        SALA_WEEKLY_LIMIT_EXCEEDED: 'El alumno alcanzó el límite semanal de su Plan.',
        SALA_SCHEDULE_CLOSED: 'El horario está cerrado para esa fecha.',
        SALA_CAPACITY_EXCEEDED: 'El horario ya no tiene cupo.',
        SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED: 'El horario ya no tiene cupo.',
        SALA_REQUIRED_SLOTS_UNAVAILABLE: 'No hay disponibilidad para los 60 minutos completos.',
      };
      throw new Error(messages[body.code ?? ''] ?? body.message ?? 'No se pudo asignar el alumno.');
    }
  }, onSuccess: onSaved });
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="assignment-title" className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-md bg-white p-6 shadow-xl">
    <h2 id="assignment-title" className="text-xl font-semibold">Asignar alumno</h2>
    <p className="mt-3">Todos los {dayName(selection.date)} · {clock(selection.hour)} – {clock(selection.hour + 60)}</p>
    <p className="mt-1 text-sm">Comienza el <strong>{startDate}</strong> · Duración: 60 minutos.</p>
    {startDate !== selection.date ? <p className="mt-2 text-sm text-muted-foreground">La fecha consultada ya pasó. Se utilizará la siguiente ocurrencia de este día.</p> : null}
    <form className="mt-5 space-y-4" onSubmit={form.handleSubmit(() => create.mutate())}>
      <label className="grid gap-2 text-sm font-medium">Buscar alumno<input className="h-11 rounded-md border px-3" placeholder="Nombre, apellido o DNI" value={search} onChange={(event) => { setSearch(event.target.value); form.setValue('personId', ''); }} /></label>
      {students.isPending ? <p role="status">Cargando alumnos…</p> : students.isError ? <p role="alert">No se pudieron buscar los alumnos.</p> : term && matches.length === 0 ? <p>No hay alumnos activos con esa búsqueda.</p> : null}
      <div className="max-h-52 space-y-2 overflow-y-auto">{matches.map((item) => <button type="button" key={item.id} aria-pressed={personId === item.id} style={{ borderColor: personId === item.id ? 'var(--primary)' : undefined }} className={cn('min-h-11 w-full rounded-md border p-3 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring', personId === item.id && 'border-primary bg-primary/10')} onClick={() => form.setValue('personId', item.id)}>{item.firstName} {item.lastName} · DNI {item.dni}{!item.hasValidAccess ? <span className="block text-amber-900">Sin vigencia actual; se validará la fecha de inicio.</span> : null}</button>)}</div>
      {agenda.isPending ? <p role="status">Verificando disponibilidad…</p> : agenda.isError ? <p role="alert">No se pudo consultar la disponibilidad.</p> : !slot ? <p role="alert">El horario está cerrado, incompleto o sin cupo para la fecha de inicio.</p> : null}
      {create.isError ? <p role="alert" className="text-sm text-red-800">{create.error.message}</p> : null}
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={create.isPending} onClick={onClose}>Cerrar</Button><Button type="submit" disabled={!student || !slot || agenda.isError || agenda.isFetching || create.isPending}>Confirmar asignación</Button></div>
    </form>
  </section></div>;
}

export function FixedBookingsCalendar({ csrfToken, canManageAgenda, canManageParticipation, canCreatePerson }: { csrfToken: string; canManageAgenda: boolean; canManageParticipation: boolean; canCreatePerson: boolean }): React.JSX.Element {
  const client = useQueryClient();
  const today = todayOperational();
  const [week, setWeek] = useState(() => monday(today));
  const [band, setBand] = useState<'morning' | 'afternoon'>('morning');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [spontaneous, setSpontaneous] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [booking, setBooking] = useState<TimelineBooking | null>(null);
  const dates = Array.from({ length: 7 }, (_, i) => addCalendarDays(week, i));
  const queries = useQueries({ queries: dates.map((date) => ({ queryKey: ['sala', 'agenda', date], queryFn: () => loadAgenda(date), ...refreshOptions })) });
  const allGroups = queries.flatMap((query) => query.data ?? []);
  const hours = [...new Set(allGroups.map((group) => Math.floor(minutes(group.slot.startTime) / 60) * 60))].sort((a, b) => a - b);
  const bands = { morning: hours.filter((hour) => hour < 12 * 60), afternoon: hours.filter((hour) => hour >= 12 * 60) };
  const visibleHours = bands[band];
  const visibleDays = dates.filter((_, i) => i < 5 || Boolean(queries[i]?.data?.length));
  const selectedGroups = selection ? queries[dates.indexOf(selection.date)]?.data ?? [] : [];
  const selectedGroup = selection ? calendarHour(selectedGroups, selection.hour) : undefined;
  const selectedBookings = selection ? buildTimelineBookings(selectedGroups).filter((entry) => entry.startMinutes < selection.hour + 60 && entry.endMinutes > selection.hour) : [];
  const fixed = selectedBookings.filter((entry) => entry.origin === 'FIXED');
  const others = selectedBookings.filter((entry) => entry.origin !== 'FIXED');
  const operationDate = selection?.date ?? (dates.includes(today) ? today : week);
  const operationGroups = queries[dates.indexOf(operationDate)]?.data ?? [];
  const refresh = async () => { await Promise.all([
    client.invalidateQueries({ queryKey: ['sala', 'agenda'] }), client.invalidateQueries({ queryKey: ['sala', 'availability'] }),
    client.invalidateQueries({ queryKey: ['sala', 'students'] }), client.invalidateQueries({ queryKey: ['sala-fixed'] }),
    client.invalidateQueries({ queryKey: ['reservations'] }), client.invalidateQueries({ queryKey: ['sala-dashboard'] }),
  ]); };
  const update = useMutation({ mutationFn: async ({ entry, status, correction }: { entry: TimelineBooking; status: EditableStatus; correction: boolean }) => {
    const reference = { personId: entry.personId, scheduleSlotId: entry.scheduleSlotId, date: operationDate, startTime: clock(entry.startMinutes), ...(entry.sourceId ? { sourceId: entry.sourceId } : {}) };
    const options = { ...readOptions, headers: { 'x-csrf-token': csrfToken } };
    const response = correction ? await correctSalaOccurrence({ ...reference, status }, options) : status === 'ATTENDED' ? await markSalaOccurrenceAttended(reference, options) : status === 'ABSENT' ? await markSalaOccurrenceAbsent(reference, options) : await cancelSalaOccurrence(reference, options);
    if (response.status >= 400) throw new Error('No se pudo actualizar el estado.');
  }, onSuccess: async () => { setBooking(null); await refresh(); } });
  const changeWeek = (date: string) => { setWeek(monday(date)); setSelection(null); setExpanded(false); setBooking(null); };
  const range = (values: number[]) => values.length ? `${clock(values[0]!).slice(0, 2)}–${clock(values[values.length - 1]! + 60).slice(0, 2)}` : 'Sin horarios';
  const renderEntry = (entry: TimelineBooking) => <li key={`${entry.origin}-${entry.sourceId ?? entry.personId}-${entry.startMinutes}`} className="space-y-2 border-t py-3 text-sm">
    <p className="font-medium">{entry.person.firstName} {entry.person.lastName}</p>
    <p>{entry.status === 'CANCELLED' ? 'Canceló esta fecha' : entry.status === 'PENDING_PAYMENT' ? 'Pendiente de renovación' : entry.status === 'ATTENDED' ? 'Asistió' : entry.status === 'ABSENT' ? 'Ausente' : 'Vigente'} · {clock(entry.startMinutes)} – {clock(entry.endMinutes)}</p>
    <div className="flex flex-wrap items-center gap-3"><Link className="underline" href={`/sala/people/${entry.personId}`}>Ver ficha</Link><Button variant="secondary" className="h-9" onClick={() => { update.reset(); setBooking(entry); }}>Ver reserva{canManageAgenda ? ' y asistencia' : ''}</Button></div>
  </li>;

  return <section data-testid="fixed-bookings-calendar" className="space-y-5" aria-labelledby="weekly-agenda-title">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="weekly-agenda-title" className="text-xl font-semibold">Agenda</h2><p className="mt-1 text-sm text-muted-foreground">Calendario semanal de Sala · {shortDate(week)} al {shortDate(addCalendarDays(week, 6))}</p></div><div className="flex flex-wrap items-center gap-2"><Button variant="secondary" aria-label="Semana anterior" onClick={() => changeWeek(addCalendarDays(week, -7))}><ChevronLeft size={18} /></Button><Button variant="secondary" onClick={() => changeWeek(today)}>Hoy</Button><Button variant="secondary" aria-label="Semana siguiente" onClick={() => changeWeek(addCalendarDays(week, 7))}><ChevronRight size={18} /></Button><Button variant="secondary" onClick={() => { void refresh(); }}>Actualizar</Button></div></header>
    {queries.some((query) => query.isPending) ? <p role="status">Cargando semana…</p> : null}
    {queries.some((query) => query.isError) ? <p role="alert">No se pudo cargar toda la semana. Usá Actualizar para reintentar.</p> : null}
    <div className="grid items-start gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
      <aside aria-label="Turno seleccionado" className="order-2 min-w-0 rounded-md border bg-white p-5 lg:order-1">
        <p className="flex items-center gap-2 text-sm font-semibold"><ArrowUpRight size={18} /> TURNO SELECCIONADO</p>
        {selection && selectedGroup ? <>
          <h3 className="mt-5 text-2xl font-semibold capitalize">{dayName(selection.date)}</h3><p className="mt-1 text-xl tabular-nums">{clock(selection.hour)} – {clock(selection.hour + 60)}</p><p className="mt-1 text-sm text-muted-foreground">{shortDate(selection.date)}</p>
          <p className={cn('mt-4 font-medium', selectedGroup.isClosed || selectedGroup.available === 0 ? 'text-stone-700' : 'text-emerald-900')}>{availabilityLabel(selectedGroup)}</p>
          <p className="mt-6 font-medium">Turno fijo semanal</p><p className="mt-1 text-sm text-muted-foreground">Todos los {dayName(selection.date)}</p>
          <div className="mt-6 space-y-3 text-emerald-900"><p className="flex justify-between gap-2 text-sm text-foreground"><span>Ocupados / capacidad</span><strong className="tabular-nums">{selectedGroup.reserved} / {selectedGroup.capacity}</strong></p><Occupancy group={selectedGroup} /></div>
          <p className="mt-3 text-sm">{selectedGroup.isClosed ? 'Horario cerrado para esta fecha' : `Quedan ${selectedGroup.available} lugares disponibles`}</p>
          {selectedGroup.isOverbooked ? <p className="mt-2 text-sm text-red-800">El horario tiene sobrecupo.</p> : null}
          <Button variant="secondary" className="mt-5 w-full" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>Ver alumnos asignados</Button>
          {expanded ? <div className="mt-4"><h4 className="font-semibold">Alumnos con turno fijo</h4>{fixed.length ? <ul className="mt-2">{fixed.map(renderEntry)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No hay alumnos fijos asignados a esta hora.</p>}</div> : null}
          {canManageAgenda ? <Button className="mt-3 w-full" disabled={(selection.date >= today && !assignmentSlot(selectedGroups, selection.hour)) || queries[dates.indexOf(selection.date)]?.isFetching || queries[dates.indexOf(selection.date)]?.isError} onClick={() => setAssigning(true)}><Plus size={16} />Asignar alumno</Button> : null}
          {others.length ? <div className="mt-6"><h4 className="font-semibold">Reservas puntuales e incorporaciones</h4><ul className="mt-2">{others.map((entry) => <React.Fragment key={`${entry.origin}-${entry.sourceId ?? entry.personId}-${entry.startMinutes}`}><li className="mt-3 text-xs text-muted-foreground">{entry.origin === 'ONE_OFF' ? 'Reserva puntual' : 'Incorporación espontánea'}</li>{renderEntry(entry)}</React.Fragment>)}</ul></div> : null}
        </> : <p className="mt-5 text-sm text-muted-foreground">Seleccioná un horario del calendario para consultar sus alumnos y operar la agenda.</p>}
        {canManageAgenda ? <Button variant="secondary" className="mt-5 w-full" disabled={!operationGroups.length} onClick={() => setSpontaneous(true)}>Incorporación espontánea</Button> : null}
      </aside>
      <div className="order-1 min-w-0 space-y-4 lg:order-2">
        <div role="group" aria-label="Franjas horarias" className="inline-flex flex-wrap gap-1 rounded-md bg-slate-100 p-1">{(['morning', 'afternoon'] as const).map((key) => <button key={key} type="button" aria-pressed={band === key} onClick={() => setBand(key)} className={cn('min-h-11 rounded px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring', band === key ? 'bg-white text-foreground' : 'text-slate-600 hover:bg-white/70')}>{key === 'morning' ? 'Mañana' : 'Tarde'} · {range(bands[key])}</button>)}</div>
        <div className="overflow-x-auto rounded-md border bg-white" tabIndex={0} aria-label="Calendario semanal"><table className="w-full min-w-[720px] border-separate border-spacing-2 text-sm"><thead><tr><th className="sticky left-0 z-10 w-14 bg-white p-2 text-left font-medium">Hora</th>{visibleDays.map((date) => <th key={date} scope="col" className={cn('min-w-28 p-2 text-left', date === today && 'bg-primary/15')}><span className="block capitalize">{dayName(date)}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{shortDate(date)}</span></th>)}</tr></thead><tbody>{visibleHours.map((hour) => <tr key={hour}><th scope="row" className="sticky left-0 z-10 bg-white p-2 align-top font-medium tabular-nums">{clock(hour)}</th>{visibleDays.map((date) => {
          const query = queries[dates.indexOf(date)]!;
          const group = calendarHour(query.data ?? [], hour);
          const selected = selection?.date === date && selection.hour === hour;
          // Inline border colors override the existing unlayered global border reset.
          return <td key={date} className="p-0 align-top">{group ? <button type="button" aria-label={`${dayName(date)} ${clock(hour)}: ${group.reserved} / ${group.capacity} ocupados, ${availabilityLabel(group)}`} aria-pressed={selected} style={{ borderColor: selected ? 'var(--primary)' : group.isClosed || group.available === 0 ? '#d6d3d1' : '#a7f3d0' }} onClick={() => { setSelection({ date, hour }); setBooking(null); }} className={cn('relative flex min-h-28 w-full flex-col justify-between gap-2 rounded-md border-2 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selected ? 'border-primary bg-yellow-50 text-stone-900' : group.isClosed || group.available === 0 ? 'border-stone-300 bg-stone-100 text-stone-700' : 'border-emerald-200 bg-emerald-50 text-emerald-900')}>
            {selected ? <Check size={14} aria-hidden="true" className="absolute right-1 top-1" /> : null}<span className="font-semibold tabular-nums">{group.reserved} / {group.capacity} <span className="font-normal">ocupados</span></span><span className="flex items-start gap-1 text-xs">{!group.isClosed && group.available > 0 ? <Check size={12} className="mt-0.5 shrink-0" aria-hidden="true" /> : null}{availabilityLabel(group)}</span><Occupancy group={group} />
          </button> : <div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-md bg-slate-50 text-slate-500"><span>—</span><span className="text-xs">{query.isPending ? 'Cargando' : query.isError ? 'Sin datos' : 'Sin turno'}</span></div>}</td>;
        })}</tr>)}</tbody></table></div>
        {!visibleHours.length && !queries.some((query) => query.isPending || query.isError) ? <p className="text-sm text-muted-foreground">No hay horarios configurados en esta franja.</p> : null}
        <div aria-label="Leyenda" className="flex flex-wrap gap-4 text-xs text-muted-foreground">{[['Con cupo', 'border-emerald-200 bg-emerald-50'], ['Completo', 'border-stone-300 bg-stone-100'], ['Sin turno', 'border-slate-100 bg-slate-50'], ['Seleccionado', 'border-primary bg-yellow-50']].map(([label, color]) => <span key={label} className="flex items-center gap-2"><span aria-hidden="true" style={{ borderColor: label === 'Seleccionado' ? 'var(--primary)' : label === 'Con cupo' ? '#a7f3d0' : label === 'Completo' ? '#d6d3d1' : undefined }} className={cn('h-3 w-3 rounded-sm border-2', color)} />{label}</span>)}</div>
      </div>
    </div>
    {assigning && selection && canManageAgenda ? <AssignmentDialog selection={selection} csrfToken={csrfToken} onClose={() => setAssigning(false)} onSaved={async () => { setAssigning(false); await refresh(); }} /> : null}
    {booking ? <div className="relative z-[60]"><BookingModal booking={booking} date={operationDate} pending={update.isPending} canManageAgenda={canManageAgenda} error={update.isError ? update.error.message : null} onClose={() => setBooking(null)} onAction={(status) => update.mutate({ entry: booking, status, correction: false })} onCorrect={(status) => update.mutate({ entry: booking, status, correction: true })} /></div> : null}
    {spontaneous && canManageAgenda ? <div className="relative z-[60]"><SpontaneousModal date={operationDate} groups={operationGroups} initialSlotId={selection ? selectedGroups.find((group) => minutes(group.slot.startTime) === selection.hour)?.slot.id ?? '' : ''} csrfToken={csrfToken} canManageParticipation={canManageParticipation} canCreatePerson={canCreatePerson} onClose={() => setSpontaneous(false)} onSaved={(created) => { setSpontaneous(false); if (created) setNotice(created); void refresh(); }} /></div> : null}
    {notice ? <TemporaryPortalPin notice={notice} onClose={() => setNotice(null)} /> : null}
  </section>;
}
