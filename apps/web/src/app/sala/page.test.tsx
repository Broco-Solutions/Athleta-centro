import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import SalaPage from './page';
import { addCalendarDays, calendarHour } from '../../features/sala/fixed-bookings-calendar';
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

it.each(['PROFESSOR', 'ADMINISTRATIVE', 'GENERAL_ADMIN'])('%s enters the weekly calendar at /sala', async (role) => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: [role] } })));
  renderPage();
  expect(await screen.findByTestId('fixed-bookings-calendar')).toBeVisible();
  expect(await screen.findByRole('button', { name: /^lunes 09:00:/ })).toBeVisible();
  expect(screen.queryByTestId('sala-reservations-agenda')).not.toBeInTheDocument();
  expect(router.replace).not.toHaveBeenCalled();
  const navigation = within(screen.getByRole('navigation', { name: 'Navegación principal' }));
  expect(navigation.getByRole('link', { name: 'Agenda' })).toHaveAttribute('href', '/sala');
  if (role === 'PROFESSOR') {
    expect(navigation.getByRole('link', { name: 'Alumnos' })).toHaveAttribute('href', '/students');
    expect(navigation.getByRole('link', { name: 'Rutinas' })).toHaveAttribute('href', '/routines');
    expect(navigation.queryByRole('link', { name: 'Reservas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Secciones de Sala' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver Personas' })).not.toBeInTheDocument();
  }
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

it('splits twelve configured hours into six morning and six afternoon hours with primary selection', async () => {
  const hours = Array.from({ length: 12 }, (_, index) => index + 8);
  server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: hours.flatMap(hour => hourGroups(hour)) })));
  renderPage();
  await screen.findByTestId('fixed-bookings-calendar');
  const morning = await screen.findByRole('button', { name: 'Mañana · 08–14' });
  const afternoon = await screen.findByRole('button', { name: 'Tarde · 14–20' });
  expect(morning).toHaveAttribute('aria-pressed', 'true');
  expect(morning).toHaveClass('bg-primary', 'text-primary-foreground');
  expect(afternoon).toHaveAttribute('aria-pressed', 'false');
  expect(afternoon).not.toHaveClass('bg-primary');
  for (const hour of ['08', '13']) expect(await screen.findByRole('button', { name: new RegExp(`^lunes ${hour}:00:`) })).toBeVisible();
  for (const hour of ['14', '19']) expect(screen.queryByRole('button', { name: new RegExp(`^lunes ${hour}:00:`) })).not.toBeInTheDocument();
  fireEvent.click(afternoon);
  expect(afternoon).toHaveClass('bg-primary', 'text-primary-foreground');
  expect(morning).not.toHaveClass('bg-primary');
  for (const hour of ['14', '19']) expect(await screen.findByRole('button', { name: new RegExp(`^lunes ${hour}:00:`) })).toBeVisible();
  for (const hour of ['08', '13']) expect(screen.queryByRole('button', { name: new RegExp(`^lunes ${hour}:00:`) })).not.toBeInTheDocument();
});

it('keeps all nine configured hours across the two bands', async () => {
  const hours = Array.from({ length: 9 }, (_, index) => index + 9);
  server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: hours.flatMap(hour => hourGroups(hour)) })));
  renderPage();
  for (const hour of hours.slice(0, 5)) expect(await screen.findByRole('button', { name: new RegExp(`^lunes ${String(hour).padStart(2, '0')}:00:`) })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Tarde/ }));
  for (const hour of hours.slice(5)) expect(await screen.findByRole('button', { name: new RegExp(`^lunes ${String(hour).padStart(2, '0')}:00:`) })).toBeVisible();
});

