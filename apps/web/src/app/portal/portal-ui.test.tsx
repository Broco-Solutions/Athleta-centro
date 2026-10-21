import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PortalFrame } from './portal-ui';

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
  expect(screen.getByRole('link', { name: 'Desarrollado por Broco Solutions' })).toHaveAttribute('href', 'https://www.brocosolutions.com');
});

it('does not retry failed session renewal', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, json: async () => ({ code: 'UNAVAILABLE', message: 'No disponible' }) } as Response);
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><PortalFrame title="Inicio">Contenido</PortalFrame></QueryClientProvider>);
  await waitFor(() => expect(client.getQueryState(['portal', 'session'])?.status).toBe('error'));
  expect(fetch).toHaveBeenCalledTimes(1);
});
