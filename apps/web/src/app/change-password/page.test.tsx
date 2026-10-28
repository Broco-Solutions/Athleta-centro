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
  expect(screen.getByText('Ingresá la contraseña con la que acabás de iniciar sesión.')).toBeInTheDocument();
  expect(screen.getByText('Mínimo 10 caracteres, con una mayúscula, una minúscula, un número y un símbolo.')).toBeInTheDocument();
  fireEvent.change(current, { target: { value: '27739784' } });
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
  expect(screen.getByRole('alert')).toHaveTextContent('La nueva contraseña debe tener al menos 10 caracteres, una mayúscula, una minúscula, un número y un símbolo.');
  expect(changePassword).not.toHaveBeenCalled();
});

it('preserves the entered current password and sends the existing contract', async () => {
  renderPage();
  fireEvent.change(await screen.findByLabelText('Contraseña actual'), { target: { value: '27739784' } });
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'Athleta123!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
  await waitFor(() => expect(changePassword).toHaveBeenCalledWith('27739784', 'Athleta123!', 'csrf'));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo actualizar la contraseña.');
});

it('shows the shared developer footer', async () => {
  renderPage();
  expect(await screen.findByRole('link', { name: 'Desarrollado por Broco Solutions' })).toHaveAttribute('href', 'https://www.brocosolutions.com');
});

it('shows a session loading state and no editable form before verification', () => {
  vi.mocked(currentSession).mockImplementation(() => new Promise(() => undefined));
  renderPage();
  expect(screen.getByRole('status')).toHaveTextContent('Cargando sesión…');
  expect(screen.getByRole('img', { name: 'Athleta' })).toBeVisible();
  expect(screen.queryByLabelText('Contraseña actual')).not.toBeInTheDocument();
});

it('has independent native password toggles and linked help without submitting', async () => {
  renderPage();
  const current = await screen.findByLabelText('Contraseña actual');
  const next = screen.getByLabelText('Nueva contraseña');
  expect(current).toHaveAttribute('type', 'password'); expect(next).toHaveAttribute('type', 'password');
  expect(current).toHaveAttribute('autocomplete', 'current-password'); expect(next).toHaveAttribute('autocomplete', 'new-password');
  expect(next).toHaveAccessibleDescription('Mínimo 10 caracteres, con una mayúscula, una minúscula, un número y un símbolo.');
  fireEvent.change(current, { target: { value: ' Fictional Current 1! ' } });
  fireEvent.change(next, { target: { value: ' Fictional New 2! ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña actual' }));
  expect(current).toHaveAttribute('type', 'text'); expect(next).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar nueva contraseña' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña actual' }));
  expect(current).toHaveAttribute('type', 'password'); expect(next).toHaveAttribute('type', 'text');
  expect(current).toHaveValue(' Fictional Current 1! '); expect(next).toHaveValue(' Fictional New 2! ');
  expect(changePassword).not.toHaveBeenCalled();
});

it('keeps pending saves single and sends unmodified native values with CSRF', async () => {
  let finish: (() => void) | undefined;
  vi.mocked(changePassword).mockImplementation(() => new Promise((_resolve, reject) => { finish = () => reject(new Error('Synthetic failure')); }));
  renderPage();
  fireEvent.change(await screen.findByLabelText('Contraseña actual'), { target: { value: ' Current Example 1! ' } });
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: ' New Example 2! ' } });
  const form = screen.getByRole('button', { name: 'Guardar contraseña' }).closest('form')!;
  fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled());
  expect(changePassword).toHaveBeenCalledTimes(1);
  expect(changePassword).toHaveBeenCalledWith(' Current Example 1! ', ' New Example 2! ', 'csrf');
  finish!(); await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'Guardar contraseña' })).toBeEnabled();
});
