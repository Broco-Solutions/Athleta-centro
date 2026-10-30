import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import PeoplePage from './page';
import { PersonIdentity } from './[id]/clinic-actions';

const server = setupServer(); const nativeFetch = globalThis.fetch;
const session = { user: { id: 'u1', firstName: 'Test', lastName: 'User', email: 'user@test.local' }, roles: ['ADMINISTRATIVE'], permissions: ['PEOPLE_READ', 'PEOPLE_CREATE', 'PEOPLE_UPDATE_GENERAL', 'PORTAL_PIN_RESET'], mustChangePassword: false, csrfToken: 'csrf-test' };
const person = { id: '10000000-0000-4000-8000-000000000001', firstName: 'Ana', lastName: 'Sintética', dni: '20.123.456', phone: '3515550101', birthDate: '1992-03-10', email: null, emergencyContactName: null, emergencyContactPhone: null, socialWorkId: null, affiliateNumber: null, status: 'INACTIVE', contexts: [], hasSalaParticipation: false, isClinicalPatient: false };
function renderPage(): void { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); render(<QueryClientProvider client={client}><PeoplePage /></QueryClientProvider>); }
beforeAll(() => { globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch; server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => { server.use(http.get(`http://localhost:3000/api/sala/participations/person/${person.id}`, () => HttpResponse.json({ data: [] })),http.get('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ data: [{ id: 'work-a', name: 'Cobertura A', isSelectable: true }, { id: 'work-retired', name: 'Cobertura histórica', isSelectable: false }, { id: 'other-retired', name: 'Otra retirada', isSelectable: false }] })),http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: session })), http.get('http://localhost:3000/api/people', () => HttpResponse.json({ data: [person], meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 } }))); });
afterEach(() => server.resetHandlers()); afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it('renders and searches the People list through HTTP', async () => { let search = ''; server.use(http.get('http://localhost:3000/api/people', ({ request }) => { search = new URL(request.url).searchParams.get('search') ?? ''; return HttpResponse.json({ data: [person], meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 } }); })); renderPage(); expect(await screen.findByText('Sintética, Ana')).toBeInTheDocument(); fireEvent.change(screen.getByLabelText('Buscar Personas'), { target: { value: '20.123' } }); await waitFor(() => expect(search).toBe('20.123')); });
it('validates required creation fields locally', async () => { renderPage(); await screen.findByText('Sintética, Ana'); fireEvent.click(screen.getByRole('button', { name: /Nueva Persona/ })); fireEvent.click(screen.getByRole('button', { name: 'Guardar' })); expect(await screen.findByText('Ingresá el nombre')).toBeInTheDocument(); });
it('shows the shared general-person sections in a wide dialog without Sala fields by default', async () => {
  renderPage(); await screen.findByText('Sintética, Ana'); fireEvent.click(screen.getByRole('button', { name: /Nueva Persona/ }));
  const dialog = screen.getByRole('heading', { name: 'Nueva Persona' }).parentElement?.parentElement;
  expect(dialog).toHaveClass('max-w-4xl');
  for (const heading of ['Datos personales', 'Contacto de emergencia', 'Cobertura médica']) expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Entrenamiento' })).not.toBeInTheDocument();
});
it('lets a catalog administrator add a social work, selects it, and enables the affiliate number', async () => {
  let works = [{ id: 'work-a', name: 'Cobertura A', isSelectable: true }];
  let postBody: unknown;
  let csrf: string | null = null;
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: [...session.permissions, 'SOCIAL_WORK_CATALOG_MANAGE'] } })),
    http.get('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ data: works })),
    http.post('http://localhost:3000/api/clinic/social-works', async ({ request }) => {
      postBody = await request.json();
      csrf = request.headers.get('x-csrf-token');
      const created = { id: 'work-new', name: (postBody as { name: string }).name, normalizedName: 'osde', isSelectable: true, createdAt: '2026-10-30T12:00:00.000Z' };
      works = [...works, created];
      return HttpResponse.json({ data: created }, { status: 201 });
    }),
  );
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  await screen.findByLabelText('Obra social (opcional)');
  expect(screen.getByRole('button', { name: 'Agregar obra social' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Agregar obra social' }));
  const editor = screen.getByRole('group', { name: 'Nueva obra social' });
  fireEvent.change(within(editor).getByLabelText('Nueva obra social'), { target: { value: 'OSDE' } });
  fireEvent.click(within(editor).getByRole('button', { name: 'Agregar' }));
  await waitFor(() => expect(screen.getByLabelText('Obra social (opcional)')).toHaveValue('work-new'));
  expect(postBody).toEqual({ name: 'OSDE' });
  expect(csrf).toBe('csrf-test');
  expect(screen.queryByRole('group', { name: 'Nueva obra social' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Número de afiliado (opcional)')).toBeEnabled();
});

it('cancels social work creation without changing coverage and reopens with an empty input', async () => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: [...session.permissions, 'SOCIAL_WORK_CATALOG_MANAGE'] } })));
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  const selector = await screen.findByLabelText('Obra social (opcional)');
  await screen.findByRole('option', { name: 'Cobertura A' });
  fireEvent.change(selector, { target: { value: 'work-a' } });
  expect(screen.getByLabelText('Número de afiliado (opcional)')).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Agregar obra social' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Nueva obra social' }), { target: { value: 'Descartada' } });
  fireEvent.click(within(screen.getByRole('group', { name: 'Nueva obra social' })).getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('group', { name: 'Nueva obra social' })).not.toBeInTheDocument();
  expect(selector).toHaveValue('work-a');
  expect(screen.getByLabelText('Número de afiliado (opcional)')).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Agregar obra social' }));
  expect(screen.getByRole('textbox', { name: 'Nueva obra social' })).toHaveValue('');
});

