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
    'PORTAL', 'Iniciar sesión',
    'DNI', 'Sin puntos ni espacios.', 'PIN', 'Ingresar',
    '¿Necesitás ayuda?', 'Consultá en recepción.', 'Desarrollado por',
  ]) {
    expect(screen.getByText(text)).toBeInTheDocument();
  }
  expect(screen.queryByText(/PORTAL DE/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/CLIENTES/i)).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Iniciar sesión', level: 1 })).toBeVisible();
  expect(screen.getByText('DESBLOQUEÁ TU')).toBeVisible();
  expect(screen.getByText('POTENCIAL.')).toHaveClass('text-primary');
  expect(screen.getByText('DESBLOQUEÁ TU').closest('p')).toHaveClass('text-xl', 'font-bold', 'sm:text-2xl');
  const heroArrow = screen.getByTestId('portal-hero-arrow');
  expect(heroArrow).toBeVisible();
  expect(heroArrow).toHaveClass('text-primary', 'shrink-0');
  expect(heroArrow).toHaveClass('-rotate-45');
  const heroAccent = screen.getByTestId('portal-hero-accent');
  expect(heroAccent).toBeVisible();
  expect(heroAccent).toHaveClass('absolute', 'bottom-0', 'left-5', 'h-1', 'w-12', 'bg-primary');
  expect(logo.closest('header')?.nextElementSibling).toContainElement(screen.getByText('POTENCIAL.'));
  expect(screen.getByRole('link', { name: 'Desarrollado por Broco Solutions' })).toHaveAttribute('href', 'https://www.brocosolutions.com');
  expect(screen.getByRole('img', { name: 'Broco Solutions' })).toBeVisible();
  expect(screen.queryByText('Ingresá con tu DNI y PIN para continuar.')).not.toBeInTheDocument();
  expect(screen.queryByText('Ingresá 4 dígitos.')).not.toBeInTheDocument();
  expect(screen.queryByText('¿Necesitás ayuda para ingresar?')).not.toBeInTheDocument();
  const help = screen.getByText('¿Necesitás ayuda?').closest('p');
  expect(help).toHaveTextContent('¿Necesitás ayuda? Consultá en recepción.');
  expect(help).toContainElement(screen.getByText('Consultá en recepción.'));

  const dni = screen.getByLabelText('DNI');
  const dniHelp = screen.getByText('Sin puntos ni espacios.');
  expect(dniHelp.previousElementSibling).toContainElement(dni);
  expect(dniHelp).toHaveClass('text-xs', 'text-muted-foreground');
  expect(dni).toHaveAttribute('aria-describedby', 'portal-dni-help');
  expect(dni).toHaveAttribute('inputMode', 'numeric');
  expect(dni).toHaveAttribute('pattern', '[0-9]*');
  expect(dniHelp).toHaveAttribute('id', 'portal-dni-help');
  const pin = screen.getByLabelText('PIN');
  expect(pin).not.toHaveAttribute('aria-describedby');
  expect(pin).toBeRequired();
  expect(pin).toHaveAttribute('inputMode', 'numeric');
  expect(pin).toHaveAttribute('pattern', '[0-9]{4}');
  expect(pin).toHaveAttribute('maxLength', '4');
  expect(pin).toHaveAttribute('autoComplete', 'current-password');
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
