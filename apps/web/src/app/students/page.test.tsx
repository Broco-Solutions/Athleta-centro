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
  { id: 'student-1', participationId: 'participation-1', participationStartDate: '2026-10-01', firstName: 'Ana', lastName: 'Alumna', dni: '88000001', plan: { id: 'plan-1', name: '3 veces' }, professor: { id: 'prof-1', firstName: 'Federico', lastName: 'Sintético' }, routineStatus: 'ACTIVE', hasValidAccess: true, validUntil: '2026-11-20' },
  { id: 'student-2', participationId: 'participation-2', participationStartDate: '2026-05-01', firstName: 'Lucía', lastName: 'Ejemplo', dni: '88000002', plan: { id: 'plan-2', name: '2 veces' }, professor: { id: 'prof-2', firstName: 'Ramiro', lastName: 'Demostración' }, routineStatus: 'MISSING', hasValidAccess: false, validUntil: null },
  { id: 'student-3', participationId: 'participation-3', participationStartDate: '2026-08-01', firstName: 'Pedro', lastName: 'Prueba', dni: '88000003', plan: { id: 'plan-1', name: '3 veces' }, professor: { id: 'prof-1', firstName: 'Federico', lastName: 'Sintético' }, routineStatus: 'ACTIVE', hasValidAccess: false, validUntil: null },
];
beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  navigation.filter = '';
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'prof-1', firstName: 'Federico', lastName: 'Sintético' }, roles: ['PROFESSOR'], permissions: ['SALA_RELATION_READ', 'SALA_ROUTINE_READ', 'SALA_PAYMENT_READ', 'SALA_PAYMENT_REGISTER', 'PEOPLE_READ', 'PEOPLE_CREATE', 'SALA_PARTICIPATION_MANAGE'], csrfToken: 'csrf', mustChangePassword: false } })),
    http.get('http://localhost:3000/api/sala/students', () => HttpResponse.json({ data: students })),
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) { return render(<QueryClientProvider client={client}><StudentsPage /></QueryClientProvider>); }
function list() { return within(screen.getByRole('table', { name: 'Alumnos activos de Sala' })); }

