import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import PortalReservations from './page';

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
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { cleanup(); server.resetHandlers(); vi.restoreAllMocks(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it('lists every upcoming active reservation in endpoint order with cancellation actions and Home navigation', async () => {
  server.use(http.get(endpoint, () => HttpResponse.json({ data: { reservations: [
    { id: 'a', date: '2026-10-20', startTime: '09:00', serviceType: { name: 'Calistenia' }, cancelledAt: null },
    { id: 'cancelled', date: '2026-10-21', startTime: '09:00', serviceType: { name: 'Cancelada' }, cancelledAt: '2026-10-19T12:00:00Z' },
    { id: 'b', date: '2026-10-23', startTime: '18:00', serviceType: { name: 'Funcional' } },
    { id: 'c', date: '2026-10-26', startTime: '10:00', serviceType: { name: 'Musculación' } },
  ] } })));
  renderReservations();
  expect(await screen.findByText('20/10/2026 · 09:00')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Mis reservas' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Volver a Inicio' })).toHaveAttribute('href', '/portal');
  const main = within(screen.getByRole('main'));
  expect(main.getAllByRole('listitem').map(item => item.textContent)).toEqual([
    '20/10/2026 · 09:00Calistenia · ReservadoCancelar reserva',
    '23/10/2026 · 18:00Funcional · ReservadoCancelar reserva',
    '26/10/2026 · 10:00Musculación · ReservadoCancelar reserva',
  ]);
  expect(main.queryByText(/21\/10\/2026|Cancelad/)).not.toBeInTheDocument();
  expect(main.getAllByRole('button', { name: 'Cancelar reserva' })).toHaveLength(3);
  for (const nav of screen.getAllByRole('navigation', { name: 'Navegación del Portal' })) {
    expect(within(nav).getAllByRole('link').map(link => link.textContent)).toEqual(['Inicio', 'Mis datos', 'Declaración de salud']);
  }
});

it('does not request cancellation when confirmation is rejected', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  let posts = 0;
  server.use(
    http.get(endpoint, () => HttpResponse.json({ data: { reservations: [
      { id: 'a', date: '2026-10-20', startTime: '11:30', serviceType: { name: 'Calistenia' }, cancelledAt: null },
      { id: 'b', date: '2026-10-23', serviceType: { name: 'Funcional' }, cancelledAt: null },
    ] } })),
    http.post(`${endpoint}/reservations/a/cancel`, () => { posts++; return HttpResponse.json({ data: {} }); }),
  );

  renderReservations();
  fireEvent.click((await screen.findAllByRole('button', { name: 'Cancelar reserva' }))[0]!);
  fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar reserva' })[1]!);

  expect(confirm).toHaveBeenCalledWith('¿Cancelar la reserva del 20/10/2026 a las 11:30?');
  expect(confirm).toHaveBeenNthCalledWith(2, '¿Cancelar la reserva del 23/10/2026?');
  expect(posts).toBe(0);
  expect(screen.getByText('20/10/2026 · 11:30')).toBeVisible();
  expect(screen.queryByText('Reserva cancelada correctamente.')).not.toBeInTheDocument();
});

it('cancels with Portal CSRF, refetches the list and keeps other reservations', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
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
  fireEvent.click((await screen.findAllByRole('button', { name: 'Cancelar reserva' }))[0]!);

  expect(await screen.findByRole('status')).toHaveTextContent('Reserva cancelada correctamente.');
  await waitFor(() => expect(screen.queryByText('20/10/2026 · 11:30')).not.toBeInTheDocument());
  expect(screen.getByText('21/10/2026 · 08:30')).toBeVisible();
  expect(screen.getByText('22/10/2026 · 09:00')).toBeVisible();
  expect(request?.method).toBe('POST');
  expect(request?.headers.get('x-csrf-token')).toBe('portal-csrf');
  expect(await request?.text()).toBe('');
});

it('shows a safe error after rejection, refetches and leaves the active reservation available', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  server.use(
    http.get(endpoint, () => HttpResponse.json({ data: { reservations: [
      { id: 'a', date: '2026-10-20', startTime: '11:30', serviceType: { name: 'Calistenia' }, cancelledAt: null },
    ] } })),
    http.get(sessionEndpoint, () => HttpResponse.json({ data: { csrfToken: 'portal-csrf' } })),
    http.post(`${endpoint}/reservations/a/cancel`, () => HttpResponse.json({ code: 'PORTAL_RESOURCE_FORBIDDEN', message: 'Internal detail' }, { status: 403 })),
  );

  renderReservations();
  fireEvent.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cancelar la reserva. Intentá nuevamente.');
  expect(screen.queryByText('Internal detail')).not.toBeInTheDocument();
  expect(screen.getByText('20/10/2026 · 11:30')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Cancelar reserva' })).toBeEnabled();
});

it('disables only the pending reservation and shows the empty state after cancelling the last one', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
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
  const buttons = await screen.findAllByRole('button', { name: 'Cancelar reserva' });
  fireEvent.click(buttons[0]!);
  const cancelling = await screen.findByRole('button', { name: 'Cancelando…' });

  expect(cancelling).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancelar reserva' })).toBeEnabled();
  fireEvent.click(cancelling);
  expect(posts).toBe(1);
  finishPost!();

  expect(await screen.findByRole('status')).toHaveTextContent('Reserva cancelada correctamente.');
  expect(await screen.findByText('No tenés próximas reservas.')).toBeVisible();
});

it.each([false, true])('shows the empty state and Home link when no active reservations exist (cancelled=%s)', async cancelled => {
  server.use(http.get(endpoint, () => HttpResponse.json({ data: { reservations: cancelled ? [
    { id: 'cancelled', date: '2026-10-21', cancelledAt: '2026-10-19T12:00:00Z' },
  ] : [] } })));
  renderReservations();
  expect(await screen.findByText('No tenés próximas reservas.')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Volver a Inicio' })).toHaveAttribute('href', '/portal');
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
});

it('announces loading and keeps the Home link', async () => {
  server.use(http.get(endpoint, () => HttpResponse.json({ data: { reservations: [] } })));
  renderReservations();
  expect(screen.getByRole('status')).toHaveTextContent('Cargando reservas…');
  expect(screen.getByRole('link', { name: 'Volver a Inicio' })).toHaveAttribute('href', '/portal');
  await screen.findByText('No tenés próximas reservas.');
});

it('shows a safe error and keeps the Home link', async () => {
  server.use(http.get(endpoint, () => HttpResponse.json({ code: 'FAIL', message: 'Internal detail' }, { status: 500 })));
  renderReservations();
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar tus reservas. Intentá nuevamente.');
  expect(screen.queryByText('Internal detail')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Volver a Inicio' })).toHaveAttribute('href', '/portal');
});
