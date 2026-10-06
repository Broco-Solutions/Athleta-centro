import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import SalaPage from './page';
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({ useSearchParams: () => searchParams }));
const server = setupServer(); const nativeFetch = globalThis.fetch;
const session = { user: { id: 'admin', firstName: 'Admin', lastName: 'User', email: 'admin@test.local' }, roles: ['ADMINISTRATIVE'], permissions: ['SALA_RELATION_READ', 'SALA_AGENDA_MANAGE', 'SALA_PARTICIPATION_MANAGE', 'PEOPLE_CREATE', 'PEOPLE_READ'], mustChangePassword: false, csrfToken: 'csrf' };
beforeAll(() => { globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch; server.listen({ onUnhandledRequest: 'bypass' }); });
beforeEach(() => { searchParams = new URLSearchParams(); server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: session })), http.get('http://localhost:3000/api/people', () => HttpResponse.json({ data: { data: [{ id: 'person', firstName: 'Ada', lastName: 'Sintética', dni: '20123456' }] } })), http.get('http://localhost:3000/api/sala/schedule', () => HttpResponse.json({ data: [{ id: 'slot', weekday: 'MONDAY', startTime: '09:00' }] })), http.get('http://localhost:3000/api/sala/availability', () => HttpResponse.json({ data: [{ slotId: 'slot', capacity: 1, reserved: 0, available: 1, isOverbooked: false, isClosed: false }] }))); });
afterEach(() => server.resetHandlers()); afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
it('renders Sala with the daily agenda navigation', async () => { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SalaPage /></QueryClientProvider>); expect(await screen.findByRole('heading', { name: 'Agenda' })).toBeInTheDocument(); expect(screen.getByRole('link', { name: 'Agenda' })).toBeInTheDocument(); expect(screen.getByRole('link', { name: 'Alumnos' })).toHaveAttribute('href', '/sala?view=students'); expect(screen.getByRole('link', { name: 'Configuración' })).toBeInTheDocument(); });

