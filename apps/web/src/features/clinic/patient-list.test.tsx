import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { PatientList } from './patient-list';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const patient = {
  id: '10000000-0000-4000-8000-000000000001',
  firstName: 'Ana',
  lastName: 'Sintética',
  dni: '20.123.456',
  status: 'ACTIVE',
  lastAttentionAt: null,
  hasSalaParticipation: true,
  sport: 'Tenis',
  club: 'Club sintético',
  nextAppointmentAt: '2026-12-01T13:30:00.000Z',
};

function renderList(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><PatientList /></QueryClientProvider>);
}

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'u', firstName: 'Ana', lastName: 'Test' }, roles: ['ADMINISTRATIVE'], permissions: ['PEOPLE_READ', 'PEOPLE_CREATE', 'CLINIC_APPOINTMENT_MANAGE'], csrfToken: 'csrf' } })), http.get('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ data: [] })), http.get('http://localhost:3000/api/clinic/patients/overview', () => HttpResponse.json({ data: [patient], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } })));
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it('renders operational patient information without clinical content', async () => {
  renderList();
  expect(await screen.findByText('Sintética, Ana')).toBeInTheDocument();
  expect(screen.getByText('Activo')).toBeInTheDocument();
  expect(screen.getByText('Participación actual en Sala')).toBeVisible();
  expect(screen.getByText('Tenis')).toBeVisible();
  expect(screen.getByText('Club sintético')).toBeVisible();
  expect(screen.getByText(/1\/12\/26, 10:30|01\/12\/26, 10:30/)).toBeVisible();
  expect(screen.getByText('Sin atenciones')).toBeInTheDocument();
  expect(screen.queryByText(/motivo de consulta/i)).not.toBeInTheDocument();
});

it('sends En curso and recent-attention filters to the patient overview API', async () => {
  let search = '';
  let treatmentInProgress = '';
  let withoutRecentAttentionDays = '';
  server.use(http.get('http://localhost:3000/api/clinic/patients/overview', ({ request }) => {
    const params = new URL(request.url).searchParams;
    search = params.get('search') ?? '';
    treatmentInProgress = params.get('treatmentInProgress') ?? '';
    withoutRecentAttentionDays = params.get('withoutRecentAttentionDays') ?? '';
    return HttpResponse.json({ data: [patient], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } });
  }));
  renderList();
  await screen.findByText('Sintética, Ana');
  fireEvent.change(screen.getByLabelText('Tratamiento En curso'), { target: { value: 'YES' } });
  await waitFor(() => expect(treatmentInProgress).toBe('YES'));
  fireEvent.change(screen.getByLabelText('Sin Atención reciente'), { target: { value: '60' } });
  await waitFor(() => expect(withoutRecentAttentionDays).toBe('60'));
  fireEvent.change(screen.getByLabelText('Buscar Pacientes'), { target: { value: 'Ana' } });
  await waitFor(() => { expect(search).toBe('Ana'); expect(treatmentInProgress).toBe('YES'); expect(withoutRecentAttentionDays).toBe('60'); });
  const href = screen.getByRole('link', { name: 'Abrir ficha' }).getAttribute('href')!;
  expect(new URL(href, 'http://localhost').searchParams.get('search')).toBe('Ana');
  expect(new URL(href, 'http://localhost').searchParams.get('withoutRecentAttentionDays')).toBe('60');
});

const identity = { ...patient, dni: '20123456', phone: '3415551234', birthDate: '1990-01-01', email: null, emergencyContactName: null, emergencyContactPhone: null, socialWorkId: null, affiliateNumber: null, contexts: ['SALA'], isClinicalPatient: false };

async function lookupPatient(): Promise<void> {
  renderList();
  fireEvent.click(await screen.findByRole('button', { name: 'Nuevo paciente' }));
  fireEvent.change(screen.getByLabelText('DNI del paciente'), { target: { value: '20.123.456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar DNI' }));
}

it('registers an existing Sala person using the same id without creating another person', async () => {
  let registeredId = '';
  let creates = 0;
  server.use(
    http.get('http://localhost:3000/api/people', () => HttpResponse.json({ data: [identity], meta: { totalPages: 1 } })),
    http.post('http://localhost:3000/api/people', () => { creates += 1; return HttpResponse.json({ data: identity }); }),
    http.post('http://localhost:3000/api/clinic/patients', async ({ request }) => { expect(request.headers.get('x-csrf-token')).toBe('csrf'); registeredId = (await request.json() as { personId: string }).personId; return HttpResponse.json({ data: { personId: registeredId } }, { status: 201 }); }),
  );
  await lookupPatient();
  fireEvent.click(await screen.findByRole('button', { name: 'Dar de alta en Clínica' }));
  await waitFor(() => expect(registeredId).toBe(identity.id));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Dar de alta en Clínica' })).not.toBeInTheDocument());
  expect(creates).toBe(0);
  expect(screen.queryByLabelText('PIN temporal')).not.toBeInTheDocument();
});

