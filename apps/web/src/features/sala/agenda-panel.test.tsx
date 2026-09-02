import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { AgendaPanel, buildTimelineBookings, groupTimelineBookings, overlapLevels } from './agenda-panel';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const person = { id: '10000000-0000-4000-8000-000000000001', firstName: 'Ada', lastName: 'Sintética', dni: '20123456' };
const professional = { id: '30000000-0000-4000-8000-000000000001', firstName: 'María', lastName: 'Rossi' };
const slotId = '20000000-0000-4000-8000-000000000001';
const entry = (name: string, startTime = '09:00', durationMinutes = 60, status: 'RESERVED' | 'ATTENDED' | 'ABSENT' | 'CANCELLED' = 'RESERVED') => ({ personId: `${person.id}-${name}`, person: { ...person, id: `${person.id}-${name}`, firstName: name }, origin: 'ONE_OFF' as const, status, startTime, durationMinutes, professional, service: { name: 'Kinesio' } });
const group = (people = [entry('Homer')]) => ({ slot: { id: slotId, scheduleSlotId: slotId, startTime: '09:00', durationMinutes: 15 }, capacity: 3, reserved: people.length, available: 3 - people.length, isOverbooked: false, isClosed: false, people });
function renderAgenda(date = '2026-09-02') { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><AgendaPanel date={date} onDateChange={() => undefined} csrfToken="csrf" people={[person]} /></QueryClientProvider>); }
beforeAll(() => { globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch; server.listen({ onUnhandledRequest: 'error' }); });
afterEach(() => server.resetHandlers()); afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it('calculates proportional duration and a 09:30 to 10:15 booking', () => { const bookings = buildTimelineBookings([{ ...group([entry('Homer', '09:00', 60)]), people: [entry('Homer', '09:30', 45)] }]); expect(bookings[0]).toMatchObject({ startMinutes: 570, durationMinutes: 45, endMinutes: 615 }); });
it('groups simultaneous bookings by professional and assigns overlap levels', () => { const bookings = buildTimelineBookings([{ ...group([entry('Homer'), entry('Marge')]), people: [entry('Homer'), entry('Marge')] }]); const rows = groupTimelineBookings(bookings); expect(rows).toHaveLength(1); expect(rows[0]?.bookings).toHaveLength(2); expect([...overlapLevels(bookings).values()]).toEqual([0, 1]); });
it('keeps a third simultaneous booking visible and opens its detail modal', async () => { const people = [entry('Homer'), entry('Marge'), entry('Bart')]; server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: [group(people)] }))); renderAgenda(); expect(await screen.findByText('Homer Sintética')).toBeInTheDocument(); expect(screen.getByText('Marge Sintética')).toBeInTheDocument(); expect(screen.getByText('Bart Sintética')).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: /Homer Sintética 09:00 Reservado/ })); expect(screen.getByRole('dialog')).toHaveTextContent('Kinesio'); });
it('marks a booking attended through the existing mutation and refreshes', async () => { let submitted: unknown; server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: [group()] })), http.post('http://localhost:3000/api/sala/occurrences/attend', async ({ request }) => { submitted = await request.json(); return HttpResponse.json({ data: { status: 'ATTENDED' } }, { status: 201 }); })); renderAgenda(); fireEvent.click(await screen.findByRole('button', { name: /Homer Sintética 09:00 Reservado/ })); fireEvent.click(screen.getByRole('button', { name: 'Asistió' })); await waitFor(() => expect(submitted).toEqual({ personId: `${person.id}-Homer`, scheduleSlotId: slotId, date: '2026-09-02' })); });
it('opens spontaneous incorporation in a custom modal', async () => { server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: [group()] }))); renderAgenda(); fireEvent.click(await screen.findByRole('button', { name: 'Incorporación espontánea' })); expect(screen.getByRole('dialog')).toHaveTextContent('Incorporación espontánea'); expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument(); });