it('keeps the inline editor open and explains duplicate social work names', async () => {
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: [...session.permissions, 'SOCIAL_WORK_CATALOG_MANAGE'] } })),
    http.post('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ code: 'SOCIAL_WORK_NAME_DUPLICATE' }, { status: 409 })),
  );
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Agregar obra social' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Nueva obra social' }), { target: { value: ' OSDE ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
  expect(await screen.findByText('Ya existe una obra social con ese nombre.')).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Nueva obra social' })).toBeInTheDocument();
});

it('allows an administrator to create the first work when the catalog is empty', async () => {
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: [...session.permissions, 'SOCIAL_WORK_CATALOG_MANAGE'] } })),
    http.get('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ data: [] })),
  );
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  expect(await screen.findByRole('option', { name: 'Sin obra social' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Agregar obra social' })).toBeInTheDocument();
  expect(await screen.findByText(/No hay obras sociales cargadas/)).toBeInTheDocument();
  expect(screen.queryByText('No pudimos cargar las obras sociales.')).not.toBeInTheDocument();
});

it('shows a retry action when the social work catalog request fails', async () => {
  let failed = true;
  server.use(http.get('http://localhost:3000/api/clinic/social-works', () => failed ? HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 }) : HttpResponse.json({ data: [{ id: 'work-retry', name: 'Cobertura recuperada', isSelectable: true }] })));
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  expect(await screen.findByText('No pudimos cargar las obras sociales.')).toBeInTheDocument();
  failed = false;
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByRole('option', { name: 'Cobertura recuperada' })).toBeInTheDocument();
});

it('keeps the social work selector available but hides catalog creation for Professor without the permission', async () => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: ['PROFESSOR'], permissions: session.permissions.filter((permission) => permission !== 'SOCIAL_WORK_CATALOG_MANAGE') } })));
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  await screen.findByLabelText('Obra social (opcional)');
  expect(screen.getByLabelText('Obra social (opcional)')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Agregar obra social' })).not.toBeInTheDocument();
});
it('presents duplicate DNI safely', async () => { server.use(http.post('http://localhost:3000/api/people', () => HttpResponse.json({ statusCode: 409, code: 'PERSON_DNI_ALREADY_EXISTS', message: 'Conflict' }, { status: 409 }))); renderPage(); await screen.findByText('Sintética, Ana'); fireEvent.click(screen.getByRole('button', { name: /Nueva Persona/ })); fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Otra' } }); fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Persona' } }); fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '20.123.456' } }); fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '3515550100' } }); fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: '1990-01-01' } }); fireEvent.click(screen.getByRole('button', { name: 'Guardar' })); expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe una Persona con ese DNI.'); });
it('edits general data and invalidates the People query', async () => { let updatedPhone = ''; server.use(http.patch(`http://localhost:3000/api/people/${person.id}`, async ({ request }) => { updatedPhone = String((await request.json() as { phone: string }).phone); return HttpResponse.json({ data: { ...person, phone: updatedPhone } }); })); renderPage(); fireEvent.click(await screen.findByText('Sintética, Ana')); fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '3515559999' } }); fireEvent.click(screen.getByRole('button', { name: 'Guardar' })); await waitFor(() => expect(updatedPhone).toBe('3515559999')); });

function operationalBirthDate(offset: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

it('rejects a future birth date locally without posting a new Person', async () => {
  let posts = 0;
  server.use(http.post('http://localhost:3000/api/people', () => { posts += 1; return HttpResponse.json({ data: person }); }));
  renderPage();
  await screen.findByText('Sintética, Ana');
  fireEvent.click(screen.getByRole('button', { name: /Nueva Persona/ }));
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Otra' } });
  fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Persona' } });
  fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '20123457' } });
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '3515550100' } });
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: operationalBirthDate(1) } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('La fecha de nacimiento no puede ser futura')).toBeInTheDocument();
  expect(posts).toBe(0);
  fireEvent.change(screen.getByLabelText(/Fecha de nacimiento/), { target: { value: operationalBirthDate(0) } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(posts).toBe(1));
});

it('rejects a future birth date locally when editing an existing Person', async () => {
  let patches = 0;
  server.use(
    http.patch(`http://localhost:3000/api/people/${person.id}`, () => { patches += 1; return HttpResponse.json({ data: person }); }),
    http.get(`http://localhost:3000/api/sala/participations/person/${person.id}`, () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [] })),
  );
  renderPage();
  fireEvent.click(await screen.findByText('Sintética, Ana'));
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: operationalBirthDate(1) } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('La fecha de nacimiento no puede ser futura')).toBeInTheDocument();
  expect(patches).toBe(0);
});

async function openCreation(dni = '20123457', phone = '3415551234'): Promise<void> {
  renderPage();
  await screen.findByText('Sintética, Ana');
  fireEvent.click(screen.getByRole('button', { name: /Nueva Persona/ }));
  for (const [label, value] of [['Nombre', 'Otra'], ['Apellido', 'Persona'], ['DNI', dni], ['Teléfono', phone], ['Fecha de nacimiento', '1990-01-01']] as const) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}

