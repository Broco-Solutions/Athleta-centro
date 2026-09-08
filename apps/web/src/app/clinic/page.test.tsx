import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import ClinicPage from './page';

const server = setupServer();
const nativeFetch = globalThis.fetch;
let appointmentSearch = '';

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  appointmentSearch = '';
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { data: { user: { id: 'u1', firstName: 'Admin', lastName: 'Test', email: 'admin@test.local' }, roles: ['GENERAL_ADMIN'], permissions: [], mustChangePassword: false, csrfToken: 'csrf' } } })),
    http.get('http://localhost:3000/api/clinic/appointments', ({ request }) => { appointmentSearch = new URL(request.url).search; return HttpResponse.json({ data: [] }); }),
    http.get('http://localhost:3000/api/clinic/studies', () => HttpResponse.json({ data: [{ id: 'study', studyDate: '2026-08-27', studyType: 'Radiografía', fileAsset: null }] })),
    http.get('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ data: [{ id: 'work', name: 'Cobertura sintética' }] })),
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

function renderPage() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ClinicPage /></QueryClientProvider>);
}

it('renders the daily agenda, uses its date in the query, and exposes deep-link tabs', async () => {
  renderPage();
  expect(await screen.findByText('No hay turnos para esta fecha.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Fecha de agenda'), { target: { value: '2026-09-15' } });
  await waitFor(() => expect(appointmentSearch).toContain('from=2026-09-15'));
  expect(appointmentSearch).toContain('to=2026-09-16');
  expect(screen.getByRole('link', { name: 'Agenda' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Estudios' })).toHaveAttribute('href', '/clinic?tab=Estudios');
  expect(screen.getByRole('link', { name: 'Obra social' })).toHaveAttribute('href', '/clinic?tab=Obra+social');
});

it('shows an operational error without leaking clinical payloads', async () => {
  server.use(http.get('http://localhost:3000/api/clinic/appointments', () => HttpResponse.json({ code: 'CLINIC_UNAVAILABLE', message: 'Unavailable' }, { status: 503 })));
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la agenda.');
});