it('separates assigned and cancelled fixed students and hides every list until requested', async () => {
  const groups = hourGroups(9, [
    { ...fixedStudent, status: 'CANCELLED' },
    { ...fixedStudent, personId: 'automatic', sourceId: 'automatic', status: 'CANCELLED', cancelledForNonPayment: true, person: { ...fixedStudent.person, firstName: 'Automática' } },
    { ...fixedStudent, personId: 'punctual', sourceId: 'reservation', origin: 'ONE_OFF', person: { ...fixedStudent.person, id: 'punctual', firstName: 'Reserva' } },
  ], 1);
  groups[2] = { ...groups[2]!, reserved: 4, available: 2 };
  const overlap = hourGroups(8, [{ ...fixedStudent, personId: 'overlap', sourceId: 'overlap-fixed', startTime: '08:45', durationMinutes: 90, person: { ...fixedStudent.person, id: 'overlap', firstName: 'Solapada' } }]);
  server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: [...overlap, ...groups] })));
  renderPage(); await screen.findByTestId('fixed-bookings-calendar'); fireEvent.click(screen.getByRole('button', { name: /Tarde/ })); const panel = within(await selectMonday());
  expect(panel.getByText('4 / 6')).toBeVisible();
  expect(panel.getByText('Quedan 2 lugares disponibles')).toBeVisible();
  const assigned = panel.getByRole('button', { name: 'Ver alumnos asignados (1)' });
  const cancelled = panel.getByRole('button', { name: 'Ver alumnos que cancelaron (2)' });
  const others = panel.getByRole('button', { name: 'Ver reservas puntuales e incorporaciones (1)' });
  for (const button of [assigned, cancelled, others]) expect(button).toHaveAttribute('aria-expanded', 'false');
  expect(panel.queryByRole('link', { name: 'Ver ficha' })).not.toBeInTheDocument();
  fireEvent.click(assigned);
  expect(panel.getByText('Solapada Sintética')).toBeVisible();
  expect(panel.queryByText('Ana Sintética')).not.toBeInTheDocument();
  expect(panel.queryByText('Reserva Sintética')).not.toBeInTheDocument();
  expect(cancelled).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(cancelled);
  expect(panel.getByText('Canceló esta fecha · 09:00 – 10:00')).toBeVisible();
  expect(panel.getByText('Cancelación automática por falta de vigencia · 09:00 – 10:00')).toBeVisible();
  expect(panel.getAllByRole('link', { name: 'Ver ficha' }).map(link => link.getAttribute('href'))).toContain('/sala/people/student');
  fireEvent.click(others);
  expect(panel.getByText('Reserva Sintética')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /^martes 09:00:/ }));
  for (const button of panel.getAllByRole('button', { name: /^Ver alumnos|^Ver reservas/ })) expect(button).toHaveAttribute('aria-expanded', 'false');
  expect(panel.queryByRole('link', { name: 'Ver ficha' })).not.toBeInTheDocument();
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
  fireEvent.click(panel.getByRole('button', { name: /^Ver alumnos asignados/ }));
  expect(panel.getByText('Ada Sintética')).toBeVisible();
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
  fireEvent.click(panel.getByRole('button', { name: /^Ver alumnos asignados/ }));
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
  fireEvent.click(panel.getByRole('button', { name: /^Ver alumnos asignados/ }));
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
  fireEvent.click(screen.getByRole('button', { name: /^Ver alumnos que cancelaron/ }));
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