it('closes a successful creation, refreshes the list and keeps the PIN until acknowledged', async () => {
  let posts = 0;
  const created = { ...person, id: '10000000-0000-4000-8000-000000000002', firstName: 'Otra', lastName: 'Persona', dni: '20123457', phone: '3415551234', birthDate: '1990-01-01' };
  server.use(
    http.post('http://localhost:3000/api/people', () => { posts += 1; return HttpResponse.json({ data: { ...created, initialPin: '1234' } }); }),
    http.get('http://localhost:3000/api/people', () => HttpResponse.json({ data: posts ? [person, created] : [person], meta: { page: 1, pageSize: 25, total: posts ? 2 : 1, totalPages: 1 } })),
  );
  await openCreation();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  const dialog = await screen.findByRole('dialog', { name: 'Persona guardada correctamente' });
  expect(dialog).toBeVisible();
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(within(dialog).getByRole('heading', { name: 'Persona guardada correctamente' })).toBeVisible();
  expect(within(dialog).getByText('Otra Persona')).toBeVisible();
  expect(within(dialog).getByText('PIN temporal del Portal')).toBeVisible();
  expect(posts).toBe(1);
  expect(screen.queryByRole('heading', { name: 'Nueva Persona' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('DNI')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Personas' })).toBeVisible();
  expect(screen.getByRole('table')).toBeVisible();
  expect(screen.getByText('Persona, Otra')).toBeVisible();
  expect(within(dialog).getByText('1234')).toBeVisible();
  expect(within(dialog).getByText('Este PIN se mostrará una sola vez. Compartilo de forma segura con la Persona.')).toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Entendido' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('1234')).not.toBeInTheDocument();
  expect(screen.queryByText('Persona guardada correctamente')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Persona guardada correctamente' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Personas' })).toBeVisible();
  expect(screen.getByRole('table')).toBeVisible();
});

it('copies the creation PIN and clears the copied state when acknowledged', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  server.use(http.post('http://localhost:3000/api/people', () => HttpResponse.json({ data: { ...person, initialPin: '1234' } })));
  await openCreation();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  const dialog = await screen.findByRole('dialog', { name: 'Persona guardada correctamente' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Copiar PIN' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('1234'));
  expect(await within(dialog).findByText('PIN copiado')).toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Entendido' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('1234')).not.toBeInTheDocument();
  expect(screen.queryByText('PIN copiado')).not.toBeInTheDocument();
  expect(screen.queryByText('Persona guardada correctamente')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Persona guardada correctamente' })).not.toBeInTheDocument();
});

it('keeps the entered creation data and form open on a server error', async () => {
  server.use(http.post('http://localhost:3000/api/people', () => HttpResponse.json({ statusCode: 500, message: 'Error' }, { status: 500 })));
  await openCreation();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar los datos.');
  expect(screen.getByRole('heading', { name: 'Nueva Persona' })).toBeVisible();
  for (const [label, value] of [['Nombre', 'Otra'], ['Apellido', 'Persona'], ['DNI', '20123457'], ['Teléfono', '3415551234'], ['Fecha de nacimiento', '1990-01-01']] as const) {
    expect(screen.getByLabelText(label)).toHaveValue(value);
  }
  expect(screen.queryByText('Persona guardada correctamente')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Persona guardada correctamente' })).not.toBeInTheDocument();
});

it('closes a successful edit, refreshes the list and clears its notice on the next edit', async () => {
  let patched = false;
  server.use(
    http.patch(`http://localhost:3000/api/people/${person.id}`, () => { patched = true; return HttpResponse.json({ data: { ...person, phone: '3515559999' } }); }),
    http.get('http://localhost:3000/api/people', () => HttpResponse.json({ data: [{ ...person, phone: patched ? '3515559999' : person.phone }], meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 } })),
    http.get(`http://localhost:3000/api/sala/participations/person/${person.id}`, () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [] })),
  );
  renderPage();
  fireEvent.click(await screen.findByText('Sintética, Ana'));
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '3515559999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('Cambios guardados correctamente.')).toBeVisible();
  expect(patched).toBe(true);
  expect(screen.queryByRole('heading', { name: 'Editar Persona' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Teléfono')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Personas' })).toBeVisible();
  expect(screen.getByRole('table')).toBeVisible();
  expect(screen.getByText('3515559999')).toBeVisible();
  expect(screen.queryByText('Persona guardada correctamente')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Persona guardada correctamente' })).not.toBeInTheDocument();
  expect(screen.queryByText('PIN temporal del Portal')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  expect(screen.queryByText('Cambios guardados correctamente.')).not.toBeInTheDocument();
});

it('keeps the reset PIN dialog within the existing edit flow', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  server.use(
    http.post(`http://localhost:3000/api/people/${person.id}/reset-portal-pin`, () => HttpResponse.json({ data: '5678' })),
    http.get(`http://localhost:3000/api/sala/participations/person/${person.id}`, () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [] })),
  );
  renderPage();
  fireEvent.click(await screen.findByText('Sintética, Ana'));
  fireEvent.click(screen.getByRole('button', { name: 'Restablecer PIN del Portal' }));
  expect(screen.getByRole('dialog', { name: 'Restablecer PIN del Portal' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Generar nuevo PIN' }));
  expect(await screen.findByRole('dialog', { name: 'Nuevo PIN temporal' })).toHaveTextContent('5678');
  expect(screen.getByRole('heading', { name: 'Editar Persona' })).toBeInTheDocument();
  expect(screen.queryByText('Persona guardada correctamente')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Persona guardada correctamente' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Copiar PIN' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('5678'));
  expect(await screen.findByText('PIN copiado')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
  expect(screen.queryByText('5678')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Editar Persona' })).toBeVisible();
});

it.each(['12345', '123456789', '20abc123456', ''])('rejects invalid DNI %s without POST', async (dni) => {
  let posts = 0;
  server.use(http.post('http://localhost:3000/api/people', () => { posts += 1; return HttpResponse.json({ data: person }); }));
  await openCreation(dni);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('El DNI debe tener entre 6 y 8 dígitos.')).toBeInTheDocument();
  expect(posts).toBe(0);
});

it.each(['341555123', '34155512345', '+54 9 11 1234 5678', '0341555123', '341abc5551234', ''])('rejects invalid phone %s without POST', async (phone) => {
  let posts = 0;
  server.use(http.post('http://localhost:3000/api/people', () => { posts += 1; return HttpResponse.json({ data: person }); }));
  await openCreation('20123457', phone);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('El teléfono debe tener 10 dígitos.')).toBeInTheDocument();
  expect(posts).toBe(0);
});

it.each([['(341) 555-1234', '3415551234'], ['11 1234-5678', '1112345678'], ['3411551234', '3411551234']])('sends canonical DNI and phone for %s without changing input while typing', async (phone, expected) => {
  let posted: unknown;
  server.use(http.post('http://localhost:3000/api/people', async ({ request }) => { posted = await request.json(); return HttpResponse.json({ data: person }); }));
  await openCreation('20.123.456', phone);
  expect(screen.getByLabelText('DNI')).toHaveValue('20.123.456');
  expect(screen.getByLabelText('Teléfono')).toHaveValue(phone);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(posted).toMatchObject({ dni: '20123456', phone: expected }));
});

it('shows the DNI and phone help, placeholders and input modes', async () => {
  await openCreation();
  expect(screen.getByText('Ingresá entre 6 y 8 dígitos. Podés escribirlo con puntos.')).toBeVisible();
  expect(screen.getByText('Ingresá 10 dígitos con código de área, sin +54, 0 inicial ni 15. Ej: 3415551234 o 1112345678.')).toBeVisible();
  expect(screen.getByLabelText('DNI')).toHaveAttribute('placeholder', '20123456');
  expect(screen.getByLabelText('DNI')).toHaveAttribute('inputmode', 'numeric');
  expect(screen.getByLabelText('Teléfono')).toHaveAttribute('placeholder', '3415551234');
  expect(screen.getByLabelText('Teléfono')).toHaveAttribute('inputmode', 'tel');
});

it('normalizes DNI and phone before PATCH', async () => {
  let patched: unknown;
  server.use(
    http.patch(`http://localhost:3000/api/people/${person.id}`, async ({ request }) => { patched = await request.json(); return HttpResponse.json({ data: person }); }),
    http.get(`http://localhost:3000/api/sala/participations/person/${person.id}`, () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [] })),
  );
  renderPage();
  fireEvent.click(await screen.findByText('Sintética, Ana'));
  fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '1.234.567' } });
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '(341) 555-1234' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(patched).toMatchObject({ dni: '1234567', phone: '3415551234' }));
});


