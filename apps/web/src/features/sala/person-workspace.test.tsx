import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { SalaPersonWorkspace } from './person-workspace';

const navigation = vi.hoisted(() => ({ tab: 'reservations' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams({ tab: navigation.tab }) }));
const server = setupServer();
const nativeFetch = globalThis.fetch;
const personId = '10000000-0000-4000-8000-000000000001';
const services = [
  { id: 'muscle', name: 'Musculación', durationMinutes: 60 },
  { id: 'functional', name: 'Funcional', durationMinutes: 45 },
];
let personServicesRequests = 0;
let catalogRequests = 0;

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  navigation.tab = 'reservations';
  personServicesRequests = 0;
  catalogRequests = 0;
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'professor', firstName: 'Profesor', lastName: 'Sintético' }, roles: ['PROFESSOR'], permissions: ['SALA_RELATION_READ', 'SALA_AGENDA_MANAGE'], csrfToken: 'csrf', mustChangePassword: false } })),
    http.get(`http://localhost:3000/api/people/${personId}`, () => HttpResponse.json({ data: { id: personId, firstName: 'Alumno', lastName: 'Sintético', dni: '12345678' } })),
    http.get(`http://localhost:3000/api/sala/participations/person/${personId}`, () => HttpResponse.json({ data: [{ id: 'participation', endDate: null, plan: { name: 'Plan Base' } }] })),
    http.get(`http://localhost:3000/api/sala/people/${personId}/services`, () => { personServicesRequests++; return HttpResponse.json({ data: services }); }),
    http.get('http://localhost:3000/api/sala/service-types', () => { catalogRequests++; return HttpResponse.json({ data: [...services, { id: 'calisthenics', name: 'Calistenia', durationMinutes: 60 }] }); }),
    http.get(`http://localhost:3000/api/sala/people/${personId}/fixed-bookings`, () => HttpResponse.json({ data: [] })),
    http.get(`http://localhost:3000/api/sala/people/${personId}/reservations`, () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/availability', () => HttpResponse.json({ data: [{ slotId: 'window:09:00', scheduleSlotId: 'window', startTime: '09:00' }] })),
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
function renderWorkspace() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><SalaPersonWorkspace personId={personId}/></QueryClientProvider>);
}

