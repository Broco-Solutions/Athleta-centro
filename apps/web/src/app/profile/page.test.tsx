import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import ProfilePage from './page';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const session = { user: { id: 'professor', firstName: 'Ada', lastName: 'Perfil', email: 'ada@team.test' }, roles: ['PROFESSOR'], permissions: [], mustChangePassword: false, csrfToken: 'csrf' };
const profile = { id: 'professor', firstName: 'Ada', lastName: 'Perfil', email: 'ada@team.test', phone: null, dni: null, address: null, birthDate: null, profession: null, athletaStartDate: '2020-06-15', status: 'ACTIVE', roles: ['PROFESSOR'] };

function renderPage(): void { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><ProfilePage/></QueryClientProvider>); }

beforeAll(() => { globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch; server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => { server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: session })), http.get('http://localhost:3000/api/team/users/me', () => HttpResponse.json({ data: profile }))); });
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it('lets a user update personal data without rendering access-management controls', async () => {
  let payload: unknown;
  server.use(http.patch('http://localhost:3000/api/team/users/me', async ({ request }) => { payload = await request.json(); return HttpResponse.json({ data: { ...profile, phone: '351 555 0101', profession: 'Docente' } }); }));
  renderPage();
  await screen.findByDisplayValue('Ada');
  expect(screen.getByText(/años/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Inactivar acceso' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Resetear credencial' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '27739784' } });
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '351 555 0101' } });
  fireEvent.change(screen.getByLabelText('Profesión'), { target: { value: 'Docente' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(payload).toMatchObject({ phone: '351 555 0101', profession: 'Docente', dni: '27739784' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Datos actualizados');
});