it('selects optional coverage, enables free-text affiliate and clears it immediately when removed', async () => {
  let sent: Record<string, unknown> | undefined;
  server.use(http.post('http://localhost:3000/api/people', async ({ request }) => { sent = await request.json() as Record<string, unknown>; return HttpResponse.json({ data: { ...person, ...sent, initialPin: '1234' } }); }));
  await openCreation();
  const select = screen.getByLabelText('Obra social (opcional)');
  const affiliate = screen.getByLabelText('Número de afiliado (opcional)');
  expect(affiliate).toBeDisabled();
  await screen.findByRole('option', { name: 'Cobertura A' });
  expect(screen.queryByRole('option', { name: /retirada/ })).not.toBeInTheDocument();
  fireEvent.change(select, { target: { value: 'work-a' } });
  expect(affiliate).toBeEnabled();
  fireEvent.change(affiliate, { target: { value: 'ABC-123' } });
  fireEvent.change(select, { target: { value: '' } });
  expect(affiliate).toBeDisabled();
  expect(affiliate).toHaveValue('');
  fireEvent.change(select, { target: { value: 'work-a' } });
  fireEvent.change(affiliate, { target: { value: 'ABC-123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await screen.findByRole('dialog', { name: 'Persona guardada correctamente' });
  expect(sent).toMatchObject({ socialWorkId: 'work-a', affiliateNumber: 'ABC-123' });
  expect(screen.queryByLabelText('Obra social (opcional)')).not.toBeInTheDocument();
});

it('keeps the retired current coverage editable, excludes other retired works and sends null on removal', async () => {
  const covered = { ...person, socialWorkId: 'work-retired', affiliateNumber: 'OLD-1' };
  let sent: Record<string, unknown> | undefined;
  server.use(
    http.get('http://localhost:3000/api/people', () => HttpResponse.json({ data: [covered], meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 } })),
    http.get(`http://localhost:3000/api/sala/participations/person/${person.id}`, () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [] })),
    http.patch(`http://localhost:3000/api/people/${person.id}`, async ({ request }) => { sent = await request.json() as Record<string, unknown>; return HttpResponse.json({ data: { ...covered, ...sent } }); }),
  );
  renderPage();
  fireEvent.click(await screen.findByText('Sintética, Ana'));
  await screen.findByRole('option', { name: 'Cobertura histórica (retirada)' });
  expect(screen.getByLabelText('Obra social (opcional)')).toHaveValue('work-retired');
  expect(screen.getByLabelText('Número de afiliado (opcional)')).toHaveValue('OLD-1');
  expect(screen.queryByRole('option', { name: 'Otra retirada (retirada)' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Número de afiliado (opcional)'), { target: { value: 'CORRECTED' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await screen.findByText('Cambios guardados correctamente.');
  expect(sent).toMatchObject({ socialWorkId: 'work-retired', affiliateNumber: 'CORRECTED' });
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  fireEvent.change(screen.getByLabelText('Obra social (opcional)'), { target: { value: '' } });
  expect(screen.getByLabelText('Número de afiliado (opcional)')).toHaveValue('');
  expect(screen.getByRole('option', { name: 'Cobertura histórica (retirada)' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(sent).toMatchObject({ socialWorkId: null, affiliateNumber: '' }));
});


it.each([
  ['work-retired', 'ABC-123', 'Obra social: Cobertura histórica'],
  [null, null, 'Obra social: Sin obra social'],
])('shows general coverage in the internal identity without displaying IDs: %s', async (socialWorkId, affiliateNumber, label) => {
  server.use(http.get(`http://localhost:3000/api/people/${person.id}`, () => HttpResponse.json({ data: { ...person, socialWorkId, affiliateNumber } })));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PersonIdentity personId={person.id} /></QueryClientProvider>);
  expect(await screen.findByText(label)).toBeInTheDocument();
  if (affiliateNumber) expect(screen.getByText(`Número de afiliado: ${affiliateNumber}`)).toBeInTheDocument();
  expect(screen.queryByText('work-retired')).not.toBeInTheDocument();
});


it('shows empty optional emergency fields and saves them without blocking creation', async () => {
  let posted: unknown;
  server.use(http.post('http://localhost:3000/api/people', async ({ request }) => { posted = await request.json(); return HttpResponse.json({ data: { ...person, initialPin: '1234' } }); }));
  await openCreation();
  expect(screen.getByLabelText('Contacto de emergencia (opcional)')).toHaveValue('');
  expect(screen.getByLabelText('Contacto de emergencia (opcional)')).toHaveAttribute('maxlength', '150');
  const phone = screen.getByLabelText('Teléfono de emergencia (opcional)');
  expect(phone).toHaveValue('');
  expect(phone).toHaveAttribute('type', 'text');
  expect(phone).toHaveAttribute('inputmode', 'tel');
  expect(phone).toHaveAttribute('placeholder', '3415551234');
  expect(screen.getByText('Ingresá 10 dígitos con código de área, sin +54, 0 inicial ni 15.')).toBeVisible();
  expect(screen.queryByText('El teléfono de emergencia debe tener 10 dígitos.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByRole('dialog', { name: 'Persona guardada correctamente' })).toBeVisible();
  expect(posted).toMatchObject({ emergencyContactName: '', emergencyContactPhone: '' });
  expect(screen.queryByRole('heading', { name: 'Nueva Persona' })).not.toBeInTheDocument();
});

it.each([
  ['  María Pérez  ', '(341) 555-1234', 'María Pérez', '3415551234'],
  ['María Pérez', '', 'María Pérez', ''],
  ['', '3411551234', '', '3411551234'],
])('sends independent, trimmed and normalized emergency fields: %s / %s', async (name, phone, expectedName, expectedPhone) => {
  let posted: unknown;
  server.use(http.post('http://localhost:3000/api/people', async ({ request }) => { posted = await request.json(); return HttpResponse.json({ data: person }); }));
  await openCreation();
  fireEvent.change(screen.getByLabelText('Contacto de emergencia (opcional)'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Teléfono de emergencia (opcional)'), { target: { value: phone } });
  expect(screen.getByLabelText('Teléfono de emergencia (opcional)')).toHaveValue(phone);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(posted).toMatchObject({ emergencyContactName: expectedName, emergencyContactPhone: expectedPhone }));
});

it.each(['341123', '+54 3415551234', '03415551234', 'abc'])('rejects invalid emergency phone %s without POST', async (phone) => {
  let posts = 0;
  server.use(http.post('http://localhost:3000/api/people', () => { posts += 1; return HttpResponse.json({ data: person }); }));
  await openCreation();
  fireEvent.change(screen.getByLabelText('Teléfono de emergencia (opcional)'), { target: { value: phone } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('El teléfono de emergencia debe tener 10 dígitos.')).toBeVisible();
  expect(posts).toBe(0);
});

it('preloads emergency data on edit and includes both empty fields in PATCH when cleared', async () => {
  let patched: unknown;
  const withEmergency = { ...person, emergencyContactName: 'María Pérez', emergencyContactPhone: '3415551234' };
  server.use(
    http.get('http://localhost:3000/api/people', () => HttpResponse.json({ data: [withEmergency], meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 } })),
    http.patch(`http://localhost:3000/api/people/${person.id}`, async ({ request }) => { patched = await request.json(); return HttpResponse.json({ data: person }); }),
    http.get(`http://localhost:3000/api/sala/participations/person/${person.id}`, () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [] })),
  );
  renderPage();
  await screen.findByText('Sintética, Ana');
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  expect(screen.getByLabelText('Contacto de emergencia (opcional)')).toHaveValue('María Pérez');
  expect(screen.getByLabelText('Teléfono de emergencia (opcional)')).toHaveValue('3415551234');
  fireEvent.change(screen.getByLabelText('Contacto de emergencia (opcional)'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Teléfono de emergencia (opcional)'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('Cambios guardados correctamente.')).toBeVisible();
  expect(patched).toMatchObject({ emergencyContactName: '', emergencyContactPhone: '' });
});

it('lets a Professor incorporate to Sala through minimal selectors without Team or catalog administration permissions', async () => {
  let joined: unknown;
  let teamReads = 0;
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: [...session.permissions, 'SALA_RELATION_READ', 'SALA_PARTICIPATION_MANAGE'] } })),
    http.get('http://localhost:3000/api/team/users', () => { teamReads++; return HttpResponse.json({ data: [] }); }),
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [{ id: 'plan', name: 'Mensual', isSelectable: true }] })),
    http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [{ id: 'professor', firstName: 'Ana', lastName: 'Profesora' }] })),
    http.post('http://localhost:3000/api/sala/participations', async ({ request }) => { joined = await request.json(); return HttpResponse.json({ data: { id: 'joined' } }, { status: 201 }); }),
  );
  renderPage(); fireEvent.click(await screen.findByText('Sintética, Ana'));
  await screen.findByRole('option', { name: 'Mensual' }); await screen.findByRole('option', { name: 'Profesora, Ana' });
  fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'plan' } });
  fireEvent.change(screen.getByLabelText('Profesor principal'), { target: { value: 'professor' } });
  fireEvent.click(screen.getByRole('button', { name: 'Incorporar a Sala' }));
  await waitFor(() => expect(joined).toMatchObject({ personId: person.id, planId: 'plan', mainProfessorId: 'professor' })); expect(teamReads).toBe(0);
});
it.each([true, false])('shows Sala relationship without management actions or catalog requests (active=%s)', async (active) => {
  let catalogReads = 0;
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: [...session.permissions, 'SALA_RELATION_READ'] } })),
    http.get(`http://localhost:3000/api/sala/participations/person/${person.id}`, () => HttpResponse.json({ data: active ? [{ id: 'participation', startDate: '2026-01-01', endDate: null, plan: { name: 'Mensual' }, mainProfessor: { firstName: 'Ana', lastName: 'Profesora' } }] : [] })),
    http.get('http://localhost:3000/api/sala/plans', () => { catalogReads++; return HttpResponse.json({ data: [] }); }),
    http.get('http://localhost:3000/api/sala/professors', () => { catalogReads++; return HttpResponse.json({ data: [] }); }),
  );
  renderPage(); fireEvent.click(await screen.findByText('Sintética, Ana'));
  await screen.findByText(active ? 'Mensual' : 'Sin participación activa en Sala.');
  for (const name of ['Incorporar a Sala', 'Dar de baja']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Cambiar Plan')).not.toBeInTheDocument(); expect(screen.queryByLabelText('Cambiar Profesor')).not.toBeInTheDocument(); expect(catalogReads).toBe(0);
});

