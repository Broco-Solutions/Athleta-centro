'use client';
import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, Circle, Minus } from 'lucide-react';
import { PortalFrame, portalFetch, formatTime, today, bookingError } from '../../portal-ui';

type Service = { id: string; name: string; durationMinutes: number };
type Slot = { scheduleSlotId: string; startTime: string; endTime: string; available: boolean; date: string };
type StartOption = Slot & { key: string };
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
function starts(rows: Slot[], service?: Service): StartOption[] {
  if (!service) return [];
  const count = service.durationMinutes / 15;
  if (!Number.isInteger(count) || count <= 0) return [];
  return rows.flatMap(item => {
    if (!/:(00|30)$/.test(item.startTime)) return [];
    const start = minutes(item.startTime);
    const range = Array.from({ length: count }, (_, index) => rows.find(block =>
      block.scheduleSlotId === item.scheduleSlotId && block.date === item.date
      && minutes(block.startTime) === start + index * 15
      && minutes(block.endTime) === start + (index + 1) * 15));
    if (range.some(block => !block)) return [];
    return [{ ...item, endTime: clock(start + service.durationMinutes), available: range.every(block => block?.available === true), key: item.scheduleSlotId + ':' + item.startTime }];
  }).sort((a, b) => a.startTime.localeCompare(b.startTime));
}
const choiceClass = (selected: boolean): string => 'flex min-h-16 items-center justify-between gap-3 rounded-lg border p-4 text-left disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted-foreground ' + (selected ? 'border-primary bg-primary/10' : 'bg-surface');
function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }): React.JSX.Element {
  return <section className="space-y-4"><h2 className="flex items-center gap-3 font-semibold"><span className="flex size-7 items-center justify-center rounded-full bg-surface-muted text-sm">{number}</span>{title}</h2>{children}</section>;
}

