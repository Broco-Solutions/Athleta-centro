import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import ClinicPage from './page';
import { vi } from 'vitest';

let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({ useSearchParams: () => searchParams, usePathname: () => '/clinic' }));

const server = setupServer();
const nativeFetch = globalThis.fetch;
let appointmentSearch = '';

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  appointmentSearch = '';
  searchParams = new URLSearchParams();
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'u1', firstName: 'Admin', lastName: 'Test', email: 'admin@test.local' }, roles: ['GENERAL_ADMIN'], permissions: ['CLINICAL_HISTORY_READ'], mustChangePassword: false, csrfToken: 'csrf' } })),
    http.get('http://localhost:3000/api/clinic/appointments', ({ request }) => { appointmentSearch = new URL(request.url).search; return HttpResponse.json({ data: [] }); }),
    http.get('http://localhost:3000/api/clinic/studies', () => HttpResponse.json({ data: [{ id: 'study', studyDate: '2026-08-27', studyType: 'Radiografía', fileAsset: null }] })),
    http.get('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ data: [{ id: 'work', name: 'Cobertura sintética', isSelectable: true }, { id: 'retired', name: 'Cobertura retirada', isSelectable: false }] })),
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

function renderPage() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ClinicPage /></QueryClientProvider>);
}

it('renders the daily agenda, uses its date in the query, and exposes deep-link tabs', async () => {
  renderPage();
  expect(await screen.findByText('No hay Turnos para este día.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Fecha de agenda'), { target: { value: '2026-09-15' } });
  await waitFor(() => expect(decodeURIComponent(appointmentSearch)).toContain('from=2026-09-15T03:00:00.000Z'));
  expect(decodeURIComponent(appointmentSearch)).toContain('to=2026-09-16T03:00:00.000Z');
  expect(screen.getByRole('link', { name: 'Agenda' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Estudios' })).toHaveAttribute('href', '/clinic?tab=Estudios');
  expect(screen.getByRole('link', { name: 'Obra social' })).toHaveAttribute('href', '/clinic?tab=Obra+social');
});

it('shows an operational error without leaking clinical payloads', async () => {
  server.use(http.get('http://localhost:3000/api/clinic/appointments', () => HttpResponse.json({ code: 'CLINIC_UNAVAILABLE', message: 'Unavailable' }, { status: 503 })));
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la agenda.');
});


function catalogSession(permissions: string[]) {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'u1', firstName: 'Test', lastName: 'User', email: 'test@test.local' }, roles: ['ADMINISTRATIVE'], permissions, mustChangePassword: false, csrfToken: 'csrf' } })));
}

it('lets Administrative open only the social-work exception and refreshes creation and retirement', async () => {
  searchParams = new URLSearchParams({ tab: 'Obra social' });
  catalogSession(['PEOPLE_READ', 'SOCIAL_WORK_CATALOG_MANAGE']);
  let rows = [{ id: 'work', name: 'Cobertura sintética', isSelectable: true }, { id: 'retired', name: 'Cobertura retirada', isSelectable: false }];
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  server.use(
    http.get('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ data: rows })),
    http.post('http://localhost:3000/api/clinic/social-works', async ({ request }) => { expect(request.headers.get('x-csrf-token')).toBe('csrf'); const body = await request.json() as { name: string }; rows = [...rows, { id: 'new', name: body.name, isSelectable: true }]; return HttpResponse.json({ data: rows[2] }, { status: 201 }); }),
    http.patch('http://localhost:3000/api/clinic/social-works/:id/retire', ({ params }) => { rows = rows.map((row) => row.id === params.id ? { ...row, isSelectable: false } : row); return HttpResponse.json({ data: rows.find((row) => row.id === params.id) }); }),
  );
  renderPage();
  await screen.findByText('Cobertura sintética · Disponible');
  expect(screen.getByText('Cobertura retirada · Retirada')).toBeInTheDocument();
  expect(await screen.findByLabelText('Nombre de obra social')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Obra social' })).toBeInTheDocument();
  for (const name of ['Tratamientos', 'Evaluaciones', 'Estudios']) expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Nombre de obra social'), { target: { value: 'Nueva sintética' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await screen.findByText('Nueva sintética · Disponible');
  fireEvent.click(screen.getAllByRole('button', { name: 'Retirar' })[0]!);
  await screen.findByText('Cobertura sintética · Retirada');
  expect(confirm).toHaveBeenCalled();
  confirm.mockRestore();
});

it('shows the catalog without administrative actions to clinical readers', async () => {
  searchParams = new URLSearchParams({ tab: 'Obra social' });
  renderPage();
  await screen.findByText('Cobertura sintética · Disponible');
  await screen.findByText('Cobertura retirada · Retirada');
  expect(screen.queryByLabelText('Nombre de obra social')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retirar' })).not.toBeInTheDocument();
});

it('keeps the catalog visible when a mutation fails', async () => {
  searchParams = new URLSearchParams({ tab: 'Obra social' });
  catalogSession(['SOCIAL_WORK_CATALOG_MANAGE']);
  server.use(http.post('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ code: 'SOCIAL_WORK_NAME_DUPLICATE' }, { status: 409 })));
  renderPage();
  fireEvent.change(await screen.findByLabelText('Nombre de obra social'), { target: { value: 'Duplicada' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar los cambios.');
  expect(screen.getByText('Cobertura sintética · Disponible')).toBeInTheDocument();
});

it.each([
  ['work', 'ABC-123', 'Nombre: Cobertura sintética', 'Número de afiliado: ABC-123'],
  ['retired', null, 'Nombre: Cobertura retirada', 'Número de afiliado: —'],
  [null, null, 'Sin obra social', null],
])('shows current coverage %s separately from orders with another work', async (socialWorkId, affiliateNumber, name, affiliate) => {
  searchParams = new URLSearchParams({ tab: 'Obra social', personId: 'person' });
  server.use(
    http.get('http://localhost:3000/api/clinic/patients', () => HttpResponse.json({ data: [{ id: 'person', firstName: 'Ana', lastName: 'Sintética', dni: '20123456' }] })),
    http.get('http://localhost:3000/api/people/person', () => HttpResponse.json({ data: { socialWorkId, affiliateNumber } })),
    http.get('http://localhost:3000/api/clinic/attentions', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/clinic/orders', () => HttpResponse.json({ data: [{ id: 'order', reference: 'ORD-1', socialWork: { name: 'Otra obra social' } }] })),
  );
  renderPage();
  expect(await screen.findByText(name!)).toBeInTheDocument();
  if (affiliate) expect(screen.getByText(affiliate)).toBeInTheDocument();
  expect(await screen.findByText('Otra obra social · ORD-1')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Órdenes' })).toBeInTheDocument();
});
