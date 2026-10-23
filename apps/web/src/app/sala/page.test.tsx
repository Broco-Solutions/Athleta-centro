import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import SalaPage from './page';
import { addCalendarDays, assignmentDate, calendarHour } from '../../features/sala/fixed-bookings-calendar';
import type { AgendaEntry, AgendaGroup } from '../../features/sala/agenda-panel';

let searchParams = new URLSearchParams();
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => searchParams, useRouter: () => router }));
const server = setupServer();
const nativeFetch = globalThis.fetch;
const clients: QueryClient[] = [];
const session = { user: { id: 'admin', firstName: 'Admin', lastName: 'User', email: 'admin@test.local' }, roles: ['ADMINISTRATIVE'], permissions: ['SALA_RELATION_READ', 'SALA_AGENDA_MANAGE', 'SALA_PARTICIPATION_MANAGE', 'PEOPLE_CREATE', 'PEOPLE_READ'], mustChangePassword: false, csrfToken: 'csrf' };
const fixedStudent: AgendaEntry = { personId: 'student', person: { id: 'student', firstName: 'Ana', lastName: 'Sintética', dni: '88000001' }, origin: 'FIXED', status: 'RESERVED', sourceId: 'fixed-1', startTime: '09:00', durationMinutes: 60 };
function hourGroups(hour: number, entries: AgendaEntry[] = [], reserved = 0, capacity = 6): AgendaGroup[] {
  return [0, 15, 30, 45].map((minute, index) => ({ slot: { id: `slot-${hour}:${minute}`, scheduleSlotId: `slot-${hour}`, startTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, durationMinutes: 15 }, capacity, reserved, available: Math.max(0, capacity - reserved), isOverbooked: reserved > capacity, isClosed: false, people: index === 0 ? entries : [] }));
}
function renderPage(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><SalaPage /></QueryClientProvider>);
  return client;
}
async function selectMonday(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: /^lunes 09:00:/ }));
  return screen.getByRole('complementary', { name: 'Turno seleccionado' });
}
beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-19T10:00:00Z'));
  router.replace.mockClear(); searchParams = new URLSearchParams();
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: session })),
    http.get('http://localhost:3000/api/sala/agenda', ({ request }) => {
      const date = new URL(request.url).searchParams.get('date')!;
      return HttpResponse.json({ data: new Date(`${date}T12:00Z`).getUTCDay() === 0 ? [] : [...hourGroups(9, [fixedStudent], 1), ...hourGroups(16), ...hourGroups(21)] });
    }),
    http.get('http://localhost:3000/api/sala/students', () => HttpResponse.json({ data: [{ id: 'new-student', participationId: 'participation-real', firstName: 'Ada', lastName: 'Sintética', dni: '88000002', hasValidAccess: true }] })),
    http.get('http://localhost:3000/api/people', () => HttpResponse.json({ data: [{ id: 'person', firstName: 'Ada', lastName: 'Sintética', dni: '88000002' }] })),
    http.get('http://localhost:3000/api/sala/people/person/spontaneous-options', () => HttpResponse.json({ data: { eligible: true, plan: { name: 'Base' }, services: [] } })),
  );
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); server.resetHandlers(); vi.useRealTimers(); focusManager.setFocused(undefined); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it.each(['PROFESSOR', 'ADMINISTRATIVE', 'GENERAL_ADMIN'])('%s enters the weekly calendar at /sala and retains /reservations links', async (role) => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: [role] } })));
  renderPage();
  expect(await screen.findByTestId('fixed-bookings-calendar')).toBeVisible();
  expect(await screen.findByRole('button', { name: /^lunes 09:00:/ })).toBeVisible();
  expect(screen.queryByTestId('sala-reservations-agenda')).not.toBeInTheDocument();
  expect(router.replace).not.toHaveBeenCalled();
  const navigation = within(screen.getByRole('navigation', { name: 'Navegación principal' }));
  expect(navigation.getByRole('link', { name: 'Agenda' })).toHaveAttribute('href', '/sala');
  if (role === 'PROFESSOR') expect(navigation.getByRole('link', { name: 'Reservas' })).toHaveAttribute('href', '/reservations');
});

