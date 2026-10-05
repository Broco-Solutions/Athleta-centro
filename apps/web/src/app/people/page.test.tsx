import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import PeoplePage from './page';

const server = setupServer(); const nativeFetch = globalThis.fetch;
const session = { user: { id: 'u1', firstName: 'Test', lastName: 'User', email: 'user@test.local' }, roles: ['PROFESSOR'], permissions: ['PEOPLE_READ', 'PEOPLE_CREATE', 'PEOPLE_UPDATE_GENERAL'], mustChangePassword: false, csrfToken: 'csrf-test' };
const person = { id: '10000000-0000-4000-8000-000000000001', firstName: 'Ana', lastName: 'Sintética', dni: '20.123.456', phone: '3515550101', birthDate: '1992-03-10', email: null, emergencyContactName: null, emergencyContactPhone: null, socialWorkId: null, affiliateNumber: null, status: 'INACTIVE', contexts: [], hasSalaParticipation: false, isClinicalPatient: false };
function renderPage(): void { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); render(<QueryClientProvider client={client}><PeoplePage /></QueryClientProvider>); }
beforeAll(() => { globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch; server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => { server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: session })), http.get('http://localhost:3000/api/people', () => HttpResponse.json({ data: [person], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } }))); });
afterEach(() => server.resetHandlers()); afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it('renders and searches the People list through HTTP', async () => { let search = ''; server.use(http.get('http://localhost:3000/api/people', ({ request }) => { search = new URL(request.url).searchParams.get('search') ?? ''; return HttpResponse.json({ data: [person], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } }); })); renderPage(); expect(await screen.findByText('Sintética, Ana')).toBeInTheDocument(); fireEvent.change(screen.getByLabelText('Buscar Personas'), { target: { value: '20.123' } }); await waitFor(() => expect(search).toBe('20.123')); });
it('validates required creation fields locally', async () => { renderPage(); await screen.findByText('Sintética, Ana'); fireEvent.click(screen.getByRole('button', { name: /Nueva Persona/ })); fireEvent.click(screen.getByRole('button', { name: 'Guardar' })); expect(await screen.findByText('Ingresá el nombre')).toBeInTheDocument(); });
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
    http.get('http://localhost:3000/api/team/users', () => HttpResponse.json({ data: [] })),
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
    http.get('http://localhost:3000/api/people', () => HttpResponse.json({ data: posts ? [person, created] : [person], meta: { page: 1, pageSize: 10, total: posts ? 2 : 1, totalPages: 1 } })),
  );
  await openCreation();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('Persona guardada correctamente.')).toBeVisible();
  expect(posts).toBe(1);
  expect(screen.queryByRole('heading', { name: 'Nueva Persona' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('DNI')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Personas' })).toBeVisible();
  expect(screen.getByRole('table')).toBeVisible();
  expect(screen.getByText('Persona, Otra')).toBeVisible();
  expect(screen.getByText('1234')).toBeVisible();
  expect(screen.getByText(/Este PIN se mostrará una sola vez\./)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
  expect(screen.queryByText('1234')).not.toBeInTheDocument();
  expect(screen.queryByText('Persona guardada correctamente.')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Personas' })).toBeVisible();
  expect(screen.getByRole('table')).toBeVisible();
});

it('copies the creation PIN and clears the notice when starting another creation', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  server.use(http.post('http://localhost:3000/api/people', () => HttpResponse.json({ data: { ...person, initialPin: '1234' } })));
  await openCreation();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await screen.findByText('Persona guardada correctamente.');
  fireEvent.click(screen.getByRole('button', { name: 'Copiar PIN' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('1234'));
  expect(await screen.findByText('PIN copiado')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Nueva Persona/ }));
  expect(screen.queryByText('1234')).not.toBeInTheDocument();
  expect(screen.queryByText('PIN copiado')).not.toBeInTheDocument();
  expect(screen.queryByText('Persona guardada correctamente.')).not.toBeInTheDocument();
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
  expect(screen.queryByText('Persona guardada correctamente.')).not.toBeInTheDocument();
});

it('closes a successful edit, refreshes the list and clears its notice on the next edit', async () => {
  let patched = false;
  server.use(
    http.patch(`http://localhost:3000/api/people/${person.id}`, () => { patched = true; return HttpResponse.json({ data: { ...person, phone: '3515559999' } }); }),
    http.get('http://localhost:3000/api/people', () => HttpResponse.json({ data: [{ ...person, phone: patched ? '3515559999' : person.phone }], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } })),
    http.get(`http://localhost:3000/api/sala/participations/person/${person.id}`, () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/team/users', () => HttpResponse.json({ data: [] })),
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
  expect(screen.queryByText('Persona guardada correctamente.')).not.toBeInTheDocument();
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
    http.get('http://localhost:3000/api/team/users', () => HttpResponse.json({ data: [] })),
  );
  renderPage();
  fireEvent.click(await screen.findByText('Sintética, Ana'));
  fireEvent.click(screen.getByRole('button', { name: 'Resetear PIN del Portal' }));
  expect(screen.getByRole('dialog', { name: 'Resetear PIN del Portal' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Generar nuevo PIN' }));
  expect(await screen.findByRole('dialog', { name: 'Nuevo PIN del Portal' })).toHaveTextContent('5678');
  expect(screen.getByRole('heading', { name: 'Editar Persona' })).toBeInTheDocument();
  expect(screen.queryByText('Persona guardada correctamente.')).not.toBeInTheDocument();
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
    http.get('http://localhost:3000/api/team/users', () => HttpResponse.json({ data: [] })),
  );
  renderPage();
  fireEvent.click(await screen.findByText('Sintética, Ana'));
  fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '1.234.567' } });
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '(341) 555-1234' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(patched).toMatchObject({ dni: '1234567', phone: '3415551234' }));
});