const planId = '20000000-0000-4000-8000-000000000001';
const professorId = '20000000-0000-4000-8000-000000000002';
const existing = { id: '20000000-0000-4000-8000-000000000003', firstName: 'Ana', lastName: 'Existente', dni: '30123456', hasSalaParticipation: false };
function renderStudents(): void {
  searchParams = new URLSearchParams('view=students');
  server.use(
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [{ id: planId, name: 'Mensual', isSelectable: true }, { id: 'retired', name: 'Retirado', isSelectable: false }] })),
    http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [{ id: professorId, firstName: 'Ana', lastName: 'Profesora' }] })),
    http.get('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ data: [{ id: 'work', name: 'Cobertura', isSelectable: true }, { id: 'old', name: 'Obra retirada', isSelectable: false }] })),
  );
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><SalaPage /></QueryClientProvider>);
}
async function selectAssignment(): Promise<void> {
  await screen.findByRole('option', { name: 'Mensual' });
  await screen.findByRole('option', { name: 'Profesora, Ana' });
  fireEvent.change(screen.getByLabelText('Plan'), { target: { value: planId } });
  fireEvent.change(screen.getByLabelText('Profesor principal'), { target: { value: professorId } });
}
async function fillNewStudent(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Nuevo alumno' }));
  for (const [label, value] of [['Nombre', '  Ana  '], ['Apellido', 'Nueva'], ['DNI', '30.123-456'], ['Teléfono', '(341) 555-1234'], ['Fecha de nacimiento', '1990-01-01']] as const) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  await selectAssignment();
}
it('shows both incorporation actions and creates a student through one atomic request with a one-time PIN', async () => {
  let posted: Record<string, unknown> | undefined;
  let studentsReads = 0;
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  server.use(
    http.post('http://localhost:3000/api/sala/students', async ({ request }) => { posted = await request.json() as Record<string, unknown>; return HttpResponse.json({ data: { ...existing, ...posted, firstName: 'Ana', lastName: 'Nueva', hasSalaParticipation: true, initialPin: '1234' } }, { status: 201 }); }),
    http.get('http://localhost:3000/api/people', () => { studentsReads++; return HttpResponse.json({ data: posted ? [{ ...existing, lastName: 'Nueva', hasSalaParticipation: true, status: 'ACTIVE' }] : [], meta: { page: 1, pageSize: 100, total: posted ? 1 : 0, totalPages: 1 } }); }),
  );
  renderStudents();
  expect(await screen.findByRole('button', { name: 'Incorporar Persona existente' })).toBeVisible();
  await fillNewStudent();
  for (const label of ['Nombre', 'Apellido', 'DNI', 'Teléfono', 'Fecha de nacimiento', 'Email (opcional)', 'Contacto de emergencia (opcional)', 'Teléfono de emergencia (opcional)', 'Obra social (opcional)', 'Número de afiliado (opcional)', 'Plan', 'Profesor principal']) expect(screen.getByLabelText(label)).toBeVisible();
  expect(screen.queryByLabelText('Fecha de inicio')).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Retirado' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Obra retirada' })).not.toBeInTheDocument();
  const affiliate = screen.getByLabelText('Número de afiliado (opcional)');
  expect(affiliate).toBeDisabled();
  await screen.findByRole('option', { name: 'Cobertura' });
  fireEvent.change(screen.getByLabelText('Obra social (opcional)'), { target: { value: 'work' } });
  fireEvent.change(affiliate, { target: { value: 'ABC' } });
  fireEvent.change(screen.getByLabelText('Obra social (opcional)'), { target: { value: '' } });
  expect(affiliate).toHaveValue(''); expect(affiliate).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Teléfono de emergencia (opcional)'), { target: { value: '11 1234-5678' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar e incorporar' }));
  const dialog = await screen.findByRole('dialog', { name: 'Alumno guardado correctamente' });
  expect(posted).toMatchObject({ firstName: 'Ana', dni: '30123456', phone: '3415551234', emergencyContactPhone: '1112345678', socialWorkId: null, affiliateNumber: '', planId, mainProfessorId: professorId });
  expect(posted).not.toHaveProperty('startDate');
  expect(within(dialog).getByText('PIN temporal del Portal')).toBeVisible();
  expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
  expect(await screen.findByText('Nueva, Ana')).toBeVisible(); expect(studentsReads).toBeGreaterThan(1);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Copiar PIN' }));
  expect(await within(dialog).findByText('PIN copiado')).toBeVisible(); expect(writeText).toHaveBeenCalledWith('1234');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Entendido' }));
  expect(screen.queryByText('1234')).not.toBeInTheDocument(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('searches and incorporates an existing Person without offering active students or creating another PIN', async () => {
  let joined: Record<string, unknown> | undefined;
  let search = '';
  let reads = 0;
  server.use(
    http.get('http://localhost:3000/api/people', ({ request }) => { reads++; search = new URL(request.url).searchParams.get('search') ?? ''; return HttpResponse.json({ data: [{ ...existing, hasSalaParticipation: Boolean(joined) }, { ...existing, id: 'active', lastName: 'Ya activo', hasSalaParticipation: true }], meta: { page: 1, pageSize: 25, total: 2, totalPages: 1 } }); }),
    http.post('http://localhost:3000/api/sala/participations', async ({ request }) => { joined = await request.json() as Record<string, unknown>; return HttpResponse.json({ data: { id: 'participation' } }, { status: 201 }); }),
  );
  renderStudents(); fireEvent.click(await screen.findByRole('button', { name: 'Incorporar Persona existente' }));
  fireEvent.change(screen.getByLabelText('Buscar Persona'), { target: { value: '30123456' } });
  await waitFor(() => expect(search).toBe('30123456'));
  await screen.findByRole('option', { name: 'Existente, Ana · 30123456' });
  expect(screen.queryByRole('option', { name: /Ya activo/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Persona'), { target: { value: existing.id } });
  await selectAssignment(); fireEvent.click(screen.getByRole('button', { name: 'Incorporar a Sala' }));
  expect(await screen.findByText('Persona incorporada a Sala correctamente.')).toBeVisible();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  expect(joined).toEqual({ personId: existing.id, planId, mainProfessorId: professorId, startDate: today });
  expect(reads).toBeGreaterThan(2); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.queryByText('PIN temporal del Portal')).not.toBeInTheDocument();
});
it('explains duplicate DNI and keeps the new student form open', async () => {
  server.use(http.post('http://localhost:3000/api/sala/students', () => HttpResponse.json({ code: 'PERSON_DNI_ALREADY_EXISTS' }, { status: 409 })));
  renderStudents(); await fillNewStudent(); fireEvent.click(screen.getByRole('button', { name: 'Guardar e incorporar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe una Persona con ese DNI. Podés incorporarla a Sala como Persona existente.');
  expect(screen.getByLabelText('DNI')).toHaveValue('30.123-456');
});
it('hides global Sala navigation for clinical relation permissions and shows it to Professors', async () => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: ['KINESIOLOGIST'], permissions: ['SALA_RELATION_READ', 'SALA_CLINICAL_INDICATION_CLOSE', 'CLINIC_OPERATIONAL_READ'] } })));
  renderStudents(); const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
  await within(nav).findByRole('link', { name: 'Clínica' });
  expect(within(nav).queryByRole('link', { name: 'Sala' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Nuevo alumno' })).not.toBeInTheDocument();
});
it('shows Sala navigation for an operational Professor', async () => {
  renderStudents(); expect(await within(await screen.findByRole('navigation', { name: 'Navegación principal' })).findByRole('link', { name: 'Sala' })).toBeVisible();
});

it.each([false, true])('disables incorporation and explains missing configuration (catalog manager=%s)', async (manage) => {
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: [...session.permissions, ...(manage ? ['SALA_PLAN_CATALOG_MANAGE'] : [])] } })),
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [] })),
  );
  renderStudents();
  server.use(http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [] })), http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [] })));
  fireEvent.click(await screen.findByRole('button', { name: 'Nuevo alumno' }));
  expect(await screen.findByText(/No hay Planes disponibles para incorporar alumnos/)).toBeVisible();
  expect(await screen.findByText('No hay Profesores activos disponibles.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Guardar e incorporar' })).toBeDisabled();
  if (manage) expect(screen.getByRole('link', { name: 'Configurar Planes' })).toHaveAttribute('href', '/sala/configuration');
  else expect(screen.queryByRole('link', { name: 'Configurar Planes' })).not.toBeInTheDocument();
});
it.each([
  ['DNI', '12345', 'El DNI debe tener entre 6 y 8 dígitos.'],
  ['Teléfono', '+54 3415551234', 'El teléfono debe tener 10 dígitos.'],
  ['Teléfono de emergencia (opcional)', '123', 'El teléfono de emergencia debe tener 10 dígitos.'],
  ['Fecha de nacimiento', '2999-01-01', 'La fecha de nacimiento no puede ser futura'],
])('validates the Person rule for %s before requesting student creation', async (label, value, message) => {
  let posts = 0;
  server.use(http.post('http://localhost:3000/api/sala/students', () => { posts++; return HttpResponse.json({ data: existing }); }));
  renderStudents(); await fillNewStudent(); fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar e incorporar' }));
  expect(await screen.findByText(message)).toBeVisible(); expect(posts).toBe(0);
});