it.each([
  { roles: ['PROFESSOR'], visible: false },
  { roles: ['ADMINISTRATIVE'], visible: true },
  { roles: ['GENERAL_ADMIN'], visible: true },
  { roles: ['KINESIOLOGIST'], visible: true },
  { roles: ['OSTEOPATH'], visible: true },
  { roles: ['PROFESSOR', 'KINESIOLOGIST'], visible: true },
])('applies provisional creation visibility only to pure Professor: $roles', async ({ roles, visible }) => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles } })));
  renderPage(); await screen.findByRole('button', { name: /Cerrar sesión/ });
  if (visible) expect(await screen.findByRole('button', { name: /Nueva Persona/ })).toBeVisible();
  else expect(screen.queryByRole('button', { name: /Nueva Persona/ })).not.toBeInTheDocument();
});

it('reuses the Sala Objective dialog without submitting the surrounding Person form', async () => {
  let objective = 'Mejorar fuerza'; let objectiveWrites = 0; let personWrites = 0;
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: ['GENERAL_ADMIN'], permissions: [...session.permissions, 'SALA_RELATION_READ'] } })),
    http.get(`http://localhost:3000/api/sala/participations/person/${person.id}`, () => HttpResponse.json({ data: [{ id: 'participation', startDate: '2026-10-01', endDate: null, objective, plan: { name: 'Mensual' } }] })),
    http.patch('http://localhost:3000/api/sala/participations/participation/objective', async ({ request }) => { const body = await request.json() as { objective: string }; objective = body.objective; objectiveWrites++; return HttpResponse.json({ data: { objective } }); }),
    http.patch(`http://localhost:3000/api/people/${person.id}`, () => { personWrites++; return HttpResponse.json({ data: person }); }),
  );
  renderPage(); fireEvent.click(await screen.findByText('Sintética, Ana')); await screen.findByText('Mejorar fuerza');
  const objectiveSection = screen.getByRole('heading', { name: 'Objetivo' }).parentElement!;
  fireEvent.click(within(objectiveSection).getByRole('button', { name: 'Editar' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Editar Objetivo' }));
  fireEvent.change(dialog.getByLabelText('Objetivo'), { target: { value: 'Preparar carrera' } }); fireEvent.click(dialog.getByRole('button', { name: 'Guardar' }));
  await screen.findByText('Preparar carrera'); await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar Objetivo' })).not.toBeInTheDocument());
  expect(objectiveWrites).toBe(1); expect(personWrites).toBe(0);
  expect(screen.getByRole('heading', { name: 'Editar Persona' })).toBeInTheDocument();
});

it('edits and clears the shared optional sport and club fields', async () => {
  let updated: unknown;
  server.use(http.patch(`http://localhost:3000/api/people/${person.id}`, async ({ request }) => { updated = await request.json(); return HttpResponse.json({ data: person }); }));
  renderPage();
  fireEvent.click(await screen.findByText('Sintética, Ana'));
  fireEvent.change(screen.getByLabelText('Deporte (opcional)'), { target: { value: 'Tenis' } });
  fireEvent.change(screen.getByLabelText('Club (opcional)'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(updated).toMatchObject({ sport: 'Tenis', club: '' }));
});

function salaCreationHandlers(role = 'ADMINISTRATIVE') {
  let catalogReads = 0;
  let peoplePosts = 0;
  let studentPosts = 0;
  let payload: unknown;
  let csrf: string | null = null;
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: [role], permissions: [...session.permissions, 'SALA_PARTICIPATION_MANAGE'] } })),
    http.get('http://localhost:3000/api/sala/plans', () => { catalogReads++; return HttpResponse.json({ data: [{ id: 'plan', name: 'Plan activo', isSelectable: true }, { id: 'retired', name: 'Plan retirado', isSelectable: false }] }); }),
    http.get('http://localhost:3000/api/sala/professors', () => { catalogReads++; return HttpResponse.json({ data: [{ id: 'professor', firstName: 'Ana', lastName: 'Profesora' }] }); }),
    http.post('http://localhost:3000/api/people', () => { peoplePosts++; return HttpResponse.json({ data: { ...person, initialPin: '1234' } }, { status: 201 }); }),
    http.post('http://localhost:3000/api/sala/students', async ({ request }) => { studentPosts++; payload = await request.json(); csrf = request.headers.get('x-csrf-token'); return HttpResponse.json({ data: { ...person, initialPin: '4812' } }, { status: 201 }); }),
  );
  return () => ({ catalogReads, peoplePosts, studentPosts, payload, csrf });
}
async function enableSalaCreation() {
  fireEvent.click(screen.getByRole('checkbox', { name: 'Incorporar también a Sala' }));
  await screen.findByRole('option', { name: 'Plan activo' });
  await screen.findByRole('option', { name: 'Profesora, Ana' });
}
it.each(['ADMINISTRATIVE', 'GENERAL_ADMIN'])('creates only a Person by default without loading Sala catalogs for %s', async (role) => {
  const state = salaCreationHandlers(role);
  await openCreation();
  expect(screen.getByRole('checkbox', { name: 'Incorporar también a Sala' })).not.toBeChecked();
  expect(screen.queryByLabelText('Plan')).not.toBeInTheDocument();
  expect(state().catalogReads).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await screen.findByRole('dialog', { name: 'Persona guardada correctamente' });
  expect(state()).toMatchObject({ peoplePosts: 1, studentPosts: 0, catalogReads: 0 });
});
it.each(['ADMINISTRATIVE', 'GENERAL_ADMIN'])('creates Person and Sala atomically and displays a single initial PIN for %s', async (role) => {
  const state = salaCreationHandlers(role);
  await openCreation('20.123.457', '(341) 555-1234');
  await enableSalaCreation();
  expect(screen.getByRole('heading', { name: 'Entrenamiento' })).toBeInTheDocument();
  expect(state().catalogReads).toBe(2);
  expect(screen.queryByRole('option', { name: 'Plan retirado' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'plan' } });
  fireEvent.change(screen.getByLabelText('Profesor principal'), { target: { value: 'professor' } });
  fireEvent.change(screen.getByLabelText('Email (opcional)'), { target: { value: 'persona@example.test' } });
  fireEvent.change(screen.getByLabelText('Deporte (opcional)'), { target: { value: 'Tenis' } });
  fireEvent.change(screen.getByLabelText('Club (opcional)'), { target: { value: 'Club sintético' } });
  fireEvent.change(screen.getByLabelText('Contacto de emergencia (opcional)'), { target: { value: 'Contacto sintético' } });
  fireEvent.change(screen.getByLabelText('Teléfono de emergencia (opcional)'), { target: { value: '(11) 1234-5678' } });
  await screen.findByRole('option', { name: 'Cobertura A' });
  fireEvent.change(screen.getByLabelText('Obra social (opcional)'), { target: { value: 'work-a' } });
  fireEvent.change(screen.getByLabelText('Número de afiliado (opcional)'), { target: { value: '  ABC-123  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await screen.findByRole('dialog', { name: 'Persona guardada correctamente' });
  expect(state()).toMatchObject({ peoplePosts: 0, studentPosts: 1, csrf: 'csrf-test', payload: {
    firstName: 'Otra', lastName: 'Persona', dni: '20123457', phone: '3415551234', birthDate: '1990-01-01',
    email: 'persona@example.test', sport: 'Tenis', club: 'Club sintético', emergencyContactName: 'Contacto sintético', emergencyContactPhone: '1112345678', socialWorkId: 'work-a', affiliateNumber: 'ABC-123', planId: 'plan', mainProfessorId: 'professor',
  } });
  expect(screen.getAllByLabelText('PIN temporal')).toHaveLength(1);
  expect(screen.getByLabelText('PIN temporal')).toHaveTextContent('4812');
  fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
  expect(screen.queryByLabelText('PIN temporal')).not.toBeInTheDocument();
});
it('requires Plan and Professor only while incorporation is enabled', async () => {
  const state = salaCreationHandlers();
  await openCreation(); await enableSalaCreation();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('Seleccioná un Plan.')).toBeVisible();
  expect(screen.getByText('Seleccioná un Profesor principal.')).toBeVisible();
  expect(state()).toMatchObject({ peoplePosts: 0, studentPosts: 0 });
  fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'plan' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(screen.queryByText('Seleccioná un Plan.')).not.toBeInTheDocument());
  expect(screen.getByText('Seleccioná un Profesor principal.')).toBeVisible();
  expect(state().studentPosts).toBe(0);
  fireEvent.change(screen.getByLabelText('Plan'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Profesor principal'), { target: { value: 'professor' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('Seleccioná un Plan.')).toBeVisible();
  expect(state().studentPosts).toBe(0);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Incorporar también a Sala' }));
  expect(screen.queryByLabelText('Plan')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await screen.findByRole('dialog', { name: 'Persona guardada correctamente' });
  expect(state()).toMatchObject({ peoplePosts: 1, studentPosts: 0 });
});
it.each([409, 500])('keeps atomic creation failure visible without falling back to Person creation (%s)', async (status) => {
  const state = salaCreationHandlers();
  server.use(http.post('http://localhost:3000/api/sala/students', () => HttpResponse.json({ code: status === 409 ? 'PERSON_DNI_ALREADY_EXISTS' : 'INTERNAL_ERROR' }, { status })));
  await openCreation(); await enableSalaCreation();
  fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'plan' } });
  fireEvent.change(screen.getByLabelText('Profesor principal'), { target: { value: 'professor' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(status === 409 ? 'Ya existe una Persona con ese DNI.' : 'No pudimos guardar los datos.');
  expect(state().peoplePosts).toBe(0);
  expect(screen.queryByRole('dialog', { name: 'Persona guardada correctamente' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('PIN temporal')).not.toBeInTheDocument();
});
it('does not offer Sala incorporation without participation management', async () => {
  await openCreation();
  expect(screen.queryByRole('checkbox', { name: 'Incorporar también a Sala' })).not.toBeInTheDocument();
});

it('requests pages of 25 and keeps backend pagination', async () => {
  let requested = new URLSearchParams();
  server.use(http.get('http://localhost:3000/api/people', ({ request }) => {
    requested = new URL(request.url).searchParams;
    return HttpResponse.json({ data: [person], meta: { page: Number(requested.get('page')), pageSize: 25, total: 26, totalPages: 2 } });
  }));
  renderPage(); await screen.findByText('Sintética, Ana');
  expect(requested.get('pageSize')).toBe('25');
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await waitFor(() => expect(requested.get('page')).toBe('2'));
  expect(screen.getByText('Página 2 de 2')).toBeVisible();
});

it('counts backend totals across pages and hides previous totals while filters load', async () => {
  let release!: () => void;
  const requests: URL[] = [];
  server.use(http.get('http://localhost:3000/api/people', async ({ request }) => {
    const url = new URL(request.url); requests.push(url);
    const search = url.searchParams.get('search');
    if (search === 'espera') await new Promise<void>(resolve => { release = resolve; });
    const total = search === 'espera' ? 0 : search ? 1 : 26;
    return HttpResponse.json({ data: total ? [person] : [], meta: { page: Number(url.searchParams.get('page')), pageSize: 25, total, totalPages: total === 26 ? 2 : 1 } });
  }));
  renderPage();
  expect(await screen.findByText('26 personas')).toBeVisible();
  expect(screen.getAllByRole('row')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await waitFor(() => expect(requests.at(-1)?.searchParams.get('page')).toBe('2'));
  expect(await screen.findByText('26 personas')).toBeVisible();
  expect(requests.every(url => url.searchParams.get('pageSize') === '25')).toBe(true);
  fireEvent.change(screen.getByLabelText('Buscar Personas'), { target: { value: 'Ana' } });
  expect(await screen.findByText('1 persona')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Buscar Personas'), { target: { value: 'espera' } });
  expect(await screen.findByText('Cargando resultados…')).toBeVisible();
  expect(screen.queryByText('1 persona')).not.toBeInTheDocument();
  expect(screen.queryByText('0 personas')).not.toBeInTheDocument();
  await waitFor(() => expect(release).toBeDefined()); release();
  expect(await screen.findByText('0 personas')).toBeVisible();
});

it('does not report zero records on loading or query failure', async () => {
  let release!: () => void;
  server.use(http.get('http://localhost:3000/api/people', async () => {
    await new Promise<void>(resolve => { release = resolve; });
    return HttpResponse.json({}, { status: 500 });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><PeoplePage /></QueryClientProvider>);
  await waitFor(() => expect(release).toBeDefined());
  expect(screen.queryByText('0 personas')).not.toBeInTheDocument();
  release();
  await waitFor(() => expect(client.getQueryCache().getAll().some(query => query.state.status === 'error')).toBe(true));
  expect(screen.queryByText('0 personas')).not.toBeInTheDocument();
});
