import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import PortalSala from './page';
import * as portalUi from '../portal-ui';
import { portalFetch } from '../portal-ui';

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
      expect(body).toMatchObject({ scheduleSlotId: 'window', serviceTypeId: 'service', startTime: '09:00', date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
      return HttpResponse.json({ data: { id: 'reservation' } }, { status: 201 });
    }),
  );
});
afterEach(() => { server.resetHandlers(); vi.restoreAllMocks(); });
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

function fixedHandlers(state: { weekday: string; startTime: string; active: boolean }, onChange?: (body: Record<string, string>) => void, onAvailability?: (url: string) => void): void {
  server.use(
    http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: state.active ? [{ id: 'fixed-1', startDate: '2026-09-07', startTime: state.startTime, serviceType: { id: 'service', name: 'Rehabilitación' }, scheduleSlot: { id: 'window', weekday: state.weekday } }] : [], routine: null, evaluations: [], paymentState: 'PENDING' } })),
    http.get('http://localhost:3000/api/portal/sala/availability', ({ request }) => { onAvailability?.(request.url); return HttpResponse.json({ data: [
      { scheduleSlotId: 'window', startTime: '09:00', endTime: '09:15', available: true, date: '2026-09-01' },
      { scheduleSlotId: 'window', startTime: '09:15', endTime: '09:30', available: true, date: '2026-09-01' },
      { scheduleSlotId: 'window', startTime: '09:30', endTime: '09:45', available: true, date: '2026-09-01' },
      { scheduleSlotId: 'window', startTime: '09:45', endTime: '10:00', available: true, date: '2026-09-01' },
      { scheduleSlotId: 'window', startTime: '10:00', endTime: '10:15', available: true, date: '2026-09-01' },
    ] }); }),
    http.post('http://localhost:3000/api/portal/sala/fixed-bookings/fixed-1/change', async ({ request }) => { onChange?.(await request.json() as Record<string, string>); return HttpResponse.json({ data: {} }); }),
    http.post('http://localhost:3000/api/portal/sala/fixed-bookings/fixed-1/end', () => { state.active = false; return HttpResponse.json({ data: {} }); }),
  );
}

it('updates an offered fixed-booking time and persists it after reload', async () => {
  const state = { weekday: 'MONDAY', startTime: '10:00', active: true }; let changed: Record<string, string> | undefined; let availabilityUrl = '';
  fixedHandlers(state, (body) => { changed = body; state.startTime = body.startTime ?? state.startTime; }, (url) => { if (url.includes('excludeFixedBookingId')) availabilityUrl = url; });
  renderPortalSala();
  await screen.findByRole('button', { name: 'Modificar' });
  fireEvent.click(screen.getByRole('button', { name: 'Modificar' }));
  const dialog = await screen.findByRole('dialog', { name: 'Modificar turno fijo' });
  expect(within(dialog).getByRole('combobox', { name: 'Servicio' })).toHaveValue('service');
  expect(within(dialog).getByRole('combobox', { name: 'Día' })).toHaveValue('MONDAY');
  expect(within(dialog).getByRole('combobox', { name: 'Hora' })).toHaveValue('window:10:00');
  await within(dialog).findByRole('option', { name: '09:30' });
  fireEvent.change(within(dialog).getByRole('combobox', { name: 'Hora' }), { target: { value: 'window:09:30' } });
  const save = within(dialog).getByRole('button', { name: 'Guardar cambios' });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
  await waitFor(() => expect(changed).toMatchObject({ scheduleSlotId: 'window', serviceTypeId: 'service', startTime: '09:30', startDate: expect.any(String) }));
  expect(Object.keys(changed ?? {}).sort()).toEqual(['scheduleSlotId', 'serviceTypeId', 'startDate', 'startTime']);
  expect(changed?.startDate).toBe('2026-09-07');
  expect(availabilityUrl).toContain('excludeFixedBookingId=fixed-1');
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Modificar turno fijo' })).not.toBeInTheDocument());
  expect(await screen.findByText('Turno fijo modificado.')).toBeInTheDocument();
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

it('offers only services returned for the current plan', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala/services', () => HttpResponse.json({ data: [
    { id: 'muscle', name: 'Musculación', durationMinutes: 60 },
    { id: 'functional', name: 'Funcional', durationMinutes: 45 },
  ] })));
  renderPortalSala();
  await screen.findAllByRole('option', { name: 'Musculación · 60 min' });
  expect(screen.getAllByRole('option', { name: 'Funcional · 45 min' })).toHaveLength(2);
  expect(screen.queryByRole('option', { name: /Calistenia/ })).not.toBeInTheDocument();
});
it('shows the empty plan state and disables new reservations and fixed bookings', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala/services', () => HttpResponse.json({ data: [] })));
  renderPortalSala();
  expect(await screen.findByText('Tu Plan actual no tiene servicios disponibles. Consultá con Athleta.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reservar horario' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Crear turno fijo' })).toBeDisabled();
});
it('preserves an old fixed service in the listing but requires an allowed service when editing', async () => {
  let submitted: unknown;
  server.use(
    http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [{
      id: 'old-fixed', startDate: '2026-09-07', startTime: '09:00',
      serviceType: { id: 'calisthenics', name: 'Calistenia' }, scheduleSlot: { id: 'window', weekday: 'MONDAY' },
    }], routine: null, evaluations: [], paymentState: 'PENDING' } })),
    http.post('http://localhost:3000/api/portal/sala/fixed-bookings/old-fixed/change', async ({ request }) => { submitted = await request.json(); return HttpResponse.json({ data: {} }); }),
  );
  renderPortalSala();
  expect(await screen.findByText('Calistenia')).toBeInTheDocument();
  await screen.findAllByRole('option', { name: 'Rehabilitación · 45 min' });
  fireEvent.click(screen.getByRole('button', { name: 'Modificar' }));
  const dialog = await screen.findByRole('dialog', { name: 'Modificar turno fijo' });
  const selector = within(dialog).getByRole('combobox', { name: 'Servicio' });
  expect(selector).toHaveValue('');
  expect(within(dialog).getByRole('option', { name: 'Seleccionar servicio' })).toBeInTheDocument();
  expect(within(dialog).queryByRole('option', { name: 'Calistenia' })).not.toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  fireEvent.change(selector, { target: { value: 'service' } });
  await within(dialog).findByRole('option', { name: '09:00' });
  fireEvent.change(within(dialog).getByRole('combobox', { name: 'Hora' }), { target: { value: 'window:09:00' } });
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Guardar cambios' })).toBeEnabled());
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(submitted).toMatchObject({ serviceTypeId: 'service' }));
});

