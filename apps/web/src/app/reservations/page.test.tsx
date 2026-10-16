import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { vi } from 'vitest';
import ReservationsPage from './page';

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

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
  expect(await screen.findByRole('heading', { name: 'Reservas' })).toBeVisible();
  await screen.findByRole('button', { name: 'Incorporación espontánea' });
  expect(agendaReads).toBe(0); expect(peopleReads).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Incorporación espontánea' }));
  await screen.findByRole('dialog', { name: 'Incorporación espontánea' });
  expect(screen.getByRole('button', { name: 'Nueva Persona' })).toBeVisible();
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
it.each(['ADMINISTRATIVE', 'GENERAL_ADMIN'])('redirects %s from transversal reservations into Sala', async (role) => {
  router.replace.mockClear();
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: [role] } })));
  renderPage();
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sala'));
  expect(timelineReads).toBe(0);
});
it('does not add the Professor-specific action to combined roles', async () => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: ['PROFESSOR', 'KINESIOLOGIST'] } })));
  renderPage(); await screen.findByText('Agenda transversal');
  expect(screen.queryByRole('button', { name: 'Incorporación espontánea' })).not.toBeInTheDocument();
});

it('lets a pure Professor open the existing new Person form in spontaneous incorporation today', async () => {
  server.use(
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ data: [] })),
  );
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Incorporación espontánea' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Nueva Persona' }));
  expect(screen.getByLabelText('Nombre')).toBeVisible();
  expect(screen.getByLabelText('Plan')).toBeVisible();
  expect(screen.getByLabelText('Profesor principal')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Persona existente' })).toBeVisible();
});
it('keeps new Person unavailable without PEOPLE_CREATE', async () => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: session.permissions.filter(permission => permission !== 'PEOPLE_CREATE') } })));
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Incorporación espontánea' }));
  await screen.findByRole('dialog', { name: 'Incorporación espontánea' });
  expect(screen.queryByRole('button', { name: 'Nueva Persona' })).not.toBeInTheDocument();
});
