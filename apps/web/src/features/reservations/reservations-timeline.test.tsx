import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { ReservationsTimeline, positionBookings, timelineHours } from './reservations-timeline';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const person = { id: '10000000-0000-4000-8000-000000000001', firstName: 'Homer', lastName: 'Simpson', dni: '45000001' };
const professional = { id: '30000000-0000-4000-8000-000000000001', firstName: 'Brian', lastName: 'Griffin', discipline: 'Kinesiólogo' };
const data = { date: '2026-09-02', startTime: '08:00', endTime: '12:00', rows: [{ kind: 'SALA' as const, professional: null, bookings: [{ id: 'sala-1', source: 'SALA' as const, person, startTime: '09:00', durationMinutes: 60, serviceName: 'Sala', status: 'RESERVED', origin: 'ONE_OFF', scheduleSlotId: 'slot-1' }] }, { kind: 'PROFESSIONAL' as const, professional, bookings: [{ id: 'clinic-1', source: 'CLINIC' as const, person: { ...person, id: 'person-2', firstName: 'Marge' }, startTime: '10:00', durationMinutes: 60, serviceName: 'Kinesiología', status: 'CANCELLED', origin: 'APPOINTMENT' }] }, { kind: 'PROFESSIONAL' as const, professional: { ...professional, id: 'empty', firstName: 'Stewie' }, bookings: [] }] };
beforeAll(() => { globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch; server.listen({ onUnhandledRequest: 'error' }); });
afterEach(() => server.resetHandlers()); afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
function renderTimeline(isProfessorOnly = false) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ReservationsTimeline isProfessorOnly={isProfessorOnly} date="2026-09-02" onDateChange={() => undefined} csrfToken="csrf" /></QueryClientProvider>); }

it('shows hourly headers without quarter-hour labels', async () => { server.use(http.get('http://localhost:3000/api/reservations', () => HttpResponse.json({ data }))); renderTimeline(); expect(await screen.findByText('09:00')).toBeInTheDocument(); expect(screen.getByText('10:00')).toBeInTheDocument(); expect(screen.getByText('11:00')).toBeInTheDocument(); expect(screen.queryByText(':15')).not.toBeInTheDocument(); });
it('keeps Sala, booked professionals and empty professionals as separate rows', async () => { server.use(http.get('http://localhost:3000/api/reservations', () => HttpResponse.json({ data }))); renderTimeline(); expect(await screen.findByText('Sala')).toBeInTheDocument(); expect(screen.getByText('Brian Griffin')).toBeInTheDocument(); expect(screen.getByText('Stewie Griffin')).toBeInTheDocument(); expect(screen.getByText('Homer Simpson')).toBeInTheDocument(); expect(screen.getByText('Marge Simpson')).toBeInTheDocument(); });
it('uses four slots for 60 minutes, handles partial overlap and opens detail', async () => { const salaBooking = data.rows[0]?.bookings[0]; if (!salaBooking) throw new Error('Missing Sala fixture'); const positioned = positionBookings([salaBooking, { ...salaBooking, id: 'sala-2', person: { ...person, id: 'person-3', firstName: 'Marge' }, startTime: '09:30', durationMinutes: 45 }]); expect(positioned[0]).toMatchObject({ startMinutes: 540, endMinutes: 600, level: 0 }); expect(positioned[1]).toMatchObject({ startMinutes: 570, endMinutes: 615, level: 1 }); expect(timelineHours('08:00', '12:00')).toEqual([480, 540, 600, 660]); server.use(http.get('http://localhost:3000/api/reservations', () => HttpResponse.json({ data }))); renderTimeline(); fireEvent.click(await screen.findByRole('button', { name: /Homer Simpson 09:00 Reservado/ })); expect(screen.getByRole('dialog')).toHaveTextContent('Sala'); });


it.each([['Asistió', 'attend'], ['Ausente', 'absent'], ['Cancelar', 'cancel']])('lets Professor use %s and links only to Ver alumno', async (action, endpoint) => {
  let submitted: unknown;
  server.use(
    http.get('http://localhost:3000/api/reservations', () => HttpResponse.json({ data: { ...data, rows: [data.rows[0]] } })),
    http.post(`http://localhost:3000/api/sala/occurrences/${endpoint}`, async ({ request }) => { submitted = await request.json(); return HttpResponse.json({ data: {} }); }),
  );
  renderTimeline(true);
  fireEvent.click(await screen.findByRole('button', { name: /Homer Simpson 09:00 Reservado/ }));
  expect(screen.getByRole('link', { name: 'Ver alumno' })).toHaveAttribute('href', `/sala/people/${person.id}`);
  expect(screen.queryByRole('link', { name: 'Ver Persona' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Ver Sala' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: action }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(submitted).toEqual({ personId: person.id, scheduleSlotId: 'slot-1', date: '2026-09-02' });
});
