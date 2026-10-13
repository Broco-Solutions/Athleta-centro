import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import ReservationsPage from './page';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const person = { id: 'student-1', firstName: 'Ana', lastName: 'Sintética', dni: '88000001' };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const session = { user: { id: 'professor', firstName: 'Profesor', lastName: 'Sintético' }, roles: ['PROFESSOR'], permissions: ['PEOPLE_READ', 'PEOPLE_CREATE', 'SALA_RELATION_READ', 'SALA_AGENDA_MANAGE', 'SALA_PARTICIPATION_MANAGE'], csrfToken: 'csrf', mustChangePassword: false };
let agendaReads = 0;
let peopleReads = 0;
let timelineReads = 0;
beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  agendaReads = peopleReads = timelineReads = 0;
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: session })),
    http.get('http://localhost:3000/api/reservations', () => { timelineReads++; return HttpResponse.json({ data: { date: today(), startTime: '09:00', endTime: '10:00', rows: [] } }); }),
    http.get('http://localhost:3000/api/sala/agenda', () => { agendaReads++; return HttpResponse.json({ data: [{ slot: { id: 'window:09:00', scheduleSlotId: 'window', startTime: '09:00', durationMinutes: 15 }, capacity: 10, reserved: 0, available: 10, isOverbooked: false, isClosed: false, people: [] }] }); }),
    http.get('http://localhost:3000/api/people', () => { peopleReads++; return HttpResponse.json({ data: [person], meta: { totalPages: 1 } }); }),
    http.get('http://localhost:3000/api/sala/people/student-1/spontaneous-options', () => HttpResponse.json({ data: { eligible: true, participationId: 'participation', plan: { id: 'plan', name: 'Base' }, services: [{ id: 'service', name: 'Musculación', durationMinutes: 15 }] } })),
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(<QueryClientProvider client={client}><ReservationsPage /></QueryClientProvider>);
  return { client, invalidate };
}
it('reuses spontaneous incorporation for an existing person and refreshes operational queries after saving', async () => {
  let submitted: unknown;
  server.use(http.post('http://localhost:3000/api/sala/occurrences/spontaneous', async ({ request }) => { submitted = await request.json(); return HttpResponse.json({ data: {} }, { status: 201 }); }));
  const { invalidate } = renderPage();
  expect(await screen.findByRole('link', { name: 'Reservas' })).toHaveAttribute('aria-current', 'page');
  await screen.findByRole('button', { name: 'Incorporación espontánea' });
  expect(agendaReads).toBe(0); expect(peopleReads).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Incorporación espontánea' }));
  await screen.findByRole('dialog', { name: 'Incorporación espontánea' });
  expect(screen.queryByRole('button', { name: 'Nueva Persona' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Persona espontánea'), { target: { value: person.id } });
  await screen.findByRole('option', { name: 'Musculación · 15 min' });
  fireEvent.change(screen.getByLabelText('Servicio'), { target: { value: 'service' } });
  fireEvent.change(screen.getByLabelText('Horario espontáneo'), { target: { value: 'window:09:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Incorporar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(submitted).toMatchObject({ personId: person.id, date: today(), serviceTypeId: 'service', startTime: '09:00', scheduleSlotId: 'window' });
  for (const queryKey of [['reservations', today()], ['sala', 'agenda', today()], ['sala-dashboard']]) expect(invalidate).toHaveBeenCalledWith({ queryKey });
  expect(timelineReads).toBeGreaterThan(1);
});
it('shows Agenda as the active context for General Admin', async () => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: ['GENERAL_ADMIN'] } })));
  renderPage();
  const active = await screen.findByRole('link', { name: 'Agenda' });
  expect(active).toHaveAttribute('href', '/reservations');
  expect(active).toHaveAttribute('aria-current', 'page');
  expect(await screen.findByRole('heading', { name: 'Agenda' })).toBeVisible();
  expect(screen.getByText('Turnos de Sala y Clínica organizados por horario.')).toBeVisible();
});
it('does not add the Professor-specific action to combined roles', async () => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: ['PROFESSOR', 'KINESIOLOGIST'] } })));
  renderPage(); await screen.findByText('Agenda transversal');
  expect(screen.queryByRole('button', { name: 'Incorporación espontánea' })).not.toBeInTheDocument();
});
