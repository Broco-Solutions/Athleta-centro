import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import CheckInPage from './page';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const session = { user: { id: 'staff', firstName: 'Staff', lastName: 'Athleta' }, roles: ['PROFESSOR'], permissions: ['SALA_AGENDA_MANAGE'], csrfToken: 'csrf', mustChangePassword: false };
beforeAll(() => { globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch; server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: session }))));
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
function renderPage(): void { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><CheckInPage /></QueryClientProvider>); }

it('registra por DNI, presenta el resultado y habilita otro alumno después', async () => {
  let submitted: unknown;
  server.use(http.post('http://localhost:3000/api/sala/check-in', async ({ request }) => { submitted = await request.json(); expect(request.headers.get('x-csrf-token')).toBe('csrf'); return HttpResponse.json({ data: { status: 'REGISTERED', message: '¡Asistencia registrada! Que tengas un buen entrenamiento.', person: 'Ana Alumna', startTime: '09:00', validUntil: '2026-10-23', renewalMessage: 'Tu plan vence hoy. Recordá renovarlo para continuar entrenando.' } }); }));
  renderPage();
  fireEvent.change(await screen.findByLabelText('DNI del alumno'), { target: { value: '30123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Registrar llegada' }));
  expect(await screen.findByText('Ana Alumna · Turno de las 09:00')).toBeInTheDocument();
  expect(screen.getByText('Tu plan vence hoy. Recordá renovarlo para continuar entrenando.')).toBeInTheDocument();
  expect(submitted).toEqual({ dni: '30123456' });
  expect(screen.queryByLabelText('DNI del alumno')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Registrar otro alumno' }));
  expect(screen.getByLabelText('DNI del alumno')).toHaveValue('');
});

it('muestra la falta de permiso sin exponer el formulario', async () => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: [] } })));
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso para registrar asistencias.');
  expect(screen.queryByLabelText('DNI del alumno')).not.toBeInTheDocument();
});
