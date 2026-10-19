import React from 'react';
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import PortalReserve from './page';
import * as portalUi from '../../portal-ui';

// Allow MSW responses to settle when the full web suite runs concurrently.
configure({ asyncUtilTimeout: 3000 });
const server = setupServer();
const nativeFetch = globalThis.fetch;
const base = 'http://localhost:3000/api/portal/';
let submitted: unknown;
let csrfHeader: string | null;
let availabilityCalls: number;
const services = [
  { id: 'muscle', name: 'Musculación', durationMinutes: 60 },
  { id: 'functional', name: 'Funcional', durationMinutes: 45 },
];
function blocks(full = '') {
  return ['17:00', '17:15', '17:30', '17:45', '18:00', '18:15', '18:30', '18:45'].map(startTime => {
    const end = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3)) + 15;
    return { scheduleSlotId: 'window', startTime, endTime: String(Math.floor(end / 60)).padStart(2, '0') + ':' + String(end % 60).padStart(2, '0'), available: startTime !== full, date: '2026-10-08' };
  });
}
function renderReserve(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><PortalReserve /></QueryClientProvider>);
  return client;
}
beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  vi.spyOn(portalUi, 'today').mockReturnValue('2026-10-08');
  vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-08T09:00:00-03:00').getTime());
  submitted = undefined; csrfHeader = null; availabilityCalls = 0;
  server.use(
    http.get(base + 'sala', () => HttpResponse.json({ data: { validity: { hasValidAccess: true, validUntil: '2026-11-20' } } })),
    http.get(base + 'sala/services', () => HttpResponse.json({ data: [services[0]] })),
    http.get(base + 'sala/availability', () => { availabilityCalls++; return HttpResponse.json({ data: blocks() }); }),
    http.get(base + 'auth/session', () => HttpResponse.json({ data: { csrfToken: 'csrf' } })),
    http.post(base + 'sala/reservations', async ({ request }) => { submitted = await request.json(); csrfHeader = request.headers.get('x-csrf-token'); return HttpResponse.json({ data: { id: 'reservation' } }, { status: 201 }); }),
  );
});
afterEach(() => { server.resetHandlers(); vi.restoreAllMocks(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it('automatically selects the only plan service and offers complete half-hour starts without selects', async () => {
  renderReserve();
  expect(await screen.findByRole('button', { name: 'Musculación 60 min' })).toHaveAttribute('aria-pressed', 'true');
  await screen.findByRole('button', { name: '17:00–18:00 Hay lugar' });
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /17:15–/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /17:45–/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /18:30–/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reservar en Sala' })).toBeDisabled();
});

it('keeps an ongoing activity visible with exactly twenty minutes remaining', async () => {
  vi.mocked(Date.now).mockReturnValue(new Date('2026-10-08T17:40:00-03:00').getTime());
  renderReserve();
  expect(await screen.findByRole('button', { name: '17:00–18:00 Hay lugar' })).toBeEnabled();
});

it('removes an activity with less than twenty minutes remaining while retaining later starts', async () => {
  vi.mocked(Date.now).mockReturnValue(new Date('2026-10-08T17:40:00.001-03:00').getTime());
  renderReserve();
  expect(await screen.findByRole('button', { name: '17:30–18:30 Hay lugar' })).toBeEnabled();
  expect(screen.queryByText('17:00–18:00')).not.toBeInTheDocument();
});

it('expires a selected activity on the local clock tick without requesting availability again', async () => {
  vi.mocked(Date.now).mockRestore();
  // Keep timeouts real so MSW and query notifications can settle normally.
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date('2026-10-08T17:40:00-03:00'));
  try {
    renderReserve();
    fireEvent.click(await screen.findByRole('button', { name: '17:00–18:00 Hay lugar' }));
    expect(screen.getByRole('button', { name: 'Reservar en Sala' })).toBeEnabled();
    expect(screen.getByText(/ · 17:00–18:00/)).toBeInTheDocument();
    expect(availabilityCalls).toBe(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });

    expect(screen.queryByRole('button', { name: /17:00–18:00/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/17:00–18:00/)).not.toBeInTheDocument();
    expect(screen.getByText(/ · Elegí un horario/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reservar en Sala' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '17:30–18:30 Hay lugar' })).toBeEnabled();
    expect(availabilityCalls).toBe(1);
  } finally {
    cleanup();
    vi.useRealTimers();
  }
});

it('retains tomorrow’s activities even when their equivalent time has passed today', async () => {
  vi.mocked(Date.now).mockReturnValue(new Date('2026-10-08T20:00:00-03:00').getTime());
  server.use(http.get(base + 'sala/availability', ({ request }) => {
    const date = new URL(request.url).searchParams.get('date');
    return HttpResponse.json({ data: blocks().map(block => ({ ...block, date })) });
  }));
  renderReserve();
  await screen.findByText('No hay horarios disponibles para esta fecha.');
  fireEvent.click(screen.getByRole('button', { name: /Mañana 09\/10/ }));
  expect(await screen.findByRole('button', { name: '17:00–18:00 Hay lugar' })).toBeEnabled();
});

it('requires a manual service selection and only displays services supplied by the plan endpoint', async () => {
  server.use(http.get(base + 'sala/services', () => HttpResponse.json({ data: services })));
  renderReserve();
  const muscle = await screen.findByRole('button', { name: 'Musculación 60 min' });
  expect(muscle).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Funcional 45 min' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByText('Calistenia')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reservar en Sala' })).toBeDisabled();
  fireEvent.click(muscle);
  fireEvent.click(await screen.findByRole('button', { name: '17:00–18:00 Hay lugar' }));
  expect(screen.getByRole('button', { name: 'Reservar en Sala' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Funcional 45 min' }));
  expect(screen.getByRole('button', { name: 'Reservar en Sala' })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Hoy 08\/10/ })).toHaveAttribute('aria-pressed', 'true');
  expect(await screen.findByRole('button', { name: '17:00–17:45 Hay lugar' })).toBeEnabled();
});

it('offers three quick dates and an optional calendar limited to thirty operational days', async () => {
  renderReserve();
  await screen.findByRole('button', { name: 'Musculación 60 min' });
  expect(screen.getByRole('button', { name: /Hoy 08\/10/ })).toBeEnabled();
  expect(screen.getByRole('button', { name: /Mañana 09\/10/ })).toBeEnabled();
  expect(screen.getByRole('button', { name: /sábado 10\/10/i })).toBeEnabled();
  expect(screen.queryByLabelText('Fecha')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ver calendario' }));
  expect(screen.getByLabelText('Fecha')).toHaveAttribute('min', '2026-10-08');
  expect(screen.getByLabelText('Fecha')).toHaveAttribute('max', '2026-11-07');
  fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-11-08' } });
  expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-08');
  fireEvent.click(await screen.findByRole('button', { name: '17:00–18:00 Hay lugar' }));
  fireEvent.click(screen.getByRole('button', { name: /Mañana 09\/10/ }));
  expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-09');
  expect(screen.getByRole('button', { name: 'Reservar en Sala' })).toBeDisabled();
});

it('disables a complete time range when an intermediate block is full while retaining other choices', async () => {
  server.use(http.get(base + 'sala/availability', () => HttpResponse.json({ data: blocks('17:15') })));
  renderReserve();
  const full = await screen.findByRole('button', { name: '17:00–18:00 Sin lugar' });
  expect(full).toBeDisabled();
  fireEvent.click(full);
  expect(screen.getByRole('button', { name: 'Reservar en Sala' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '18:00–19:00 Hay lugar' }));
  expect(screen.getByRole('button', { name: 'Reservar en Sala' })).toBeEnabled();
});

it('does not join separate windows or gaps to manufacture a complete range', async () => {
  server.use(http.get(base + 'sala/availability', () => HttpResponse.json({ data: blocks().slice(0, 4).map((block, index) => ({ ...block, scheduleSlotId: index === 2 ? 'other-window' : 'window' })) })));
  renderReserve();
  expect(await screen.findByText('No hay horarios disponibles para esta fecha.')).toBeInTheDocument();
});

it('disables the remaining flow when the plan has no services', async () => {
  server.use(http.get(base + 'sala/services', () => HttpResponse.json({ data: [] })));
  renderReserve();
  expect(await screen.findByText('Tu Plan actual no tiene servicios disponibles. Consultá con Athleta.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Hoy 08\/10/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Ver calendario' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Reservar en Sala' })).toBeDisabled();
  expect(availabilityCalls).toBe(0);
});

it('preserves the exact payload and CSRF token, refreshes queries and retains the service and date after success', async () => {
  const client = renderReserve();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  fireEvent.click(await screen.findByRole('button', { name: '17:00–18:00 Hay lugar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reservar en Sala' }));
  expect(await screen.findByText('Horario reservado.')).toBeInTheDocument();
  expect(submitted).toEqual({ date: '2026-10-08', scheduleSlotId: 'window', serviceTypeId: 'muscle', startTime: '17:00' });
  expect(csrfHeader).toBe('csrf');
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['portal', 'sala'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['portal', 'sala', 'availability'] });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Reservar en Sala' })).toBeDisabled());
  expect(screen.getByRole('button', { name: 'Musculación 60 min' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: /Hoy 08\/10/ })).toHaveAttribute('aria-pressed', 'true');
});

it.each([
  ['PORTAL_SALA_VALIDITY_REQUIRED', 'Necesitás tener vigencia de Sala para reservar esa fecha.'],
  ['SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED', 'No hay lugar disponible para ese horario.'],
  ['SALA_CAPACITY_FULL', 'No hay lugar disponible para ese horario.'],
  ['SALA_RESERVATION_DUPLICATE', 'Ya tenés una actividad reservada en ese horario. Elegí otro horario.'],
  ['SALA_BOOKING_OVERLAP', 'Ya tenés una actividad reservada en ese horario. Elegí otro horario.'],
  ['SALA_OCCURRENCE_DUPLICATE', 'Ya tenés una actividad reservada en ese horario. Elegí otro horario.'],
  ['SALA_SCHEDULE_CLOSED', 'El horario está cerrado para esa fecha.'],
  ['SALA_SERVICE_TYPE_INVALID', 'El servicio no está disponible para tu Plan.'],
  ['SALA_SERVICE_NOT_INCLUDED_IN_PLAN', 'El servicio no está disponible para tu Plan.'],
  ['SALA_REQUIRED_SLOTS_UNAVAILABLE', 'El servicio no entra completo en ese horario.'],
])('preserves the functional message for %s and refreshes availability after rejection', async (code, expected) => {
  server.use(http.post(base + 'sala/reservations', () => HttpResponse.json({ code, message: 'Conflict' }, { status: 409 })));
  renderReserve();
  fireEvent.click(await screen.findByRole('button', { name: '17:00–18:00 Hay lugar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reservar en Sala' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(expected);
  await waitFor(() => expect(availabilityCalls).toBeGreaterThan(1));
});

it('keeps the selected date when changing service and clears the previous time', async () => {
  server.use(http.get(base + 'sala/services', () => HttpResponse.json({ data: services })));
  renderReserve();
  fireEvent.click(await screen.findByRole('button', { name: 'Musculación 60 min' }));
  fireEvent.click(screen.getByRole('button', { name: /Mañana 09\/10/ }));
  fireEvent.click(await screen.findByRole('button', { name: '17:00–18:00 Hay lugar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Funcional 45 min' }));
  expect(screen.getByRole('button', { name: /Mañana 09\/10/ })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Reservar en Sala' })).toBeDisabled();
});

it('shows Reservando and prevents another submit while the mutation is pending', async () => {
  let finish!: () => void;
  const response = new Promise<void>(resolve => { finish = resolve; });
  server.use(http.post(base + 'sala/reservations', async () => {
    await response;
    return HttpResponse.json({ data: { id: 'reservation' } });
  }));
  renderReserve();
  fireEvent.click(await screen.findByRole('button', { name: '17:00–18:00 Hay lugar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reservar en Sala' }));
  expect(await screen.findByRole('button', { name: 'Reservando…' })).toBeDisabled();
  finish();
  expect(await screen.findByText('Horario reservado.')).toBeInTheDocument();
});

it('turns a stale selected time into a disabled full time after a capacity rejection', async () => {
  let rejected = false;
  server.use(
    http.get(base + 'sala/availability', () => HttpResponse.json({ data: blocks(rejected ? '17:15' : '') })),
    http.post(base + 'sala/reservations', () => {
      rejected = true;
      return HttpResponse.json({ code: 'SALA_CAPACITY_FULL', message: 'Full' }, { status: 409 });
    }),
  );
  renderReserve();
  fireEvent.click(await screen.findByRole('button', { name: '17:00–18:00 Hay lugar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reservar en Sala' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No hay lugar disponible para ese horario.');
  expect(await screen.findByRole('button', { name: '17:00–18:00 Sin lugar' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Reservar en Sala' })).toBeDisabled();
});

it('blocks the dedicated reservation route when current validity is missing', async () => {
  server.use(http.get(base + 'sala', () => HttpResponse.json({ data: { validity: { hasValidAccess: false, validUntil: null } } })));
  renderReserve();
  expect(await screen.findByRole('heading', { name: 'Cuota sin vigencia' })).toBeVisible();
  expect(screen.getByText('No podés realizar nuevas reservas por el momento.')).toBeVisible();
  expect(screen.getByText('Consultá en recepción para renovar tu cuota y volver a reservar.')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Volver a Sala' })).toHaveAttribute('href', '/portal/sala');
  expect(screen.queryByText('Vigencia de Sala')).not.toBeInTheDocument();
  expect(screen.queryByText('Sin vigencia')).not.toBeInTheDocument();
  expect(screen.queryByText('Necesitás renovar tu vigencia para realizar nuevas reservas.')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reservar en Sala' })).not.toBeInTheDocument();
});
it('limits the dedicated reservation calendar to the end of current validity', async () => {
  server.use(http.get(base + 'sala', () => HttpResponse.json({ data: { validity: { hasValidAccess: true, validUntil: '2026-10-09' } } })));
  renderReserve();
  fireEvent.click(await screen.findByRole('button', { name: 'Ver calendario' }));
  expect(screen.getByLabelText('Fecha')).toHaveAttribute('max', '2026-10-09');
});
