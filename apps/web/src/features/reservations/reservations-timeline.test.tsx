import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ReservationsTimeline, positionBookings, splitAgendaGroups, timelineHours } from './reservations-timeline';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const person = { id: '10000000-0000-4000-8000-000000000001', firstName: 'Homer', lastName: 'Simpson', dni: '45000001' };
const professional = { id: '30000000-0000-4000-8000-000000000001', firstName: 'Brian', lastName: 'Griffin', discipline: 'Kinesiólogo' };
const salaBooking = { id: 'sala-1', source: 'SALA' as const, person, startTime: '09:00', durationMinutes: 60, serviceName: 'Sala', status: 'RESERVED', origin: 'ONE_OFF', scheduleSlotId: 'slot-1' };
const transversalData = { date: '2026-09-02', startTime: '08:00', endTime: '12:00', rows: [{ kind: 'SALA' as const, professional: null, bookings: [salaBooking] }, { kind: 'PROFESSIONAL' as const, professional, bookings: [{ id: 'clinic-1', source: 'CLINIC' as const, person: { ...person, id: 'person-2', firstName: 'Marge' }, startTime: '10:00', durationMinutes: 60, serviceName: 'Kinesiología', status: 'CANCELLED', origin: 'APPOINTMENT' }] }, { kind: 'PROFESSIONAL' as const, professional: { ...professional, id: 'empty', firstName: 'Stewie' }, bookings: [] }] };
function salaPerson(id: string, firstName: string, lastName: string) { return { ...person, id, firstName, lastName }; }
const professorBookings = [
  { ...salaBooking, id: 'fixed-8', person: salaPerson('p-juan', 'Juan', 'Pérez'), startTime: '08:00', serviceName: 'Musculación', durationMinutes: 60, origin: 'FIXED', status: 'RESERVED' },
  { ...salaBooking, id: 'oneoff-9', person: salaPerson('p-maria', 'María', 'Gómez'), startTime: '09:00', serviceName: 'Funcional', durationMinutes: 45, origin: 'ONE_OFF', status: 'RESERVED' },
  { ...salaBooking, id: 'fixed-9', person: salaPerson('p-pedro', 'Pedro', 'López'), startTime: '09:00', serviceName: 'Musculación', durationMinutes: 60, origin: 'FIXED', status: 'ATTENDED' },
  { ...salaBooking, id: 'spontaneous-1030', person: salaPerson('p-ana', 'Ana', 'Torres'), startTime: '10:30', serviceName: 'Funcional', durationMinutes: 45, origin: 'SPONTANEOUS', status: 'ATTENDED' },
];
function response(rows: typeof transversalData.rows, date = '2026-09-02') { return { date, startTime: '07:00', endTime: '12:00', rows }; }
function professorResponse(bookings = professorBookings, date = '2026-09-02') { return response([{ kind: 'SALA' as const, professional: null, bookings }], date); }
beforeAll(() => { globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch; server.listen({ onUnhandledRequest: 'error' }); });
afterEach(() => { server.resetHandlers(); vi.useRealTimers(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
function renderTimeline(isProfessorOnly = false, date = '2026-09-02', onDateChange = vi.fn(), variant: 'sala' | 'transversal' = isProfessorOnly ? 'sala' : 'transversal') { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return { ...render(<QueryClientProvider client={client}><ReservationsTimeline isProfessorOnly={isProfessorOnly} variant={variant} date={date} onDateChange={onDateChange} csrfToken="csrf" /></QueryClientProvider>), onDateChange, client }; }
function serve(data: unknown) { server.use(http.get('http://localhost:3000/api/reservations', () => HttpResponse.json({ data }))); }

describe('transversal timeline', () => {
  it('shows hourly headers without quarter-hour labels', async () => { serve(transversalData); renderTimeline(); expect(await screen.findByText('09:00')).toBeInTheDocument(); expect(screen.getByText('10:00')).toBeInTheDocument(); expect(screen.getByText('11:00')).toBeInTheDocument(); expect(screen.queryByText(':15')).not.toBeInTheDocument(); });
  it('keeps Sala, booked professionals and empty professionals as separate rows', async () => { serve(transversalData); renderTimeline(); expect(await screen.findByText('Sala')).toBeInTheDocument(); expect(screen.getByText('Brian Griffin')).toBeInTheDocument(); expect(screen.getByText('Stewie Griffin')).toBeInTheDocument(); expect(screen.getByText('Homer Simpson')).toBeInTheDocument(); expect(screen.getByText('Marge Simpson')).toBeInTheDocument(); });
  it('uses four slots for 60 minutes, handles partial overlap and opens detail', async () => { const positioned = positionBookings([salaBooking, { ...salaBooking, id: 'sala-2', person: { ...person, id: 'person-3', firstName: 'Marge' }, startTime: '09:30', durationMinutes: 45 }]); expect(positioned[0]).toMatchObject({ startMinutes: 540, endMinutes: 600, level: 0 }); expect(positioned[1]).toMatchObject({ startMinutes: 570, endMinutes: 615, level: 1 }); expect(timelineHours('08:00', '12:00')).toEqual([480, 540, 600, 660]); serve(transversalData); renderTimeline(); fireEvent.click(await screen.findByRole('button', { name: /Homer Simpson 09:00 Reservado/ })); expect(screen.getByRole('dialog')).toHaveTextContent('Sala'); });
});

describe('Profesor vertical agenda', () => {
  it('groups the day bookings and translates origin and status without rendering the timeline', async () => {
    serve(professorResponse()); renderTimeline(true);
    const agenda = await screen.findByTestId('sala-reservations-agenda');
    expect(screen.queryByTestId('reservations-timeline')).not.toBeInTheDocument();
    for (const hour of ['08:00', '09:00', '10:30']) expect(within(agenda).getByText(hour)).toBeInTheDocument();
    const nine = within(agenda).getByRole('region', { name: '09:00, 2 alumnos' });
    expect(nine).toHaveTextContent('María Gómez'); expect(nine).toHaveTextContent('Pedro López');
    expect(agenda).toHaveTextContent('Juan Pérez'); expect(agenda).toHaveTextContent('Musculación · 60 min');
    expect(agenda).toHaveTextContent('Turno fijo'); expect(agenda).toHaveTextContent('Reserva puntual'); expect(agenda).toHaveTextContent('Incorporación espontánea');
    expect(agenda).toHaveTextContent('Reservado'); expect(agenda).toHaveTextContent('Asistió');
    expect(agenda).not.toHaveTextContent('Las divisiones internas representan 15 minutos');
  });

  it('sorts times and names consistently within an hour', async () => {
    const bookings = [
      { ...professorBookings[0]!, id: 'late', startTime: '10:00', person: salaPerson('late', 'Zoé', 'Zulu') },
      { ...professorBookings[0]!, id: 'nine', startTime: '09:00', person: salaPerson('nine', 'Juan', 'Zeta') },
      { ...professorBookings[0]!, id: 'eight', startTime: '08:00', person: salaPerson('eight', 'Ana', 'Beta') },
      { ...professorBookings[0]!, id: 'nine-a', startTime: '09:00', person: salaPerson('nine-a', 'Ana', 'Alonso') },
    ];
    serve(professorResponse(bookings)); renderTimeline(true);
    const agenda = await screen.findByTestId('sala-reservations-agenda');
    const hours = within(agenda).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(hours).toEqual(['Horarios del día', '08:00', '09:00', '10:00']);
    const nine = within(agenda).getByRole('region', { name: '09:00, 2 alumnos' });
    expect(nine.textContent?.indexOf('Ana Alonso')).toBeLessThan(nine.textContent?.indexOf('Juan Zeta') ?? 0);
  });

  it('keeps an activity in progress in Ahora y próximos until its end', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T12:30:00.000Z')); // 09:30 in Argentina
    const groups = [
      { ...professorBookings[0]!, id: 'past', startTime: '08:00', durationMinutes: 60 },
      { ...professorBookings[0]!, id: 'active', startTime: '09:00', durationMinutes: 60 },
      { ...professorBookings[0]!, id: 'future', startTime: '10:00', durationMinutes: 60 },
    ];
    const split = splitAgendaGroups(groups, '2026-10-13');
    expect(split.previous.map((group) => group.time)).toEqual(['08:00']);
    expect(split.upcoming.map((group) => group.time)).toEqual(['09:00', '10:00']);
    vi.useRealTimers();
  });

  it.each([1, -1])('uses Horarios del día for an adjacent date (%s days)', async (offset) => {
    const [year, month, day] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('-').map(Number);
    const target = new Date(Date.UTC(year ?? 2000, (month ?? 1) - 1, (day ?? 1) + offset));
    const date = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(target.getUTCDate()).padStart(2, '0')}`;
    serve(professorResponse([professorBookings[0]!], date)); renderTimeline(true, date);
    const agenda = await screen.findByTestId('sala-reservations-agenda');
    expect(agenda).toHaveTextContent('Horarios del día'); expect(agenda).not.toHaveTextContent('Horarios anteriores'); expect(agenda).not.toHaveTextContent('Ahora y próximos');
  });

  it('uses the same Sala vertical agenda for non-Professor sessions and filters out Clinic bookings', async () => {
    serve(transversalData); renderTimeline(false, '2026-09-02', vi.fn(), 'sala');
    const agenda = await screen.findByTestId('sala-reservations-agenda');
    expect(agenda).toHaveTextContent('Homer Simpson');
    expect(agenda).not.toHaveTextContent('Marge Simpson');
    expect(screen.queryByTestId('reservations-timeline')).not.toBeInTheDocument();
  });

  it('shows cancelled bookings as muted history and offers no status actions', async () => {
    serve(professorResponse([{ ...professorBookings[0]!, id: 'cancelled', status: 'CANCELLED' }])); renderTimeline(true);
    fireEvent.click(await screen.findByRole('button', { name: /Juan Pérez 08:00 Cancelado/ }));
    const dialog = screen.getByRole('dialog'); expect(dialog).toHaveTextContent('Cancelado'); expect(within(dialog).queryByRole('button', { name: 'Asistió' })).not.toBeInTheDocument(); expect(within(dialog).queryByRole('button', { name: 'Ausente' })).not.toBeInTheDocument(); expect(within(dialog).queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });

  it.each([['Asistió', 'attend'], ['Ausente', 'absent'], ['Cancelar', 'cancel']])('lets Professor use %s and links only to Ver alumno', async (action, endpoint) => {
    let submitted: unknown;
    server.use(http.get('http://localhost:3000/api/reservations', () => HttpResponse.json({ data: professorResponse([salaBooking]) })), http.post(`http://localhost:3000/api/sala/occurrences/${endpoint}`, async ({ request }) => { submitted = await request.json(); return HttpResponse.json({ data: {} }); }));
    renderTimeline(true);
    fireEvent.click(await screen.findByRole('button', { name: /Homer Simpson 09:00 Reservado/ }));
    expect(screen.getByRole('link', { name: 'Ver alumno' })).toHaveAttribute('href', `/sala/people/${person.id}`);
    expect(screen.queryByRole('link', { name: 'Ver Persona' })).not.toBeInTheDocument(); expect(screen.queryByRole('link', { name: 'Ver Sala' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: action }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(submitted).toEqual({ personId: person.id, scheduleSlotId: 'slot-1', date: '2026-09-02' });
  });

  it('navigates to the previous, next and operational today dates', async () => {
    const onDateChange = vi.fn(); serve(professorResponse([])); renderTimeline(true, '2026-10-13', onDateChange);
    fireEvent.click(screen.getByRole('button', { name: 'Día anterior' })); expect(onDateChange).toHaveBeenLastCalledWith('2026-10-12');
    fireEvent.click(screen.getByRole('button', { name: 'Día siguiente' })); expect(onDateChange).toHaveBeenLastCalledWith('2026-10-14');
    fireEvent.click(screen.getByRole('button', { name: 'Hoy' })); expect(onDateChange).toHaveBeenLastCalledWith(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()));
  });
});
