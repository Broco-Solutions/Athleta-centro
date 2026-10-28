import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import PortalReservations from './page';
import * as portalUi from '../../portal-ui';

vi.mock('next/navigation', () => ({ usePathname: () => '/portal/sala/reservas' }));
const server = setupServer(http.get('http://localhost:3000/api/portal/auth/session', () => HttpResponse.json({ data: { csrfToken: 'csrf' } })));
const nativeFetch = globalThis.fetch;
const endpoint = 'http://localhost:3000/api/portal/sala';
const sessionEndpoint = 'http://localhost:3000/api/portal/auth/session';
function renderReservations(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><PortalReservations /></QueryClientProvider>);
}
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => { vi.spyOn(portalUi, 'today').mockReturnValue('2026-10-19'); });
afterEach(() => { cleanup(); server.resetHandlers(); vi.restoreAllMocks(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it('combines only future RESERVED occurrences and active replacements in date/time order', async () => {
  server.use(http.get(endpoint, () => HttpResponse.json({ data: {
    reservations: [
      { id: 'replacement-1', date: '2026-10-30', startTime: '09:00', cancelledAt: null },
      { id: 'cancelled-replacement', date: '2026-10-31', startTime: '10:00', cancelledAt: '2026-10-20T12:00:00Z' },
      { id: 'past', date: '2026-10-18', startTime: '10:00' },
      { id: 'earlier', date: '2026-10-30', startTime: '08:00' },
    ],
    fixedOccurrences: [
      { fixedSalaBookingId: 'fixed-2', date: '2026-11-02', startTime: '08:00', status: 'RESERVED', cancelledForNonPayment: false },
      { fixedSalaBookingId: 'fixed-1', date: '2026-10-28', startTime: '18:00', status: 'RESERVED', cancelledForNonPayment: false },
      ...['PENDING_PAYMENT', 'CANCELLED', 'ATTENDED', 'ABSENT'].map((status, index) => ({ fixedSalaBookingId: 'excluded', date: `2026-11-0${4 + index}`, startTime: '18:00', status, cancelledForNonPayment: false })),
      { fixedSalaBookingId: 'past', date: '2026-10-18', startTime: '08:00', status: 'RESERVED', cancelledForNonPayment: false },
    ],
  } })));
  renderReservations();
  await screen.findByText('28/10/2026 · 18:00');
  expect(screen.getByRole('heading', { name: 'Mis próximos turnos' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Volver a Inicio' })).toHaveAttribute('href', '/portal');
  expect(within(screen.getByRole('main')).getAllByRole('listitem').map(item => item.textContent)).toEqual([
    '28/10/2026 · 18:00Cancelar esta fecha', '30/10/2026 · 08:00Cancelar esta fecha', '30/10/2026 · 09:00Cancelar esta fecha', '02/11/2026 · 08:00Cancelar esta fecha',
  ]);
  expect(screen.queryByText(/Pendiente de renovación|Cancelado|Sin servicio|Sala|Funcional|Musculación/)).not.toBeInTheDocument();
});

it('cancels a fixed date using Portal CSRF and removes it after invalidation', async () => {
  let cancelled = false;
  let request: Request | undefined;
  server.use(
    http.get(endpoint, () => HttpResponse.json({ data: { reservations: [], fixedOccurrences: [{ fixedSalaBookingId: 'fixed-1', date: '2026-10-28', startTime: '18:00', status: cancelled ? 'CANCELLED' : 'RESERVED', cancelledForNonPayment: false }] } })),
    http.post(`${endpoint}/fixed-bookings/fixed-1/occurrences/2026-10-28/cancel`, ({ request: incoming }) => { request = incoming; cancelled = true; return HttpResponse.json({ data: {} }); }),
  );
  renderReservations();
  fireEvent.click(await screen.findByRole('button', { name: 'Cancelar esta fecha' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));
  await screen.findByText('No tenés próximos turnos disponibles.');
  expect(screen.queryByText('28/10/2026 · 18:00')).not.toBeInTheDocument();
  expect(request?.method).toBe('POST');
  expect(request?.headers.get('x-csrf-token')).toBe('csrf');
  expect(await request?.text()).toBe('');
});

it('does not request cancellation when confirmation is rejected', async () => {
  let posts = 0;
  server.use(
    http.get(endpoint, () => HttpResponse.json({ data: { reservations: [
      { id: 'a', date: '2026-10-20', startTime: '11:30', serviceType: { name: 'Calistenia' }, cancelledAt: null },
      { id: 'b', date: '2026-10-23', serviceType: { name: 'Funcional' }, cancelledAt: null },
    ] } })),
    http.post(`${endpoint}/reservations/a/cancel`, () => { posts++; return HttpResponse.json({ data: {} }); }),
  );

  renderReservations();
  fireEvent.click((await screen.findAllByRole('button', { name: 'Cancelar esta fecha' }))[0]!);
  expect(screen.getByRole('dialog')).toHaveTextContent('¿Cancelar la reserva del 20/10/2026 a las 11:30?');
  fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar esta fecha' })[1]!);

  expect(screen.getByRole('dialog')).toHaveTextContent('¿Cancelar la reserva del 23/10/2026?');
  fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
  expect(posts).toBe(0);
  expect(screen.getByText('20/10/2026 · 11:30')).toBeVisible();
  expect(screen.queryByText('Reserva cancelada correctamente.')).not.toBeInTheDocument();
});

it('cancels with Portal CSRF, refetches the list and keeps other reservations', async () => {
  let cancelled = false;
  let request: Request | undefined;
  server.use(
    http.get(endpoint, () => HttpResponse.json({ data: { reservations: [
      { id: 'a', date: '2026-10-20', startTime: '11:30', serviceType: { name: 'Calistenia' }, cancelledAt: cancelled ? '2026-10-19T12:00:00Z' : null },
      { id: 'b', date: '2026-10-21', startTime: '08:30', serviceType: { name: 'Musculación' }, cancelledAt: null },
      { id: 'c', date: '2026-10-22', startTime: '09:00', serviceType: { name: 'Funcional' }, cancelledAt: null },
    ] } })),
    http.get(sessionEndpoint, () => HttpResponse.json({ data: { csrfToken: 'portal-csrf' } })),
    http.post(`${endpoint}/reservations/a/cancel`, async ({ request: incoming }) => {
      request = incoming;
      cancelled = true;
      return HttpResponse.json({ data: { id: 'a', cancelledAt: '2026-10-19T12:00:00Z' } });
    }),
  );

  renderReservations();
  fireEvent.click((await screen.findAllByRole('button', { name: 'Cancelar esta fecha' }))[0]!);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));

  expect(await screen.findByRole('status')).toHaveTextContent('Reserva cancelada correctamente.');
  await waitFor(() => expect(screen.queryByText('20/10/2026 · 11:30')).not.toBeInTheDocument());
  expect(screen.getByText('21/10/2026 · 08:30')).toBeVisible();
  expect(screen.getByText('22/10/2026 · 09:00')).toBeVisible();
  expect(request?.method).toBe('POST');
  expect(request?.headers.get('x-csrf-token')).toBe('portal-csrf');
  expect(await request?.text()).toBe('');
});

it('shows a safe error after rejection, refetches and leaves the active reservation available', async () => {
  server.use(
    http.get(endpoint, () => HttpResponse.json({ data: { reservations: [
      { id: 'a', date: '2026-10-20', startTime: '11:30', serviceType: { name: 'Calistenia' }, cancelledAt: null },
    ] } })),
    http.get(sessionEndpoint, () => HttpResponse.json({ data: { csrfToken: 'portal-csrf' } })),
    http.post(`${endpoint}/reservations/a/cancel`, () => HttpResponse.json({ code: 'PORTAL_RESOURCE_FORBIDDEN', message: 'Internal detail' }, { status: 403 })),
  );

  renderReservations();
  fireEvent.click(await screen.findByRole('button', { name: 'Cancelar esta fecha' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cancelar la reserva. Intentá nuevamente.');
  expect(screen.queryByText('Internal detail')).not.toBeInTheDocument();
  expect(screen.getByText('20/10/2026 · 11:30')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Cancelar esta fecha' })).toBeEnabled();
});

it('disables only the pending reservation and shows the empty state after cancelling the last one', async () => {
  let finishPost: (() => void) | undefined;
  let posts = 0;
  let cancelled = false;
  server.use(
    http.get(endpoint, () => HttpResponse.json({ data: { reservations: cancelled ? [] : [
      { id: 'a', date: '2026-10-20', startTime: '11:30', serviceType: { name: 'Calistenia' }, cancelledAt: null },
      { id: 'b', date: '2026-10-21', startTime: '08:30', serviceType: { name: 'Musculación' }, cancelledAt: null },
    ] } })),
    http.get(sessionEndpoint, () => HttpResponse.json({ data: { csrfToken: 'portal-csrf' } })),
    http.post(`${endpoint}/reservations/a/cancel`, () => {
      posts++;
      return new Promise<Response>(resolve => {
        finishPost = () => { cancelled = true; resolve(HttpResponse.json({ data: { id: 'a' } })); };
      });
    }),
  );

  renderReservations();
  const buttons = await screen.findAllByRole('button', { name: 'Cancelar esta fecha' });
  fireEvent.click(buttons[0]!);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));
  const cancelling = await screen.findByRole('button', { name: 'Cancelando…' });

  expect(cancelling).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancelar esta fecha' })).toBeEnabled();
  fireEvent.click(cancelling);
  expect(posts).toBe(1);
  finishPost!();

  expect(await screen.findByRole('status')).toHaveTextContent('Reserva cancelada correctamente.');
  expect(await screen.findByText('No tenés próximos turnos disponibles.')).toBeVisible();
});

it.each([false, true])('shows the empty state and Home link when no active reservations exist (cancelled=%s)', async cancelled => {
  server.use(http.get(endpoint, () => HttpResponse.json({ data: { reservations: cancelled ? [
    { id: 'cancelled', date: '2026-10-21', cancelledAt: '2026-10-19T12:00:00Z' },
  ] : [] } })));
  renderReservations();
  expect(await screen.findByText('No tenés próximos turnos disponibles.')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Volver a Inicio' })).toHaveAttribute('href', '/portal');
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
});

it('announces loading and keeps the Home link', async () => {
  server.use(http.get(endpoint, () => HttpResponse.json({ data: { reservations: [] } })));
  renderReservations();
  expect(screen.getByRole('status')).toHaveTextContent('Cargando reservas…');
  expect(screen.getByRole('link', { name: 'Volver a Inicio' })).toHaveAttribute('href', '/portal');
  await screen.findByText('No tenés próximos turnos disponibles.');
});

it('shows a safe error and keeps the Home link', async () => {
  server.use(http.get(endpoint, () => HttpResponse.json({ code: 'FAIL', message: 'Internal detail' }, { status: 500 })));
  renderReservations();
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar tus reservas. Intentá nuevamente.');
  expect(screen.queryByText('Internal detail')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Volver a Inicio' })).toHaveAttribute('href', '/portal');
});
