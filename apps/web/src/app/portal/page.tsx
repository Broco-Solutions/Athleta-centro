'use client';
import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, CheckCircle2 } from 'lucide-react';
import type { RoutineDay } from '../../features/sala/routine-editor';
import { bookingError, PortalApiError, PortalFrame, portalFetch, formatDate, formatTime, today, replacementDateAllowed, firstReplacementDate, type ReplacementWeek } from './portal-ui';

type FixedBooking = { id: string; startDate: string; endDate?: string | null; startTime?: string; serviceType?: { id?: string; name: string; durationMinutes?: number } | null; scheduleSlot?: { id: string; weekday: string } | null };
type SalaData = { replacementWeeks: ReplacementWeek[]; reservations: Array<{ id: string; date: string; startTime?: string; serviceType?: { name: string } | null; cancelledAt?: string | null }>; fixed: FixedBooking[]; fixedOccurrences?: Array<{ fixedSalaBookingId: string; date: string; startTime: string; status: 'RESERVED' | 'PENDING_PAYMENT' | 'CANCELLED' | 'ATTENDED' | 'ABSENT'; cancelledForNonPayment: boolean }>; routine?: { days: RoutineDay[] } | null; evaluations: Array<{ id: string; evaluationDate: string; results: Array<{ resultText: string; testDefinition: { id: string; name: string } }> }>; validity: { hasValidAccess: boolean; validUntil: string | null } };
type Slot = { scheduleSlotId: string; startTime: string; endTime: string; available: boolean; date: string };
type Service = { id: string; name: string; durationMinutes: number };
type StartOption = Slot & { key: string };
type ReservationConfirmation = { serviceName: string; date: string; startTime: string; endTime: string };
const weekdays = [{ value: 'MONDAY', label: 'Lunes', short: 'Lun' }, { value: 'TUESDAY', label: 'Martes', short: 'Mar' }, { value: 'WEDNESDAY', label: 'Miércoles', short: 'Mié' }, { value: 'THURSDAY', label: 'Jueves', short: 'Jue' }, { value: 'FRIDAY', label: 'Viernes', short: 'Vie' }, { value: 'SATURDAY', label: 'Sábado', short: 'Sáb' }, { value: 'SUNDAY', label: 'Domingo', short: 'Dom' }];
const weekdayLabel = (value?: string): string => weekdays.find(item => item.value === value)?.label ?? '';
const csrf = async (): Promise<string> => (await portalFetch<{ csrfToken: string }>('auth/session')).csrfToken;
const shortDate = (value: string): string => value.slice(8, 10) + '/' + value.slice(5, 7);
const longWeekday = (value: string): string => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long' }).format(new Date(`${value}T12:00:00-03:00`));
const minutes = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clock = (value: number): string => String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
function starts(rows: Slot[], service?: Service): StartOption[] {
  if (!service) return [];
  const count = service.durationMinutes / 15;
  if (!Number.isInteger(count) || count <= 0) return [];
  return rows.flatMap(item => {
    if (!/:00$/.test(item.startTime)) return [];
    const start = minutes(item.startTime);
    const range = Array.from({ length: count }, (_, index) => rows.find(block => block.scheduleSlotId === item.scheduleSlotId && block.date === item.date && minutes(block.startTime) === start + index * 15 && minutes(block.endTime) === start + (index + 1) * 15));
    if (range.some(block => !block)) return [];
    return [{ ...item, endTime: clock(start + service.durationMinutes), available: range.every(block => block?.available === true), key: item.scheduleSlotId + ':' + item.startTime }];
  }).sort((a, b) => a.startTime.localeCompare(b.startTime));
}
const choiceClass = (selected: boolean): string => 'flex min-h-16 items-center justify-between gap-3 rounded-lg border p-4 text-left disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted-foreground ' + (selected ? 'border-primary bg-primary/10' : 'bg-surface');
function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }): React.JSX.Element { return <section className="space-y-4"><h2 className="flex items-center gap-3 font-semibold"><span className="flex size-7 items-center justify-center rounded-full bg-surface-muted text-sm">{number}</span>{title}</h2>{children}</section>; }

