import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PortalFrame, PortalLogoutButton } from './portal-ui';

vi.mock('next/navigation', () => ({ usePathname: () => '/portal' }));
afterEach(() => vi.restoreAllMocks());

it('validates and renews the session once on mount without polling or render loops', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ data: { csrfToken: 'synthetic-csrf' } }) } as Response);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><PortalFrame title="Inicio">Contenido</PortalFrame></QueryClientProvider>);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(fetch).toHaveBeenCalledWith('/api/portal/auth/session', expect.objectContaining({ credentials: 'include' }));
  await waitFor(() => expect(client.getQueryState(['portal', 'session'])?.status).toBe('success'));
  view.rerender(<QueryClientProvider client={client}><PortalFrame title="Mis datos">Otro contenido</PortalFrame></QueryClientProvider>);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Athleta · Portal personal')).toBeVisible();
  expect(screen.getAllByRole('link', { name: 'Instagram de Athleta' })).toHaveLength(1);
  expect(screen.getAllByRole('link', { name: 'Yrigoyen 2333, Casilda' })).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Desarrollado por Broco Solutions' })).toHaveAttribute('href', 'https://www.brocosolutions.com');
});

it('does not retry failed session renewal', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, json: async () => ({ code: 'UNAVAILABLE', message: 'No disponible' }) } as Response);
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><PortalFrame title="Inicio">Contenido</PortalFrame></QueryClientProvider>);
  await waitFor(() => expect(client.getQueryState(['portal', 'session'])?.status).toBe('error'));
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('keeps one logout label, prevents duplicate submissions and reports a recoverable failure', async () => {
  const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response);
  const client = new QueryClient(); client.setQueryData(['portal', 'private'], 'synthetic');
  render(<QueryClientProvider client={client}><PortalLogoutButton /></QueryClientProvider>);
  const button = screen.getByRole('button', { name: 'Cerrar sesión' });
  expect(button).toHaveTextContent('Cerrar sesión');
  fireEvent.click(button); fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cerrar la sesión. Intentá nuevamente.');
  expect(request).toHaveBeenCalledTimes(1); expect(button).toBeEnabled();
  expect(client.getQueryData(['portal', 'private'])).toBe('synthetic');
});
