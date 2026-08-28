'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
import { cancelSalaReservation, changeFixedSalaBooking, createFixedSalaBooking, createSalaReservation, endFixedSalaBooking, getSalaAvailability, listFixedSalaBookings, listPeople, listPersonSalaParticipations, listPersonSalaRoutines, listSalaExerciseDefinitions, listSalaReservations, listSalaSchedule, listSalaServiceTypes, replaceSalaRoutine } from '@athleta/api-client';
import { WorkspaceShell } from '../../features/auth/workspace-shell';
import { currentSession } from '../../features/auth/auth';
import { AgendaPanel } from '../../features/sala/agenda-panel';
import { RoutinePanel, type ExerciseDefinition, type Routine } from '../../features/sala/routine-panel';
import { PhysicalEvaluationPanel } from '../../features/sala/physical-evaluation-panel';
import { PaymentPanel } from '../../features/sala/payment-panel';

type Person = { id: string; firstName: string; lastName: string; dni: string };
type Slot = { id: string; weekday: string; startTime: string };
type ServiceType = { id: string; name: string; durationMinutes: number };
type Availability = { slotId: string; scheduleSlotId: string; startTime: string; endTime: string; capacity: number; reserved: number; available: number; isOverbooked: boolean; isClosed: boolean };
type Participation = { id: string; endDate?: string | null };
type FixedBooking = { id: string; startDate: string; endDate?: string | null; scheduleSlot?: Slot };
type Reservation = { id: string; date: string; cancelledAt?: string | null; scheduleSlot?: Slot };
const weekdayLabels: Record<string, string> = { MONDAY: 'Lunes', TUESDAY: 'Martes', WEDNESDAY: 'Miércoles', THURSDAY: 'Jueves', FRIDAY: 'Viernes', SATURDAY: 'Sábado', SUNDAY: 'Domingo' };
const timeLabel = (value: string): string => { const match = value.match(/(?:T|^)(\d{2}:\d{2})/); return match?.[1] ?? value.slice(0, 5); };
const endTimeLabel = (start: string, duration: number): string => { const [hour, minute] = start.split(':').map(Number); const total = (hour ?? 0) * 60 + (minute ?? 0) + duration; return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; };
const weekdayLabel = (value: string): string => weekdayLabels[value] ?? value;

const unwrapList = <T,>(value: unknown): T[] => { const body = (value as { data?: unknown }).data; if (Array.isArray(body)) return body as T[]; const nested = (body as { data?: unknown } | undefined)?.data; return Array.isArray(nested) ? nested as T[] : []; };
const requestOptions = (csrfToken: string): RequestInit => ({ credentials: 'include', headers: { 'x-csrf-token': csrfToken } });