it('uses the person services endpoint instead of the global catalog for a new reservation', async () => {
  renderWorkspace();
  await screen.findByText('Participación activa');
  await screen.findByRole('option', { name: 'Musculación' });
  expect(screen.getByRole('option', { name: 'Funcional' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Calistenia' })).not.toBeInTheDocument();
  expect(personServicesRequests).toBe(1);
  expect(catalogRequests).toBe(0);
});
it.each(['reservations', 'fixed'])('shows an empty plan state and prevents creation on the %s tab', async (tab) => {
  navigation.tab = tab;
  server.use(http.get(`http://localhost:3000/api/sala/people/${personId}/services`, () => HttpResponse.json({ data: [] })));
  renderWorkspace();
  expect(await screen.findByText('El Plan actual no tiene servicios disponibles para nuevas reservas.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: tab === 'fixed' ? 'Crear turno fijo' : 'Crear reserva' })).toBeDisabled();
  expect(screen.getByLabelText('Servicio').querySelectorAll('option')).toHaveLength(1);
});
it.each([true, false])('preloads a fixed service only when the current plan permits it (allowed=%s)', async (allowed) => {
  navigation.tab = 'fixed';
  server.use(http.get(`http://localhost:3000/api/sala/people/${personId}/fixed-bookings`, () => HttpResponse.json({ data: [{
    id: 'fixed', startDate: '2026-08-31', startTime: '09:00',
    scheduleSlot: { id: 'window', weekday: 'MONDAY', startTime: '09:00' },
    serviceType: allowed ? services[0] : { id: 'calisthenics', name: 'Calistenia', durationMinutes: 60 },
  }] })));
  renderWorkspace();
  await screen.findByRole('option', { name: 'Musculación' });
  fireEvent.click(await screen.findByRole('button', { name: 'Modificar' }));
  expect(screen.getByLabelText('Servicio')).toHaveValue(allowed ? 'muscle' : '');
  expect(screen.queryByRole('option', { name: 'Calistenia' })).not.toBeInTheDocument();
  if (!allowed) {
    expect(screen.getByText(/Calistenia · MONDAY/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Servicio'), { target: { value: 'functional' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled());
  }
});
it('does not query person services without an active participation', async () => {
  server.use(http.get(`http://localhost:3000/api/sala/participations/person/${personId}`, () => HttpResponse.json({ data: [] })));
  renderWorkspace();
  await screen.findByText('Sin participación activa');
  expect(screen.getByRole('button', { name: 'Crear reserva' })).toBeDisabled();
  expect(personServicesRequests).toBe(0);
  expect(catalogRequests).toBe(0);
});

it.each(['reservations', 'fixed'])('offers only half-hour starts and submits distinct starts from one window on %s', async tab => {
  navigation.tab = tab;
  const submitted: Record<string, string>[] = [];
  server.use(
    http.get('http://localhost:3000/api/sala/availability', () => HttpResponse.json({ data: ['12:00', '12:15', '12:30', '12:45'].map(startTime => ({ slotId: `window:${startTime}`, scheduleSlotId: 'window', startTime })) })),
    http.post(`http://localhost:3000/api/sala/${tab === 'fixed' ? 'fixed-bookings' : 'reservations'}`, async ({ request }) => { submitted.push(await request.json() as Record<string, string>); return HttpResponse.json({ data: {} }, { status: 201 }); }),
  );
  renderWorkspace();
  await screen.findByRole('option', { name: 'Musculación' });
  await screen.findByRole('option', { name: '12:30' });
  expect(screen.getByRole('option', { name: '12:00' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '12:15' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '12:45' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Servicio'), { target: { value: 'muscle' } });
  for (const [index, startTime] of ['12:00', '12:30'].entries()) {
    fireEvent.change(screen.getByLabelText('Horario'), { target: { value: `window:${startTime}` } });
    expect(screen.getByLabelText('Horario')).toHaveValue(`window:${startTime}`);
    const submit = screen.getByRole('button', { name: tab === 'fixed' ? 'Crear turno fijo' : 'Crear reserva' });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    await waitFor(() => expect(submitted).toHaveLength(index + 1));
    expect(submitted[index]).toMatchObject({ scheduleSlotId: 'window', startTime, serviceTypeId: 'muscle' });
  }
});
it.each(['12:15', '12:45'])('shows historical fixed start %s and requires a new half-hour selection', async startTime => {
  navigation.tab = 'fixed';
  let submitted: unknown;
  server.use(
    http.get(`http://localhost:3000/api/sala/people/${personId}/fixed-bookings`, () => HttpResponse.json({ data: [{ id: 'historical', startDate: '2026-08-31', startTime, scheduleSlot: { id: 'window', weekday: 'MONDAY', startTime: '12:00' }, serviceType: services[0] }] })),
    http.get('http://localhost:3000/api/sala/availability', () => HttpResponse.json({ data: ['12:00', '12:15', '12:30', '12:45'].map(startTime => ({ slotId: `window:${startTime}`, scheduleSlotId: 'window', startTime })) })),
    http.post('http://localhost:3000/api/sala/fixed-bookings/historical/change', async ({ request }) => { submitted = await request.json(); return HttpResponse.json({ data: {} }); }),
  );
  renderWorkspace();
  await screen.findByRole('option', { name: 'Musculación' });
  expect(await screen.findByText(new RegExp(`MONDAY · ${startTime}`))).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Modificar' }));
  expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  expect(screen.queryByRole('option', { name: startTime })).not.toBeInTheDocument();
  await screen.findByRole('option', { name: '12:30' });
  fireEvent.change(screen.getByLabelText('Horario'), { target: { value: 'window:12:30' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(submitted).toMatchObject({ scheduleSlotId: 'window', startTime: '12:30' }));
});
