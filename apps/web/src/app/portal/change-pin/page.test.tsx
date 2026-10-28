import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChangePin from './page';
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { vi.restoreAllMocks(); navigation.push.mockReset(); });

it('keeps the PIN change flow and shared developer footer', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { csrfToken: 'synthetic-csrf' } }) } as Response)
    .mockResolvedValueOnce({ ok: true } as Response);
  render(<ChangePin />);
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
  render(<ChangePin />);
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
