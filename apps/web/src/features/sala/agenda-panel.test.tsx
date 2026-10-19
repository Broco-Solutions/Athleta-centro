import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { todayOperational } from './student-onboarding';
import { AgendaPanel, buildTimelineBookings, groupTimelineBookings, overlapLevels, type AgendaEntry } from './agenda-panel';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const person = { id: '10000000-0000-4000-8000-000000000001', firstName: 'Ada', lastName: 'Sintética', dni: '20123456', hasSalaParticipation: true };
const professional = { id: '30000000-0000-4000-8000-000000000001', firstName: 'María', lastName: 'Rossi' };
const slotId = '20000000-0000-4000-8000-000000000001';
const operationalToday = '2026-10-16';
const entry = (name: string, startTime = '09:00', durationMinutes = 60, status: 'RESERVED' | 'ATTENDED' | 'ABSENT' | 'CANCELLED' = 'RESERVED') => ({ personId: `${person.id}-${name}`, person: { ...person, id: `${person.id}-${name}`, firstName: name }, origin: 'ONE_OFF' as const, status, startTime, durationMinutes, professional, service: { name: 'Kinesio' } });
const group = (people: AgendaEntry[] = [entry('Homer')]) => ({ slot: { id: slotId, scheduleSlotId: slotId, startTime: '09:00', durationMinutes: 15 }, capacity: 3, reserved: people.length, available: 3 - people.length, isOverbooked: false, isClosed: false, people });
function renderAgenda(date = '2026-09-02', canManageAgenda = true) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><AgendaPanel canManageAgenda={canManageAgenda} canManageParticipation canCreatePerson date={date} onDateChange={() => undefined} csrfToken="csrf" /></QueryClientProvider>); }
beforeAll(() => { globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch; server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-16T11:00:00Z')); });
afterEach(() => { server.resetHandlers(); vi.useRealTimers(); }); afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it('calculates proportional duration and a 09:30 to 10:15 booking', () => { const bookings = buildTimelineBookings([{ ...group([entry('Homer', '09:00', 60)]), people: [entry('Homer', '09:30', 45)] }]); expect(bookings[0]).toMatchObject({ startMinutes: 570, durationMinutes: 45, endMinutes: 615 }); });
it('groups simultaneous bookings by professional and assigns overlap levels', () => { const bookings = buildTimelineBookings([{ ...group([entry('Homer'), entry('Marge')]), people: [entry('Homer'), entry('Marge')] }]); const rows = groupTimelineBookings(bookings); expect(rows).toHaveLength(1); expect(rows[0]?.bookings).toHaveLength(2); expect([...overlapLevels(bookings).values()]).toEqual([0, 1]); });
it('keeps a third simultaneous booking visible and opens its detail modal', async () => { const people = [entry('Homer'), entry('Marge'), entry('Bart')]; server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: [group(people)] }))); renderAgenda(); expect(await screen.findByText('Homer Sintética')).toBeInTheDocument(); expect(screen.getByText('Marge Sintética')).toBeInTheDocument(); expect(screen.getByText('Bart Sintética')).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: /Homer Sintética 09:00 Reservado/ })); expect(screen.getByRole('dialog')).toHaveTextContent('Kinesio'); });
it('marks a booking attended through the existing mutation and refreshes', async () => { let submitted: unknown; server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: [group()] })), http.post('http://localhost:3000/api/sala/occurrences/attend', async ({ request }) => { submitted = await request.json(); return HttpResponse.json({ data: { status: 'ATTENDED' } }, { status: 201 }); })); renderAgenda(); fireEvent.click(await screen.findByRole('button', { name: /Homer Sintética 09:00 Reservado/ })); fireEvent.click(screen.getByRole('button', { name: 'Asistió' })); await waitFor(() => expect(submitted).toEqual({ personId: `${person.id}-Homer`, scheduleSlotId: slotId, date: '2026-09-02', startTime: '09:00' })); });

