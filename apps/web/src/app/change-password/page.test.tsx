import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { changePassword, currentSession } from '../../features/auth/auth';
import ChangePasswordPage from './page';

vi.mock('../../features/auth/auth', () => ({ currentSession: vi.fn(), changePassword: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(currentSession).mockResolvedValue({ user: { id: 'synthetic', firstName: 'Ada', lastName: 'Test', email: 'ada@test.local' }, roles: ['PROFESSOR'], permissions: [], mustChangePassword: true, csrfToken: 'csrf' });
  vi.mocked(changePassword).mockRejectedValue(new Error('Synthetic rejection'));
});

function renderPage(): void {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><ChangePasswordPage/></QueryClientProvider>);
}

it.each(['12345678', 'abcdefghij!', 'ABCDEFGHIJ1!', 'Abcdefghij!', 'Abcdefghi1'])('rejects a weak new password %s before sending a request', async (password) => {
  renderPage();
  const current = await screen.findByLabelText('Contraseña actual');
  expect(screen.getByText('Si es tu primer ingreso, ingresá tu DNI.')).toBeInTheDocument();
  expect(screen.getByText('Mínimo 10 caracteres, con una mayúscula, una minúscula, un número y un símbolo.')).toBeInTheDocument();
  fireEvent.change(current, { target: { value: '27739784' } });
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
  expect(screen.getByRole('alert')).toHaveTextContent('La nueva contraseña debe tener al menos 10 caracteres, una mayúscula, una minúscula, un número y un símbolo.');
  expect(changePassword).not.toHaveBeenCalled();
});

it('sends the DNI as the current password and a strong personal password', async () => {
  renderPage();
  fireEvent.change(await screen.findByLabelText('Contraseña actual'), { target: { value: '27739784' } });
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'Athleta123!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
  await waitFor(() => expect(changePassword).toHaveBeenCalledWith('27739784', 'Athleta123!', 'csrf'));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo actualizar la contraseña.');
});
