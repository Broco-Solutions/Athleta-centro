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
    http.get(base + 'sala', () => HttpResponse.json({ data: { replacementWeeks: [{ weekStart: '2026-10-05', weekEnd: '2026-10-11', available: 1 }], validity: { hasValidAccess: true, validUntil: '2026-11-20' } } })),
    http.get(base + 'sala/availability', () => { availabilityCalls++; return HttpResponse.json({ data: blocks() }); }),
    http.get(base + 'auth/session', () => HttpResponse.json({ data: { csrfToken: 'csrf' } })),
    http.post(base + 'sala/reservations', async ({ request }) => { submitted = await request.json(); csrfHeader = request.headers.get('x-csrf-token'); return HttpResponse.json({ data: { id: 'reservation' } }, { status: 201 }); }),
  );
});
afterEach(() => { server.resetHandlers(); vi.restoreAllMocks(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it('defaults to general Sala and offers only exact-hour starts', async () => {
  renderReserve();
  await screen.findByRole('button', { name: '17:00–18:00 Hay lugar' });
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /17:15–/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /17:45–/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /18:30–/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reservar reemplazo' })).toBeDisabled();
});

it('keeps an ongoing activity visible with exactly twenty minutes remaining', async () => {
  vi.mocked(Date.now).mockReturnValue(new Date('2026-10-08T17:40:00-03:00').getTime());
  renderReserve();
  expect(await screen.findByRole('button', { name: '17:00–18:00 Hay lugar' })).toBeEnabled();
});

it('removes an activity with less than twenty minutes remaining while retaining later starts', async () => {
  vi.mocked(Date.now).mockReturnValue(new Date('2026-10-08T17:40:00.001-03:00').getTime());
  renderReserve();
  expect(await screen.findByRole('button', { name: '18:00–19:00 Hay lugar' })).toBeEnabled();
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
    expect(screen.getByRole('button', { name: 'Reservar reemplazo' })).toBeEnabled();
    expect(screen.getByText(/ · 17:00–18:00/)).toBeInTheDocument();
    expect(availabilityCalls).toBe(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });

    expect(screen.queryByRole('button', { name: /17:00–18:00/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/17:00–18:00/)).not.toBeInTheDocument();
    expect(screen.getByText(/ · Elegí un horario/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reservar reemplazo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '18:00–19:00 Hay lugar' })).toBeEnabled();
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
  fireEvent.click(screen.getByRole('button', { name: /viernes 09\/10/i }));
  expect(await screen.findByRole('button', { name: '17:00–18:00 Hay lugar' })).toBeEnabled();
});

it('disables a complete time range when an intermediate block is full while retaining other choices', async () => {
  server.use(http.get(base + 'sala/availability', () => HttpResponse.json({ data: blocks('17:15') })));
  renderReserve();
  const full = await screen.findByRole('button', { name: '17:00–18:00 Sin lugar' });
  expect(full).toBeDisabled();
  fireEvent.click(full);
  expect(screen.getByRole('button', { name: 'Reservar reemplazo' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '18:00–19:00 Hay lugar' }));
  expect(screen.getByRole('button', { name: 'Reservar reemplazo' })).toBeEnabled();
});

it('does not join separate windows or gaps to manufacture a complete range', async () => {
  server.use(http.get(base + 'sala/availability', () => HttpResponse.json({ data: blocks().slice(0, 4).map((block, index) => ({ ...block, scheduleSlotId: index === 2 ? 'other-window' : 'window' })) })));
  renderReserve();
  expect(await screen.findByText('No hay horarios disponibles para esta fecha.')).toBeInTheDocument();
});

it.each([
  ['PORTAL_SALA_REPLACEMENT_REQUIRED', 'Para reservar otro horario primero cancelá una fecha de uno de tus turnos fijos de esta semana.'],
  ['PORTAL_SALA_TIME_PASSED', 'Ese horario ya no admite nuevas reservas. Elegí otro horario.'],
  ['PORTAL_SALA_VALIDITY_REQUIRED', 'Tu cuota no está vigente para esta fecha. Consultá en recepción para renovarla.'],
  ['PORTAL_SALA_PAYMENT_REQUIRED', 'Tu cuota no está vigente para esta fecha. Consultá en recepción para renovarla.'],
  ['SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED', 'Ese horario acaba de quedarse sin lugar. Elegí otro horario disponible.'],
  ['SALA_CAPACITY_FULL', 'Ese horario acaba de quedarse sin lugar. Elegí otro horario disponible.'],
  ['SALA_RESERVATION_DUPLICATE', 'Ya tenés una actividad reservada en ese horario. Elegí otro.'],
  ['SALA_BOOKING_OVERLAP', 'Ya tenés una actividad reservada en ese horario. Elegí otro.'],
  ['SALA_OCCURRENCE_DUPLICATE', 'Ya tenés una actividad reservada en ese horario. Elegí otro.'],
  ['SALA_SCHEDULE_CLOSED', 'Athleta cerró ese horario para esta fecha. Elegí otro horario.'],
  ['SALA_SERVICE_TYPE_INVALID', 'Ese servicio no está disponible con tu Plan actual. Elegí otro servicio o consultá en recepción.'],
  ['SALA_SERVICE_NOT_INCLUDED_IN_PLAN', 'Ese servicio no está disponible con tu Plan actual. Elegí otro servicio o consultá en recepción.'],
  ['SALA_REQUIRED_SLOTS_UNAVAILABLE', 'Ese horario ya no permite completar la duración del servicio. Elegí otro horario.'],
])('preserves the functional message for %s and refreshes availability after rejection', async (code, expected) => {
  server.use(http.post(base + 'sala/reservations', () => HttpResponse.json({ code, message: 'Conflict' }, { status: 409 })));
  renderReserve();
  fireEvent.click(await screen.findByRole('button', { name: '17:00–18:00 Hay lugar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reservar reemplazo' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(expected);
  await waitFor(() => expect(availabilityCalls).toBeGreaterThan(1));
});

it('uses a safe fallback for an unknown reservation error', async () => {
  server.use(http.post(base + 'sala/reservations', () => HttpResponse.json({ code: 'UNEXPECTED', message: 'Internal database detail' }, { status: 500 })));
  renderReserve();
  fireEvent.click(await screen.findByRole('button', { name: '17:00–18:00 Hay lugar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reservar reemplazo' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos completar la operación. Tus datos no fueron modificados. Intentá nuevamente.');
  expect(screen.queryByText('Internal database detail')).not.toBeInTheDocument();
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
  fireEvent.click(screen.getByRole('button', { name: 'Reservar reemplazo' }));
  expect(await screen.findByRole('button', { name: 'Reservando…' })).toBeDisabled();
  finish();
  expect(await screen.findByRole('heading', { name: 'Reserva confirmada' })).toBeInTheDocument();
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
  fireEvent.click(screen.getByRole('button', { name: 'Reservar reemplazo' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Ese horario acaba de quedarse sin lugar. Elegí otro horario disponible.');
  expect(await screen.findByRole('button', { name: '17:00–18:00 Sin lugar' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Reservar reemplazo' })).toBeDisabled();
});

it('blocks the dedicated reservation route when current validity is missing', async () => {
  server.use(http.get(base + 'sala', () => HttpResponse.json({ data: { replacementWeeks: [{ weekStart: '2026-10-05', weekEnd: '2026-10-11', available: 1 }], validity: { hasValidAccess: false, validUntil: null } } })));
  renderReserve();
  expect(await screen.findByRole('heading', { name: 'Cuota sin vigencia' })).toBeVisible();
  expect(screen.getByText('No podés realizar nuevas reservas por el momento.')).toBeVisible();
  expect(screen.getByText('Consultá en recepción para renovar tu cuota y volver a reservar.')).toBeVisible();
  for (const link of screen.getAllByRole('link', { name: 'Volver a Inicio' })) expect(link).toHaveAttribute('href', '/portal');
  expect(screen.queryByRole('link', { name: 'Volver a Sala' })).not.toBeInTheDocument();
  expect(screen.queryByText('Vigencia de Sala')).not.toBeInTheDocument();
  expect(screen.queryByText('Sin vigencia')).not.toBeInTheDocument();
  expect(screen.queryByText('Necesitás renovar tu vigencia para realizar nuevas reservas.')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reservar reemplazo' })).not.toBeInTheDocument();
});
it('hides all booking inputs and the booking action without an available replacement', async () => {
  server.use(http.get(base + 'sala', () => HttpResponse.json({ data: { replacementWeeks: [], validity: { hasValidAccess: true, validUntil: '2026-11-20' } } })));
  renderReserve();
  expect(await screen.findByText('No tenés un cambio disponible.')).toBeVisible();
  expect(screen.getByText('Para reservar otro horario, primero cancelá una fecha de uno de tus turnos fijos.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Reservar reemplazo' })).not.toBeInTheDocument();
  expect(screen.queryByText('Servicio (opcional)')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Fecha')).not.toBeInTheDocument();
  expect(screen.queryByText('Elegí el horario')).not.toBeInTheDocument();
  expect(availabilityCalls).toBe(0);
});

it('shows only the first chronological enabled week with three steps and no service or calendar', async () => {
  vi.mocked(portalUi.today).mockReturnValue('2026-10-26');
  server.use(http.get(base + 'sala', () => HttpResponse.json({ data: { replacementWeeks: [
    { weekStart: '2026-11-02', weekEnd: '2026-11-08', available: 1 },
    { weekStart: '2026-10-19', weekEnd: '2026-10-25', available: 0 },
    { weekStart: '2026-10-26', weekEnd: '2026-11-01', available: 1 },
  ], validity: { hasValidAccess: true, validUntil: '2026-11-20' } } })));
  renderReserve();
  expect(await screen.findByRole('heading', { name: 'Semana disponible' })).toBeVisible();
  expect(screen.getByText('26/10/2026 — 01/11/2026')).toBeVisible();
  const dayButtons = screen.getAllByRole('button').filter(button => /\d{2}\/\d{2}/.test(button.getAttribute('aria-label') ?? ''));
  expect(dayButtons.map(button => button.getAttribute('aria-label'))).toEqual(['lunes 26/10', 'martes 27/10', 'miércoles 28/10', 'jueves 29/10', 'viernes 30/10', 'sábado 31/10', 'domingo 01/11']);
  for (const [number, title] of [[1, 'Elegí el día'], [2, 'Elegí el horario'], [3, 'Confirmá']]) expect(screen.getByRole('heading', { name: `${number} ${title}` })).toBeVisible();
  expect(document.querySelector('input[type="date"]')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Ver calendario' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Servicio|Sin servicio|60 min/)).not.toBeInTheDocument();
});

it('sends only date, slot and time with CSRF and keeps confirmation after consuming the replacement', async () => {
  vi.mocked(portalUi.today).mockReturnValue('2026-10-28');
  let consumed = false;
  server.use(
    http.get(base + 'sala', () => HttpResponse.json({ data: { replacementWeeks: consumed ? [] : [{ weekStart: '2026-10-26', weekEnd: '2026-11-01', available: 1 }], validity: { hasValidAccess: true, validUntil: '2026-11-20' } } })),
    http.get(base + 'sala/availability', () => HttpResponse.json({ data: blocks().map(block => ({ ...block, date: '2026-10-28' })) })),
    http.post(base + 'sala/reservations', async ({ request }) => { submitted = await request.json(); csrfHeader = request.headers.get('x-csrf-token'); consumed = true; return HttpResponse.json({ data: {} }, { status: 201 }); }),
  );
  const client = renderReserve();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  fireEvent.click(await screen.findByRole('button', { name: '18:00–19:00 Hay lugar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reservar reemplazo' }));
  await screen.findByRole('heading', { name: 'Reserva confirmada' });
  await waitFor(() => expect(client.getQueryData<{ replacementWeeks: unknown[] }>(['portal', 'sala'])?.replacementWeeks).toEqual([]));
  expect(submitted).toEqual({ date: '2026-10-28', scheduleSlotId: 'window', startTime: '18:00' });
  expect(csrfHeader).toBe('csrf');
  expect(screen.getByText('Fecha')).toBeVisible();
  expect(screen.getByText('Hora')).toBeVisible();
  expect(screen.getByText(/miércoles 28\/10/i)).toBeVisible();
  expect(screen.getByText('18:00 – 19:00')).toBeVisible();
  expect(screen.getByText('Tu lugar quedó reservado.')).toBeVisible();
  expect(screen.queryByText(/Servicio|Sala · 60 min|Sin servicio/)).not.toBeInTheDocument();
  for (const link of screen.getAllByRole('link', { name: 'Volver a Inicio' })) expect(link).toHaveAttribute('href', '/portal');
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['portal', 'sala'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['portal', 'sala', 'availability'] });
});

it('offers only remaining days within validity and clears time selection when the day changes', async () => {
  server.use(http.get(base + 'sala', () => HttpResponse.json({ data: { replacementWeeks: [{ weekStart: '2026-10-05', weekEnd: '2026-10-11', available: 1 }], validity: { hasValidAccess: true, validUntil: '2026-10-09' } } })));
  renderReserve();
  fireEvent.click(await screen.findByRole('button', { name: '17:00–18:00 Hay lugar' }));
  expect(screen.getByRole('button', { name: 'Reservar reemplazo' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'jueves 08/10' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'viernes 09/10' }));
  expect(screen.getByRole('button', { name: 'Reservar reemplazo' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /sábado|domingo|lunes|martes|miércoles/i })).not.toBeInTheDocument();
});

it('caps an enabled week at thirty days from today', async () => {
  server.use(http.get(base + 'sala', () => HttpResponse.json({ data: { replacementWeeks: [{ weekStart: '2026-11-02', weekEnd: '2026-11-08', available: 1 }], validity: { hasValidAccess: true, validUntil: '2026-12-20' } } })));
  renderReserve();
  await screen.findByRole('heading', { name: 'Semana disponible' });
  expect(screen.getByRole('button', { name: 'sábado 07/11' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'domingo 08/11' })).not.toBeInTheDocument();
});
