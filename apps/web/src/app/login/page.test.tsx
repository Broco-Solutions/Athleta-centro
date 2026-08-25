import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import LoginPage from './page';

const server = setupServer();
const nativeFetch = globalThis.fetch;

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><LoginPage /></QueryClientProvider>);
}

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

describe('LoginPage', () => {
  it('renders the internal login form', () => { renderPage(); expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument(); expect(screen.getByLabelText('Email')).toBeInTheDocument(); });

  it('submits once and disables the button while authentication is pending', async () => {
    let requests = 0;
    server.use(http.post('http://localhost:3000/api/auth/login', async () => { requests += 1; await new Promise<void>(() => undefined); return HttpResponse.json({}); }));
    renderPage(); fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'synthetic@athleta.test' } }); fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'ValidPass1!' } }); const button = screen.getByRole('button', { name: /Ingresar/ }); fireEvent.click(button); fireEvent.click(button); await waitFor(() => expect(button).toBeDisabled()); expect(requests).toBe(1);
  });

  it('shows the same safe error for rejected credentials and backend failures', async () => {
    server.use(http.post('http://localhost:3000/api/auth/login', () => HttpResponse.json({ code: 'INVALID_CREDENTIALS' }, { status: 401 })));
    renderPage(); fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'unknown@athleta.test' } }); fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'WrongPass1!' } }); fireEvent.click(screen.getByRole('button', { name: /Ingresar/ })); expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos iniciar sesión con los datos ingresados.');
  });
});
