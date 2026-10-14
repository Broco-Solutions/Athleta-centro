import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import SalaPage from './page';
let searchParams = new URLSearchParams();
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => searchParams, useRouter: () => router }));
const server = setupServer(); const nativeFetch = globalThis.fetch;
const session = { user: { id: 'admin', firstName: 'Admin', lastName: 'User', email: 'admin@test.local' }, roles: ['ADMINISTRATIVE'], permissions: ['SALA_RELATION_READ', 'SALA_AGENDA_MANAGE', 'SALA_PARTICIPATION_MANAGE', 'PEOPLE_CREATE', 'PEOPLE_READ'], mustChangePassword: false, csrfToken: 'csrf' };
beforeAll(() => { globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch; server.listen({ onUnhandledRequest: 'bypass' }); });
beforeEach(() => { router.replace.mockClear(); searchParams = new URLSearchParams(); server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: session })), http.get('http://localhost:3000/api/people', () => HttpResponse.json({ data: { data: [{ id: 'person', firstName: 'Ada', lastName: 'Sintética', dni: '20123456' }] } })), http.get('http://localhost:3000/api/sala/schedule', () => HttpResponse.json({ data: [{ id: 'slot', weekday: 'MONDAY', startTime: '09:00' }] })), http.get('http://localhost:3000/api/sala/availability', () => HttpResponse.json({ data: [{ slotId: 'slot', capacity: 1, reserved: 0, available: 1, isOverbooked: false, isClosed: false }] }))); });
afterEach(() => server.resetHandlers()); afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
it.each(['ADMINISTRATIVE', 'GENERAL_ADMIN'])('%s renders the shared vertical Sala agenda and excludes Clinic bookings', async (role) => {
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: [role], permissions: [...session.permissions, 'SALA_SCHEDULE_MANAGE', 'SALA_ROUTINE_MANAGE', 'CLINIC_OPERATIONAL_READ', 'FINANCE_OPERATIONAL_READ', 'TEAM_READ'] } })),
    http.get('http://localhost:3000/api/reservations', () => HttpResponse.json({ data: { date: '2026-10-13', startTime: '08:00', endTime: '12:00', rows: [{ kind: 'SALA', bookings: [{ id: 'sala-booking', source: 'SALA', person: { id: 'student', firstName: 'Ana', lastName: 'Alumna', dni: '88000001' }, startTime: '09:00', durationMinutes: 60, serviceName: 'Musculación', status: 'RESERVED', origin: 'FIXED', scheduleSlotId: 'slot' }] }, { kind: 'PROFESSIONAL', bookings: [{ id: 'clinic-booking', source: 'CLINIC', person: { id: 'patient', firstName: 'Clara', lastName: 'Paciente', dni: '88000002' }, startTime: '10:00', durationMinutes: 60, serviceName: 'Kinesiología', status: 'SCHEDULED', origin: 'APPOINTMENT' }] }] } })),
  );
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SalaPage /></QueryClientProvider>);
  expect(await screen.findByRole('heading', { name: 'Agenda' })).toBeInTheDocument();
  expect(await screen.findByTestId('sala-reservations-agenda')).toHaveTextContent('Ana Alumna');
  expect(screen.getByTestId('sala-reservations-agenda')).not.toHaveTextContent('Clara Paciente');
  expect(screen.getByRole('link', { name: 'Agenda' })).toHaveAttribute('href', '/sala');
  expect(screen.getByRole('link', { name: 'Alumnos' })).toHaveAttribute('href', '/students');
  expect(screen.getByRole('link', { name: 'Rutinas' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Configuración' })).toHaveAttribute('href', '/sala/configuration');
  expect(screen.queryByRole('navigation', { name: 'Secciones de Sala' })).not.toBeInTheDocument();
});

function renderStudents(): void { searchParams = new URLSearchParams(); render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SalaPage/></QueryClientProvider>); }
it('hides global Sala navigation for clinical relation permissions', async () => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: ['KINESIOLOGIST'], permissions: ['SALA_RELATION_READ', 'SALA_CLINICAL_INDICATION_CLOSE', 'CLINIC_OPERATIONAL_READ'] } })));
  renderStudents(); const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
  await within(nav).findByRole('link', { name: 'Clínica' });
  expect(within(nav).queryByRole('link', { name: 'Sala' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Nuevo alumno' })).not.toBeInTheDocument();
});
it('preserves Sala navigation for Administration', async () => {
  renderStudents();
  const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
  expect(await within(nav).findByRole('link', { name: 'Agenda' })).toHaveAttribute('href', '/sala');
});

it.each([true, false])('shows spontaneous incorporation only with agenda permission (%s)', async (allowed) => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: allowed ? session.permissions : session.permissions.filter((permission) => permission !== 'SALA_AGENDA_MANAGE') } })), http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: [] })));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SalaPage /></QueryClientProvider>);
  await screen.findByRole('heading', { name: 'Agenda' });
  if (allowed) expect(await screen.findByRole('button', { name: 'Incorporación espontánea' })).toBeVisible();
  else { await screen.findByRole('button', { name: /Cerrar sesión/ }); expect(screen.queryByRole('button', { name: 'Incorporación espontánea' })).not.toBeInTheDocument(); }
});