it('shows all students, full Professor names, plan and follow-up states with contextual student creation', async () => {
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
  expect(row.getByText('Sin vigencia')).toBeInTheDocument();
  expect(list().getAllByText('Federico Sintético', { exact: false })).toHaveLength(2);
  expect(list().getAllByText('Activa')).toHaveLength(2);
  expect(list().getByText('Vigente hasta 20/11/2026')).toBeInTheDocument();
  expect(row.getByRole('link', { name: 'Ver ficha' })).toHaveAttribute('href', '/sala/people/student-2');
  expect(screen.queryByText('Nueva Persona')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Nuevo alumno' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Personas' })).not.toBeInTheDocument();
});
it.each([['Lucía', 'Lucía Ejemplo'], ['88000001', 'Ana Alumna']])('searches locally by %s', async (term, name) => {
  renderPage(); await screen.findByText('Ana Alumna');
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar por nombre o DNI' }), { target: { value: term } });
  expect(list().getByText(name)).toBeInTheDocument();
  expect(list().getAllByRole('link', { name: 'Ver ficha' })).toHaveLength(1);
});
it.each([['Sin rutina', 1], ['Sin vigencia', 2]])('filters by %s and returns to Todos', async (name, count) => {
  renderPage(); await screen.findByText('Ana Alumna');
  fireEvent.click(screen.getByRole('button', { name }));
  expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
  expect(list().getAllByRole('link', { name: 'Ver ficha' })).toHaveLength(count);
  expect(list().queryByText('Ana Alumna')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
  expect(list().getAllByRole('link', { name: 'Ver ficha' })).toHaveLength(3);
});
it.each([['without-routine', 'Sin rutina', 1], ['without-validity', 'Sin vigencia', 2]])('activates URL filter %s', async (filter, label, count) => {
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
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'prof-1', firstName: 'Federico', lastName: 'Sintético' }, roles, permissions: ['SALA_RELATION_READ', 'SALA_ROUTINE_READ', 'SALA_PAYMENT_READ', 'SALA_PAYMENT_REGISTER', ...(manage ? ['SALA_PARTICIPATION_MANAGE'] : [])], csrfToken: 'csrf', mustChangePassword: false } })));
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
it.each(['PROFESSOR', 'ADMINISTRATIVE', 'GENERAL_ADMIN'])('removes unpaid-month and bulk controls for %s', async (role) => {
  managerSession([role]); renderPage(); await screen.findByText('Ana Alumna');
  expect(screen.queryByLabelText('Meses consecutivos sin pago')).not.toBeInTheDocument();
  expect(screen.queryByText('Seleccionar todos los alumnos filtrados')).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(list().queryByRole('columnheader', { name: 'Selección', hidden: true })).not.toBeInTheDocument();
  for (const name of ['Cambiar profesor principal', 'Dar de baja de Sala']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
});
it('combines search, Mis alumnos and Sin rutina', async () => {
  server.use(http.get('http://localhost:3000/api/sala/students', () => HttpResponse.json({ data: students.map((student) => student.id === 'student-3' ? { ...student, routineStatus: 'MISSING' } : student) })));
  renderPage(); await screen.findByText('Ana Alumna');
  fireEvent.click(screen.getByRole('button', { name: 'Mis alumnos' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sin rutina' }));
  fireEvent.change(screen.getByLabelText('Buscar por nombre o DNI'), { target: { value: 'Pedro' } });
  expect(list().getAllByRole('link', { name: 'Ver ficha' })).toHaveLength(1);
  expect(list().getByText('Pedro Prueba')).toBeInTheDocument();
});
it('links Professor payment states to contextual student payments', async () => {
  renderPage(); await screen.findByText('Ana Alumna');
  expect(list().getByText('Vigente hasta 20/11/2026')).toBeVisible();
  expect(list().getAllByText('Sin vigencia')).toHaveLength(2);
  expect(screen.queryByRole('link', { name: 'Renovar' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ver pagos' })).toHaveAttribute('href', '/sala/people/student-1?tab=payments');
  expect(within(list().getByText('Lucía Ejemplo').closest('tr')!).getByRole('link', { name: 'Registrar renovación' })).toHaveAttribute('href', '/sala/people/student-2?tab=payments&action=renew');
});
it.each(['ADMINISTRATIVE', 'GENERAL_ADMIN', 'PROFESSOR+ADMINISTRATIVE'])('links %s to contextual Finance and preserves Ver ficha', async role => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'admin' }, roles: role.split('+'), permissions: ['SALA_RELATION_READ', 'SALA_ROUTINE_READ', 'SALA_PAYMENT_READ', 'SALA_PAYMENT_REGISTER', 'SALA_PAYMENT_MANAGE', 'FINANCE_OPERATIONAL_READ'], csrfToken: 'csrf', mustChangePassword: false } })));
  renderPage(); await screen.findByText('Ana Alumna');
  const pending = within(list().getByText('Lucía Ejemplo').closest('tr')!);
  expect(pending.getByRole('link', { name: 'Renovar' })).toHaveAttribute('href', '/finance?view=income&personId=student-2&action=renew');
  expect(pending.getByRole('link', { name: 'Ver ficha' })).toHaveAttribute('href', '/sala/people/student-2');
  expect(list().getByRole('link', { name: 'Ver pagos' })).toHaveAttribute('href', '/finance?view=income&personId=student-1');
});


