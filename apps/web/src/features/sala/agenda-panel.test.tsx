import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { delay, HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { AgendaPanel } from './agenda-panel';

const nativeFetch = globalThis.fetch;
const server = setupServer();
const person = { id: '10000000-0000-4000-8000-000000000001', firstName: 'Ada', lastName: 'Sintética', dni: '20123456' };
const slotId = '20000000-0000-4000-8000-000000000001';

function group(status: 'RESERVED' | 'ATTENDED' | 'ABSENT' | 'CANCELLED' = 'RESERVED') {
  return { slot: { id: slotId, startTime: '1970-01-01T09:00:00.000Z', durationMinutes: 60 }, capacity: 2, reserved: status === 'CANCELLED' ? 0 : 1, available: status === 'CANCELLED' ? 2 : 1, isOverbooked: false, isClosed: false, people: [{ personId: person.id, person, origin: 'FIXED', status }] };
}

function renderAgenda(date = '2026-08-27') {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><AgendaPanel date={date} onDateChange={() => undefined} csrfToken="csrf" people={[person]} /></QueryClientProvider>);
}

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it('renders loading, empty and operational attendance states', async () => {
  server.use(http.get('http://localhost:3000/api/sala/agenda', async () => { await delay(30); return HttpResponse.json({ data: [group('RESERVED'), { ...group('ATTENDED'), slot: { id: `${slotId}-2`, startTime: '1970-01-01T10:00:00.000Z', durationMinutes: 60 }, people: [{ personId: `${person.id}-2`, person: { ...person, id: `${person.id}-2`, firstName: 'Bea' }, origin: 'ONE_OFF', status: 'ATTENDED' }] }, { ...group('ABSENT'), slot: { id: `${slotId}-3`, startTime: '1970-01-01T11:00:00.000Z', durationMinutes: 60 } }, { ...group('CANCELLED'), slot: { id: `${slotId}-4`, startTime: '1970-01-01T12:00:00.000Z', durationMinutes: 60 }, isClosed: true }] }); }));
  renderAgenda();
  expect(screen.getByRole('status')).toHaveTextContent('Cargando agenda');
  expect(await screen.findByText('Reservado')).toBeInTheDocument();
  expect(screen.getByText('Asistió', { selector: 'span' })).toBeInTheDocument();
  expect(screen.getByText('Ausente', { selector: 'span' })).toBeInTheDocument();
  expect(screen.getByText('Cancelado', { selector: 'span' })).toBeInTheDocument();
  expect(screen.getByText('Cerrado')).toBeInTheDocument();
});

it('shows an empty agenda', async () => {
  server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: [] })));
  renderAgenda();
  expect(await screen.findByText('No hay horarios configurados para esta fecha.')).toBeInTheDocument();
});

it('marks attendance and refreshes the agenda using the generated client', async () => {
  let status: 'RESERVED' | 'ATTENDED' = 'RESERVED';
  let submitted: unknown;
  server.use(
    http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: [group(status)] })),
    http.post('http://localhost:3000/api/sala/occurrences/attend', async ({ request }) => { submitted = await request.json(); status = 'ATTENDED'; return HttpResponse.json({ data: { status } }, { status: 201 }); }),
  );
  renderAgenda();
  await screen.findByText('Reservado');
  fireEvent.click(screen.getByRole('button', { name: 'Asistió' }));
  await waitFor(() => expect(submitted).toEqual({ personId: person.id, scheduleSlotId: slotId, date: '2026-08-27' }));
  await waitFor(() => expect(screen.getByText('Asistió', { selector: 'span' })).toBeInTheDocument());
});

it('supports corrections and exposes backend errors for duplicate spontaneous attendance', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  server.use(
    http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: [group('ATTENDED')] })),
    http.post('http://localhost:3000/api/sala/occurrences/absent', () => HttpResponse.json({ data: { status: 'ABSENT' } }, { status: 201 })),
    http.post('http://localhost:3000/api/sala/occurrences/spontaneous', () => HttpResponse.json({ statusCode: 409, code: 'SALA_OCCURRENCE_DUPLICATE', message: 'Duplicate' }, { status: 409 })),
  );
  renderAgenda(today);
  await screen.findByText('Asistió', { selector: 'span' });
  fireEvent.click(screen.getByRole('button', { name: 'Ausente' }));
  fireEvent.change(screen.getByLabelText('Persona espontánea'), { target: { value: person.id } });
  fireEvent.change(screen.getByLabelText('Horario espontáneo'), { target: { value: slotId } });
  fireEvent.click(screen.getByRole('button', { name: 'Incorporar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('ya posee una presencia');
});