export default function PortalHome(): React.JSX.Element {
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const [cancellingOccurrence, setCancellingOccurrence] = useState<NonNullable<SalaData['fixedOccurrences']>[number] | null>(null);
  const [occurrenceError, setOccurrenceError] = useState('');
  const [reservationDialog, setReservationDialog] = useState(false);
  const [reservationNow, setReservationNow] = useState(Date.now);
  useEffect(() => {
    if (!reservationDialog) return;
    const timer = setInterval(() => setReservationNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [reservationDialog]);
  const [reservationService, setReservationService] = useState('');
  const [reservationDate, setReservationDate] = useState(today);
  const [reservationKey, setReservationKey] = useState('');
  const [reservationError, setReservationError] = useState('');
  const [reservationConfirmation, setReservationConfirmation] = useState<ReservationConfirmation | null>(null);
  const maxDate = new Date(`${today()}T12:00:00Z`); maxDate.setUTCDate(maxDate.getUTCDate() + 30);

  const data = useQuery({ queryKey: ['portal', 'sala'], queryFn: () => portalFetch<SalaData>('sala'), retry: false });
  const services = useQuery({ queryKey: ['portal', 'sala', 'services'], queryFn: () => portalFetch<Service[]>('sala/services') });
  const selectedService = reservationService ? services.data?.find(item => item.id === reservationService) : { id: '', name: 'Sala', durationMinutes: 60 };
  const replacementWeeks = data.data?.replacementWeeks ?? [];
  const maxReservationDate = data.data?.validity.validUntil && data.data.validity.validUntil < maxDate.toISOString().slice(0, 10) ? data.data.validity.validUntil : maxDate.toISOString().slice(0, 10);
  const initialReservationDate = firstReplacementDate(replacementWeeks, today(), maxReservationDate);
  const validReplacementDate = replacementDateAllowed(reservationDate, replacementWeeks) && reservationDate >= today() && reservationDate <= maxReservationDate;
  const availability = useQuery({ queryKey: ['portal', 'sala', 'availability', reservationDate], queryFn: async () => (await portalFetch<Slot[]>(`sala/availability?date=${reservationDate}`)).map(item => ({ ...item, startTime: formatTime(item.startTime), endTime: formatTime(item.endTime) })), enabled: reservationDialog && Boolean(selectedService && reservationDate) && validReplacementDate && data.data?.validity.hasValidAccess === true });
  const reservationOptions = starts(availability.data ?? [], selectedService).filter(item => reservationDate !== today() || new Date(`${reservationDate}T${item.startTime}:00-03:00`).getTime() + (selectedService?.durationMinutes ?? 0) * 60_000 - reservationNow >= 20 * 60_000);
  const selectedReservation = reservationOptions.find(item => item.key === reservationKey && item.available);
  const saveReservation = useMutation({ mutationFn: async () => { if (!selectedService || !selectedReservation || !validReplacementDate || !data.data?.validity.hasValidAccess) throw new Error('RESERVATION_REQUIRED'); const confirmation = { serviceName: selectedService.name, date: reservationDate, startTime: selectedReservation.startTime, endTime: selectedReservation.endTime }; const token = await csrf(); await portalFetch('sala/reservations', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': token }, body: JSON.stringify({ date: reservationDate, ...(selectedService.id ? { serviceTypeId: selectedService.id } : {}), scheduleSlotId: selectedReservation.scheduleSlotId, startTime: selectedReservation.startTime }) }); return confirmation; }, onSuccess: async confirmation => { setReservationConfirmation(confirmation); setReservationKey(''); setReservationError(''); await refresh(); }, onError: error => setReservationError(bookingError(error)) });
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ['portal', 'sala'] }), client.invalidateQueries({ queryKey: ['portal', 'sala', 'availability'] }), client.invalidateQueries({ queryKey: ['portal', 'sala', 'fixed-availability'] })]); };
  const cancel = useMutation({ mutationFn: async (id: string) => { const token = await csrf(); return portalFetch(`sala/reservations/${id}/cancel`, { method: 'POST', headers: { 'x-csrf-token': token } }); }, onSuccess: refresh });
  const cancelFixedOccurrence = useMutation({
    mutationFn: async () => {
      if (!cancellingOccurrence) throw new Error('Seleccioná una fecha.');
      const token = await csrf();
      return portalFetch(`sala/fixed-bookings/${cancellingOccurrence.fixedSalaBookingId}/occurrences/${cancellingOccurrence.date}/cancel`, { method: 'POST', headers: { 'x-csrf-token': token } });
    },
    onSuccess: async () => {
      const date = cancellingOccurrence?.date;
      setCancellingOccurrence(null);
      await refresh();
      const updated = client.getQueryData<SalaData>(['portal', 'sala']);
      setMessage(date && replacementDateAllowed(date, updated?.replacementWeeks ?? []) ? 'Fecha cancelada. Ahora podés reservar un reemplazo para esta semana.' : 'Fecha cancelada.');
    },
    onError: error => setOccurrenceError(error instanceof PortalApiError ? error.message : 'No pudimos cancelar esta fecha. Intentá nuevamente.'),
  });
  const sala = data.data ? { ...data.data, fixed: data.data.fixed.filter(item => !item.endDate) } : null;
  const upcomingReservations = (sala?.reservations ?? []).filter(reservation => !reservation.cancelledAt)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  const nextReservation = upcomingReservations[0];
  const routineDays = sala?.routine?.days ?? [];
  const routineExerciseCount = routineDays.reduce((total, day) => total + day.exercises.length, 0);
  return <PortalFrame title="Inicio">
    {data.isLoading ? <p role="status">Cargando Sala…</p> : null}
    {data.isError && !(data.error instanceof PortalApiError && data.error.code === 'PORTAL_SALA_UNAVAILABLE') ? <p role="alert">No pudimos cargar Sala.</p> : null}
    {sala ? <>
    {message ? <p role="status" className="text-sm">{message}</p> : null}
    <section className="rounded-lg border bg-white p-4">
      <h2 className="text-lg font-semibold">Próxima reserva</h2>
      {nextReservation ? <div className="flex items-center justify-between gap-3 py-3 text-sm">
        <span><strong>{formatDate(nextReservation.date)}{nextReservation.startTime ? ` · ${formatTime(nextReservation.startTime)}` : ''}</strong><br />{nextReservation.serviceType?.name ?? 'Sala'} · Reservado</span>
        <button type="button" className="min-h-11 rounded border px-3 py-2" onClick={() => cancel.mutate(nextReservation.id)}>Cancelar</button>
      </div> : <p className="mt-2 text-sm text-muted-foreground">No tenés próximas reservas.</p>}
      <Link href="/portal/sala/reservas" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Ver mis reservas<ArrowRight size={16} aria-hidden="true" /></Link>
    </section>
    {initialReservationDate ? <button type="button" className="min-h-12 w-full rounded-lg bg-primary px-5 font-semibold hover:bg-primary-hover disabled:opacity-50" disabled={!sala.validity.hasValidAccess} onClick={() => { setReservationService(''); setReservationDate(initialReservationDate); setReservationKey(''); setReservationError(''); setReservationConfirmation(null); setReservationNow(Date.now()); setReservationDialog(true); }}>Reservar reemplazo</button> : null}
    {reservationDialog ? <div role="dialog" aria-modal="true" aria-labelledby="reservation-title" className="fixed inset-0 z-30 overflow-y-auto bg-white sm:grid sm:place-items-center sm:bg-black/50 sm:p-4"><div className="min-h-full w-full bg-surface p-4 sm:min-h-0 sm:max-w-4xl sm:rounded-lg sm:border sm:p-8">{!reservationConfirmation ? <button type="button" className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium" disabled={saveReservation.isPending} onClick={() => { setReservationDialog(false); setReservationConfirmation(null); setReservationError(''); }}><ArrowLeft size={18} aria-hidden="true" />Volver</button> : null}<div className="mx-auto max-w-3xl space-y-8">{reservationConfirmation ? <section className="max-w-2xl rounded-lg border bg-white p-5 sm:p-6" aria-labelledby="reservation-title"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 shrink-0 text-green-700" size={22} aria-hidden="true"/><div><h2 id="reservation-title" className="text-xl font-semibold">Reserva confirmada</h2><p className="mt-1 text-sm text-muted-foreground">Tu lugar quedó reservado.</p></div></div><dl className="mt-5 grid gap-3 border-t pt-4 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">Servicio</dt><dd className="mt-1 font-medium">{reservationConfirmation.serviceName}</dd></div><div><dt className="text-muted-foreground">Fecha</dt><dd className="mt-1 font-medium capitalize">{longWeekday(reservationConfirmation.date)} {shortDate(reservationConfirmation.date)}</dd></div><div><dt className="text-muted-foreground">Hora</dt><dd className="mt-1 font-medium">{reservationConfirmation.startTime} – {reservationConfirmation.endTime}</dd></div></dl><button type="button" className="mt-5 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium hover:bg-primary-hover" onClick={() => { setReservationDialog(false); setReservationConfirmation(null); setReservationError(''); }}>Volver a Inicio</button></section> : <><h2 id="reservation-title" className="text-2xl font-semibold">Reserva de reemplazo</h2><p className="text-sm">Elegí otro horario dentro de la misma semana del turno que cancelaste.</p>
      <Step number={1} title="Servicio (opcional)"><div className="grid gap-3 sm:grid-cols-2">{[{ id: '', name: 'Sin servicio — Sala (60 min)', durationMinutes: 60 }, ...(services.data ?? [])].map(item => <button type="button" key={item.id} aria-label={`${item.name} ${item.durationMinutes} min`} aria-pressed={reservationService === item.id} disabled={saveReservation.isPending} className={choiceClass(reservationService === item.id)} onClick={() => { setReservationService(item.id); setReservationKey(''); setReservationError(''); }}><span>{item.name}<span className="block text-sm text-muted-foreground">{item.durationMinutes} min</span></span>{reservationService === item.id ? <Check size={20} aria-hidden="true" /> : null}</button>)}</div></Step>
      <Step number={2} title="Fecha"><label className="block text-sm" htmlFor="reservation-date">Fecha de la reserva</label><input id="reservation-date" type="date" className="min-h-12 w-full rounded-lg border bg-surface px-4 sm:w-auto" min={today()} max={sala.validity.validUntil && sala.validity.validUntil < maxDate.toISOString().slice(0, 10) ? sala.validity.validUntil : maxDate.toISOString().slice(0, 10)} value={reservationDate} disabled={saveReservation.isPending} onChange={event => { setReservationDate(event.target.value); setReservationKey(''); setReservationError(''); }} /></Step>
      <Step number={3} title="Horario">{!validReplacementDate ? <p>Elegí una fecha dentro de la semana habilitada por tu cancelación.</p> : !selectedService || !reservationDate ? <p>Elegí un servicio y una fecha para consultar los horarios.</p> : availability.isLoading ? <p role="status">Cargando horarios…</p> : availability.isError ? <p role="alert">No pudimos cargar los horarios. Intentá nuevamente.</p> : reservationOptions.length ? <div className="grid gap-3 md:grid-cols-3">{reservationOptions.map(item => <button type="button" key={item.key} aria-label={`${item.startTime}–${item.endTime} ${item.available ? 'Hay lugar' : 'Sin lugar'}`} className={choiceClass(reservationKey === item.key)} disabled={!item.available || saveReservation.isPending} aria-pressed={reservationKey === item.key} onClick={() => { setReservationKey(item.key); setReservationError(''); }}><span><strong className="block text-sm">{item.startTime}–{item.endTime}</strong><span className="text-xs text-muted-foreground">{item.available ? 'Hay lugar' : 'Sin lugar'}</span></span>{reservationKey === item.key ? <Check size={18} aria-hidden="true" /> : null}</button>)}</div> : <p>No hay horarios disponibles para este día.</p>}</Step>
      <Step number={4} title="Confirmar"><div className="rounded-lg border bg-surface-muted p-4"><p>{selectedService?.name} · {formatDate(reservationDate)}{selectedReservation ? ` · ${selectedReservation.startTime}–${selectedReservation.endTime}` : ''}</p><p className="mt-2 text-sm text-muted-foreground">La fecha de la reserva debe estar cubierta por tu vigencia de Sala.</p></div><button type="button" className="min-h-12 w-full rounded-lg bg-primary px-5 font-semibold hover:bg-primary-hover disabled:opacity-50 sm:w-auto" disabled={!validReplacementDate || !selectedReservation || saveReservation.isPending || reservationDate < today() || reservationDate > maxDate.toISOString().slice(0, 10) || !sala.validity.hasValidAccess || !sala.validity.validUntil || reservationDate > sala.validity.validUntil} onClick={() => saveReservation.mutate()}>{saveReservation.isPending ? 'Reservando…' : 'Confirmar reserva'}</button>{reservationError ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{reservationError}</p> : null}</Step>
    </>}</div></div></div> : null}
    <section id="turnos-fijos" className="rounded-lg border bg-white p-4"><h2 className="text-lg font-semibold">Mis turnos fijos</h2>{!initialReservationDate ? <p className="mt-2 text-sm text-muted-foreground">Para reservar otro horario, primero cancelá una fecha de uno de tus turnos fijos.</p> : null}
      {sala.fixed.length ? <ul className="mt-3 divide-y">{sala.fixed.map(item => { const duration = item.serviceType?.durationMinutes; const startTime = item.startTime ? formatTime(item.startTime) : ''; const endTime = duration && startTime ? clock(minutes(startTime) + duration) : ''; return <li key={item.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="text-sm"><strong>{item.serviceType?.name ?? 'Sala'}{duration ? ` · ${duration} min` : ''}</strong><p className="mt-1">{weekdayLabel(item.scheduleSlot?.weekday)} · {startTime}{endTime ? `–${endTime}` : ''}</p><p className="mt-1 text-muted-foreground">Desde {formatDate(item.startDate)}</p></div></li>; })}</ul> : <p className="mt-2 text-sm text-muted-foreground">No tenés turnos fijos.</p>}
      {sala.fixedOccurrences?.length ? <div className="mt-3 rounded-md bg-slate-50 p-3"><h3 className="text-sm font-semibold">Próximos turnos fijos</h3><ul className="mt-2 divide-y text-sm">{sala.fixedOccurrences.map(occurrence => <li key={`${occurrence.fixedSalaBookingId}:${occurrence.date}`} className="flex flex-wrap items-center justify-between gap-3 py-2"><span>{formatDate(occurrence.date)} · {occurrence.startTime}</span><span className={occurrence.status === 'PENDING_PAYMENT' ? 'font-medium text-amber-800' : occurrence.status === 'CANCELLED' ? 'text-slate-600' : 'text-emerald-800'}>{occurrence.status === 'PENDING_PAYMENT' ? 'Pendiente de renovación' : occurrence.status === 'CANCELLED' ? 'Cancelado' : occurrence.status === 'RESERVED' ? 'Reservado' : occurrence.status === 'ATTENDED' ? 'Asistió' : 'Ausente'}</span>{occurrence.status === 'RESERVED' || occurrence.status === 'PENDING_PAYMENT' ? <button type="button" className="min-h-11 rounded border px-3 py-2" onClick={() => { setOccurrenceError(''); setMessage(''); setCancellingOccurrence(occurrence); }}>Cancelar esta fecha</button> : null}</li>)}</ul>{sala.fixedOccurrences.some(occurrence => occurrence.status === 'PENDING_PAYMENT') ? <p className="mt-2 text-xs text-amber-900">Tu lugar está reservado, pero la fecha no está cubierta por tu vigencia actual. Necesitás renovarla antes del inicio.</p> : null}</div> : null}
    </section>
    {cancellingOccurrence ? <div role="dialog" aria-modal="true" aria-labelledby="occurrence-cancel-title" className="fixed inset-0 z-30 grid place-items-center bg-black/50 p-4"><div className="w-full max-w-md rounded-md bg-white p-6"><h3 id="occurrence-cancel-title" className="text-lg font-semibold">Cancelar esta fecha</h3><p className="mt-2 text-sm">Se cancelará únicamente el turno del {formatDate(cancellingOccurrence.date)} a las {formatTime(cancellingOccurrence.startTime)}.</p><p className="mt-2 text-sm">Tu turno fijo continuará las semanas siguientes.</p>{occurrenceError ? <p role="alert" className="mt-3 text-sm text-red-700">{occurrenceError}</p> : null}<div className="mt-5 flex justify-end gap-2"><button type="button" className="min-h-11 rounded border px-3 py-2" disabled={cancelFixedOccurrence.isPending} onClick={() => setCancellingOccurrence(null)}>Volver</button><button type="button" className="min-h-11 rounded bg-primary px-3 py-2 font-medium disabled:opacity-50" disabled={cancelFixedOccurrence.isPending} onClick={() => cancelFixedOccurrence.mutate()}>Cancelar esta fecha</button></div></div></div> : null}
    <section id="rutina" className="rounded-lg border border-border bg-white p-4">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Mi rutina</h2>{sala.routine ? <p className="mt-1 text-sm text-muted-foreground">{routineDays.length} {routineDays.length === 1 ? 'día' : 'días'} · {routineExerciseCount} {routineExerciseCount === 1 ? 'ejercicio' : 'ejercicios'}</p> : null}</div>{sala.routine ? <Link href="/portal/sala/rutina" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Ver rutina<ArrowRight size={16} aria-hidden="true" /></Link> : null}</div>
      {!sala.routine ? <p className="mt-2 text-sm text-muted-foreground">No hay una rutina activa.</p> : null}
    </section><section id="evaluaciones" className="rounded-lg border bg-white p-4"><h2 className="text-lg font-semibold">Mis evaluaciones físicas</h2><PhysicalResults evaluations={sala.evaluations} /></section><section className="rounded-lg border bg-white p-4"><h2 className="text-lg font-semibold">Vigencia de Sala</h2><p className="mt-2 text-sm">{sala.validity.hasValidAccess ? `Vigente hasta ${formatDate(sala.validity.validUntil!)}` : 'Sin vigencia'}</p>{!sala.validity.hasValidAccess ? <p className="mt-1 text-sm text-muted-foreground">Necesitás renovar tu vigencia para realizar nuevas reservas.</p> : null}</section>
    </> : null}
  </PortalFrame>;
}

function PhysicalResults({ evaluations }: { evaluations: SalaData['evaluations'] }): React.JSX.Element {
  const groups = new Map<string, { name: string; results: Array<{ date: string; text: string }> }>();
  for (const evaluation of [...evaluations].sort((a, b) => a.evaluationDate.localeCompare(b.evaluationDate))) {
    for (const result of evaluation.results) {
      const group = groups.get(result.testDefinition.id) ?? { name: result.testDefinition.name, results: [] };
      group.results.push({ date: evaluation.evaluationDate, text: result.resultText });
      groups.set(result.testDefinition.id, group);
    }
  }
  return groups.size ? <>{[...groups].map(([id, group]) => <article key={id} className="border-b py-3 text-sm"><h3 className="font-semibold">{group.name}</h3><ul className="mt-2 space-y-1">{group.results.map((result, index) => <li key={index}>{formatDate(result.date)} · {result.text}</li>)}</ul></article>)}</> : <p className="mt-2 text-sm text-muted-foreground">No hay evaluaciones físicas.</p>;
}
