import React from 'react';
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import PortalHome from './page';

const base = 'http://localhost:3000/api/portal/';
// Allow MSW responses to settle when the full web suite runs concurrently.
configure({ asyncUtilTimeout: 3000 });
const server = setupServer();
const nativeFetch = globalThis.fetch;
const sala = { reservations: [{ id: 'reservation', date: '2026-10-09', startTime: '17:00' }], fixedOccurrences: [], routine: null, paymentState: 'PAID' };
function renderHome(): void {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><PortalHome /></QueryClientProvider>);
}
beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T15:00:00Z'));
  server.use(
    http.get(base + 'me', () => HttpResponse.json({ data: { firstName: 'Persona', lastName: 'Sintética' } })),
    http.get(base + 'sala', () => HttpResponse.json({ data: sala })),
    http.get(base + 'clinic/appointments', () => HttpResponse.json({ data: [] })),
    http.get(base + 'auth/session', () => HttpResponse.json({ data: { csrfToken: 'csrf' } })),
  );
});
afterEach(() => { server.resetHandlers(); vi.useRealTimers(); vi.restoreAllMocks(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it('greets the real person and links to booking and existing Sala sections with actual appointment and payment', async () => {
  renderHome();
  expect(await screen.findByRole('heading', { name: 'Hola, Persona' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Cambiar PIN' })).toHaveAttribute('href', '/portal/change-pin');
  expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  expect(screen.queryByText('Portal personal')).not.toBeInTheDocument();
  expect(await screen.findByRole('link', { name: 'Reservar en Sala' })).toHaveAttribute('href', '/portal/sala/reservar');
  expect(await screen.findByText(/viernes, 09 de octubre · 17:00/i)).toBeInTheDocument();
  expect(screen.getByText('Reservado')).toBeInTheDocument();
  expect(screen.getByText('Pago registrado')).toBeInTheDocument();
  expect(screen.getByText('octubre de 2026')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Mis turnos fijos/ })).toHaveAttribute('href', '/portal/sala#turnos-fijos');
  expect(screen.getByRole('link', { name: /Evaluaciones físicas/ })).toHaveAttribute('href', '/portal/sala#evaluaciones');
  expect(screen.queryByRole('heading', { name: 'Tu rutina activa' })).not.toBeInTheDocument();
  expect(screen.queryByText('Clínica')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Sala' })).not.toBeInTheDocument();
});

it('shows the earliest future noncancelled fixed commitment without a cancellation action', async () => {
  server.use(http.get(base + 'sala', () => HttpResponse.json({ data: { ...sala, paymentState: 'PENDING', reservations: [
    { id: 'past', date: '2026-10-08', startTime: '09:00' },
    { id: 'cancelled', date: '2026-10-08', startTime: '16:00', cancelledAt: '2026-10-08' },
    ...sala.reservations,
  ], fixedOccurrences: [
    { fixedSalaBookingId: 'cancelled-fixed', date: '2026-10-08', startTime: '16:00', status: 'CANCELLED', cancelledForNonPayment: true },
    { fixedSalaBookingId: 'fixed', date: '2026-10-08', startTime: '18:00', status: 'PENDING_PAYMENT', cancelledForNonPayment: false },
  ] } })));
  renderHome();
  expect(await screen.findByText(/jueves, 08 de octubre · 18:00/i)).toBeInTheDocument();
  expect(screen.getByText('Pendiente de pago')).toBeInTheDocument();
  expect(screen.getByText('Pago pendiente')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cancelar turno' })).not.toBeInTheDocument();
});

it('cancels a punctual reservation through the existing endpoint and refreshes the next turn', async () => {
  let cancelled = false;
  server.use(
    http.get(base + 'sala', () => HttpResponse.json({ data: { ...sala, reservations: cancelled ? [] : sala.reservations } })),
    http.post(base + 'sala/reservations/reservation/cancel', ({ request }) => {
      expect(request.headers.get('x-csrf-token')).toBe('csrf'); cancelled = true;
      return HttpResponse.json({ data: {} });
    }),
  );
  renderHome();
  fireEvent.click(await screen.findByRole('button', { name: 'Cancelar turno' }));
  expect(await screen.findByText('No tenés próximos turnos en Sala.')).toBeInTheDocument();
});

it('only shows an existing active routine and uses its actual day names', async () => {
  server.use(http.get(base + 'sala', () => HttpResponse.json({ data: { ...sala, routine: { days: [{ id: 'day', name: 'Día de prueba' }] } } })));
  renderHome();
  expect(await screen.findByRole('heading', { name: 'Tu rutina activa' })).toBeInTheDocument();
  expect(screen.getByText('Día de prueba')).toBeInTheDocument();
  expect(screen.getByText('Solo lectura')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ver mi rutina' })).toHaveAttribute('href', '/portal/sala#rutina');
});

it('uses a neutral summary when the routine has no useful day names', async () => {
  server.use(http.get(base + 'sala', () => HttpResponse.json({ data: { ...sala, routine: { days: [{ id: 'day', name: ' ' }] } } })));
  renderHome();
  expect(await screen.findByText('Rutina actual')).toBeInTheDocument();
});

it('shows a compact clinical card when there is a real future scheduled appointment', async () => {
  server.use(http.get(base + 'clinic/appointments', () => HttpResponse.json({ data: [{ id: 'clinical', startAt: '2026-10-10T15:00:00Z', status: 'SCHEDULED' }] })));
  renderHome();
  expect(await screen.findByRole('heading', { name: 'Clínica' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ver turnos' })).toHaveAttribute('href', '/portal/clinic');
  expect(screen.getByText(/10\/10\/26, 12:00/)).toBeInTheDocument();
});

it('omits Sala actions when Sala is unavailable and keeps the compact empty turn card', async () => {
  server.use(http.get(base + 'sala', () => HttpResponse.json({ code: 'PORTAL_SALA_UNAVAILABLE', message: 'Unavailable' }, { status: 403 })));
  renderHome();
  await screen.findByRole('heading', { name: 'Hola, Persona' });
  await waitFor(() => expect(screen.getByText('No pudimos cargar tus turnos de Sala.')).toBeInTheDocument());
  expect(screen.queryByRole('link', { name: 'Reservar en Sala' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Tu próximo turno' })).toBeInTheDocument();
});

it('calculates the payment month in Buenos Aires at the UTC month boundary', async () => {
  vi.setSystemTime(new Date('2026-11-01T01:00:00Z'));
  renderHome();
  expect(await screen.findByText('octubre de 2026')).toBeInTheDocument();
});