export default function SalaPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const csrfToken = session.data?.csrfToken ?? '';
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [personId, setPersonId] = useState('');
  const [participationId, setParticipationId] = useState('');
  const [slotId, setSlotId] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [bookingStartTime, setBookingStartTime] = useState('');
  const [confirmOverbooking, setConfirmOverbooking] = useState(false);

  const people = useQuery({ queryKey: ['people', 'sala'], queryFn: async () => unwrapList<Person>(await listPeople({ page: 1, pageSize: 100 }, { credentials: 'include' })), initialData: [] });
  const slots = useQuery({ queryKey: ['sala', 'schedule'], queryFn: async () => unwrapList<Slot>(await listSalaSchedule({ credentials: 'include' })), initialData: [] });
  const services = useQuery({ queryKey: ['sala', 'service-types'], queryFn: async () => unwrapList<ServiceType>(await listSalaServiceTypes({ credentials: 'include' })), initialData: [] });
  const participations = useQuery({ queryKey: ['sala', 'parts', personId], queryFn: async () => unwrapList<Participation>(await listPersonSalaParticipations(personId, { credentials: 'include' })), enabled: Boolean(personId), initialData: [] });
  const availability = useQuery({ queryKey: ['sala', 'availability', date], queryFn: async () => unwrapList<Availability>(await getSalaAvailability({ date }, { credentials: 'include' })), initialData: [] });
  const fixedBookings = useQuery({ queryKey: ['sala', 'fixed', personId], queryFn: async () => unwrapList<FixedBooking>(await listFixedSalaBookings(personId, { credentials: 'include' })), enabled: Boolean(personId), initialData: [] });
  const reservations = useQuery({ queryKey: ['sala', 'reservations', personId], queryFn: async () => unwrapList<Reservation>(await listSalaReservations(personId, { credentials: 'include' })), enabled: Boolean(personId), initialData: [] });

  const refreshBookings = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['sala', 'fixed'] }), queryClient.invalidateQueries({ queryKey: ['sala', 'reservations'] }), queryClient.invalidateQueries({ queryKey: ['sala', 'availability'] }), queryClient.invalidateQueries({ queryKey: ['sala', 'agenda'] })]); };
  const reserve = useMutation({ mutationFn: async () => { const response = await createSalaReservation({ personId, salaParticipationId: participationId, scheduleSlotId: slotId, serviceTypeId, startTime: bookingStartTime, date, confirmOverbooking }, requestOptions(csrfToken)); if (Number(response.status) === 409 && !confirmOverbooking) throw new Error('OVERBOOKING_CONFIRMATION_REQUIRED'); if (Number(response.status) >= 400) throw new Error('RESERVATION_FAILED'); }, onSuccess: async () => { setConfirmOverbooking(false); await refreshBookings(); }, onError: (error) => { if (String(error).includes('OVERBOOKING_CONFIRMATION_REQUIRED')) setConfirmOverbooking(true); } });
  const createFixed = useMutation({ mutationFn: () => createFixedSalaBooking({ personId, salaParticipationId: participationId, scheduleSlotId: slotId, serviceTypeId, startTime: bookingStartTime, startDate: date }, requestOptions(csrfToken)), onSuccess: refreshBookings });
  const changeFixed = useMutation({ mutationFn: (id: string) => changeFixedSalaBooking(id, { id, personId, salaParticipationId: participationId, scheduleSlotId: slotId, serviceTypeId, startTime: bookingStartTime, startDate: date }, requestOptions(csrfToken)), onSuccess: refreshBookings });
  const finishFixed = useMutation({ mutationFn: (id: string) => endFixedSalaBooking(id, { endDate: date }, requestOptions(csrfToken)), onSuccess: refreshBookings });
  const cancelReservation = useMutation({ mutationFn: (id: string) => cancelSalaReservation(id, requestOptions(csrfToken)), onSuccess: refreshBookings });

  const peopleRows = Array.isArray(people.data) ? people.data : [];
  const slotRows = Array.isArray(slots.data) ? slots.data : [];
  const availabilityRows = Array.isArray(availability.data) ? availability.data : [];
  const serviceRows = Array.isArray(services.data) ? services.data : [];
  const selectedService = serviceRows.find((service) => service.id === serviceTypeId);
  const windowSlots = availabilityRows.filter((state) => state.scheduleSlotId === slotId);
  const startOptions = windowSlots.filter((state) => { if (!selectedService) return true; const startIndex = windowSlots.findIndex((candidate) => candidate.slotId === state.slotId); return windowSlots.slice(startIndex, startIndex + selectedService.durationMinutes / 15).length === selectedService.durationMinutes / 15; });
  const activeParticipations = participations.data.filter((participation) => !participation.endDate);
  const routineApi = { list: async (id: string, options: RequestInit): Promise<Routine[]> => unwrapList<Routine>(await listPersonSalaRoutines(id, options)), exercises: async (options: RequestInit): Promise<ExerciseDefinition[]> => unwrapList<ExerciseDefinition>(await listSalaExerciseDefinitions(options)), create: async (input: Parameters<typeof replaceSalaRoutine>[0], options: RequestInit) => replaceSalaRoutine(input, options), replace: async (_id: string, input: Parameters<typeof replaceSalaRoutine>[0], options: RequestInit) => replaceSalaRoutine(input, options) };

  return (
    <WorkspaceShell active="Sala">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-semibold">Sala</h1><a href="/sala/configuration" className="rounded-md border px-3 py-2 text-sm font-medium">Configuración</a></header>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-md border bg-white p-5"><h2 className="mb-2 text-lg font-semibold">Operación diaria</h2><p className="text-sm text-muted-foreground">La capacidad general, los horarios y las excepciones se administran desde Configuración.</p><a className="mt-4 inline-flex rounded-md border px-3 py-2 text-sm" href="/sala/configuration">Abrir configuración</a></section>
        <section className="rounded-md border bg-white p-5"><h2 className="mb-4 text-lg font-semibold">Disponibilidad por bloque</h2><input aria-label="Fecha de disponibilidad" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-10 w-full rounded-md border px-3" /><div className="mt-4 grid gap-2">{availabilityRows.map((state) => <div key={state.slotId} className="rounded border p-3 text-sm"><div className="flex justify-between"><span>{state.startTime}–{state.endTime}</span><span>{state.isClosed ? 'Cerrado' : state.isOverbooked ? 'Sobrecupo' : state.available === 0 ? 'Completo' : 'Disponible'}</span></div><p>{state.reserved} / {state.capacity} ocupados</p></div>)}</div></section>
      </div>
      <section className="mt-5 rounded-md border bg-white p-5"><h2 className="mb-4 text-lg font-semibold">Reservas</h2><div className="grid gap-3 md:grid-cols-3"><select aria-label="Alumno" value={personId} onChange={(event) => { setPersonId(event.target.value); setParticipationId(''); }} className="h-10 rounded-md border px-3"><option value="">Seleccionar alumno</option>{peopleRows.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName} · {person.dni}</option>)}</select><select aria-label="Participación" value={participationId} onChange={(event) => setParticipationId(event.target.value)} className="h-10 rounded-md border px-3"><option value="">Participación activa</option>{activeParticipations.map((participation) => <option key={participation.id} value={participation.id}>Plan actual</option>)}</select><select aria-label="Servicio" value={serviceTypeId} onChange={(event) => setServiceTypeId(event.target.value)} className="h-10 rounded-md border px-3"><option value="">Seleccionar servicio</option>{serviceRows.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.durationMinutes} min</option>)}</select><select aria-label="Ventana semanal" value={slotId} onChange={(event) => { setSlotId(event.target.value); setBookingStartTime(''); }} className="h-10 rounded-md border px-3"><option value="">Seleccionar ventana</option>{slotRows.map((slot) => <option key={slot.id} value={slot.id}>{weekdayLabel(slot.weekday)} · desde {timeLabel(slot.startTime)}</option>)}</select><select aria-label="Hora de inicio" value={bookingStartTime} onChange={(event) => setBookingStartTime(event.target.value)} className="h-10 rounded-md border px-3"><option value="">Seleccionar inicio</option>{startOptions.map((state) => <option key={state.slotId} value={state.startTime}>{state.startTime}</option>)}</select><div className="flex gap-2"><Button type="button" disabled={!personId || !participationId || !slotId || !serviceTypeId || !bookingStartTime || reserve.isPending} onClick={() => reserve.mutate()}>Reserva puntual</Button><Button type="button" variant="secondary" disabled={!personId || !participationId || !slotId || !serviceTypeId || !bookingStartTime || createFixed.isPending} onClick={() => createFixed.mutate()}>Turno fijo</Button></div></div>{selectedService && bookingStartTime ? <p className="mt-3 text-sm text-muted-foreground">{selectedService.name} · {selectedService.durationMinutes} min · {bookingStartTime}–{endTimeLabel(bookingStartTime, selectedService.durationMinutes)}</p> : null}{confirmOverbooking ? <div role="alert" className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">El turno supera la capacidad de uno o más bloques. <Button className="ml-3" type="button" onClick={() => reserve.mutate()}>Confirmar sobrecupo</Button></div> : null}
        <div className="mt-5 grid gap-5 lg:grid-cols-2"><div><h3 className="font-semibold">Turnos fijos</h3>{fixedBookings.data.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Sin turnos fijos.</p> : fixedBookings.data.map((booking) => <div key={booking.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-3 text-sm"><span>{weekdayLabel(booking.scheduleSlot?.weekday ?? '')} · {timeLabel(booking.scheduleSlot?.startTime ?? '')} · {booking.startDate} · {booking.endDate ?? 'Sin fecha de finalización'}</span>{!booking.endDate ? <span className="flex gap-2"><Button type="button" variant="secondary" onClick={() => changeFixed.mutate(booking.id)}>Modificar</Button><Button type="button" variant="secondary" onClick={() => finishFixed.mutate(booking.id)}>Finalizar</Button></span> : null}</div>)}</div><div><h3 className="font-semibold">Reservas puntuales</h3>{reservations.data.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Sin reservas puntuales.</p> : reservations.data.map((reservation) => <div key={reservation.id} className="flex items-center justify-between gap-2 border-b py-3 text-sm"><span>{reservation.date} · {timeLabel(reservation.scheduleSlot?.startTime ?? '')} · {reservation.cancelledAt ? 'Cancelada' : 'Activa'}</span>{!reservation.cancelledAt ? <Button type="button" variant="secondary" onClick={() => cancelReservation.mutate(reservation.id)}>Cancelar</Button> : null}</div>)}</div></div>
      </section>
      <AgendaPanel date={date} onDateChange={setDate} csrfToken={csrfToken} people={peopleRows} />
      {personId && participationId ? <RoutinePanel personId={personId} participationId={participationId} csrfToken={csrfToken} api={routineApi} /> : null}
      {personId && participationId && session.data?.user?.id ? <PhysicalEvaluationPanel personId={personId} participationId={participationId} professorId={session.data.user.id} csrfToken={csrfToken} /> : null}
      {personId ? <PaymentPanel personId={personId} csrfToken={csrfToken} /> : null}
    </WorkspaceShell>
  );
}