const existingPerson = { id: 'person-existing', firstName: 'Persona', lastName: 'Sintética', dni: '88123456', phone: '1123456789', birthDate: '2000-01-01', status: 'ACTIVE', contexts: [], hasSalaParticipation: false, isClinicalPatient: false };
function enrollmentHandlers(people: object[] = []) {
  server.use(
    http.get('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/people', () => HttpResponse.json({ data: people, meta: { page: 1, pageSize: 25, total: people.length, totalPages: 1 } })),
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [{ id: 'plan-new', name: 'Plan seleccionable', isSelectable: true }, { id: 'retired', name: 'Plan retirado', isSelectable: false }] })),
    http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [{ id: 'prof-new', firstName: 'Profesor', lastName: 'Elegible' }] })),
  );
}
async function selectEnrollmentOptions() {
  await screen.findByRole('option', { name: 'Plan seleccionable' });
  await screen.findByRole('option', { name: 'Profesor Elegible' });
  fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'plan-new' } });
  fireEvent.change(screen.getByLabelText('Profesor principal'), { target: { value: 'prof-new' } });
}
function fillNewPerson() {
  for (const [label, value] of [['Nombre', ' Nueva '], ['Apellido', ' Sintética '], ['Teléfono', '(11) 2345-6789'], ['Fecha de nacimiento', '2000-01-02']] as const) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}
it.each([[[]], [['PEOPLE_CREATE']], [['SALA_PARTICIPATION_MANAGE']]])('hides creation unless both permissions are present: %j', async (permissions) => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'prof-1' }, roles: ['PROFESSOR'], permissions: ['SALA_RELATION_READ', 'SALA_ROUTINE_READ', 'SALA_PAYMENT_READ', 'SALA_PAYMENT_REGISTER', ...permissions], csrfToken: 'csrf', mustChangePassword: false } })));
  renderPage(); await screen.findByText('Ana Alumna');
  expect(screen.queryByRole('button', { name: 'Nuevo alumno' })).not.toBeInTheDocument();
});
it.each(['PROFESSOR', 'ADMINISTRATIVE', 'GENERAL_ADMIN'])('reuses existing identity and joins without new credentials for %s', async role => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'actor' }, roles: [role], permissions: ['SALA_RELATION_READ', 'SALA_ROUTINE_READ', 'SALA_PAYMENT_READ', 'SALA_PAYMENT_REGISTER', 'PEOPLE_CREATE', 'SALA_PARTICIPATION_MANAGE'], csrfToken: 'csrf', mustChangePassword: false } })));
  // At this UTC instant Argentina is still on the previous day.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T01:30:00Z'));
  try {
    enrollmentHandlers([{ ...existingPerson, id: 'partial', dni: '8812345', hasSalaParticipation: true }, existingPerson]);
    let body: unknown; let creates = 0; let reads = 0;
    server.use(
      http.get('http://localhost:3000/api/sala/students', () => { reads++; return HttpResponse.json({ data: students }); }),
      http.post('http://localhost:3000/api/sala/students', () => { creates++; return HttpResponse.json({}); }),
      http.post('http://localhost:3000/api/sala/participations', async ({ request }) => { body = await request.json(); expect(request.headers.get('x-csrf-token')).toBe('csrf'); expect(request.credentials).toBe('include'); return HttpResponse.json({ data: {} }); }),
    );
    await startAdministrativeEnrollment(); await selectExistingPerson();
    for (const label of ['Nombre', 'Apellido', 'Teléfono', 'Fecha de nacimiento']) expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    await selectEnrollmentOptions(); fireEvent.click(screen.getByRole('button', { name: 'Incorporar a Sala' }));
    await screen.findByText('El Alumno fue incorporado a Sala.');
    expect(body).toEqual({ personId: 'person-existing', planId: 'plan-new', mainProfessorId: 'prof-new', startDate: '2026-10-14' });
    expect(creates).toBe(0); expect(reads).toBe(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.queryByLabelText('PIN temporal')).not.toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});
