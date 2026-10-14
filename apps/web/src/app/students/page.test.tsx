import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import StudentsPage from './page';

const navigation = vi.hoisted(() => ({ filter: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.filter ? { filter: navigation.filter } : {}) }));
const server = setupServer();
const nativeFetch = globalThis.fetch;
const students = [
  { id: 'student-1', participationId: 'participation-1', participationStartDate: '2026-10-01', unpaidConsecutiveMonths: 0, firstName: 'Ana', lastName: 'Alumna', dni: '88000001', plan: { id: 'plan-1', name: '3 veces' }, professor: { id: 'prof-1', firstName: 'Federico', lastName: 'Sintético' }, routineStatus: 'ACTIVE', paymentStatus: 'PAID' },
  { id: 'student-2', participationId: 'participation-2', participationStartDate: '2026-05-01', unpaidConsecutiveMonths: 6, firstName: 'Lucía', lastName: 'Ejemplo', dni: '88000002', plan: { id: 'plan-2', name: '2 veces' }, professor: { id: 'prof-2', firstName: 'Ramiro', lastName: 'Demostración' }, routineStatus: 'MISSING', paymentStatus: 'PENDING' },
  { id: 'student-3', participationId: 'participation-3', participationStartDate: '2026-08-01', unpaidConsecutiveMonths: 3, firstName: 'Pedro', lastName: 'Prueba', dni: '88000003', plan: { id: 'plan-1', name: '3 veces' }, professor: { id: 'prof-1', firstName: 'Federico', lastName: 'Sintético' }, routineStatus: 'ACTIVE', paymentStatus: 'PENDING' },
];
beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  navigation.filter = '';
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'prof-1', firstName: 'Federico', lastName: 'Sintético' }, roles: ['PROFESSOR'], permissions: ['SALA_RELATION_READ', 'SALA_ROUTINE_READ', 'SALA_PAYMENT_READ'], csrfToken: 'csrf', mustChangePassword: false } })),
    http.get('http://localhost:3000/api/sala/students', () => HttpResponse.json({ data: students })),
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
function renderPage() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><StudentsPage /></QueryClientProvider>); }
function list() { return within(screen.getByRole('table', { name: 'Alumnos activos de Sala' })); }