it.each(['ADMINISTRATIVE', 'GENERAL_ADMIN'])('%s can keep using spontaneous incorporation from the shared Sala agenda', async (role) => {
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: [role] } })),
    http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: [{ slot: { id: 'window:09:00', scheduleSlotId: 'window', startTime: '09:00', durationMinutes: 15 }, capacity: 10, reserved: 0, available: 10, isOverbooked: false, isClosed: false, people: [] }] })),
    http.get('http://localhost:3000/api/people', () => HttpResponse.json({ data: [], meta: { page: 1, pageSize: 100, total: 0, totalPages: 1 } })),
  );
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SalaPage /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Incorporación espontánea' }));
  expect(await screen.findByRole('dialog', { name: 'Incorporación espontánea' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Nueva Persona' })).toBeVisible();
});

it.each([{ roles: ['PROFESSOR'], visible: false }, { roles: ['PROFESSOR', 'KINESIOLOGIST'], visible: true }])('applies provisional new-person visibility to spontaneous incorporation: $roles', async ({ roles, visible }) => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles } })), http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: [] })));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SalaPage /></QueryClientProvider>);
  if (!visible) {
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/reservations'));
    expect(screen.queryByRole('heading', { name: 'Agenda' })).not.toBeInTheDocument();
    return;
  }
  fireEvent.click(await screen.findByRole('button', { name: 'Incorporación espontánea' }));
  if (visible) expect(screen.getByRole('button', { name: 'Nueva Persona' })).toBeVisible();
  else expect(screen.queryByRole('button', { name: 'Nueva Persona' })).not.toBeInTheDocument();
});


it.each([['', '/reservations'], ['view=students', '/students']])('redirects old pure Professor links %s before rendering administrative agenda', async (query, target) => {
  let peopleReads = 0;
  searchParams = new URLSearchParams(query);
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: ['PROFESSOR'] } })),
    http.get('http://localhost:3000/api/people', () => { peopleReads++; return HttpResponse.json({ data: [] }); }),
  );
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SalaPage /></QueryClientProvider>);
  expect(screen.queryByRole('heading', { name: 'Agenda' })).not.toBeInTheDocument();
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith(target));
  expect(screen.queryByRole('heading', { name: 'Agenda' })).not.toBeInTheDocument();
  expect(peopleReads).toBe(0);
});

it.each(['ADMINISTRATIVE', 'GENERAL_ADMIN'])('redirects legacy students list for %s to the shared follow-up interface', async (role) => {
  searchParams = new URLSearchParams('view=students');
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: [role] } })));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SalaPage/></QueryClientProvider>);
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/students'));
  expect(screen.queryByRole('heading', { name: 'Alumnos' })).not.toBeInTheDocument();
});