export default function PortalReserve(): React.JSX.Element {
  const client = useQueryClient();
  const currentDate = today();
  const [date, setDate] = useState(currentDate);
  const [serviceId, setServiceId] = useState('');
  const [selection, setSelection] = useState('');
  const [reservationNow, setReservationNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setReservationNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const [calendar, setCalendar] = useState(false);
  const [message, setMessage] = useState('');
  const services = useQuery({ queryKey: ['portal', 'sala', 'services'], queryFn: () => portalFetch<Service[]>('sala/services') });
  const service = services.data?.length === 1 ? services.data[0]?.id ?? '' : serviceId;
  const selectedService = services.data?.find(item => item.id === service);
  const availability = useQuery({
    queryKey: ['portal', 'sala', 'availability', date],
    queryFn: async () => (await portalFetch<Slot[]>('sala/availability?date=' + date)).map(item => ({ ...item, startTime: formatTime(item.startTime), endTime: formatTime(item.endTime) })),
    enabled: Boolean(selectedService),
  });
  const options = starts(availability.data ?? [], selectedService).filter(item => {
    if (date < currentDate) return false;
    if (date > currentDate) return true;
    return new Date(`${date}T${item.startTime}:00-03:00`).getTime()
      + (selectedService?.durationMinutes ?? 0) * 60_000 - reservationNow >= 20 * 60_000;
  });
  const selectedSlot = options.find(item => item.key === selection && item.available);
  const reserve = useMutation({
    mutationFn: async () => {
      if (!selectedSlot || !selectedService) throw new Error('SLOT_REQUIRED');
      const token = (await portalFetch<{ csrfToken: string }>('auth/session')).csrfToken;
      return portalFetch('sala/reservations', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ date, scheduleSlotId: selectedSlot.scheduleSlotId, serviceTypeId: service, startTime: selectedSlot.startTime }),
      });
    },
    onSuccess: async () => {
      setMessage('Horario reservado.'); setSelection('');
      await Promise.all([client.invalidateQueries({ queryKey: ['portal', 'sala'] }), client.invalidateQueries({ queryKey: ['portal', 'sala', 'availability'] })]);
    },
    onError: async error => {
      setMessage(bookingError(error));
      await client.invalidateQueries({ queryKey: ['portal', 'sala', 'availability'] });
    },
  });
  const chooseDate = (value: string): void => {
    if (!value || value < currentDate || value > addDays(currentDate, 30)) return;
    setDate(value); setSelection(''); setMessage('');
  };
  const quickDates = [0, 1, 2].map(offset => addDays(currentDate, offset));
  const hasServices = Boolean(services.data?.length);

  return <PortalFrame title="Reservar en Sala" subtitle="Elegí cuándo querés venir a entrenar." backToHome>
    <div className="max-w-4xl space-y-8 rounded-xl border bg-surface p-5 sm:p-8">
      <Step number={1} title="Elegí el servicio">
        {services.isLoading ? <p role="status" className="text-sm text-muted-foreground">Cargando servicios…</p> : services.isError ? <p role="alert">No pudimos cargar los servicios. Intentá nuevamente.</p> : !hasServices ? <p className="text-sm text-muted-foreground">Tu Plan actual no tiene servicios disponibles. Consultá con Athleta.</p> : <div className="grid gap-3 sm:grid-cols-2">{services.data?.map(item => <button type="button" key={item.id} aria-label={item.name + ' ' + item.durationMinutes + ' min'} aria-pressed={service === item.id} disabled={reserve.isPending} className={choiceClass(service === item.id)} onClick={() => { setServiceId(item.id); setSelection(''); setMessage(''); }}><span><span className="block font-medium">{item.name}</span><span className="text-sm text-muted-foreground">{item.durationMinutes} min</span></span>{service === item.id ? <Check size={20} className="text-primary-hover" aria-hidden="true" /> : null}</button>)}</div>}
      </Step>
      <Step number={2} title="Elegí la fecha">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">{quickDates.map((value, index) => <button type="button" key={value} aria-label={(index === 0 ? 'Hoy' : index === 1 ? 'Mañana' : dateLabel(value, { weekday: 'long' })) + ' ' + shortDate(value) + ' ' + dateLabel(value, { weekday: 'long' })} disabled={!hasServices || reserve.isPending} aria-pressed={date === value} className={choiceClass(date === value) + ' relative justify-center px-2'} onClick={() => chooseDate(value)}><span className="text-center"><span className="block text-sm font-medium">{index === 0 ? 'Hoy' : index === 1 ? 'Mañana' : dateLabel(value, { weekday: 'long' })}</span><strong className="my-1 block">{shortDate(value)}</strong><span className="block text-xs capitalize text-muted-foreground">{dateLabel(value, { weekday: 'long' })}</span></span>{date === value ? <Check size={12} aria-hidden="true" className="absolute right-2 top-2 text-primary-hover" /> : null}</button>)}</div>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm capitalize text-muted-foreground">{dateLabel(date, { month: 'long', year: 'numeric' })}</p><button type="button" disabled={!hasServices || reserve.isPending} aria-expanded={calendar} aria-controls="reservation-date" className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm disabled:opacity-50" onClick={() => setCalendar(!calendar)}><CalendarDays size={16} aria-hidden="true" />Ver calendario</button></div>
        {calendar ? <label className="grid gap-2 text-sm">Fecha<input id="reservation-date" type="date" className="min-h-11 rounded-lg border px-3" value={date} min={currentDate} max={addDays(currentDate, 30)} disabled={!hasServices || reserve.isPending} onChange={event => chooseDate(event.target.value)} /></label> : null}
      </Step>
      <Step number={3} title="Elegí el horario">
        <div><p className="text-sm capitalize">{date === currentDate ? 'Hoy, ' : ''}{dateLabel(date, { weekday: 'long' }) + ' ' + shortDate(date)}</p>{selectedService ? <p className="mt-1 text-sm text-muted-foreground">{selectedService.name} · {selectedService.durationMinutes} min</p> : null}</div>
        {!selectedService ? <p className="text-sm text-muted-foreground">Elegí un servicio para consultar los horarios.</p> : availability.isLoading ? <p role="status" className="text-sm text-muted-foreground">Cargando horarios…</p> : availability.isError ? <p role="alert">No pudimos cargar los horarios. Intentá nuevamente.</p> : options.length ? <div className="grid gap-3 md:grid-cols-3">{options.map(item => <button type="button" key={item.key} aria-label={item.startTime + '–' + item.endTime + ' ' + (item.available ? 'Hay lugar' : 'Sin lugar')} disabled={!item.available || reserve.isPending} aria-pressed={selectedSlot?.key === item.key} className={choiceClass(selectedSlot?.key === item.key)} onClick={() => { setSelection(item.key); setMessage(''); }}><span><strong className="block text-sm">{item.startTime}–{item.endTime}</strong><span className="text-xs text-muted-foreground">{item.available ? 'Hay lugar' : 'Sin lugar'}</span></span>{!item.available ? <Minus size={18} aria-hidden="true" /> : selectedSlot?.key === item.key ? <Check size={18} aria-hidden="true" className="text-primary-hover" /> : <Circle size={16} aria-hidden="true" className="text-muted-foreground" />}</button>)}</div> : <p className="text-sm text-muted-foreground">No hay horarios disponibles para esta fecha.</p>}
      </Step>
      <Step number={4} title="Revisá y reservá">
        <div className="rounded-lg border bg-surface-muted p-4"><h3 className="text-sm font-semibold">Tu selección</h3>{selectedService ? <p className="mt-2 text-sm">{selectedService.name} · {selectedService.durationMinutes} min</p> : null}<p className="mt-1 text-sm capitalize text-muted-foreground">{dateLabel(date, { weekday: 'long' }) + ' ' + shortDate(date)}{selectedSlot ? ' · ' + selectedSlot.startTime + '–' + selectedSlot.endTime : ' · Elegí un horario'}</p></div>
        <button type="button" className="min-h-12 w-full rounded-lg bg-primary px-5 font-semibold hover:bg-primary-hover disabled:opacity-50 sm:w-auto" disabled={!selectedService || !selectedSlot || reserve.isPending} onClick={() => reserve.mutate()}>{reserve.isPending ? 'Reservando…' : 'Reservar en Sala'}</button>
        {message ? <p role={reserve.isError ? 'alert' : 'status'} className="text-sm">{message}</p> : null}
      </Step>
    </div>
  </PortalFrame>;
}
