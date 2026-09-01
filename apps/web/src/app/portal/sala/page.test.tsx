import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import PortalSala from './page';

const server = setupServer();
const nativeFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'bypass' });
});
beforeEach(() => {
  server.use(
    http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [], routine: null, evaluations: [], paymentState: 'PENDING' } })),
    http.get('http://localhost:3000/api/portal/sala/services', () => HttpResponse.json({ data: [{ id: 'service', name: 'Rehabilitación', durationMinutes: 45 }] })),
    http.get('http://localhost:3000/api/portal/sala/availability', () => HttpResponse.json({ data: [
      { scheduleSlotId: 'window', startTime: '09:00', endTime: '09:15', available: true, date: '2026-09-01' },
      { scheduleSlotId: 'window', startTime: '09:15', endTime: '09:30', available: true, date: '2026-09-01' },
      { scheduleSlotId: 'window', startTime: '09:30', endTime: '09:45', available: true, date: '2026-09-01' },
    ] })),
    http.get('http://localhost:3000/api/portal/auth/session', () => HttpResponse.json({ data: { csrfToken: 'csrf' } })),
    http.post('http://localhost:3000/api/portal/sala/reservations', async ({ request }) => {
      const body = await request.json();
      expect(body).toMatchObject({ scheduleSlotId: 'window', startTime: '09:00' });
      return HttpResponse.json({ data: { id: 'reservation' } }, { status: 201 });
    }),
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it('enables a valid Portal Sala reservation and sends the selected start', async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><PortalSala /></QueryClientProvider>);
  const reserve = await screen.findByRole('button', { name: 'Reservar horario' });
  expect(reserve).toBeDisabled();
  fireEvent.change(screen.getAllByRole('combobox')[0]!, { target: { value: 'service' } });
  fireEvent.change(screen.getByLabelText('Inicio'), { target: { value: 'window:09:00' } });
  await waitFor(() => expect(reserve).toBeEnabled());
  fireEvent.click(reserve);
  expect(await screen.findByText('Horario reservado.')).toBeInTheDocument();
});

function renderPortalSala(): void {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><PortalSala /></QueryClientProvider>);
}

function fixedHandlers(state: { weekday: string; startTime: string; active: boolean }, onChange?: (body: Record<string, string>) => void): void {
  server.use(
    http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: state.active ? [{ id: 'fixed-1', startDate: '2026-01-01', startTime: state.startTime, serviceType: { id: 'service', name: 'Rehabilitación' }, scheduleSlot: { id: 'window', weekday: state.weekday } }] : [], routine: null, evaluations: [], paymentState: 'PENDING' } })),
    http.get('http://localhost:3000/api/portal/sala/availability', () => HttpResponse.json({ data: [
      { scheduleSlotId: 'window', startTime: '09:00', endTime: '09:15', available: true, date: '2026-09-01' },
      { scheduleSlotId: 'window', startTime: '09:15', endTime: '09:30', available: true, date: '2026-09-01' },
      { scheduleSlotId: 'window', startTime: '09:30', endTime: '09:45', available: true, date: '2026-09-01' },
      { scheduleSlotId: 'window', startTime: '09:45', endTime: '10:00', available: true, date: '2026-09-01' },
    ] })),
    http.post('http://localhost:3000/api/portal/sala/fixed-bookings/fixed-1/change', async ({ request }) => { onChange?.(await request.json() as Record<string, string>); return HttpResponse.json({ data: {} }); }),
    http.post('http://localhost:3000/api/portal/sala/fixed-bookings/fixed-1/end', () => { state.active = false; return HttpResponse.json({ data: {} }); }),
  );
}

it('opens the fixed booking edit modal with current values and persists a changed day and hour', async () => {
  const state = { weekday: 'TUESDAY', startTime: '09:00', active: true }; let changed: Record<string, string> | undefined;
  fixedHandlers(state, (body) => { changed = body; state.weekday = 'WEDNESDAY'; state.startTime = body.startTime ?? state.startTime; });
  renderPortalSala();
  await screen.findByRole('button', { name: 'Modificar' });
  fireEvent.click(screen.getByRole('button', { name: 'Modificar' }));
  const dialog = await screen.findByRole('dialog', { name: 'Modificar turno fijo' });
  expect(within(dialog).getByRole('combobox', { name: 'Servicio' })).toHaveValue('service');
  expect(within(dialog).getByRole('combobox', { name: 'Día' })).toHaveValue('TUESDAY');
  expect(within(dialog).getByRole('combobox', { name: 'Hora' })).toHaveValue('09:00');
  fireEvent.change(within(dialog).getByRole('combobox', { name: 'Día' }), { target: { value: 'WEDNESDAY' } });
  fireEvent.change(within(dialog).getByRole('combobox', { name: 'Hora' }), { target: { value: '09:00' } });
  const save = within(dialog).getByRole('button', { name: 'Guardar cambios' });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
  await waitFor(() => expect(changed).toMatchObject({ scheduleSlotId: 'window', serviceTypeId: 'service', startTime: '09:00' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Modificar turno fijo' })).not.toBeInTheDocument());
  expect(await screen.findByText(/WEDNESDAY/)).toBeInTheDocument();
});

it('opens the custom finish confirmation and removes the fixed booking after success', async () => {
  const state = { weekday: 'TUESDAY', startTime: '09:00', active: true }; fixedHandlers(state);
  renderPortalSala();
  await screen.findByRole('button', { name: 'Finalizar' });
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
  const dialog = await screen.findByRole('dialog', { name: 'Finalizar turno fijo' });
  expect(within(dialog).getByText('El turno dejará de generar compromisos futuros. La actividad anterior se conservará.')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Finalizar turno' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Finalizar turno fijo' })).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByText('No tenés un turno fijo.')).toBeInTheDocument());
});
