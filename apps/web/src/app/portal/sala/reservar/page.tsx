'use client';
import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Circle, Minus } from 'lucide-react';
import { PortalFrame, portalFetch, formatDate, formatTime, today, bookingError, firstReplacementDate, type ReplacementWeek } from '../../portal-ui';

type Slot = { scheduleSlotId: string; startTime: string; endTime: string; available: boolean; date: string };
type StartOption = Slot & { key: string };
type ReservationConfirmation = { date: string; startTime: string; endTime: string };
const addDays = (date: string, days: number): string => {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', ...options }).format(new Date(date + 'T12:00:00-03:00'));
const shortDate = (date: string): string => date.slice(8, 10) + '/' + date.slice(5, 7);
const minutes = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clock = (value: number): string => String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
// Offer only complete consecutive windows. The API validates capacity again at submit.
function starts(rows: Slot[], durationMinutes = 60): StartOption[] {
  const count = durationMinutes / 15;
  if (!Number.isInteger(count) || count <= 0) return [];
  return rows.flatMap(item => {
    if (!/:00$/.test(item.startTime)) return [];
    const start = minutes(item.startTime);
    const range = Array.from({ length: count }, (_, index) => rows.find(block =>
      block.scheduleSlotId === item.scheduleSlotId && block.date === item.date
      && minutes(block.startTime) === start + index * 15
      && minutes(block.endTime) === start + (index + 1) * 15));
    if (range.some(block => !block)) return [];
    return [{ ...item, endTime: clock(start + durationMinutes), available: range.every(block => block?.available === true), key: item.scheduleSlotId + ':' + item.startTime }];
  }).sort((a, b) => a.startTime.localeCompare(b.startTime));
}
const choiceClass = (selected: boolean): string => 'flex min-h-16 items-center justify-between gap-3 rounded-lg border p-4 text-left disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted-foreground ' + (selected ? 'border-primary bg-primary/10' : 'bg-surface');
function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }): React.JSX.Element {
  return <section className="space-y-4"><h2 className="flex items-center gap-3 font-semibold"><span className="flex size-7 items-center justify-center rounded-full bg-surface-muted text-sm">{number}</span>{' '}{title}</h2>{children}</section>;
}

