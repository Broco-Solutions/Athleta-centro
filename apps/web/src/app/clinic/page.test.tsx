import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import ClinicPage from './page';

const server = setupServer();
const nativeFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { data: { user: { id: 'u1', firstName: 'Admin', lastName: 'Test', email: 'admin@test.local' }, roles: ['GENERAL_ADMIN'], permissions: [], mustChangePassword: false, csrfToken: 'csrf' } } })),
    http.get('http://localhost:3000/api/clinic/appointments', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/clinic/studies', () => HttpResponse.json({ data: [{ id: 'study', studyDate: '2026-08-27', studyType: 'Radiografía', fileAsset: null }] })),
    http.get('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ data: [{ id: 'work', name: 'Cobertura sintética' }] })),
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

function renderPage() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ClinicPage /></QueryClientProvider>);
}

it('renders the daily agenda states and navigates the clinical workspace', async () => {
  renderPage();
  expect(await screen.findByText('No hay turnos para esta fecha.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Estudios' }));
  expect(await screen.findByText(/Seleccioná un Paciente/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Obra social' }));
  expect(await screen.findByText(/1 obras sociales configuradas/)).toBeInTheDocument();
});

it('shows an operational error without leaking clinical payloads', async () => {
  server.use(http.get('http://localhost:3000/api/clinic/appointments', () => HttpResponse.json({ code: 'CLINIC_UNAVAILABLE', message: 'Unavailable' }, { status: 503 })));
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la agenda.');
});