it('changes bands without excluding late configured hours, includes Saturday and navigates weeks', async () => {
  const dates: string[] = [];
  server.use(http.get('http://localhost:3000/api/sala/agenda', ({ request }) => {
    const date = new URL(request.url).searchParams.get('date')!; dates.push(date);
    return HttpResponse.json({ data: [...hourGroups(9), ...hourGroups(16), ...hourGroups(21)] });
  }));
  renderPage(); await screen.findByRole('button', { name: /^lunes 09:00:/ });
  expect(screen.getByRole('columnheader', { name: /sábado/ })).toBeVisible();
  expect(screen.getByRole('columnheader', { name: /domingo/ })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Tarde/ }));
  expect(await screen.findByRole('button', { name: /^lunes 21:00:/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: /^lunes 09:00:/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Mañana/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));
  await waitFor(() => expect(dates).toContain('2026-10-26'));
  fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
  await screen.findByRole('button', { name: /^lunes 09:00:/ });
  fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
  await waitFor(() => expect(dates).toContain('2026-10-12'));
  fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
  expect(await screen.findByRole('button', { name: /^lunes 09:00:/ })).toBeVisible();
  expect(new Set(dates)).toEqual(new Set(Array.from({ length: 21 }, (_, i) => addCalendarDays('2026-10-12', i))));
});

it('uses the most restrictive quarter and separates cancelled fixed students from punctual bookings and overlapping durations', async () => {
  const groups = hourGroups(9, [{ ...fixedStudent, status: 'CANCELLED' }, { ...fixedStudent, personId: 'punctual', sourceId: 'reservation', origin: 'ONE_OFF', person: { ...fixedStudent.person, id: 'punctual', firstName: 'Reserva' } }], 1);
  groups[2] = { ...groups[2]!, reserved: 4, available: 2 };
  const overlap = hourGroups(8, [{ ...fixedStudent, personId: 'overlap', sourceId: 'overlap-fixed', startTime: '08:45', durationMinutes: 90, person: { ...fixedStudent.person, id: 'overlap', firstName: 'Solapada' } }]);
  server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: [...overlap, ...groups] })));
  renderPage(); const panel = within(await selectMonday());
  expect(panel.getByText('4 / 6')).toBeVisible();
  expect(panel.getByText('Quedan 2 lugares disponibles')).toBeVisible();
  fireEvent.click(panel.getByRole('button', { name: 'Ver alumnos asignados' }));
  expect(panel.getByText('Canceló esta fecha · 09:00 – 10:00')).toBeVisible();
  expect(panel.getByText('Solapada Sintética')).toBeVisible();
  const fixedHeading = panel.getByRole('heading', { name: 'Alumnos con turno fijo' });
  expect(fixedHeading.parentElement).not.toHaveTextContent('Reserva Sintética');
  expect(panel.getAllByRole('link', { name: 'Ver ficha' }).map((link) => link.getAttribute('href'))).toContain('/sala/people/student');
  expect(screen.queryByText(/Profesor a cargo|Responsable a cargo/)).not.toBeInTheDocument();
});