it('creates a new student from assignment and assigns the selected fixed slot before showing the Portal PIN', async () => {
  const createdId = 'created-student';
  let fixedPayload: unknown;
  let assigned = false;
  let studentsRead = 0;
  server.use(
    http.get('http://localhost:3000/api/sala/agenda', ({ request }) => {
      const date = new URL(request.url).searchParams.get('date')!;
      const entries = assigned && date === '2026-10-19' ? [fixedStudent, { ...fixedStudent, personId: createdId, sourceId: 'created-fixed', person: { id: createdId, firstName: 'Eva', lastName: 'Nueva', dni: '88000003' } }] : [fixedStudent];
      return HttpResponse.json({ data: new Date(`${date}T12:00Z`).getUTCDay() === 0 ? [] : [...hourGroups(9, entries, entries.length), ...hourGroups(16), ...hourGroups(21)] });
    }),
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [{ id: 'plan', name: 'Plan Base', isSelectable: true }] })),
    http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [{ id: 'professor', firstName: 'Ana', lastName: 'Profesora' }] })),
    http.get('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ data: [] })),
    http.post('http://localhost:3000/api/sala/students', async ({ request }) => {
      expect(request.headers.get('x-csrf-token')).toBe('csrf');
      expect(await request.json()).toMatchObject({ firstName: 'Eva', lastName: 'Nueva', planId: 'plan', mainProfessorId: 'professor' });
      return HttpResponse.json({ data: { id: createdId, firstName: 'Eva', lastName: 'Nueva', initialPin: '4812' } }, { status: 201 });
    }),
    http.get('http://localhost:3000/api/sala/students', () => {
      studentsRead += 1;
      return HttpResponse.json({ data: [
        { id: 'new-student', participationId: 'participation-real', firstName: 'Ada', lastName: 'Sintética', dni: '88000002', hasValidAccess: true },
        ...(studentsRead > 1 ? [{ id: createdId, participationId: 'participation-created', firstName: 'Eva', lastName: 'Nueva', dni: '88000003', hasValidAccess: true }] : []),
      ] });
    }),
    http.post('http://localhost:3000/api/sala/fixed-bookings', async ({ request }) => {
      fixedPayload = await request.json();
      assigned = true;
      return HttpResponse.json({ data: {} }, { status: 201 });
    }),
  );
  renderPage();
  const panel = within(await selectMonday());
  fireEvent.click(panel.getByRole('button', { name: 'Asignar alumno' }));
  const assignment = within(await screen.findByRole('dialog', { name: 'Asignar alumno' }));
  fireEvent.click(await assignment.findByRole('button', { name: /Nuevo alumno/ }));
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Eva' } });
  fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Nueva' } });
  fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '88000003' } });
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '3415551234' } });
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: '2000-01-01' } });
  await screen.findByRole('option', { name: 'Plan Base' });
  await screen.findByRole('option', { name: 'Profesora, Ana' });
  fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'plan' } });
  fireEvent.change(screen.getByLabelText('Profesor principal'), { target: { value: 'professor' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar e asignar' }));
  await screen.findByRole('dialog', { name: 'Alumno guardado correctamente' });
  expect(fixedPayload).toEqual({ personId: createdId, salaParticipationId: 'participation-created', scheduleSlotId: 'slot-9', startTime: '09:00', startDate: '2026-10-19' });
  expect(screen.getByText('PIN temporal del Portal')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
  await waitFor(() => expect(panel.getByText('Eva Nueva')).toBeVisible());
});

it('does not offer Nuevo alumno when person creation is not permitted', async () => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: session.permissions.filter(permission => permission !== 'PEOPLE_CREATE') } })));
  renderPage();
  const panel = within(await selectMonday());
  fireEvent.click(panel.getByRole('button', { name: 'Asignar alumno' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Asignar alumno' }));
  expect(dialog.queryByRole('button', { name: /Nuevo alumno/ })).not.toBeInTheDocument();
  fireEvent.change(dialog.getByLabelText('Buscar alumno'), { target: { value: 'Ada' } });
  expect(await dialog.findByRole('button', { name: /Ada Sintética/ })).toBeVisible();
});

it('keeps the one-time PIN and refreshes students when automatic assignment fails', async () => {
  let createdCount = 0;
  let fixedCount = 0;
  server.use(
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [{ id: 'plan', name: 'Plan Base', isSelectable: true }] })),
    http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [{ id: 'professor', firstName: 'Ana', lastName: 'Profesora' }] })),
    http.get('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ data: [] })),
    http.post('http://localhost:3000/api/sala/students', () => { createdCount += 1; return HttpResponse.json({ data: { id: 'partial-student', firstName: 'Eva', lastName: 'Nueva', initialPin: '4812' } }, { status: 201 }); }),
    http.get('http://localhost:3000/api/sala/students', () => HttpResponse.json({ data: [
      { id: 'new-student', participationId: 'participation-real', firstName: 'Ada', lastName: 'Sintética', dni: '88000002', hasValidAccess: true },
      ...(createdCount ? [{ id: 'partial-student', participationId: 'partial-participation', firstName: 'Eva', lastName: 'Nueva', dni: '88000003', hasValidAccess: true }] : []),
    ] })),
    http.post('http://localhost:3000/api/sala/fixed-bookings', () => {
      fixedCount += 1;
      return fixedCount === 1 ? HttpResponse.json({ code: 'SALA_WEEKLY_LIMIT_EXCEEDED' }, { status: 409 }) : HttpResponse.json({ data: {} }, { status: 201 });
    }),
  );
  renderPage();
  const panel = within(await selectMonday());
  fireEvent.click(panel.getByRole('button', { name: 'Asignar alumno' }));
  const assignment = within(await screen.findByRole('dialog', { name: 'Asignar alumno' }));
  fireEvent.click(await assignment.findByRole('button', { name: /Nuevo alumno/ }));
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Eva' } });
  fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Nueva' } });
  fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '88000003' } });
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '3415551234' } });
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: '2000-01-01' } });
  await screen.findByRole('option', { name: 'Plan Base' });
  fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'plan' } });
  fireEvent.change(screen.getByLabelText('Profesor principal'), { target: { value: 'professor' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar e asignar' }));
  const pinDialog = await screen.findByRole('dialog', { name: 'Alumno guardado correctamente' });
  expect(within(pinDialog).getByRole('alert')).toHaveTextContent('no pudo asignarse automáticamente');
  expect(within(pinDialog).getByLabelText('PIN temporal')).toHaveTextContent('4812');
  fireEvent.click(within(pinDialog).getByRole('button', { name: 'Entendido' }));
  expect(createdCount).toBe(1);
  fireEvent.click(panel.getByRole('button', { name: 'Asignar alumno' }));
  const retry = within(await screen.findByRole('dialog', { name: 'Asignar alumno' }));
  fireEvent.change(retry.getByLabelText('Buscar alumno'), { target: { value: 'Eva' } });
  expect(await retry.findByRole('button', { name: /Eva Nueva/ })).toBeVisible();
  fireEvent.click(retry.getByRole('button', { name: /Eva Nueva/ }));
  fireEvent.click(retry.getByRole('button', { name: 'Confirmar asignación' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Asignar alumno' })).not.toBeInTheDocument());
  expect(createdCount).toBe(1);
  expect(fixedCount).toBe(2);
});

it('starts directly with Agenda, identifies the week and orders the calendar before the detail', async () => {
  renderPage();
  const calendar = await screen.findByTestId('fixed-bookings-calendar');
  expect(screen.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible();
  for (const text of ['Módulo global', 'Operación diaria y personas con participación activa.']) expect(screen.queryByText(text)).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Sala', level: 1 })).not.toBeInTheDocument();
  const toolbar = within(calendar).getByRole('toolbar', { name: 'Navegación semanal' });
  for (const name of ['Semana anterior', 'Hoy', 'Semana siguiente', 'Actualizar']) expect(within(toolbar).getByRole('button', { name })).toBeVisible();
  expect(within(toolbar).getByText('Semana del 19 al 25 de octubre de 2026')).toBeVisible();
  const bands = within(toolbar).getByRole('group', { name: 'Franjas horarias' });
  expect(bands).toContainElement(within(toolbar).getByRole('button', { name: /Mañana/ }));
  expect(bands).toContainElement(within(toolbar).getByRole('button', { name: /Tarde/ }));
  expect(within(calendar).queryByText('Lunes 19/10/2026 — Domingo 25/10/2026')).not.toBeInTheDocument();
  expect(within(calendar).queryByText('Semana actual')).not.toBeInTheDocument();
  const panel = within(calendar).getByRole('complementary');
  const grid = panel.parentElement!;
  expect(grid).toHaveClass('lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]');
  expect(grid.firstElementChild).toContainElement(within(calendar).getByLabelText('Calendario semanal'));
  expect(within(calendar).getByRole('button', { name: /Mañana/ })).toBeVisible();
  expect(within(calendar).getByRole('button', { name: /Tarde/ })).toBeVisible();
  expect(within(calendar).getByLabelText('Calendario semanal')).toHaveClass('overflow-x-auto');
});

it.each([
  ['2026-10-26T10:00:00Z', 'Semana del 26 de octubre al 1 de noviembre de 2026'],
  ['2026-12-28T10:00:00Z', 'Semana del 28 de diciembre de 2026 al 3 de enero de 2027'],
])('formats a week crossing month or year (%s)', async (date, label) => {
  vi.setSystemTime(new Date(date)); renderPage();
  expect(await within(await screen.findByRole('toolbar', { name: 'Navegación semanal' })).findByText(label)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
  expect(screen.queryByText('Semana actual')).not.toBeInTheDocument();
});

it('keeps full times red, including after selection, and highlights the selected border', async () => {
  server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: hourGroups(9, [fixedStudent], 6) })));
  renderPage();
  const cell = await screen.findByRole('button', { name: /^lunes 09:00:/ });
  expect(cell).toHaveClass('bg-red-50', 'border-red-200', 'text-red-800');
  fireEvent.click(cell);
  expect(cell.style.borderColor).toBe('var(--primary)');
  expect(cell).toHaveClass('bg-red-50', 'text-red-800');
  const panel = within(screen.getByRole('complementary', { name: 'Turno seleccionado' }));
  expect(panel.getByText('Completo · 0 libres')).toHaveClass('bg-red-50', 'border-red-200', 'text-red-800');
  expect(panel.getByLabelText('6 de 6 ocupados').parentElement).toHaveClass('text-red-800');
  expect(screen.getByText('Completo')).toHaveClass('text-red-800');
});

it.each(['2026-10-20T02:00:00Z', '2026-10-19T13:00:00Z'])('shows historical details only after selecting a finalized cell (%s)', async now => {
  vi.setSystemTime(new Date(now));
  const entries: AgendaEntry[] = [
    { ...fixedStudent, status: 'ATTENDED' },
    { ...fixedStudent, personId: 'bruno', person: { ...fixedStudent.person, id: 'bruno', firstName: 'Bruno' }, sourceId: 'absent', status: 'ABSENT' },
    { ...fixedStudent, personId: 'carla', person: { ...fixedStudent.person, id: 'carla', firstName: 'Carla' }, sourceId: 'cancelled', origin: 'ONE_OFF', status: 'CANCELLED' },
    { ...fixedStudent, personId: 'diego', person: { ...fixedStudent.person, id: 'diego', firstName: 'Diego' }, sourceId: 'spontaneous', origin: 'SPONTANEOUS', status: 'ATTENDED' },
    { ...fixedStudent, personId: 'elena', person: { ...fixedStudent.person, id: 'elena', firstName: 'Elena' }, sourceId: 'unregistered', status: 'RESERVED' },
  ];
  const groups = hourGroups(9, entries, 2);
  groups[1] = { ...groups[1]!, people: entries };
  server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: groups })));
  renderPage();
  const cell = await screen.findByRole('button', { name: /^lunes 09:00:/ });
  expect(cell).toHaveTextContent('Finalizado');
  for (const label of ['Asistieron:', 'No asistieron:', 'Ausentes:', 'Cancelaron:', 'Sin registrar:']) expect(within(cell).queryByText(new RegExp(label))).not.toBeInTheDocument();
  expect(cell).toHaveClass('bg-slate-100');
  fireEvent.click(cell);
  const panel = within(screen.getByRole('complementary', { name: 'Turno seleccionado' }));
  for (const [category, person] of [['Asistieron', 'Ana Sintética'], ['Ausentes', 'Bruno Sintética'], ['Cancelaron', 'Carla Sintética'], ['Incorporaciones espontáneas', 'Diego Sintética'], ['Sin registrar', 'Elena Sintética']] as const) {
    expect(panel.getByRole('heading', { name: category })).toBeVisible();
    expect(panel.getByText(person)).toBeVisible();
  }
  expect(panel.queryByRole('button', { name: 'Asignar alumno' })).not.toBeInTheDocument();
});