it('offers the existing patient record without repeating registration', async () => {
  let registers = 0;
  server.use(
    http.get('http://localhost:3000/api/people', () => HttpResponse.json({ data: [{ ...identity, isClinicalPatient: true }], meta: { totalPages: 1 } })),
    http.post('http://localhost:3000/api/clinic/patients', () => { registers += 1; return HttpResponse.json({ data: {} }); }),
  );
  await lookupPatient();
  await screen.findByText('Ana Sintética · DNI 20123456');
  expect(screen.queryByRole('button', { name: 'Dar de alta en Clínica' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'Abrir ficha' }).some((link) => link.getAttribute('href') === `/clinic?tab=Paciente&personId=${identity.id}`)).toBe(true);
  expect(registers).toBe(0);
});

it('creates optional empty sports data, shows the PIN once and retries only clinical registration after failure', async () => {
  let creates = 0;
  let registers = 0;
  server.use(
    http.get('http://localhost:3000/api/people', () => HttpResponse.json({ data: [], meta: { totalPages: 0 } })),
    http.post('http://localhost:3000/api/people', async ({ request }) => {
      creates += 1;
      expect(await request.json()).toMatchObject({ dni: '20123456', sport: null, club: null });
      return HttpResponse.json({ data: { ...identity, initialPin: '4321' } }, { status: 201 });
    }),
    http.post('http://localhost:3000/api/clinic/patients', async ({ request }) => {
      registers += 1;
      expect(await request.json()).toEqual({ personId: identity.id });
      return registers === 1 ? HttpResponse.json({ code: 'UNAVAILABLE' }, { status: 503 }) : HttpResponse.json({ data: { personId: identity.id } }, { status: 201 });
    }),
  );
  await lookupPatient();
  for (const [label, value] of [['Nombre', 'Ana'], ['Apellido', 'Sintética'], ['Teléfono', '3415551234'], ['Fecha de nacimiento', '1990-01-01'], ['Club (opcional)', '   ']]) {
    fireEvent.change(await screen.findByLabelText(label!), { target: { value } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByLabelText('PIN temporal')).toHaveTextContent('4321');
  expect(await screen.findByRole('alert')).toHaveTextContent('La Persona está guardada.');
  fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
  expect(screen.queryByText('4321')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Dar de alta en Clínica' }));
  await waitFor(() => expect(registers).toBe(2));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Dar de alta en Clínica' })).not.toBeInTheDocument());
  expect(creates).toBe(1);
  expect(screen.queryByLabelText('PIN temporal')).not.toBeInTheDocument();
});

it('hides patient creation without registration permission', async () => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { permissions: ['CLINIC_OPERATIONAL_READ'] } })));
  renderList();
  await screen.findByText('Sintética, Ana');
  expect(screen.queryByRole('button', { name: 'Nuevo paciente' })).not.toBeInTheDocument();
});

it('reports lookup failure without offering unverified creation', async () => {
  server.use(http.get('http://localhost:3000/api/people', () => HttpResponse.json({ message: 'technical payload' }, { status: 503 })));
  await lookupPatient();
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos buscar la Persona.');
  expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
  expect(screen.queryByText('technical payload')).not.toBeInTheDocument();
});

it('restores the list search, combined filters and page', async () => {
  let params = new URLSearchParams();
  server.use(http.get('http://localhost:3000/api/clinic/patients/overview', ({ request }) => { params = new URL(request.url).searchParams; return HttpResponse.json({ data: [patient], meta: { page: 2, total: 12, totalPages: 2 } }); }));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PatientList initialParams="search=Ana&page=2&treatmentInProgress=YES&withoutRecentAttentionDays=60"/></QueryClientProvider>);
  await screen.findByText('Sintética, Ana');
  expect(params.get('page')).toBe('2');
  expect(params.get('search')).toBe('Ana');
  expect(params.get('treatmentInProgress')).toBe('YES');
  expect(params.get('withoutRecentAttentionDays')).toBe('60');
  expect(screen.getByLabelText('Buscar Pacientes')).toHaveValue('Ana');
});
