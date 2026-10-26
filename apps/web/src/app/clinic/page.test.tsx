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
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'u1', firstName: 'Admin', lastName: 'Test', email: 'admin@test.local' }, roles: ['GENERAL_ADMIN'], permissions: ['PEOPLE_READ', 'CLINIC_OPERATIONAL_READ', 'CLINICAL_HISTORY_READ'], mustChangePassword: false, csrfToken: 'csrf' } })),
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
  expect(screen.queryByRole('link', { name: 'Estudios' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Obra social' })).not.toBeInTheDocument();
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
    http.get('http://localhost:3000/api/people/person', () => HttpResponse.json({ data: { id: 'person', firstName: 'Ana', lastName: 'Sintética', dni: '20123456', isClinicalPatient: true, socialWorkId, affiliateNumber } })),
    http.get('http://localhost:3000/api/clinic/attentions', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/clinic/orders', () => HttpResponse.json({ data: [{ id: 'order', reference: 'ORD-1', socialWork: { name: 'Otra obra social' } }] })),
  );
  renderPage();
  expect(await screen.findByText(name!)).toBeInTheDocument();
  if (affiliate) expect(screen.getByText(affiliate)).toBeInTheDocument();
  expect(await screen.findByText('Otra obra social · ORD-1')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Órdenes' })).toBeInTheDocument();
});

const profile = { id: 'person', firstName: 'Ana', lastName: 'Sintética', dni: '20123456', phone: '3415551234', birthDate: '1990-03-10', email: 'ana@example.test', emergencyContactName: 'Contacto sintético', emergencyContactPhone: '3415555678', sport: 'Tenis', club: 'Club sintético', socialWorkId: 'work', affiliateNumber: 'ABC', hasSalaParticipation: true, isClinicalPatient: true };
function profileHandlers() {
  server.use(
    http.get('http://localhost:3000/api/people/person', () => HttpResponse.json({ data: profile })),
    http.get('http://localhost:3000/api/clinic/attentions', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/clinic/treatments', () => HttpResponse.json({ data: [{ id: 't', status: 'IN_PROGRESS' }] })),
  );
}

it('loads an individual clinical identity and general, operational and authorized clinical context', async () => {
  searchParams = new URLSearchParams({ tab: 'Paciente', personId: 'person', search: 'Ana', page: '2', treatmentInProgress: 'YES' });
  profileHandlers();
  renderPage();
  expect(await screen.findByRole('heading', { name: 'Ana Sintética' })).toBeVisible();
  for (const text of ['Participación actual en Sala', '10/03/1990', '3415551234', 'ana@example.test', 'Contacto sintético 3415555678', 'Tenis', 'Club sintético', 'Cobertura sintética', 'ABC']) expect(await screen.findByText(text)).toBeVisible();
  expect(await screen.findByText('Última Atención: Sin atenciones')).toBeVisible();
  expect(await screen.findByText('Próximo Turno: Sin próximo turno')).toBeVisible();
  expect(await screen.findByText('Tratamientos En curso: 1')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Estudios' })).toBeVisible();
  const back = new URL(screen.getByRole('link', { name: 'Volver a Pacientes' }).getAttribute('href')!, 'http://localhost');
  expect(back.searchParams.get('tab')).toBe('Pacientes');
  expect(back.searchParams.get('search')).toBe('Ana');
  expect(back.searchParams.get('page')).toBe('2');
  expect(back.searchParams.get('treatmentInProgress')).toBe('YES');
  expect(back.searchParams.has('personId')).toBe(false);
});

it('lets Administrative edit shared general data and operate without fetching reserved clinical history', async () => {
  searchParams = new URLSearchParams({ tab: 'Paciente', personId: 'person' });
  profileHandlers();
  catalogSession(['PEOPLE_READ', 'PEOPLE_UPDATE_GENERAL', 'CLINIC_OPERATIONAL_READ', 'CLINIC_APPOINTMENT_MANAGE', 'CLINIC_ATTENTION_REGISTER', 'CLINIC_INCOME_MANAGE']);
  let historyRequests = 0;
  let current = profile;
  server.use(
    http.get('http://localhost:3000/api/clinic/treatments', () => { historyRequests += 1; return HttpResponse.json({ data: [] }); }),
    http.get('http://localhost:3000/api/people/person', () => HttpResponse.json({ data: current })),
    http.patch('http://localhost:3000/api/people/person', async ({ request }) => { expect(request.headers.get('x-csrf-token')).toBe('csrf'); current = { ...current, ...await request.json() as typeof profile }; return HttpResponse.json({ data: current }); }),
  );
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar datos generales' }));
  fireEvent.change(screen.getByLabelText('Deporte (opcional)'), { target: { value: 'Natación' } });
  fireEvent.change(screen.getByLabelText('Club (opcional)'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('Natación')).toBeVisible();
  expect(screen.queryByText('Club sintético')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Agendar turno' })).toHaveAttribute('href', '/clinic/appointments/new?personId=person');
  expect(screen.getByRole('link', { name: 'Registrar cobro' })).toBeVisible();
  expect(screen.queryByText('Contexto clínico')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Nuevo tratamiento' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Estudios' })).not.toBeInTheDocument();
  expect(historyRequests).toBe(0);
});

it('denies reserved deep links before requesting clinical content', async () => {
  searchParams = new URLSearchParams({ tab: 'Tratamientos', personId: 'person' });
  profileHandlers();
  catalogSession(['PEOPLE_READ', 'CLINIC_OPERATIONAL_READ']);
  let historyRequests = 0;
  server.use(http.get('http://localhost:3000/api/clinic/treatments', () => { historyRequests += 1; return HttpResponse.json({ data: [] }); }));
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permisos para consultar esta sección clínica.');
  expect(historyRequests).toBe(0);
});

it.each([
  [404, 'La Persona no existe.'],
  [503, 'No pudimos cargar la Persona.'],
  [200, 'La Persona todavía no está registrada como Paciente.'],
])('distinguishes individual identity response %s', async (status, message) => {
  searchParams = new URLSearchParams({ tab: 'Paciente', personId: 'person' });
  profileHandlers();
  server.use(http.get('http://localhost:3000/api/people/person', () => HttpResponse.json(status === 200 ? { data: { ...profile, isClinicalPatient: false } } : { message: 'technical payload' }, { status })));
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.queryByText('technical payload')).not.toBeInTheDocument();
});

it('shows loading instead of reporting an unregistered patient while identity is pending', async () => {
  searchParams = new URLSearchParams({ tab: 'Paciente', personId: 'person' });
  server.use(http.get('http://localhost:3000/api/people/person', () => new Promise(() => {})));
  renderPage();
  expect(await screen.findByText('Cargando Persona…')).toBeVisible();
  expect(screen.queryByText('La Persona todavía no está registrada como Paciente.')).not.toBeInTheDocument();
});

it('shows the latest attention and nearest future scheduled appointment in Argentina', async () => {
  searchParams = new URLSearchParams({ tab: 'Paciente', personId: 'person' });
  profileHandlers();
  server.use(
    http.get('http://localhost:3000/api/clinic/attentions', () => HttpResponse.json({ data: [{ id: 'older', occurredAt: '2026-01-01T13:00:00.000Z' }, { id: 'latest', occurredAt: '2026-01-02T14:30:00.000Z' }] })),
    http.get('http://localhost:3000/api/clinic/appointments', () => HttpResponse.json({ data: [{ id: 'later', status: 'SCHEDULED', startAt: '2030-01-04T13:00:00.000Z' }, { id: 'cancelled', status: 'CANCELLED', startAt: '2030-01-02T13:00:00.000Z' }, { id: 'next', status: 'SCHEDULED', startAt: '2030-01-03T13:00:00.000Z' }, { id: 'past', status: 'SCHEDULED', startAt: '2020-01-01T13:00:00.000Z' }] })),
  );
  renderPage();
  expect(await screen.findByText(/Última Atención: 2\/1\/26, 11:30/)).toBeVisible();
  expect(await screen.findByText(/Próximo Turno: 3\/1\/30, 10:00/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Editar datos generales' })).not.toBeInTheDocument();
});