it('shows all students, full Professor names, plan and follow-up states without creation actions', async () => {
  renderPage();
  expect(await screen.findByRole('heading', { name: 'Alumnos' })).toBeInTheDocument();
  await screen.findByText('Ana Alumna');
  expect(screen.getByText('3 alumnos')).toBeInTheDocument();
  expect(list().getByText('Lucía Ejemplo')).toBeInTheDocument();
  expect(list().getByText('Pedro Prueba')).toBeInTheDocument();
  expect(list().getByRole('columnheader', { name: 'Profesor', hidden: true })).toBeInTheDocument();
  const row = within(list().getByText('Lucía Ejemplo').closest('tr')!);
  expect(row.getByText('Ramiro Demostración', { exact: false })).toBeInTheDocument();
  expect(row.getByText('2 veces', { exact: false })).toBeInTheDocument();
  expect(row.getByText('Sin rutina')).toBeInTheDocument();
  expect(row.getByText('Pago pendiente')).toBeInTheDocument();
  expect(list().getAllByText('Federico Sintético', { exact: false })).toHaveLength(2);
  expect(list().getAllByText('Activa')).toHaveLength(2);
  expect(list().getByText('Pago registrado')).toBeInTheDocument();
  expect(row.getByRole('link', { name: 'Ver ficha' })).toHaveAttribute('href', '/sala/people/student-2');
  expect(screen.queryByText('Nueva Persona')).not.toBeInTheDocument();
  expect(screen.queryByText('Nuevo alumno')).not.toBeInTheDocument();
});
it.each([['Lucía', 'Lucía Ejemplo'], ['88000001', 'Ana Alumna']])('searches locally by %s', async (term, name) => {
  renderPage(); await screen.findByText('Ana Alumna');
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar por nombre o DNI' }), { target: { value: term } });
  expect(list().getByText(name)).toBeInTheDocument();
  expect(list().getAllByRole('link', { name: 'Ver ficha' })).toHaveLength(1);
});
it.each([['Sin rutina', 1], ['Pago pendiente', 2]])('filters by %s and returns to Todos', async (name, count) => {
  renderPage(); await screen.findByText('Ana Alumna');
  fireEvent.click(screen.getByRole('button', { name }));
  expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
  expect(list().getAllByRole('link', { name: 'Ver ficha' })).toHaveLength(count);
  expect(list().queryByText('Ana Alumna')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
  expect(list().getAllByRole('link', { name: 'Ver ficha' })).toHaveLength(3);
});
it.each([['without-routine', 'Sin rutina', 1], ['pending-payment', 'Pago pendiente', 2]])('activates URL filter %s', async (filter, label, count) => {
  navigation.filter = filter; renderPage(); await screen.findByText('Lucía Ejemplo');
  expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
  expect(list().getAllByRole('link', { name: 'Ver ficha' })).toHaveLength(count);
});
it('shows a meaningful empty state', async () => {
  server.use(http.get('http://localhost:3000/api/sala/students', () => HttpResponse.json({ data: [] })));
  renderPage(); expect(await screen.findByText('No hay alumnos activos de Sala.')).toBeInTheDocument();
});
it('shows no search results and allows restoring the list', async () => {
  renderPage(); await screen.findByText('Ana Alumna');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nadie' } });
  expect(screen.getByText('Sin resultados')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
  expect(list().getAllByRole('link', { name: 'Ver ficha' })).toHaveLength(3);
});
it('reports HTTP failures instead of showing an empty list', async () => {
  server.use(http.get('http://localhost:3000/api/sala/students', () => HttpResponse.json({}, { status: 403 })));
  renderPage(); expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar los alumnos.');
});

function managerSession(roles = ['PROFESSOR'], manage = true) {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'prof-1', firstName: 'Federico', lastName: 'Sintético' }, roles, permissions: ['SALA_RELATION_READ', 'SALA_ROUTINE_READ', 'SALA_PAYMENT_READ', ...(manage ? ['SALA_PARTICIPATION_MANAGE'] : [])], csrfToken: 'csrf', mustChangePassword: false } })));
}
it('uses Mis alumnos only as a reversible local filter', async () => {
  renderPage(); await screen.findByText('Ana Alumna');
  fireEvent.click(screen.getByRole('button', { name: 'Mis alumnos' }));
  expect(list().getAllByRole('link', { name: 'Ver ficha' })).toHaveLength(2);
  expect(list().queryByText('Lucía Ejemplo')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mis alumnos' }));
  expect(list().getAllByRole('link', { name: 'Ver ficha' })).toHaveLength(3);
});
it('hides Mis alumnos without Professor role and selection without management permission', async () => {
  managerSession(['ADMINISTRATIVE'], false); renderPage(); await screen.findByText('Ana Alumna');
  expect(screen.queryByRole('button', { name: 'Mis alumnos' })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cambiar profesor principal' })).not.toBeInTheDocument();
});
it.each([[1, 4], [2, 3], [3, 2], [6, 1]])('filters consecutive unpaid months %i+', async (threshold, count) => {
  server.use(http.get('http://localhost:3000/api/sala/students', () => HttpResponse.json({ data: [0, 1, 2, 3, 6].map((unpaidConsecutiveMonths, index) => ({ ...students[0], id: `student-${index}`, participationId: `participation-${index}`, unpaidConsecutiveMonths })) })));
  renderPage(); await screen.findAllByText('Ana Alumna');
  fireEvent.change(screen.getByLabelText('Meses consecutivos sin pago'), { target: { value: threshold } });
  expect(list().getAllByRole('link', { name: 'Ver ficha' })).toHaveLength(count);
});
it('combines search, Mis alumnos, Sin rutina and unpaid months', async () => {
  server.use(http.get('http://localhost:3000/api/sala/students', () => HttpResponse.json({ data: students.map((student) => student.id === 'student-3' ? { ...student, routineStatus: 'MISSING' } : student) })));
  renderPage(); await screen.findByText('Ana Alumna');
  fireEvent.click(screen.getByRole('button', { name: 'Mis alumnos' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sin rutina' }));
  fireEvent.change(screen.getByLabelText('Meses consecutivos sin pago'), { target: { value: 3 } });
  fireEvent.change(screen.getByLabelText('Buscar por nombre o DNI'), { target: { value: 'Pedro' } });
  expect(list().getAllByRole('link', { name: 'Ver ficha' })).toHaveLength(1);
  expect(list().getByText('Pedro Prueba')).toBeInTheDocument();
});
it('selects participation IDs, selects all filtered and clears hidden students on filter changes', async () => {
  managerSession(); renderPage(); await screen.findByText('Ana Alumna');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar a Ana Alumna' }));
  expect(screen.getByText('1 alumnos seleccionados')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar todos los alumnos filtrados' }));
  expect(screen.getByText('3 alumnos seleccionados')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sin rutina' }));
  expect(screen.getByText('1 alumnos seleccionados')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
  expect(screen.getByRole('checkbox', { name: 'Seleccionar a Ana Alumna' })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Seleccionar a Lucía Ejemplo' })).toBeChecked();
});
it.each(['professor', 'leave'])('sends one bulk %s request and clears selection after refetch', async (kind) => {
  managerSession(); let calls = 0; let reads = 0; let body: unknown;
  server.use(
    http.get('http://localhost:3000/api/sala/students', () => { reads++; return HttpResponse.json({ data: calls && kind === 'leave' ? [] : students }); }),
    http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [{ id: 'prof-2', firstName: 'Ramiro', lastName: 'Demostración' }] })),
    http.post(`http://localhost:3000/api/sala/participations/bulk-${kind === 'professor' ? 'change-professor' : 'leave'}`, async ({ request }) => { calls++; body = await request.json(); return HttpResponse.json({ data: { affected: 3 } }); }),
  );
  renderPage(); await screen.findByText('Ana Alumna');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar todos los alumnos filtrados' }));
  fireEvent.click(screen.getByRole('button', { name: kind === 'professor' ? 'Cambiar profesor principal' : 'Dar de baja de Sala' }));
  if (kind === 'professor') { await screen.findByRole('option', { name: 'Ramiro Demostración' }); fireEvent.change(screen.getByLabelText('Nuevo profesor'), { target: { value: 'prof-2' } }); }
  fireEvent.click(screen.getByRole('button', { name: kind === 'professor' ? 'Cambiar profesor' : 'Dar de baja' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(calls).toBe(1); expect(reads).toBe(2);
  expect(body).toEqual({ participationIds: ['participation-1', 'participation-2', 'participation-3'], ...(kind === 'professor' ? { mainProfessorId: 'prof-2' } : {}) });
  expect(screen.queryByText(/alumnos seleccionados/)).not.toBeInTheDocument();
});
it('keeps bulk dialog and selection on failure', async () => {
  managerSession(); server.use(http.post('http://localhost:3000/api/sala/participations/bulk-leave', () => HttpResponse.json({}, { status: 409 })));
  renderPage(); await screen.findByText('Ana Alumna'); fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar a Ana Alumna' }));
  fireEvent.click(screen.getByRole('button', { name: 'Dar de baja de Sala' })); fireEvent.click(screen.getByRole('button', { name: 'Dar de baja' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar la operación');
  expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(screen.getByText('1 alumnos seleccionados')).toBeInTheDocument();
});

it('shows only payment states to Professor', async () => {
  renderPage(); await screen.findByText('Ana Alumna');
  expect(list().getByText('Pago registrado')).toBeVisible();
  expect(list().getAllByText('Pago pendiente')).toHaveLength(2);
  expect(screen.queryByRole('link', { name: 'Registrar pago' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Ver pago' })).not.toBeInTheDocument();
});
it.each(['ADMINISTRATIVE', 'GENERAL_ADMIN'])('links %s to contextual Finance and preserves Ver ficha', async role => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'admin' }, roles: [role], permissions: ['SALA_RELATION_READ', 'SALA_ROUTINE_READ', 'SALA_PAYMENT_READ', 'SALA_PAYMENT_MANAGE'], csrfToken: 'csrf', mustChangePassword: false } })));
  renderPage(); await screen.findByText('Ana Alumna');
  const pending = within(list().getByText('Lucía Ejemplo').closest('tr')!);
  expect(pending.getByRole('link', { name: 'Registrar pago' })).toHaveAttribute('href', '/finance?view=income&personId=student-2');
  expect(pending.getByRole('link', { name: 'Ver ficha' })).toHaveAttribute('href', '/sala/people/student-2');
  expect(list().getByRole('link', { name: 'Ver pago' })).toHaveAttribute('href', '/finance?view=income&personId=student-1');
});
