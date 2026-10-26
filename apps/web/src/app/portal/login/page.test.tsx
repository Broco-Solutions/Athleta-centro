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

it('renders the official brand, personal access and verified contact', () => {
  renderPage();
  expect(screen.getByRole('img', { name: 'Athleta' })).toBeVisible();
  expect(screen.getByText('Portal personal')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  expect(screen.getByLabelText('DNI')).toHaveAttribute('autocomplete', 'username');
  expect(screen.getByLabelText('PIN')).toHaveAttribute('autocomplete', 'current-password');
  expect(screen.getByRole('link', { name: /Contacto Athleta/ })).toHaveAttribute('href', 'tel:+5493464566340');
  expect(screen.getByRole('link', { name: 'Desarrollado por Broco Solutions' })).toHaveAttribute('href', 'https://www.brocosolutions.com');
});

it('keeps only numeric characters in the DNI and PIN fields', () => {
  renderPage();
  const dni = screen.getByLabelText('DNI');
  const pin = screen.getByLabelText('PIN');

  fireEvent.change(dni, { target: { value: '12.34 ABC 56' } });
  expect(dni).toHaveValue('123456');

  fireEvent.change(pin, { target: { value: '1a2-34x5' } });
  expect(pin).toHaveValue('1234');
});

it('uses a dynamic viewport height and a compact single-column composition', () => {
  renderPage();
  const main = screen.getByRole('main');

  expect(main).toHaveClass('min-h-dvh');
  expect(main).toHaveClass('flex-col');
  expect(main).not.toHaveClass('lg:grid-cols-2');
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

it('keeps network errors generic and allows a retry', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
  renderPage(); enterCredentials(); fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos ingresar con esos datos.');
  expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled();
});
it('sends only once while the Portal login is pending', async () => {
  const request = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => undefined));
  renderPage(); enterCredentials();
  const form = screen.getByRole('button', { name: 'Ingresar' }).closest('form')!;
  fireEvent.submit(form); fireEvent.submit(form);
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Ingresando…' })).toBeDisabled();
});
