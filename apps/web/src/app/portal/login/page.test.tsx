import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PortalLogin from './page';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

function renderPage(): void {
  render(<PortalLogin />);
}

function enterCredentials(): void {
  fireEvent.change(screen.getByPlaceholderText('Ingresá tu DNI'), { target: { value: '12345678' } });
  fireEvent.change(screen.getByPlaceholderText('Ingresá tu PIN'), { target: { value: '1234' } });
}

beforeEach(() => {
  navigation.push.mockReset();
  vi.restoreAllMocks();
});

it('renders the mobile login composition and official Athleta logo', () => {
  renderPage();

  const logo = screen.getByRole('img', { name: 'Athleta' });
  expect(new URL(logo.getAttribute('src')!, 'http://localhost').searchParams.get('url')).toBe('/logo-athleta.png');
  for (const text of [
    'DESBLOQUEÁ TU', 'POTENCIAL.', 'Portal Athleta',
    'Ingresá con tu DNI y PIN para continuar.', 'DNI', 'PIN de 4 dígitos', 'Ingresar',
    '¿Necesitás ayuda para ingresar?', 'Consultá en recepción.', 'Desarrollado por', 'Broco Solutions',
  ]) {
    expect(screen.getByText(text)).toBeInTheDocument();
  }
  expect(screen.queryByText(/PORTAL DE/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/CLIENTES/i)).not.toBeInTheDocument();
});

it('shows the PIN as a password by default and toggles visibility', () => {
  renderPage();
  const pin = screen.getByPlaceholderText('Ingresá tu PIN');

  expect(pin).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar PIN' }));
  expect(pin).toHaveAttribute('type', 'text');
  fireEvent.click(screen.getByRole('button', { name: 'Ocultar PIN' }));
  expect(pin).toHaveAttribute('type', 'password');
});

it.each([
  [false, '/portal'],
  [true, '/portal/change-pin'],
])('submits the existing login request and routes mustChangePin=%s to %s', async (mustChangePin, destination) => {
  const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ data: { mustChangePin } }),
  } as Response);
  renderPage();
  enterCredentials();
  fireEvent.submit(screen.getByRole('button', { name: 'Ingresar' }).closest('form')!);

  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/portal/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dni: '12345678', pin: '1234' }),
    credentials: 'include',
  }));
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(destination));
});

it('shows the existing authentication error for an unsuccessful response', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response);
  renderPage();
  enterCredentials();
  fireEvent.submit(screen.getByRole('button', { name: 'Ingresar' }).closest('form')!);

  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos ingresar con esos datos. Revisalos o comunicate con Athleta.');
  expect(navigation.push).not.toHaveBeenCalled();
});