export default function PortalReserve(): React.JSX.Element {
  const client = useQueryClient();
  const currentDate = today();
  const [chosenDate, setDate] = useState('');
  const [selection, setSelection] = useState('');
  const [reservationNow, setReservationNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setReservationNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const [reservationConfirmation, setReservationConfirmation] = useState<ReservationConfirmation | null>(null);
  const [reservationError, setReservationError] = useState('');
  const sala = useQuery({ queryKey: ['portal', 'sala'], queryFn: () => portalFetch<{ replacementWeeks: ReplacementWeek[]; validity: { hasValidAccess: boolean; validUntil: string | null } }>('sala') });
  const validUntil = sala.data?.validity.validUntil;
  const maxDate = validUntil && validUntil < addDays(currentDate, 30) ? validUntil : addDays(currentDate, 30);
  const hasValidity = sala.data?.validity.hasValidAccess === true;
  const replacementWeeks = sala.data?.replacementWeeks ?? [];
  const initialDate = firstReplacementDate(replacementWeeks, currentDate, maxDate);
  const activeReplacementWeek = replacementWeeks.find(week => week.available > 0 && initialDate && initialDate >= week.weekStart && initialDate <= week.weekEnd);
  const weekDates = activeReplacementWeek ? Array.from({ length: 7 }, (_, index) => addDays(activeReplacementWeek.weekStart, index))
    .filter(value => value <= activeReplacementWeek.weekEnd && value >= currentDate && value <= maxDate) : [];
  const date = weekDates.includes(chosenDate) ? chosenDate : initialDate || currentDate;
  const validReplacementDate = weekDates.includes(date);
  const availability = useQuery({
    queryKey: ['portal', 'sala', 'availability', date],
    queryFn: async () => (await portalFetch<Slot[]>('sala/availability?date=' + date)).map(item => ({ ...item, startTime: formatTime(item.startTime), endTime: formatTime(item.endTime) })),
    enabled: hasValidity && validReplacementDate,
  });
  const options = starts(availability.data ?? []).filter(item => {
    if (date < currentDate) return false;
    if (date > currentDate) return true;
    return new Date(`${date}T${item.startTime}:00-03:00`).getTime()
      + 60 * 60_000 - reservationNow >= 20 * 60_000;
  });
  const selectedSlot = options.find(item => item.key === selection && item.available);
  const reserve = useMutation({
    mutationFn: async () => {
      if (!selectedSlot || !hasValidity || !validReplacementDate) throw new Error('SLOT_REQUIRED');
      const confirmation = { date, startTime: selectedSlot.startTime, endTime: selectedSlot.endTime };
      const token = (await portalFetch<{ csrfToken: string }>('auth/session')).csrfToken;
      await portalFetch('sala/reservations', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ date, scheduleSlotId: selectedSlot.scheduleSlotId, startTime: selectedSlot.startTime }),
      });
      return confirmation;
    },
    onSuccess: async confirmation => {
      setReservationConfirmation(confirmation);
      setSelection('');
      await Promise.all([client.invalidateQueries({ queryKey: ['portal', 'sala'] }), client.invalidateQueries({ queryKey: ['portal', 'sala', 'availability'] })]);
    },
    onError: async error => {
      setReservationError(bookingError(error));
      await client.invalidateQueries({ queryKey: ['portal', 'sala', 'availability'] });
    },
  });
  const chooseDate = (value: string): void => {
    if (!weekDates.includes(value)) return;
    setDate(value); setSelection(''); setReservationError('');
  };

  if (sala.isPending) return <PortalFrame title="Reservar reemplazo" backToHome><p role="status">Cargando vigencia…</p></PortalFrame>;
  if (sala.isError) return <PortalFrame title="Reservar reemplazo" backToHome><p role="alert">No pudimos cargar tu vigencia. Intentá nuevamente.</p></PortalFrame>;
  if (!hasValidity) return <PortalFrame title="Reservar reemplazo" backToHome>
    <section aria-labelledby="reservation-validity-title" className="w-full max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
          <AlertTriangle aria-hidden="true" size={18} />
        </span>
        <div className="min-w-0">
          <h2 id="reservation-validity-title" className="font-semibold text-amber-900">Cuota sin vigencia</h2>
          <p className="mt-2 text-base text-foreground">No podés realizar nuevas reservas por el momento.</p>
          <p className="mt-1 text-sm text-amber-900/80">Consultá en recepción para renovar tu cuota y volver a reservar.</p>
          <Link href="/portal" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-medium text-foreground hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft aria-hidden="true" size={16} />
            Volver a Inicio
          </Link>
        </div>
      </div>
    </section>
  </PortalFrame>;
  if (!initialDate && !reservationConfirmation) return <PortalFrame title="Reservar reemplazo" backToHome><section className="space-y-3"><h2 className="font-semibold">No tenés un cambio disponible.</h2><p>Para reservar otro horario, primero cancelá una fecha de uno de tus turnos fijos.</p><Link href="/portal" className="inline-flex min-h-11 items-center underline">Volver a Inicio</Link></section></PortalFrame>;
  return <PortalFrame title="Reservar reemplazo" subtitle="Elegí otro horario dentro de la misma semana del turno que cancelaste." backToHome>
    {reservationConfirmation ? <section className="w-full max-w-2xl rounded-lg border bg-white p-5 sm:p-6" aria-labelledby="reservation-confirmation-title"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 shrink-0 text-green-700" size={22} aria-hidden="true"/><div><h2 id="reservation-confirmation-title" className="text-xl font-semibold">Reserva confirmada</h2><p className="mt-1 text-sm text-muted-foreground">Tu lugar quedó reservado.</p></div></div><dl className="mt-5 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Fecha</dt><dd className="mt-1 font-medium capitalize">{dateLabel(reservationConfirmation.date, { weekday: 'long' })} {shortDate(reservationConfirmation.date)}</dd></div><div><dt className="text-muted-foreground">Hora</dt><dd className="mt-1 font-medium">{reservationConfirmation.startTime} – {reservationConfirmation.endTime}</dd></div></dl><Link href="/portal" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft aria-hidden="true" size={16}/>Volver a Inicio</Link></section> : <div className="max-w-4xl space-y-8 rounded-xl border bg-surface p-5 sm:p-8">
      <section className="space-y-2"><h2 className="font-semibold">Semana disponible</h2><p className="text-sm">{activeReplacementWeek ? `${formatDate(activeReplacementWeek.weekStart)} — ${formatDate(activeReplacementWeek.weekEnd)}` : ''}</p></section>
      <Step number={1} title="Elegí el día">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">{weekDates.map(value => <button type="button" key={value} aria-label={dateLabel(value, { weekday: 'long' }) + ' ' + shortDate(value)} disabled={reserve.isPending} aria-pressed={date === value} className={choiceClass(date === value) + ' justify-center px-2'} onClick={() => chooseDate(value)}><span className="text-center"><span className="block text-sm font-medium capitalize">{dateLabel(value, { weekday: 'short' }).replace('.', '')}</span><strong className="mt-1 block">{value.slice(8, 10)}</strong></span></button>)}</div>
      </Step>
      <Step number={2} title="Elegí el horario">
        <div><p className="text-sm capitalize">{date === currentDate ? 'Hoy, ' : ''}{dateLabel(date, { weekday: 'long' }) + ' ' + shortDate(date)}</p></div>
        {!validReplacementDate ? <p>Elegí una fecha dentro de la semana habilitada por tu cancelación.</p> : availability.isLoading ? <p role="status" className="text-sm text-muted-foreground">Cargando horarios…</p> : availability.isError ? <p role="alert">No pudimos cargar los horarios. Intentá nuevamente.</p> : options.length ? <div className="grid gap-3 md:grid-cols-3">{options.map(item => <button type="button" key={item.key} aria-label={item.startTime + '–' + item.endTime + ' ' + (item.available ? 'Hay lugar' : 'Sin lugar')} disabled={!item.available || reserve.isPending} aria-pressed={selectedSlot?.key === item.key} className={choiceClass(selectedSlot?.key === item.key)} onClick={() => { setSelection(item.key); setReservationError(''); }}><span><strong className="block text-sm">{item.startTime}–{item.endTime}</strong><span className="text-xs text-muted-foreground">{item.available ? 'Hay lugar' : 'Sin lugar'}</span></span>{!item.available ? <Minus size={18} aria-hidden="true" /> : selectedSlot?.key === item.key ? <Check size={18} aria-hidden="true" className="text-primary-hover" /> : <Circle size={16} aria-hidden="true" className="text-muted-foreground" />}</button>)}</div> : <p className="text-sm text-muted-foreground">No hay horarios disponibles para esta fecha.</p>}
      </Step>
      <Step number={3} title="Confirmá">
        <div className="rounded-lg border bg-surface-muted p-4"><h3 className="text-sm font-semibold">Tu selección</h3><p className="mt-1 text-sm capitalize text-muted-foreground">{dateLabel(date, { weekday: 'long' }) + ' ' + shortDate(date)}{selectedSlot ? ' · ' + selectedSlot.startTime + '–' + selectedSlot.endTime : ' · Elegí un horario'}</p></div>
        <button type="button" className="min-h-12 w-full rounded-lg bg-primary px-5 font-semibold hover:bg-primary-hover disabled:opacity-50 sm:w-auto" disabled={!validReplacementDate || !selectedSlot || reserve.isPending} onClick={() => reserve.mutate()}>{reserve.isPending ? 'Reservando…' : 'Reservar reemplazo'}</button>
        {reservationError ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{reservationError}</p> : null}
      </Step>
    </div>}
  </PortalFrame>;
}