it('distinguishes pending payment and automatic cancellation from absence', async () => {
  server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: [group([{ ...entry('Homer'), origin: 'FIXED', status: 'PENDING_PAYMENT' }, { ...entry('Marge'), origin: 'FIXED', status: 'CANCELLED', cancelledForNonPayment: true }])] })));
  renderAgenda();
  fireEvent.click(await screen.findByRole('button', { name: /Homer Sintética 09:00 Pendiente de renovación/ }));
  expect(screen.getByRole('dialog')).toHaveTextContent('El lugar está reservado, pero la fecha no está cubierta por la vigencia actual');
  expect(screen.queryByRole('button', { name: 'Asistió' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  fireEvent.click(screen.getByRole('button', { name: /Marge Sintética 09:00 Cancelado/ }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Por falta de vigencia');
});

it('keeps direct initial actions for RESERVED', async () => {
  server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: [group()] })));
  renderAgenda();
  fireEvent.click(await screen.findByRole('button', { name: /Homer Sintética 09:00 Reservado/ }));
  const modal = within(screen.getByRole('dialog'));
  for (const name of ['Asistió', 'Ausente', 'Cancelar turno']) expect(modal.getByRole('button', { name })).toBeVisible();
  expect(modal.queryByRole('button', { name: 'Corregir estado' })).not.toBeInTheDocument();
});

it.each([
  ['ATTENDED', 'Asistió', 'ABSENT', 'ONE_OFF'],
  ['ABSENT', 'Ausente', 'ATTENDED', 'FIXED'],
  ['CANCELLED', 'Cancelado', 'RESERVED', 'ONE_OFF'],
  ['ATTENDED', 'Asistió', 'CANCELLED', 'SPONTANEOUS'],
] as const)('corrects %s (label %s) to %s via the existing correction endpoint (%s)', async (status, label, target, origin) => {
  let submitted: unknown; let reads = 0;
  server.use(
    http.get('http://localhost:3000/api/sala/agenda', () => { reads++; return HttpResponse.json({ data: [group([{ ...entry('Homer', '09:00', 60, status), origin }])] }); }),
    http.post('http://localhost:3000/api/sala/occurrences/correct', async ({ request }) => {
      expect(request.credentials).toBe('include');
      expect(request.headers.get('x-csrf-token')).toBe('csrf');
      submitted = await request.json();
      return HttpResponse.json({ data: { status: target } }, { status: 201 });
    }),
  );
  renderAgenda();
  fireEvent.click(await screen.findByRole('button', { name: `Homer Sintética 09:00 ${label}` }));
  const modal = within(screen.getByRole('dialog'));
  expect(modal.getByText('Estado')).toBeVisible();
  expect(modal.getByText(label)).toBeVisible();
  fireEvent.click(modal.getByRole('button', { name: 'Corregir estado' }));
  const select = modal.getByLabelText('Nuevo estado');
  const labels = { RESERVED: 'Reservado', ATTENDED: 'Asistió', ABSENT: 'Ausente', CANCELLED: 'Cancelado' };
  for (const candidate of Object.keys(labels) as Array<keyof typeof labels>) {
    if (candidate === status) expect(within(select).queryByRole('option', { name: labels[candidate] })).not.toBeInTheDocument();
    else expect(within(select).getByRole('option', { name: labels[candidate] })).toBeInTheDocument();
  }
  expect(modal.getByRole('button', { name: 'Guardar corrección' })).toBeDisabled();
  fireEvent.change(select, { target: { value: target } });
  fireEvent.click(modal.getByRole('button', { name: 'Guardar corrección' }));
  await waitFor(() => expect(submitted).toEqual({ personId: `${person.id}-Homer`, scheduleSlotId: slotId, date: '2026-09-02', startTime: '09:00', status: target }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(reads).toBeGreaterThan(1));
});

it('cancels correction mode without closing the detail and reports correction failures', async () => {
  server.use(
    http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: [group([entry('Homer', '09:00', 60, 'ABSENT')])] })),
    http.post('http://localhost:3000/api/sala/occurrences/correct', () => HttpResponse.json({}, { status: 500 })),
  );
  renderAgenda();
  fireEvent.click(await screen.findByRole('button', { name: /Homer Sintética 09:00 Ausente/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Corregir estado' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar corrección' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(screen.queryByLabelText('Nuevo estado')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Corregir estado' }));
  fireEvent.change(screen.getByLabelText('Nuevo estado'), { target: { value: 'ATTENDED' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo corregir el estado.');
  expect(screen.getByLabelText('Nuevo estado')).toHaveValue('ATTENDED');
});

it.each(['RESERVED', 'ATTENDED', 'ABSENT', 'CANCELLED'] as const)('shows %s details without modifying actions for a reader', async (status) => {
  server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: [group([entry('Homer', '09:00', 60, status)])] })));
  renderAgenda('2026-09-02', false);
  fireEvent.click(await screen.findByRole('button', { name: /Homer Sintética 09:00/ }));
  const modal = within(screen.getByRole('dialog'));
  expect(modal.getByText('Homer Sintética')).toBeVisible();
  expect(modal.getByText('Estado')).toBeVisible();
  const labels = { RESERVED: 'Reservado', ATTENDED: 'Asistió', ABSENT: 'Ausente', CANCELLED: 'Cancelado' };
  expect(modal.getByText(labels[status])).toBeVisible();
  for (const name of ['Asistió', 'Ausente', 'Cancelar turno', 'Corregir estado', 'Guardar corrección']) expect(modal.queryByRole('button', { name })).not.toBeInTheDocument();
});
it('opens spontaneous incorporation in a custom modal', async () => { server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: [group()] }))); renderAgenda(); fireEvent.click(await screen.findByRole('button', { name: 'Incorporación espontánea' })); expect(screen.getByRole('dialog')).toHaveTextContent('Incorporación espontánea'); expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument(); });