it('keeps previous dates historical and allows correcting their attendance with the original date', async () => {
  let payload: unknown;
  server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: hourGroups(9, [{ ...fixedStudent, status: 'ABSENT' }]) })), http.post('http://localhost:3000/api/sala/occurrences/correct', async ({ request }) => { payload = await request.json(); expect(request.headers.get('x-csrf-token')).toBe('csrf'); return HttpResponse.json({ data: {} }); }));
  renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'Semana anterior' }));
  const panel = within(await selectMonday());
  expect(panel.getByText('Finalizado')).toBeVisible();
  expect(panel.queryByRole('button', { name: 'Asignar alumno' })).not.toBeInTheDocument();
  fireEvent.click(panel.getByRole('button', { name: 'Ver reserva y asistencia' }));
  fireEvent.click(screen.getByRole('button', { name: 'Corregir estado' }));
  fireEvent.change(screen.getByLabelText('Nuevo estado'), { target: { value: 'ATTENDED' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección' }));
  await waitFor(() => expect(payload).toMatchObject({ date: '2026-10-12', sourceId: 'fixed-1', status: 'ATTENDED' }));
});

it.each(['Semana anterior', 'Semana siguiente'])('opens spontaneous incorporation only for today from %s and discards selection', async direction => {
  renderPage(); fireEvent.click(await screen.findByRole('button', { name: direction }));
  await selectMonday();
  const open = screen.getByRole('button', { name: 'Incorporación espontánea' });
  expect(open).toBeEnabled(); fireEvent.click(open);
  const dialog = within(await screen.findByRole('dialog', { name: 'Incorporación espontánea' }));
  expect(dialog.getByText('La fecha seleccionada es 2026-10-19.')).toBeVisible();
  expect(dialog.getByText('La incorporación espontánea se realiza únicamente en el día de hoy. Te llevamos a los horarios disponibles de hoy.')).toBeVisible();
  expect(within(screen.getByRole('toolbar', { name: 'Navegación semanal' })).getByText('Semana del 19 al 25 de octubre de 2026')).toBeVisible();
  expect(screen.getByText('Seleccioná un horario del calendario para consultar sus alumnos y operar la agenda.')).toBeVisible();
  expect(dialog.queryByText(/no se utiliza para fechas futuras/)).not.toBeInTheDocument();
  fireEvent.change(dialog.getByLabelText('Buscar Persona'), { target: { value: 'Ada' } });
  fireEvent.click(await dialog.findByRole('button', { name: 'Ada Sintética · DNI 88000002' }));
  const slot = await dialog.findByLabelText('Horario espontáneo');
  expect(slot).toHaveValue('');
  expect(within(slot).getByRole('option', { name: '09:00' })).toBeInTheDocument();
});

it.each(['empty', 'closed', 'elapsed'])('keeps spontaneous incorporation visible without opening an invalid form (%s)', async state => {
  const groups = state === 'empty' ? [] : hourGroups(state === 'elapsed' ? 6 : 9).map(group => ({ ...group, isClosed: state === 'closed' }));
  server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: groups })));
  renderPage();
  const open = await screen.findByRole('button', { name: 'Incorporación espontánea' });
  expect(open).toBeEnabled(); fireEvent.click(open);
  expect(await screen.findByText('Hoy no quedan horarios disponibles para una incorporación espontánea.')).toBeVisible();
  expect(open).toBeEnabled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('loads today before opening spontaneous incorporation and handles a failed read', async () => {
  renderPage(); await selectMonday();
  let finish!: () => void;
  const response = new Promise<void>(resolve => { finish = resolve; });
  server.use(http.get('http://localhost:3000/api/sala/agenda', async () => { await response; return HttpResponse.json({ code: 'FAIL' }, { status: 500 }); }));
  fireEvent.click(screen.getByRole('button', { name: 'Incorporación espontánea' }));
  expect(await screen.findByText('Cargando horarios de hoy…')).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  finish();
  expect(await screen.findByText('No se pudieron cargar los horarios de hoy. Intentá nuevamente.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Incorporación espontánea' })).toBeEnabled();
});
