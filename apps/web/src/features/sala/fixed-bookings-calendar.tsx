'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, cn } from '@athleta/ui';
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cancelSalaOccurrence, correctSalaOccurrence, createFixedSalaBooking, createSalaStudent, getSalaAgenda, listSalaStudents, markSalaOccurrenceAbsent, markSalaOccurrenceAttended } from '@athleta/api-client';
import { BookingModal, buildTimelineBookings, type AgendaGroup, type OccurrenceStatus, type TimelineBooking } from './agenda-panel';
import { SpontaneousModal } from './spontaneous-modal';
import { StudentTrainingFields, TemporaryPortalPin, todayOperational, studentSchema, type Notice, type StudentValues } from './student-onboarding';
import { GeneralPersonFields, personDefaults, personInput, type PersonValues } from '../people/general-person-form';

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
function weekLabel(start: string): string {
  const end = addCalendarDays(start, 6);
  const format = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-AR', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `Semana del ${sameMonth ? Number(start.slice(8)) : format(start, { day: 'numeric', month: 'long', ...(!sameYear ? { year: 'numeric' } : {}) })} al ${format(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}
function isPast(date: string, hour: number, now: number): boolean {
  return new Date(`${date}T${clock(hour + 60)}:00-03:00`).getTime() <= now;
}
function hourBookings(groups: AgendaGroup[], hour: number): TimelineBooking[] {
  const entries = buildTimelineBookings(groups).filter(entry => entry.startMinutes < hour + 60 && entry.endMinutes > hour);
  return [...new Map(entries.map(entry => [`${entry.origin}:${entry.sourceId ?? entry.personId}:${entry.scheduleSlotId}:${entry.startMinutes}`, entry])).values()];
}
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

function AssignmentDialog({ selection, csrfToken, canManageParticipation, canCreatePerson, onSaved, onStudentCreated, onClose }: { selection: Selection; csrfToken: string; canManageParticipation: boolean; canCreatePerson: boolean; onSaved: () => Promise<void>; onStudentCreated: (notice: Notice, assigned: boolean) => Promise<void>; onClose: () => void }): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [creatingStudent, setCreatingStudent] = useState(false);
  const startDate = assignmentDate(selection.date);
  const form = useForm<z.infer<typeof assignmentSchema>>({ resolver: zodResolver(assignmentSchema), defaultValues: { personId: '' } });
  const studentForm = useForm<StudentValues>({ resolver: zodResolver(studentSchema), defaultValues: { ...personDefaults(), planId: '', mainProfessorId: '' } });
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
  const assign = async (personId: string, salaParticipationId: string) => {
    if (!slot || agenda.isPending || agenda.isError || agenda.isFetching) throw new Error('El horario está cerrado, incompleto o sin cupo para la fecha de inicio.');
    const response = await createFixedSalaBooking({ personId, salaParticipationId, scheduleSlotId: slot.slot.scheduleSlotId ?? slot.slot.id, startTime: clock(selection.hour), startDate }, { ...readOptions, headers: { 'x-csrf-token': csrfToken } });
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
  };
  const create = useMutation({ mutationFn: async () => {
    if (!student || !slot) throw new Error('Seleccioná un alumno y un horario con disponibilidad.');
    await assign(student.id, student.participationId);
  }, onSuccess: onSaved });
  const createStudent = useMutation({ mutationFn: async (values: StudentValues) => {
    if (!canManageParticipation || !canCreatePerson || !slot || agenda.isPending || agenda.isError || agenda.isFetching) throw new Error('El horario está cerrado, incompleto o sin cupo para la fecha de inicio.');
    if (!csrfToken) throw new Error('Sesión inválida.');
    const { planId, mainProfessorId, ...generalPerson } = values;
    const createdResponse = await createSalaStudent({ ...personInput(generalPerson), planId, mainProfessorId }, { ...readOptions, headers: { 'x-csrf-token': csrfToken } });
    if (createdResponse.status < 200 || createdResponse.status >= 300) throw new Error('No pudimos crear al alumno. Revisá los datos e intentá nuevamente.');
    const created = createdResponse.data.data;
    if (!created.initialPin) throw new Error('El alumno fue creado, pero no se recibió el PIN temporal.');
    const notice: Notice = { pin: created.initialPin, firstName: created.firstName, lastName: created.lastName };
    try {
      const refreshed = await listSalaStudents(readOptions);
      if (refreshed.status !== 200) throw new Error('No se pudo actualizar la lista de alumnos.');
      const createdStudent = refreshed.data.data.find((item) => item.id === created.id);
      if (!createdStudent) throw new Error('No se encontró la participación de Sala recién creada.');
      await assign(created.id, createdStudent.participationId);
      return { notice, assigned: true };
    } catch (error) {
      return { notice, assigned: false, error: error instanceof Error ? error.message : 'No se pudo asignar el alumno al horario.' };
    }
  }, onSuccess: async (result) => {
    const notice = result.assigned ? result.notice : { ...result.notice, assignmentError: result.error ?? 'Error desconocido de asignación.' };
    await onStudentCreated(notice, result.assigned);
  } });
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="assignment-title" className={`max-h-[90vh] w-full ${creatingStudent ? 'max-w-4xl' : 'max-w-lg'} overflow-auto rounded-md bg-white p-6 shadow-xl`}>
    <h2 id="assignment-title" className="text-xl font-semibold">Asignar alumno</h2>
    <p className="mt-3">Todos los {dayName(selection.date)} · {clock(selection.hour)} – {clock(selection.hour + 60)}</p>
    <p className="mt-1 text-sm">Comienza el <strong>{startDate}</strong> · Duración: 60 minutos.</p>
    {startDate !== selection.date ? <p className="mt-2 text-sm text-muted-foreground">La fecha consultada ya pasó. Se utilizará la siguiente ocurrencia de este día.</p> : null}
    {creatingStudent ? <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={studentForm.handleSubmit((values) => createStudent.mutate(values))}>
      <GeneralPersonFields form={studentForm as unknown as import('react-hook-form').UseFormReturn<PersonValues>} />
      <StudentTrainingFields form={studentForm} canPlanManage={false} />
      {agenda.isPending ? <p role="status" className="sm:col-span-2">Verificando disponibilidad…</p> : agenda.isError ? <p role="alert" className="sm:col-span-2">No se pudo consultar la disponibilidad.</p> : !slot ? <p role="alert" className="sm:col-span-2">El horario está cerrado, incompleto o sin cupo para la fecha de inicio.</p> : null}
      {createStudent.isError ? <p role="alert" className="text-sm text-red-800 sm:col-span-2">{createStudent.error.message}</p> : null}
      <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" disabled={createStudent.isPending} onClick={() => setCreatingStudent(false)}>Volver</Button><Button type="submit" disabled={!slot || agenda.isPending || agenda.isError || agenda.isFetching || createStudent.isPending}>{createStudent.isPending ? 'Guardando…' : 'Guardar e asignar'}</Button></div>
    </form> : <form className="mt-5 space-y-4" onSubmit={form.handleSubmit(() => create.mutate())}>
      <label className="grid gap-2 text-sm font-medium">Buscar alumno<input className="h-11 rounded-md border px-3" placeholder="Nombre, apellido o DNI" value={search} onChange={(event) => { setSearch(event.target.value); form.setValue('personId', ''); }} /></label>
      {students.isPending ? <p role="status">Cargando alumnos…</p> : students.isError ? <p role="alert">No se pudieron buscar los alumnos.</p> : term && matches.length === 0 ? <p>No hay alumnos activos con esa búsqueda.</p> : null}
      <div className="max-h-52 space-y-2 overflow-y-auto">{matches.map((item) => <button type="button" key={item.id} aria-pressed={personId === item.id} style={{ borderColor: personId === item.id ? 'var(--primary)' : undefined }} className={cn('min-h-11 w-full rounded-md border p-3 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring', personId === item.id && 'border-primary bg-primary/10')} onClick={() => form.setValue('personId', item.id)}>{item.firstName} {item.lastName} · DNI {item.dni}{!item.hasValidAccess ? <span className="block text-amber-900">Sin vigencia actual; se validará la fecha de inicio.</span> : null}</button>)}</div>
      {agenda.isPending ? <p role="status">Verificando disponibilidad…</p> : agenda.isError ? <p role="alert">No se pudo consultar la disponibilidad.</p> : !slot ? <p role="alert">El horario está cerrado, incompleto o sin cupo para la fecha de inicio.</p> : null}
      {create.isError ? <p role="alert" className="text-sm text-red-800">{create.error.message}</p> : null}
      {canManageParticipation && canCreatePerson ? <Button type="button" variant="secondary" className="w-full" disabled={!slot || agenda.isPending || agenda.isError || agenda.isFetching || create.isPending} onClick={() => { createStudent.reset(); setCreatingStudent(true); }}>+ Nuevo alumno</Button> : null}
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={create.isPending} onClick={onClose}>Cerrar</Button><Button type="submit" disabled={!student || !slot || agenda.isError || agenda.isFetching || create.isPending}>Confirmar asignación</Button></div>
    </form>}
  </section></div>;
}