const serviceId = '40000000-0000-4000-8000-000000000001';
const planId = '50000000-0000-4000-8000-000000000001';
const services = [{ id: serviceId, name: 'Funcional', durationMinutes: 45, isSelectable: true }];
const eligibility = { eligible: true, participationId: 'participation', plan: { id: planId, name: 'Plan Base' }, mainProfessor: professional, services };
const blocks = (full = false) => Array.from({ length: 12 }, (_, index) => ({ ...group([]), reserved: full ? 3 : 0, available: full ? 0 : 3, slot: { id: `${slotId}-${index}`, scheduleSlotId: slotId, startTime: `${String(8 + Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`, durationMinutes: 15 } }));
function mockFlow(full = false, eligible = true): void {
  server.use(
    http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: blocks(full) })),
    http.get('http://localhost:3000/api/sala/people/:id/spontaneous-options', () => HttpResponse.json({ data: eligible ? eligibility : { eligible: false, services: [] } })),
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [{ id: planId, name: 'Plan Base', isSelectable: true, services: [...services, { id: 'retired-service', name: 'Retirado', durationMinutes: 60, isSelectable: false }] }] })),
    http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [professional] })),
    http.get('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ data: [] })),
  );
}
async function openFlow(date = todayOperational(), people = [person]): Promise<void> {
  server.use(http.get('http://localhost:3000/api/people', () => HttpResponse.json({ data: people })));
  renderAgenda(date);
  await screen.findByTestId('agenda-timeline-scroll');
  fireEvent.click(screen.getByRole('button', { name: 'Incorporación espontánea' }));
}
async function selectPerson(): Promise<void> {
  fireEvent.change(screen.getByLabelText('Buscar Persona'), { target: { value: 'Sintética' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Ada Sintética · DNI 20123456' }));
}
async function choosePerson(): Promise<void> {
  await selectPerson();
  await screen.findByRole('option', { name: 'Funcional · 45 min' });
  fireEvent.change(screen.getByLabelText('Servicio'), { target: { value: serviceId } });
}
async function chooseAssignment(): Promise<void> {
  await screen.findByRole('option', { name: 'Plan Base' });
  fireEvent.change(screen.getByLabelText('Plan'), { target: { value: planId } });
  await screen.findByRole('option', { name: 'Rossi, María' });
  fireEvent.change(screen.getByLabelText('Profesor principal'), { target: { value: professional.id } });
  await screen.findByRole('option', { name: 'Funcional · 45 min' });
  fireEvent.change(screen.getByLabelText('Servicio'), { target: { value: serviceId } });
}
async function fillNew(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Nueva Persona' }));
  for (const [label, value] of [['Nombre', ' Ana '], ['Apellido', 'Nueva'], ['DNI', '30.123-456'], ['Teléfono', '(341) 555-1234'], ['Fecha de nacimiento', '1990-01-01']] as const) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  await chooseAssignment();
}
it('lists operational slots, services from spontaneous options and sends the selected start time and service', async () => {
  mockFlow(); let submitted: unknown; let reads = 0;
  server.use(http.get('http://localhost:3000/api/sala/people/:id/spontaneous-options', ({ request }) => { expect(new URL(request.url).searchParams.get('date')).toBe(operationalToday); return HttpResponse.json({ data: eligibility }); }), http.get('http://localhost:3000/api/sala/agenda', () => { reads++; return HttpResponse.json({ data: blocks() }); }), http.post('http://localhost:3000/api/sala/occurrences/spontaneous', async ({ request }) => { submitted = await request.json(); return HttpResponse.json({ data: {} }, { status: 201 }); }));
  await openFlow(); await choosePerson();
  expect(screen.getByRole('dialog')).toHaveTextContent('Plan Base'); expect(screen.getByRole('dialog')).toHaveTextContent('María Rossi');
  const timeSelect = screen.getByLabelText('Horario espontáneo'); expect(timeSelect.querySelectorAll('option')).toHaveLength(13);
  fireEvent.change(timeSelect, { target: { value: `${slotId}-9` } }); fireEvent.click(screen.getByRole('button', { name: 'Incorporar' }));
  await waitFor(() => expect(submitted).toEqual({ personId: person.id, scheduleSlotId: slotId, startTime: '10:15', date: operationalToday, serviceTypeId: serviceId }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument()); expect(reads).toBeGreaterThan(1);
});
it.each(['Chris', 'Otra', '30123457', '30.123.457'])('searches Persons remotely by name, surname or DNI: %s', async (query) => {
  mockFlow(); const other = { ...person, id: 'other', firstName: 'Chris', lastName: 'Otra', dni: '30123457', hasSalaParticipation: false };
  await openFlow(); const requests: URL[] = [];
  server.use(http.get('http://localhost:3000/api/people', ({ request }) => { requests.push(new URL(request.url)); return HttpResponse.json({ data: [other] }); }));
  expect(screen.queryByRole('group', { name: 'Resultados' })).not.toBeInTheDocument();
  expect(screen.queryByText('Seleccionar Persona')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Buscar Persona'), { target: { value: query } });
  expect(await screen.findByRole('button', { name: 'Chris Otra · DNI 30123457' })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(Object.fromEntries(requests[0]!.searchParams)).toEqual({ search: query, page: '1', pageSize: '10' });
  expect(screen.queryByRole('button', { name: 'Ada Sintética · DNI 20123456' })).not.toBeInTheDocument();
});
it('shows search loading, empty and error states without preloading Persons', async () => {
  mockFlow(); await openFlow(); let respond!: () => void; const requests: URL[] = [];
  server.use(http.get('http://localhost:3000/api/people', async ({ request }) => { requests.push(new URL(request.url)); await new Promise<void>(resolve => { respond = resolve; }); return HttpResponse.json({ data: [] }); }));
  expect(screen.queryByText('Buscando Personas…')).not.toBeInTheDocument();
  expect(screen.queryByText('No encontramos una Persona con esa búsqueda.')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Buscar Persona'), { target: { value: '   ' } });
  expect(requests).toHaveLength(0);
  fireEvent.change(screen.getByLabelText('Buscar Persona'), { target: { value: 'Nadie' } });
  expect(await screen.findByText('Buscando Personas…')).toBeVisible();
  await waitFor(() => expect(respond).toBeDefined()); respond();
  expect(await screen.findByText('No encontramos una Persona con esa búsqueda.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Nueva Persona' })).toBeVisible();
  server.use(http.get('http://localhost:3000/api/people', () => HttpResponse.json({}, { status: 500 })));
  fireEvent.change(screen.getByLabelText('Buscar Persona'), { target: { value: 'Otra' } });
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos buscar Personas. Intentá nuevamente.');
  expect(screen.getByRole('button', { name: 'Nueva Persona' })).toBeVisible();
});
it('clears the selected Person, Service and mutation error when searching again', async () => {
  mockFlow();
  server.use(http.post('http://localhost:3000/api/sala/occurrences/spontaneous', () => HttpResponse.json({ code: 'SALA_OCCURRENCE_DUPLICATE' }, { status: 409 })));
  await openFlow(); await choosePerson();
  fireEvent.change(screen.getByLabelText('Horario espontáneo'), { target: { value: `${slotId}-0` } });
  fireEvent.click(screen.getByRole('button', { name: 'Incorporar' }));
  await screen.findByRole('alert');
  fireEvent.change(screen.getByLabelText('Buscar Persona'), { target: { value: '20123456' } });
  expect(screen.queryByLabelText('Servicio')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Incorporar' })).toBeDisabled();
  const result = await screen.findByRole('button', { name: 'Ada Sintética · DNI 20123456' });
  expect(result).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(result);
  expect(await screen.findByLabelText('Servicio')).toHaveValue('');
});
it('allows retrospective attendance for an eligible Person without offering new Person onboarding', async () => {
  mockFlow(); let submitted: unknown;
  server.use(http.post('http://localhost:3000/api/sala/occurrences/spontaneous', async ({ request }) => { submitted = await request.json(); return HttpResponse.json({ data: {} }, { status: 201 }); }));
  await openFlow('2026-09-02'); await choosePerson();
  expect(screen.queryByRole('button', { name: 'Nueva Persona' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Incorporar' })); await waitFor(() => expect(submitted).toMatchObject({ date: '2026-09-02', serviceTypeId: serviceId }));
});
it('blocks future attendance and explains Reservation or Fixed booking', async () => {
  mockFlow(); await openFlow('2999-01-01');
  expect(screen.getByRole('dialog')).toHaveTextContent('Para una fecha futura usá una Reserva puntual o un Turno fijo.');
  expect(screen.queryByLabelText('Persona espontánea')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Incorporar' })).not.toBeInTheDocument();
});
it('does not offer retrospective onboarding without a valid historical participation', async () => {
  mockFlow(false, false); await openFlow('2026-09-02');
  await selectPerson();
  expect(await screen.findByText('La Persona no tenía una participación de Sala vigente en esa fecha.')).toBeVisible();
  expect(screen.queryByLabelText('Plan')).not.toBeInTheDocument(); expect(screen.queryByLabelText('Profesor principal')).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Incorporar' })).toBeDisabled();
});
it('keeps full schedules selectable and confirms deliberate overbooking', async () => {
  mockFlow(true); const submitted: Record<string, unknown>[] = [];
  server.use(http.post('http://localhost:3000/api/sala/occurrences/spontaneous', async ({ request }) => { submitted.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ data: {} }, { status: 201 }); }));
  await openFlow(); await choosePerson(); expect(screen.getByRole('option', { name: '08:00 · Sin lugar' })).not.toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Incorporar' })); const warning = screen.getByRole('alertdialog');
  expect(warning).toHaveTextContent('Este Servicio supera la capacidad disponible'); expect(submitted).toHaveLength(0);
  fireEvent.click(within(warning).getByRole('button', { name: 'Cancelar' })); expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Incorporar' })); fireEvent.click(screen.getByRole('button', { name: 'Incorporar igualmente' }));
  await waitFor(() => expect(submitted[0]).toMatchObject({ confirmOverbooking: true, serviceTypeId: serviceId }));
});
it('also confirms when the backend reports capacity changed after loading', async () => {
  mockFlow(); const submitted: Record<string, unknown>[] = [];
  server.use(http.post('http://localhost:3000/api/sala/occurrences/spontaneous', async ({ request }) => { const body = await request.json() as Record<string, unknown>; submitted.push(body); return body.confirmOverbooking ? HttpResponse.json({ data: {} }, { status: 201 }) : HttpResponse.json({ code: 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED', details: { fullSlots: 1, requiredSlots: 3 } }, { status: 409 }); }));
  await openFlow(); await choosePerson(); fireEvent.click(screen.getByRole('button', { name: 'Incorporar' })); await screen.findByRole('alertdialog');
  fireEvent.click(screen.getByRole('button', { name: 'Incorporar igualmente' })); await waitFor(() => expect(submitted).toHaveLength(2)); expect(submitted[0]).not.toHaveProperty('confirmOverbooking'); expect(submitted[1]).toMatchObject({ confirmOverbooking: true });
});
it('onboards an existing Person without Sala today in one request and offers only selectable Plan services', async () => {
  mockFlow(false, false); let submitted: unknown;
  server.use(http.post('http://localhost:3000/api/sala/occurrences/spontaneous/join', async ({ request }) => { submitted = await request.json(); return HttpResponse.json({ data: {} }, { status: 201 }); }));
  await openFlow(todayOperational(), [{ ...person, hasSalaParticipation: false }]); await selectPerson();
  await chooseAssignment(); expect(screen.queryByRole('option', { name: /Retirado/ })).not.toBeInTheDocument(); expect(screen.queryByRole('option', { name: /Calistenia/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/Pago/)).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Incorporar' }));
  await waitFor(() => expect(submitted).toEqual({ personId: person.id, planId, mainProfessorId: professional.id, date: todayOperational(), scheduleSlotId: slotId, startTime: '08:00', serviceTypeId: serviceId }));
});
it('creates a new Person with the normal fields in one request and shows the one-time Portal PIN', async () => {
  mockFlow(); let submitted: unknown; const copy = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  server.use(http.post('http://localhost:3000/api/sala/occurrences/spontaneous/create-student', async ({ request }) => { submitted = await request.json(); return HttpResponse.json({ data: { person: { ...person, firstName: 'Ana', initialPin: '1234' }, occurrence: {} } }, { status: 201 }); }));
  await openFlow(); await fillNew();
  for (const label of ['Nombre', 'Apellido', 'DNI', 'Teléfono', 'Fecha de nacimiento', 'Email (opcional)', 'Contacto de emergencia (opcional)', 'Teléfono de emergencia (opcional)', 'Obra social (opcional)', 'Número de afiliado (opcional)', 'Plan', 'Profesor principal']) expect(screen.getByLabelText(label)).toBeVisible();
  expect(screen.queryByText(/Pago/)).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Incorporar' }));
  const pin = await screen.findByRole('dialog', { name: 'Alumno guardado correctamente' }); expect(pin).toHaveTextContent('PIN temporal del Portal');
  expect(submitted).toMatchObject({ firstName: 'Ana', dni: '30123456', phone: '3415551234', planId, mainProfessorId: professional.id, serviceTypeId: serviceId, date: todayOperational() });
  expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
  fireEvent.click(within(pin).getByRole('button', { name: 'Copiar PIN' })); await waitFor(() => expect(copy).toHaveBeenCalledWith('1234'));
  fireEvent.click(within(pin).getByRole('button', { name: 'Entendido' })); expect(screen.queryByText('1234')).not.toBeInTheDocument();
});
it('keeps duplicate DNI data visible and directs the user to existing Persons', async () => {
  mockFlow(); server.use(http.post('http://localhost:3000/api/sala/occurrences/spontaneous/create-student', () => HttpResponse.json({ code: 'PERSON_DNI_ALREADY_EXISTS' }, { status: 409 })));
  await openFlow(); await fillNew(); fireEvent.click(screen.getByRole('button', { name: 'Incorporar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe una Persona con ese DNI. Seleccionala como Persona existente.'); expect(screen.getByLabelText('DNI')).toHaveValue('30.123-456');
});
it('disables incorporation for a Plan without selectable services', async () => {
  mockFlow(false, false); server.use(http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [{ id: planId, name: 'Plan Base', services: [] }] })));
  await openFlow(); await selectPerson();
  await screen.findByRole('option', { name: 'Plan Base' }); fireEvent.change(screen.getByLabelText('Plan'), { target: { value: planId } });
  expect(await screen.findByText('El Plan seleccionado no tiene servicios disponibles.')).toBeVisible(); expect(screen.getByRole('button', { name: 'Incorporar' })).toBeDisabled();
});

it.each([
  ['SALA_OCCURRENCE_DUPLICATE', 'La Persona ya tiene una presencia registrada para este horario.'],
  ['SALA_PARTICIPATION_REQUIRED', 'La Persona no tiene una participación válida de Sala para esa fecha.'],
  ['SALA_SERVICE_NOT_INCLUDED_IN_PLAN', 'El Servicio no está incluido en el Plan de la Persona.'],
  ['SALA_SERVICE_TYPE_INVALID', 'El Servicio ya no está disponible.'],
  ['SALA_REQUIRED_SLOTS_UNAVAILABLE', 'El Servicio no entra completo en el horario seleccionado.'],
  ['SALA_SCHEDULE_CLOSED', 'El horario está cerrado para esa fecha.'],
  ['SALA_SPONTANEOUS_FUTURE_NOT_ALLOWED', 'Para una fecha futura usá una Reserva puntual o un Turno fijo.'],
])('explains %s and keeps the selection after failure', async (code, message) => {
  mockFlow(); server.use(http.post('http://localhost:3000/api/sala/occurrences/spontaneous', () => HttpResponse.json({ code, message: 'Technical error' }, { status: 400 })));
  await openFlow(); await choosePerson(); fireEvent.click(screen.getByRole('button', { name: 'Incorporar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(message); expect(screen.getByLabelText('Servicio')).toHaveValue(serviceId);
});
