import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import PortalReservations from './page';

vi.mock('next/navigation', () => ({ usePathname: () => '/portal/sala/reservas' }));
const server = setupServer();
const nativeFetch = globalThis.fetch;
const endpoint = 'http://localhost:3000/api/portal/sala';
function renderReservations(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><PortalReservations /></QueryClientProvider>);
}
beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it('lists every upcoming active reservation in endpoint order, read-only, with Home navigation', async () => {
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
    '20/10/2026 · 09:00Calistenia · Reservado',
    '23/10/2026 · 18:00Funcional · Reservado',
    '26/10/2026 · 10:00Musculación · Reservado',
  ]);
  expect(main.queryByText(/21\/10\/2026|Cancelad/)).not.toBeInTheDocument();
  expect(main.queryByRole('button')).not.toBeInTheDocument();
  for (const nav of screen.getAllByRole('navigation', { name: 'Navegación del Portal' })) {
    expect(within(nav).getAllByRole('link').map(link => link.textContent)).toEqual(['Inicio', 'Mis datos']);
  }
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
