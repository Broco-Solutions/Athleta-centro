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
