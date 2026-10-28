import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChangePin from './page';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
function renderPage(client = new QueryClient()) { return render(<QueryClientProvider client={client}><ChangePin /></QueryClientProvider>); }
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { vi.restoreAllMocks(); navigation.push.mockReset(); });

it('keeps the PIN change flow and shared developer footer', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { csrfToken: 'synthetic-csrf' } }) } as Response)
    .mockResolvedValueOnce({ ok: true } as Response);
  renderPage();
  expect(screen.getAllByRole('link', { name: 'Instagram de Athleta' })).toHaveLength(1);
  expect(screen.getAllByRole('link', { name: 'Yrigoyen 2333, Casilda' })).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Desarrollado por Broco Solutions' })).toHaveAttribute('href', 'https://www.brocosolutions.com');
  fireEvent.change(screen.getByLabelText('PIN actual'), { target: { value: '1234' } });
  fireEvent.change(screen.getByLabelText('Nuevo PIN'), { target: { value: '4321' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Guardar PIN' }).closest('form')!);
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/portal'));
  expect(fetch).toHaveBeenLastCalledWith('/api/portal/auth/change-pin', expect.objectContaining({ credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': 'synthetic-csrf' }, body: JSON.stringify({ currentPin: '1234', nextPin: '4321' }) }));
});

it('preserves leading zeros, requires explicit submit and prevents a duplicated pending change', async () => {
  let finish: ((response: Response) => void) | undefined;
  const fetch = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { csrfToken: 'synthetic-csrf' } }) } as Response)
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  renderPage();
  fireEvent.change(screen.getByLabelText('PIN actual'), { target: { value: '0001' } });
  fireEvent.change(screen.getByLabelText('Nuevo PIN'), { target: { value: '0012' } });
  expect(fetch).not.toHaveBeenCalled();
  const form = screen.getByRole('button', { name: 'Guardar PIN' }).closest('form')!;
  fireEvent.submit(form);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  fireEvent.submit(form);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenLastCalledWith('/api/portal/auth/change-pin', expect.objectContaining({ body: JSON.stringify({ currentPin: '0001', nextPin: '0012' }) }));
  finish!({ ok: false } as Response);
  expect(await screen.findByRole('alert')).toHaveTextContent('El PIN no es válido.');
  expect(screen.getByLabelText('Nuevo PIN')).toHaveValue('0012');
  expect(navigation.push).not.toHaveBeenCalled();
});


it('uses only a verified cached first name without requesting a session for its footer', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['portal', 'session'], { person: { firstName: '  María   José  ', lastName: 'Not for WhatsApp' } });
  renderPage(client);
  const link = screen.getByRole('link', { name: /WhatsApp Athleta:/ });
  expect(new URL(link.getAttribute('href')!).searchParams.get('text')).toBe('¡Hola! Soy María José. Me contacto por ');
  expect(fetch).not.toHaveBeenCalled();
  await expect(client.fetchQuery({ queryKey: ['portal', 'session'], queryFn: async () => { throw new Error('Synthetic expired session'); } })).rejects.toThrow();
  await waitFor(() => expect(new URL(link.getAttribute('href')!).searchParams.get('text')).toBe('¡Hola! Me contacto por '));
});

it('discards the cached name when the existing submit-time session check expires', async () => {
  const client = new QueryClient(); client.setQueryData(['portal', 'session'], { person: { firstName: 'Earlier identity' } });
  const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response);
  renderPage(client);
  fireEvent.change(screen.getByLabelText('PIN actual'), { target: { value: '0012' } });
  fireEvent.change(screen.getByLabelText('Nuevo PIN'), { target: { value: '0034' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Guardar PIN' }).closest('form')!);
  await screen.findByRole('alert');
  await waitFor(() => expect(new URL(screen.getByRole('link', { name: /WhatsApp Athleta:/ }).getAttribute('href')!).searchParams.get('text')).toBe('¡Hola! Me contacto por '));
  expect(request).toHaveBeenCalledTimes(1);
});