const paymentMessage = 'Para reservar en noviembre necesitás tener registrado el pago de noviembre.';
it.each([
  ['PORTAL_SALA_PAYMENT_REQUIRED', paymentMessage, paymentMessage, 403],
  ['SALA_CAPACITY_FULL', 'Capacidad agotada.', 'No pudimos reservar ese horario. Revisá la disponibilidad.', 409],
])('shows the appropriate reservation message for %s', async (code, message, expected, status) => {
  server.use(http.post('http://localhost:3000/api/portal/sala/reservations', () => HttpResponse.json({
    statusCode: status, code, message, details: { year: 2026, month: 11 },
  }, { status })));
  renderPortalSala();
  expect(await screen.findByText('Podés reservar con el pago pendiente hasta el día 15 inclusive del mes correspondiente. Desde el 16, para nuevas reservas, ese mes debe estar abonado.')).toBeInTheDocument();
  await screen.findAllByRole('option', { name: 'Rehabilitación · 45 min' });
  fireEvent.change(screen.getAllByRole('combobox')[0]!, { target: { value: 'service' } });
  await screen.findByRole('option', { name: '09:00 · Disponible' });
  fireEvent.change(screen.getByLabelText('Inicio'), { target: { value: 'window:09:00' } });
  const reserve = screen.getByRole('button', { name: 'Reservar horario' });
  await waitFor(() => expect(reserve).toBeEnabled());
  fireEvent.click(reserve);
  expect(await screen.findByText(expected)).toBeInTheDocument();
});

it('keeps a generic fetch error when the response is not structured', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala/services', () => HttpResponse.text('Unavailable', { status: 503 })));
  await expect(portalFetch('sala/services')).rejects.toThrow('No pudimos cargar esta información.');
});

it.each([
  ['2026-10-15', 'Podés realizar nuevas reservas durante el período de gracia hasta el 15 inclusive.'],
  ['2026-10-16', 'Para nuevas reservas de este mes necesitás registrar el pago.'],
])('shows pending payment guidance for operational date %s', async (date, guidance) => {
  vi.spyOn(portalUi, 'today').mockReturnValue(date);
  renderPortalSala();
  expect(await screen.findByText('Pago pendiente')).toBeInTheDocument();
  expect(screen.getByText(guidance)).toBeInTheDocument();
});
it('shows registered payment without pending guidance', async () => {
  vi.spyOn(portalUi, 'today').mockReturnValue('2026-10-16');
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [], routine: null, evaluations: [], paymentState: 'PAID' } })));
  renderPortalSala();
  expect(await screen.findByText('Pago registrado')).toBeInTheDocument();
  expect(screen.queryByText('Para nuevas reservas de este mes necesitás registrar el pago.')).not.toBeInTheDocument();
  expect(screen.queryByText('Podés realizar nuevas reservas durante el período de gracia hasta el 15 inclusive.')).not.toBeInTheDocument();
});