export function FixedBookingsCalendar({ csrfToken, canManageAgenda, canManageParticipation, canCreatePerson }: { csrfToken: string; canManageAgenda: boolean; canManageParticipation: boolean; canCreatePerson: boolean }): React.JSX.Element {
  const client = useQueryClient();
  const today = todayOperational();
  const [week, setWeek] = useState(() => monday(today));
  const [band, setBand] = useState<'morning' | 'afternoon'>('morning');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [cancelledExpanded, setCancelledExpanded] = useState(false);
  const [othersExpanded, setOthersExpanded] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const [assigning, setAssigning] = useState(false);
  const [spontaneous, setSpontaneous] = useState(false);
  const [spontaneousLoading, setSpontaneousLoading] = useState(false);
  const [spontaneousMessage, setSpontaneousMessage] = useState('');
  const [spontaneousGroups, setSpontaneousGroups] = useState<AgendaGroup[]>([]);
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
  const selectedBookings = selection ? hourBookings(selectedGroups, selection.hour) : [];
  const fixed = selectedBookings.filter((entry) => entry.origin === 'FIXED' && entry.status !== 'CANCELLED');
  const cancelled = selectedBookings.filter(entry => entry.origin === 'FIXED' && entry.status === 'CANCELLED');
  const others = selectedBookings.filter((entry) => entry.origin !== 'FIXED');
  const operationDate = selection?.date ?? (dates.includes(today) ? today : week);
  const selectedPast = Boolean(selection && isPast(selection.date, selection.hour, now));
  const spontaneousEntries = [...new Map(selectedBookings.filter((entry) => entry.origin === 'SPONTANEOUS').map((entry) => [entry.personId, entry])).values()];
  const spontaneousPeople = new Set(spontaneousEntries.map((entry) => entry.personId));
  const historicalEntries = [...new Map(selectedBookings.filter((entry) => entry.origin !== 'SPONTANEOUS' && !spontaneousPeople.has(entry.personId)).map((entry) => [entry.personId, entry])).values()];
  const historyByStatus = {
    ATTENDED: historicalEntries.filter((entry) => entry.status === 'ATTENDED'),
    ABSENT: historicalEntries.filter((entry) => entry.status === 'ABSENT'),
    CANCELLED: historicalEntries.filter((entry) => entry.status === 'CANCELLED'),
    unregistered: historicalEntries.filter((entry) => entry.status === 'RESERVED' || entry.status === 'PENDING_PAYMENT'),
  };
  const refresh = async () => { await Promise.all([
    client.invalidateQueries({ queryKey: ['sala', 'agenda'] }), client.invalidateQueries({ queryKey: ['sala', 'availability'] }),
    client.invalidateQueries({ queryKey: ['sala', 'students'], refetchType: 'all' }), client.invalidateQueries({ queryKey: ['sala-fixed'] }),
    client.invalidateQueries({ queryKey: ['reservations'] }), client.invalidateQueries({ queryKey: ['sala-dashboard'] }),
  ]); };
  const update = useMutation({ mutationFn: async ({ entry, status, correction }: { entry: TimelineBooking; status: EditableStatus; correction: boolean }) => {
    const reference = { personId: entry.personId, scheduleSlotId: entry.scheduleSlotId, date: operationDate, startTime: clock(entry.startMinutes), ...(entry.sourceId ? { sourceId: entry.sourceId } : {}) };
    const options = { ...readOptions, headers: { 'x-csrf-token': csrfToken } };
    const response = correction ? await correctSalaOccurrence({ ...reference, status }, options) : status === 'ATTENDED' ? await markSalaOccurrenceAttended(reference, options) : status === 'ABSENT' ? await markSalaOccurrenceAbsent(reference, options) : await cancelSalaOccurrence(reference, options);
    if (response.status >= 400) throw new Error('No se pudo actualizar el estado.');
  }, onSuccess: async () => { setBooking(null); await refresh(); } });
  const closeLists = () => { setExpanded(false); setCancelledExpanded(false); setOthersExpanded(false); };
  const changeWeek = (date: string) => { setWeek(monday(date)); setSelection(null); closeLists(); setBooking(null); };
  const openSpontaneous = async () => {
    changeWeek(today);
    setSpontaneous(false);
    setSpontaneousLoading(true);
    setSpontaneousMessage('La incorporación espontánea se realiza únicamente en el día de hoy. Te llevamos a los horarios disponibles de hoy.');
    try {
      const groups = await client.fetchQuery({ queryKey: ['sala', 'agenda', today], queryFn: () => loadAgenda(today), staleTime: 0 });
      const hasUpcoming = groups.some(group => !group.isClosed && new Date(`${today}T${group.slot.startTime.slice(0, 5)}:00-03:00`).getTime() >= Date.now());
      if (!hasUpcoming) {
        setSpontaneousMessage('Hoy no quedan horarios disponibles para una incorporación espontánea.');
        return;
      }
      setSpontaneousGroups(groups);
      setSpontaneous(true);
    } catch {
      setSpontaneousMessage('No se pudieron cargar los horarios de hoy. Intentá nuevamente.');
    } finally {
      setSpontaneousLoading(false);
    }
  };
  const range = (values: number[]) => values.length ? `${clock(values[0]!).slice(0, 2)}–${clock(values[values.length - 1]! + 60).slice(0, 2)}` : 'Sin horarios';
  const renderEntry = (entry: TimelineBooking) => <li key={`${entry.origin}-${entry.sourceId ?? entry.personId}-${entry.startMinutes}`} className="space-y-2 border-t py-3 text-sm">
    <p className="font-medium">{entry.person.firstName} {entry.person.lastName}</p>
    <p>{entry.status === 'CANCELLED' ? entry.cancelledForNonPayment ? 'Cancelación automática por falta de vigencia' : 'Canceló esta fecha' : entry.status === 'PENDING_PAYMENT' ? 'Pendiente de renovación' : entry.status === 'ATTENDED' ? 'Asistió' : entry.status === 'ABSENT' ? 'Ausente' : 'Vigente'} · {clock(entry.startMinutes)} – {clock(entry.endMinutes)}</p>
    <div className="flex flex-wrap items-center gap-3"><Link className="underline" href={`/sala/people/${entry.personId}`}>Ver ficha</Link><Button variant="secondary" className="h-9" onClick={() => { update.reset(); setBooking(entry); }}>Ver reserva{canManageAgenda ? ' y asistencia' : ''}</Button></div>
  </li>;

  return <section data-testid="fixed-bookings-calendar" className="space-y-5" aria-labelledby="weekly-agenda-title">
    <header><h1 id="weekly-agenda-title" className="text-xl font-semibold">Agenda</h1></header>
    <div role="toolbar" aria-label="Navegación semanal" className="flex flex-wrap items-center gap-2"><Button variant="secondary" aria-label="Semana anterior" onClick={() => changeWeek(addCalendarDays(week, -7))}><ChevronLeft size={18} /></Button><Button variant="secondary" onClick={() => changeWeek(today)}>Hoy</Button><Button variant="secondary" aria-label="Semana siguiente" onClick={() => changeWeek(addCalendarDays(week, 7))}><ChevronRight size={18} /></Button><span className="rounded-md border bg-white px-3 py-2 text-sm font-medium">{weekLabel(week)}</span><Button variant="secondary" className="ml-auto" onClick={() => { void refresh(); }}>Actualizar</Button></div>
    {queries.some((query) => query.isPending) ? <p role="status">Cargando semana…</p> : null}
    {queries.some((query) => query.isError) ? <p role="alert">No se pudo cargar toda la semana. Usá Actualizar para reintentar.</p> : null}
    <div role="group" aria-label="Franjas horarias" className="grid w-full grid-cols-2 gap-1 rounded-md bg-slate-100 p-1">{(['morning', 'afternoon'] as const).map((key) => <button key={key} type="button" aria-pressed={band === key} onClick={() => setBand(key)} className={cn('min-h-11 w-full rounded px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring', band === key ? 'bg-white text-foreground' : 'text-slate-600 hover:bg-white/70')}>{key === 'morning' ? 'Mañana' : 'Tarde'} · {range(bands[key])}</button>)}</div>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
      <div className="min-w-0 space-y-4">
        <div className="overflow-x-auto rounded-md border bg-white" tabIndex={0} aria-label="Calendario semanal"><table className="w-full min-w-[720px] border-separate border-spacing-2 text-sm"><thead><tr><th className="sticky left-0 z-10 w-14 bg-white p-2 text-left font-medium">Hora</th>{visibleDays.map((date) => <th key={date} scope="col" className={cn('min-w-28 p-2 text-left', date === today && 'bg-primary/15')}><span className="block capitalize">{dayName(date)}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{shortDate(date)}</span></th>)}</tr></thead><tbody>{visibleHours.map((hour) => <tr key={hour}><th scope="row" className="sticky left-0 z-10 bg-white p-2 align-top font-medium tabular-nums">{clock(hour)}</th>{visibleDays.map((date) => {
          const query = queries[dates.indexOf(date)]!;
          const group = calendarHour(query.data ?? [], hour);
          const past = isPast(date, hour, now);
          const selected = selection?.date === date && selection.hour === hour;
          // Inline border colors override the existing unlayered global border reset.
          return <td key={date} className="p-0 align-top">{group ? <button type="button" aria-label={`${dayName(date)} ${clock(hour)}: ${group.reserved} / ${group.capacity} ocupados, ${past ? 'Finalizado' : availabilityLabel(group)}`} aria-pressed={selected} style={{ borderColor: selected ? 'var(--primary)' : past || group.isClosed ? '#cbd5e1' : group.available === 0 ? '#fecaca' : '#a7f3d0' }} onClick={() => { setSelection({ date, hour }); closeLists(); setBooking(null); }} className={cn('relative flex min-h-28 w-full flex-col justify-between gap-2 rounded-md border-2 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', past ? 'border-slate-200 bg-slate-100 text-slate-600' : group.isClosed ? 'border-slate-200 bg-slate-50 text-slate-600' : group.available === 0 ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900', selected && 'border-primary ring-1 ring-primary')}>
            {selected ? <Check size={14} aria-hidden="true" className="absolute right-1 top-1" /> : null}{past ? <span className="font-semibold">Finalizado</span> : <><span className="font-semibold tabular-nums">{group.reserved} / {group.capacity} <span className="font-normal">ocupados</span></span><span className="flex items-start gap-1 text-xs">{!group.isClosed && group.available > 0 ? <Check size={12} className="mt-0.5 shrink-0" aria-hidden="true" /> : null}{availabilityLabel(group)}</span><Occupancy group={group} /></>}
          </button> : <div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-md bg-slate-50 text-slate-500"><span>—</span><span className="text-xs">{query.isPending ? 'Cargando' : query.isError ? 'Sin datos' : 'Sin turno'}</span></div>}</td>;
        })}</tr>)}</tbody></table></div>
        {!visibleHours.length && !queries.some((query) => query.isPending || query.isError) ? <p className="text-sm text-muted-foreground">No hay horarios configurados en esta franja.</p> : null}
        <div aria-label="Leyenda" className="flex flex-wrap gap-4 text-xs text-muted-foreground">{[['Con cupo', 'border-emerald-200 bg-emerald-50'], ['Completo', 'border-red-200 bg-red-50 text-red-800'], ['Sin turno', 'border-slate-100 bg-slate-50'], ['Seleccionado', 'border-primary bg-yellow-50']].map(([label, color]) => <span key={label} className={cn("flex items-center gap-2", label === 'Completo' && 'text-red-800')}><span aria-hidden="true" style={{ borderColor: label === 'Seleccionado' ? 'var(--primary)' : label === 'Con cupo' ? '#a7f3d0' : label === 'Completo' ? '#fecaca' : undefined }} className={cn('h-3 w-3 rounded-sm border-2', color)} />{label}</span>)}</div>
      </div>
      <aside aria-label="Turno seleccionado" className="min-w-0 rounded-md border bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-semibold"><ArrowUpRight size={18} /> TURNO SELECCIONADO</p>
        {selection && selectedGroup ? <>
          <h3 className="mt-5 text-2xl font-semibold capitalize">{dayName(selection.date)}</h3><p className="mt-1 text-xl tabular-nums">{clock(selection.hour)} – {clock(selection.hour + 60)}</p><p className="mt-1 text-sm text-muted-foreground">{shortDate(selection.date)}</p>
          {selectedPast ? <><div className="mt-4 rounded-md bg-slate-100 p-3 text-slate-700"><p className="font-semibold">Finalizado</p></div>{[['Asistieron', historyByStatus.ATTENDED], ['Ausentes', historyByStatus.ABSENT], ['Cancelaron', historyByStatus.CANCELLED], ['Incorporaciones espontáneas', spontaneousEntries], ['Sin registrar', historyByStatus.unregistered]].map(([label, entries]) => Array.isArray(entries) && entries.length ? <section key={label as string} className="mt-5"><h4 className="font-semibold">{label as string}</h4><ul className="mt-2">{(entries as TimelineBooking[]).map(renderEntry)}</ul></section> : null)}</> : <>
          <p style={{ borderColor: !selectedGroup.isClosed && selectedGroup.available === 0 ? '#fecaca' : undefined }} className={cn('mt-4 rounded-md border p-3 font-medium', selectedGroup.isClosed ? 'bg-slate-50 text-slate-600' : selectedGroup.available === 0 ? 'border-red-200 bg-red-50 text-red-800' : 'text-emerald-900')}>{availabilityLabel(selectedGroup)}</p>
          <p className="mt-6 font-medium">Turno fijo semanal</p><p className="mt-1 text-sm text-muted-foreground">Todos los {dayName(selection.date)}</p>
          <div className={cn('mt-6 space-y-3', !selectedGroup.isClosed && selectedGroup.available === 0 ? 'text-red-800' : 'text-emerald-900')}><p className="flex justify-between gap-2 text-sm text-foreground"><span>Ocupados / capacidad</span><strong className="tabular-nums">{selectedGroup.reserved} / {selectedGroup.capacity}</strong></p><Occupancy group={selectedGroup} /></div>
          <p className="mt-3 text-sm">{selectedGroup.isClosed ? 'Horario cerrado para esta fecha' : `Quedan ${selectedGroup.available} lugares disponibles`}</p>
          {selectedGroup.isOverbooked ? <p className="mt-2 text-sm text-red-800">El horario tiene sobrecupo.</p> : null}
          </>}
          {!selectedPast ? <><Button variant="secondary" className="mt-5 w-full" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>Ver alumnos asignados ({fixed.length})</Button>
          {expanded ? <div className="mt-4"><h4 className="font-semibold">Alumnos con turno fijo</h4>{fixed.length ? <ul className="mt-2">{fixed.map(renderEntry)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No hay alumnos fijos asignados a esta hora.</p>}</div> : null}
          <Button variant="secondary" className="mt-3 w-full" aria-expanded={cancelledExpanded} onClick={() => setCancelledExpanded(!cancelledExpanded)}>Ver alumnos que cancelaron ({cancelled.length})</Button>
          {cancelledExpanded ? <div className="mt-4"><h4 className="font-semibold">Cancelaciones de esta fecha</h4>{cancelled.length ? <ul className="mt-2">{cancelled.map(renderEntry)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No hay cancelaciones de turnos fijos a esta hora.</p>}</div> : null}
          {canManageAgenda && !selectedPast ? <Button className="mt-3 w-full" disabled={(selection.date >= today && !assignmentSlot(selectedGroups, selection.hour)) || queries[dates.indexOf(selection.date)]?.isFetching || queries[dates.indexOf(selection.date)]?.isError} onClick={() => setAssigning(true)}><Plus size={16} />Asignar alumno</Button> : null}
          {others.length ? <><Button variant="secondary" className="mt-3 w-full" aria-expanded={othersExpanded} onClick={() => setOthersExpanded(!othersExpanded)}>Ver reservas puntuales e incorporaciones ({others.length})</Button>{othersExpanded ? <div className="mt-4"><h4 className="font-semibold">Reservas puntuales e incorporaciones</h4><ul className="mt-2">{others.map((entry) => <React.Fragment key={`${entry.origin}-${entry.sourceId ?? entry.personId}-${entry.startMinutes}`}><li className="mt-3 text-xs text-muted-foreground">{entry.origin === 'ONE_OFF' ? 'Reserva puntual' : 'Incorporación espontánea'}</li>{renderEntry(entry)}</React.Fragment>)}</ul></div> : null}</> : null}</> : null}
        </> : <p className="mt-5 text-sm text-muted-foreground">Seleccioná un horario del calendario para consultar sus alumnos y operar la agenda.</p>}
        {canManageAgenda ? <Button variant="secondary" className="mt-5 w-full" disabled={spontaneousLoading} onClick={() => { void openSpontaneous(); }}>Incorporación espontánea</Button> : null}
        {spontaneousMessage && !spontaneous ? <p role="status" className="mt-3 text-sm">{spontaneousMessage}</p> : null}
        {spontaneousLoading ? <p role="status" className="mt-2 text-sm">Cargando horarios de hoy…</p> : null}
      </aside>

    </div>
    {assigning && selection && canManageAgenda ? <AssignmentDialog selection={selection} csrfToken={csrfToken} canManageParticipation={canManageParticipation} canCreatePerson={canCreatePerson} onClose={() => setAssigning(false)} onSaved={async () => { setAssigning(false); await refresh(); }} onStudentCreated={async (created, assigned) => { setAssigning(false); if (assigned) setExpanded(true); setNotice(created); await refresh(); }} /> : null}
    {booking ? <div className="relative z-[60]"><BookingModal booking={booking} date={operationDate} pending={update.isPending} canManageAgenda={canManageAgenda} error={update.isError ? update.error.message : null} onClose={() => setBooking(null)} onAction={(status) => update.mutate({ entry: booking, status, correction: false })} onCorrect={(status) => update.mutate({ entry: booking, status, correction: true })} /></div> : null}
    {spontaneous && canManageAgenda ? <div className="relative z-[60]"><SpontaneousModal date={today} groups={queries[dates.indexOf(today)]?.data ?? spontaneousGroups} initialSlotId="" csrfToken={csrfToken} canManageParticipation={canManageParticipation} canCreatePerson={canCreatePerson} onClose={() => setSpontaneous(false)} onSaved={(created) => { setSpontaneous(false); if (created) setNotice(created); void refresh(); }} /></div> : null}
    {notice ? <TemporaryPortalPin notice={notice} onClose={() => setNotice(null)} /> : null}
  </section>;
}