it('assigns a weekly booking with real identifiers and refreshes the panel', async () => {
  let payload: unknown; let assigned = false;
  server.use(
    http.post('http://localhost:3000/api/sala/fixed-bookings', async ({ request }) => { payload = await request.json(); assigned = true; expect(request.headers.get('x-csrf-token')).toBe('csrf'); return HttpResponse.json({ data: {} }, { status: 201 }); }),
    http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: hourGroups(9, assigned ? [fixedStudent, { ...fixedStudent, sourceId: 'new-fixed', personId: 'new-student', person: { ...fixedStudent.person, firstName: 'Ada' } }] : [fixedStudent], assigned ? 2 : 1) })),
  );
  renderPage(); const panel = within(await selectMonday());
  fireEvent.click(panel.getByRole('button', { name: 'Asignar alumno' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Asignar alumno' }));
  expect(dialog.getByText('2026-10-19')).toBeVisible();
  expect(dialog.queryByLabelText('Servicio')).not.toBeInTheDocument();
  fireEvent.change(dialog.getByLabelText('Buscar alumno'), { target: { value: '88000002' } });
  fireEvent.click(await dialog.findByRole('button', { name: /Ada Sintética/ }));
  await waitFor(() => expect(dialog.getByRole('button', { name: 'Confirmar asignación' })).toBeEnabled());
  fireEvent.click(dialog.getByRole('button', { name: 'Confirmar asignación' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(payload).toEqual({ personId: 'new-student', salaParticipationId: 'participation-real', scheduleSlotId: 'slot-9', startTime: '09:00', startDate: '2026-10-19' });
  await waitFor(() => expect(panel.getByText('2 / 6')).toBeVisible());
  fireEvent.click(panel.getByRole('button', { name: 'Ver alumnos asignados' }));
  expect(panel.getByText('Ada Sintética')).toBeVisible();
});

it('shows the next occurrence before confirming an assignment from a past week', async () => {
  renderPage(); await screen.findByRole('button', { name: 'Semana anterior' });
  fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
  await selectMonday();
  fireEvent.click(screen.getByRole('button', { name: 'Asignar alumno' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Asignar alumno' }));
  expect(dialog.getByText('2026-10-19')).toBeVisible();
  expect(dialog.getByText(/La fecha consultada ya pasó/)).toBeVisible();
  expect(assignmentDate('2026-10-12', '2026-10-20')).toBe('2026-10-26');
});

it.each(['full', 'closed', 'incomplete'])('prevents assignment when a slot is %s', async (state) => {
  const groups = hourGroups(9);
  if (state === 'full') groups[2] = { ...groups[2]!, reserved: 6, available: 0 };
  if (state === 'closed') groups[2] = { ...groups[2]!, isClosed: true };
  if (state === 'incomplete') groups.pop();
  server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: groups })));
  renderPage(); await selectMonday();
  expect(screen.getByRole('button', { name: 'Asignar alumno' })).toBeDisabled();
});

it.each(['attend', 'absent', 'cancel'])('preserves %s operations and their exact occurrence reference', async (action) => {
  let payload: unknown;
  server.use(http.post(`http://localhost:3000/api/sala/occurrences/${action}`, async ({ request }) => { payload = await request.json(); return HttpResponse.json({ data: {} }); }));
  renderPage(); const panel = within(await selectMonday());
  fireEvent.click(panel.getByRole('button', { name: 'Ver alumnos asignados' }));
  fireEvent.click(panel.getByRole('button', { name: 'Ver reserva y asistencia' }));
  fireEvent.click(screen.getByRole('button', { name: action === 'attend' ? 'Asistió' : action === 'absent' ? 'Ausente' : 'Cancelar turno' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(payload).toEqual({ personId: 'student', scheduleSlotId: 'slot-9', date: '2026-10-19', startTime: '09:00', sourceId: 'fixed-1' });
});

it('preserves correction of an occurrence', async () => {
  let payload: unknown;
  server.use(
    http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: hourGroups(9, [{ ...fixedStudent, status: 'ABSENT' }], 1) })),
    http.post('http://localhost:3000/api/sala/occurrences/correct', async ({ request }) => { payload = await request.json(); return HttpResponse.json({ data: {} }); }),
  );
  renderPage(); const panel = within(await selectMonday());
  fireEvent.click(panel.getByRole('button', { name: 'Ver alumnos asignados' }));
  fireEvent.click(panel.getByRole('button', { name: 'Ver reserva y asistencia' }));
  fireEvent.click(screen.getByRole('button', { name: 'Corregir estado' }));
  fireEvent.change(screen.getByLabelText('Nuevo estado'), { target: { value: 'ATTENDED' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección' }));
  await waitFor(() => expect(payload).toMatchObject({ status: 'ATTENDED', date: '2026-10-19', sourceId: 'fixed-1' }));
});

it('reflects a Portal cancellation on refresh only for that date and retains next week recurrence', async () => {
  let cancelled = false;
  server.use(http.get('http://localhost:3000/api/sala/agenda', ({ request }) => {
    const date = new URL(request.url).searchParams.get('date');
    const isCancelled = cancelled && date === '2026-10-19';
    return HttpResponse.json({ data: hourGroups(9, [{ ...fixedStudent, status: isCancelled ? 'CANCELLED' : 'RESERVED' }], isCancelled ? 0 : 1) });
  }));
  renderPage(); await selectMonday(); cancelled = true;
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /^lunes 09:00:/ })).toHaveTextContent('0 / 6'));
  expect(screen.getByRole('button', { name: /^martes 09:00:/ })).toHaveTextContent('1 / 6');
  fireEvent.click(screen.getByRole('button', { name: 'Ver alumnos asignados' }));
  expect(screen.getByText('Canceló esta fecha · 09:00 – 10:00')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /^lunes 09:00:/ })).toHaveTextContent('1 / 6'));
});

it('refreshes when focus returns and polls every 30 seconds', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  renderPage(); await selectMonday();
  let reads = 0;
  server.use(http.get('http://localhost:3000/api/sala/agenda', () => { reads++; return HttpResponse.json({ data: hourGroups(9, [], 2) }); }));
  act(() => { focusManager.setFocused(false); focusManager.setFocused(true); });
  await waitFor(() => expect(reads).toBe(7));
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  await waitFor(() => expect(reads).toBe(14));
});