it.each(['PROFESSOR', 'ADMINISTRATIVE', 'GENERAL_ADMIN'])('uses the full Person form atomically for %s with a new DNI', async role => {
  enrollmentHandlers(); let submitted: unknown; let peoplePosts = 0;
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'admin' }, roles: [role], permissions: ['SALA_RELATION_READ', 'SALA_ROUTINE_READ', 'SALA_PAYMENT_READ', 'SALA_PAYMENT_REGISTER', 'PEOPLE_CREATE', 'SALA_PARTICIPATION_MANAGE'], csrfToken: 'csrf', mustChangePassword: false } })),
    http.get('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ data: [{ id: 'work', name: 'Obra sintética', isSelectable: true }] })),
    http.post('http://localhost:3000/api/people', () => { peoplePosts++; return HttpResponse.json({}); }),
    http.post('http://localhost:3000/api/sala/students', async ({ request }) => { submitted = await request.json(); expect(request.credentials).toBe('include'); expect(request.headers.get('x-csrf-token')).toBe('csrf'); return HttpResponse.json({ data: { initialPin: '4812' } }, { status: 201 }); }),
  );
  await startAdministrativeEnrollment(); fireEvent.click(screen.getByRole('button', { name: 'Nueva Persona' }));
  const dialog = screen.getByRole('dialog', { name: 'Nuevo alumno' });
  expect(dialog).toHaveClass('max-w-4xl');
  for (const heading of ['Datos personales', 'Contacto de emergencia', 'Cobertura médica', 'Entrenamiento']) expect(within(dialog).getByRole('heading', { name: heading })).toBeInTheDocument();
  for (const label of ['Nombre', 'Apellido', 'DNI', 'Teléfono', 'Fecha de nacimiento', 'Email (opcional)', 'Deporte (opcional)', 'Club (opcional)', 'Contacto de emergencia (opcional)', 'Teléfono de emergencia (opcional)', 'Obra social (opcional)', 'Número de afiliado (opcional)', 'Plan', 'Profesor principal']) expect(within(dialog).getByLabelText(label)).toBeInTheDocument();
  expect(screen.getByLabelText('DNI')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '88.123-456' } });
  expect(screen.queryByLabelText('Incorporar también a Sala')).not.toBeInTheDocument();
  fillNewPerson();
  for (const [label, value] of [['Email (opcional)', 'synthetic@test.local'], ['Deporte (opcional)', ' Natación '], ['Club (opcional)', ' Club sintético '], ['Contacto de emergencia (opcional)', 'Contacto sintético'], ['Teléfono de emergencia (opcional)', '1122223333']]) fireEvent.change(screen.getByLabelText(label!), { target: { value } });
  await screen.findByRole('option', { name: 'Obra sintética' });
  fireEvent.change(screen.getByLabelText('Obra social (opcional)'), { target: { value: 'work' } });
  fireEvent.change(screen.getByLabelText('Número de afiliado (opcional)'), { target: { value: ' AF-123 ' } });
  await selectEnrollmentOptions();
  fireEvent.click(screen.getByRole('button', { name: 'Crear alumno' }));
  expect(await screen.findByRole('dialog', { name: 'Alumno creado — PIN temporal' })).toBeInTheDocument();
  expect(screen.getAllByLabelText('PIN temporal')).toHaveLength(1);
  expect(screen.getByLabelText('PIN temporal')).toHaveTextContent('4812');
  expect(screen.getByRole('button', { name: 'Copiar PIN' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo alumno' }));
  expect(screen.queryByLabelText('PIN temporal')).not.toBeInTheDocument();
  expect(peoplePosts).toBe(0);
  expect(submitted).toEqual({ firstName: 'Nueva', lastName: 'Sintética', dni: '88123456', phone: '1123456789', birthDate: '2000-01-02', email: 'synthetic@test.local', sport: 'Natación', club: 'Club sintético', emergencyContactName: 'Contacto sintético', emergencyContactPhone: '1122223333', socialWorkId: 'work', affiliateNumber: 'AF-123', planId: 'plan-new', mainProfessorId: 'prof-new' });
});

function administrativeSession(role = 'PROFESSOR') {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'admin' }, roles: [role], permissions: ['SALA_RELATION_READ', 'SALA_ROUTINE_READ', 'SALA_PAYMENT_READ', 'SALA_PAYMENT_REGISTER', 'PEOPLE_READ', 'PEOPLE_CREATE', 'SALA_PARTICIPATION_MANAGE'], csrfToken: 'csrf', mustChangePassword: false } })));
}
async function startAdministrativeEnrollment(client?: QueryClient) {
  renderPage(client);
  fireEvent.click(await screen.findByRole('button', { name: 'Nuevo alumno' }));
}
async function selectExistingPerson() {
  fireEvent.change(screen.getByLabelText('Buscar Persona'), { target: { value: 'Sintética' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Persona Sintética · DNI 88123456' }));
}
it.each(['PROFESSOR', 'ADMINISTRATIVE', 'GENERAL_ADMIN'])('opens %s enrollment in existing-person mode without a DNI step', async role => {
  administrativeSession(role); enrollmentHandlers(); await startAdministrativeEnrollment();
  expect(screen.getByRole('dialog', { name: 'Nuevo alumno' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Nueva Persona' })).toBeInTheDocument();
  expect(screen.getByLabelText('Buscar Persona')).toHaveAttribute('placeholder', 'Nombre, apellido o DNI');
  expect(screen.queryByRole('combobox', { name: 'Persona' })).not.toBeInTheDocument();
  expect(screen.queryByText('Seleccionar Persona')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('DNI')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument();
});
it.each(['Persona', 'Sintética', '88123456', '88.123.456'])('searches existing people remotely by name/surname or DNI: %s', async search => {
  administrativeSession(); enrollmentHandlers(); const searches: URL[] = [];
  server.use(http.get('http://localhost:3000/api/people', ({ request }) => { const url = new URL(request.url); searches.push(url); return HttpResponse.json({ data: url.searchParams.get('search') === search ? [existingPerson] : [] }); }));
  await startAdministrativeEnrollment();
  expect(searches).toHaveLength(0);
  expect(screen.queryByText('Resultados')).not.toBeInTheDocument();
  expect(screen.queryByText('No encontramos una Persona con esa búsqueda.')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Buscar Persona'), { target: { value: ` ${search} ` } });
  expect(await screen.findByRole('button', { name: 'Persona Sintética · DNI 88123456' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /Sintética/ })).not.toBeInTheDocument();
  expect(searches.some(url => url.searchParams.get('search') === search && url.searchParams.get('page') === '1' && url.searchParams.get('pageSize') === '10')).toBe(true);
});
it('explains loading, empty results and search failure', async () => {
  administrativeSession(); enrollmentHandlers(); let respond!: () => void;
  server.use(http.get('http://localhost:3000/api/people', async () => { await new Promise<void>(resolve => { respond = resolve; }); return HttpResponse.json({ data: [] }); }));
  await startAdministrativeEnrollment();
  fireEvent.change(screen.getByLabelText('Buscar Persona'), { target: { value: 'Sin coincidencias' } });
  expect(await screen.findByText('Buscando Personas…')).toBeInTheDocument();
  await waitFor(() => expect(respond).toBeDefined()); respond();
  expect(await screen.findByText('No encontramos una Persona con esa búsqueda.')).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Resultados' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Nueva Persona' })).toBeVisible();
  server.use(http.get('http://localhost:3000/api/people', () => HttpResponse.json({}, { status: 500 })));
  fireEvent.change(screen.getByLabelText('Buscar Persona'), { target: { value: 'Sintética' } });
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos buscar Personas. Intentá nuevamente.');
  enrollmentHandlers([existingPerson]);
  fireEvent.change(screen.getByLabelText('Buscar Persona'), { target: { value: '88123456' } });
  await screen.findByRole('button', { name: 'Persona Sintética · DNI 88123456' });
});
it('informs about active students without offering enrollment or writing', async () => {
  administrativeSession(); enrollmentHandlers([{ ...existingPerson, hasSalaParticipation: true }]); const writes = vi.fn();
  server.use(http.post('http://localhost:3000/api/*', () => { writes(); return HttpResponse.json({}); }));
  await startAdministrativeEnrollment(); await selectExistingPerson();
  expect(screen.getByText('Esta Persona ya es alumno activo de Sala.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Plan')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Profesor principal')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Incorporar a Sala' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Buscar Persona'), { target: { value: '' } });
  expect(screen.queryByText('Esta Persona ya es alumno activo de Sala.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' })); expect(writes).not.toHaveBeenCalled();
});
it('clears the selected Person, Plan, Professor and join error when the search changes', async () => {
  administrativeSession(); enrollmentHandlers([existingPerson]);
  server.use(http.post('http://localhost:3000/api/sala/participations', () => HttpResponse.json({}, { status: 500 })));
  await startAdministrativeEnrollment(); await selectExistingPerson(); await selectEnrollmentOptions();
  expect(screen.getByRole('button', { name: 'Persona Sintética · DNI 88123456' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Incorporar a Sala' }));
  await screen.findByRole('alert');
  fireEvent.change(screen.getByLabelText('Buscar Persona'), { target: { value: '88123456' } });
  expect(screen.queryByLabelText('Plan')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Profesor principal')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  const result = await screen.findByRole('button', { name: 'Persona Sintética · DNI 88123456' });
  expect(result).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(result);
  expect(screen.getByLabelText('Plan')).toHaveValue('');
  expect(screen.getByLabelText('Profesor principal')).toHaveValue('');
});
it('resets existing selections and errors when switching modes and discards the new-person draft', async () => {
  administrativeSession(); enrollmentHandlers([existingPerson]);
  server.use(http.get('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ data: [] })), http.post('http://localhost:3000/api/sala/participations', () => HttpResponse.json({}, { status: 500 })));
  await startAdministrativeEnrollment(); await selectExistingPerson(); await selectEnrollmentOptions();
  expect(screen.queryByRole('option', { name: 'Plan retirado' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Incorporar a Sala' })); await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Nueva Persona' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.getByLabelText('Plan')).toHaveValue(''); expect(screen.getByLabelText('Profesor principal')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Persona existente' }));
  expect(screen.getByLabelText('Buscar Persona')).toBeInTheDocument();
  expect(within(screen.getByRole('dialog', { name: 'Nuevo alumno' })).queryByRole('button', { pressed: true })).not.toBeInTheDocument();
  expect(screen.queryByText('Seleccionar Persona')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument(); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await selectExistingPerson(); expect(screen.getByLabelText('Plan')).toHaveValue(''); expect(screen.getByLabelText('Profesor principal')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Nueva Persona' })); expect(screen.getByLabelText('Nombre')).toHaveValue('');
});
it('keeps a conflicting new DNI and all entered data in the open form without fallback writes', async () => {
  administrativeSession(); enrollmentHandlers(); const peoplePost = vi.fn();
  server.use(http.get('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ data: [] })), http.post('http://localhost:3000/api/sala/students', () => HttpResponse.json({ code: 'PERSON_DNI_ALREADY_EXISTS' }, { status: 409 })), http.post('http://localhost:3000/api/people', () => { peoplePost(); return HttpResponse.json({}); }));
  await startAdministrativeEnrollment(); fireEvent.click(screen.getByRole('button', { name: 'Nueva Persona' }));
  fillNewPerson(); fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '88.123-456' } }); await selectEnrollmentOptions();
  fireEvent.click(screen.getByRole('button', { name: 'Crear alumno' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe una Persona con ese DNI. Volvé a Persona existente y buscala.');
  expect(screen.getByRole('dialog', { name: 'Nuevo alumno' })).toBeInTheDocument();
  expect(screen.getByLabelText('DNI')).toHaveValue('88.123-456'); expect(screen.getByLabelText('Nombre')).toHaveValue(' Nueva ');
  expect(screen.queryByLabelText('Buscar Persona')).not.toBeInTheDocument(); expect(peoplePost).not.toHaveBeenCalled();
});
it('invalidates only student, people and participation caches after joining', async () => {
  administrativeSession(); enrollmentHandlers([existingPerson]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['sala-participations'], []); client.setQueryData(['unrelated'], []);
  client.setQueryData(['people', 'detail', 'person-existing'], existingPerson);
  let peopleReads = 0; let studentReads = 0;
  const writes = vi.fn();
  server.use(http.get('http://localhost:3000/api/people', () => { peopleReads++; return HttpResponse.json({ data: [existingPerson] }); }), http.get('http://localhost:3000/api/sala/students', () => { studentReads++; return HttpResponse.json({ data: students }); }), http.post('http://localhost:3000/api/sala/participations', () => HttpResponse.json({ data: {} })), http.post('http://localhost:3000/api/people', () => { writes(); return HttpResponse.json({}); }), http.post('http://localhost:3000/api/sala/students', () => { writes(); return HttpResponse.json({}); }));
  await startAdministrativeEnrollment(client); await selectExistingPerson(); await selectEnrollmentOptions();
  fireEvent.click(screen.getByRole('button', { name: 'Incorporar a Sala' })); await screen.findByText('El Alumno fue incorporado a Sala.');
  expect(client.getQueryState(['sala-participations'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['people', 'detail', 'person-existing'])?.isInvalidated).toBe(true);
  expect(peopleReads).toBe(2); expect(studentReads).toBe(2);
  expect(client.getQueryState(['unrelated'])?.isInvalidated).toBe(false); expect(writes).not.toHaveBeenCalled();
});

it.each(['plans', 'professors'])('prevents saving when the %s catalog fails in shared enrollment', async catalog => {
  enrollmentHandlers();
  server.use(http.get(`http://localhost:3000/api/sala/${catalog}`, () => HttpResponse.json({}, { status: 500 })));
  await startAdministrativeEnrollment(); fireEvent.click(screen.getByRole('button', { name: 'Nueva Persona' }));
  expect(await screen.findByText('No se pudieron cargar los Planes o Profesores. Cerrá el alta e intentá nuevamente.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Crear alumno' })).toBeDisabled();
});
it('retains the full new-person draft on server failure and permits retry', async () => {
  enrollmentHandlers();
  server.use(http.post('http://localhost:3000/api/sala/students', () => HttpResponse.json({}, { status: 500 })));
  await startAdministrativeEnrollment(); fireEvent.click(screen.getByRole('button', { name: 'Nueva Persona' }));
  fillNewPerson(); fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '88123456' } }); await selectEnrollmentOptions();
  fireEvent.click(screen.getByRole('button', { name: 'Crear alumno' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo crear el Alumno');
  expect(screen.getByLabelText('Nombre')).toHaveValue(' Nueva ');
  expect(screen.getByRole('button', { name: 'Crear alumno' })).toBeEnabled();
  expect(screen.queryByLabelText('PIN temporal')).not.toBeInTheDocument();
});
it('validates the full Person and enrollment fields before writing', async () => {
  enrollmentHandlers(); const writes = vi.fn();
  server.use(http.post('http://localhost:3000/api/sala/students', () => { writes(); return HttpResponse.json({}); }));
  await startAdministrativeEnrollment(); fireEvent.click(screen.getByRole('button', { name: 'Nueva Persona' }));
  await screen.findByRole('option', { name: 'Profesor Elegible' });
  fireEvent.click(screen.getByRole('button', { name: 'Crear alumno' }));
  expect(await screen.findByText('Seleccioná un Plan.')).toBeVisible();
  expect(screen.getByText('Seleccioná un profesor.')).toBeVisible();
  fillNewPerson(); await selectEnrollmentOptions();
  fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '123' } });
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '+54 11 2345-6789' } });
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: '2999-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear alumno' }));
  expect(await screen.findByText('El teléfono debe tener 10 dígitos.')).toBeVisible();
  expect(screen.getByText('La fecha de nacimiento no puede ser futura')).toBeVisible();
  expect(writes).not.toHaveBeenCalled();
});