it.each([true, false])('gates mutations by SALA_AGENDA_MANAGE (%s)', async (allowed) => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: allowed ? session.permissions : ['SALA_RELATION_READ'] } })));
  renderPage(); const panel = within(await selectMonday());
  expect(Boolean(panel.queryByRole('button', { name: 'Asignar alumno' }))).toBe(allowed);
  expect(Boolean(panel.queryByRole('button', { name: 'Incorporación espontánea' }))).toBe(allowed);
});

it('does not query Sala without SALA_RELATION_READ', async () => {
  let reads = 0;
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: [] } })), http.get('http://localhost:3000/api/sala/agenda', () => { reads++; return HttpResponse.json({ data: [] }); }));
  renderPage(); expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso'); expect(reads).toBe(0);
});

it('retains spontaneous incorporation and its existing person search', async () => {
  renderPage(); await selectMonday();
  fireEvent.click(screen.getByRole('button', { name: 'Incorporación espontánea' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Incorporación espontánea' }));
  expect(dialog.getByRole('button', { name: 'Nueva Persona' })).toBeVisible();
  fireEvent.change(dialog.getByLabelText('Buscar Persona'), { target: { value: '88000002' } });
  fireEvent.click(await dialog.findByRole('button', { name: 'Ada Sintética · DNI 88000002' }));
  expect(await dialog.findByLabelText('Servicio')).toBeVisible();
});

it.each(['PROFESSOR', 'ADMINISTRATIVE', 'GENERAL_ADMIN'])('retains the legacy student redirect for %s', async (role) => {
  searchParams = new URLSearchParams('view=students');
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: [role] } })));
  renderPage(); await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/students'));
});

it('does not sum blocks and keeps capacity paired with the most restrictive occupancy', () => {
  const groups = hourGroups(9, [], 2, 8);
  groups[1] = { ...groups[1]!, capacity: 4, reserved: 3, available: 1 };
  expect(calendarHour(groups, 540)).toMatchObject({ capacity: 4, reserved: 3, available: 1 });
});

it('keeps assignment open and displays a rejected Plan limit without changing occupancy', async () => {
  server.use(http.post('http://localhost:3000/api/sala/fixed-bookings', () => HttpResponse.json({ code: 'SALA_FIXED_BOOKING_LIMIT_EXCEEDED' }, { status: 409 })));
  renderPage(); const panel = within(await selectMonday());
  fireEvent.click(panel.getByRole('button', { name: 'Asignar alumno' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Asignar alumno' }));
  fireEvent.change(dialog.getByLabelText('Buscar alumno'), { target: { value: 'Ada' } });
  fireEvent.click(await dialog.findByRole('button', { name: /Ada Sintética/ }));
  await waitFor(() => expect(dialog.getByRole('button', { name: 'Confirmar asignación' })).toBeEnabled());
  fireEvent.click(dialog.getByRole('button', { name: 'Confirmar asignación' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent('máximo de turnos fijos');
  expect(panel.getByText('1 / 6')).toBeVisible();
});

it('checks the effective future date instead of using historical availability to confirm', async () => {
  server.use(http.get('http://localhost:3000/api/sala/agenda', ({ request }) => {
    const date = new URL(request.url).searchParams.get('date')!;
    return HttpResponse.json({ data: hourGroups(9, [], date < '2026-10-19' ? 0 : 6) });
  }));
  renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'Semana anterior' }));
  await selectMonday();
  fireEvent.click(screen.getByRole('button', { name: 'Asignar alumno' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Asignar alumno' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent('sin cupo para la fecha de inicio');
  expect(dialog.getByRole('button', { name: 'Confirmar asignación' })).toBeDisabled();
});

it('allows a past full hour to open assignment when its next occurrence has room', async () => {
  server.use(http.get('http://localhost:3000/api/sala/agenda', ({ request }) => {
    const date = new URL(request.url).searchParams.get('date')!;
    return HttpResponse.json({ data: hourGroups(9, [], date < '2026-10-19' ? 6 : 0) });
  }));
  renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'Semana anterior' }));
  await selectMonday();
  fireEvent.click(screen.getByRole('button', { name: 'Asignar alumno' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Asignar alumno' }));
  fireEvent.change(dialog.getByLabelText('Buscar alumno'), { target: { value: 'Ada' } });
  fireEvent.click(await dialog.findByRole('button', { name: /Ada Sintética/ }));
  await waitFor(() => expect(dialog.getByRole('button', { name: 'Confirmar asignación' })).toBeEnabled());
});
