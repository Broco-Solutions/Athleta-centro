import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { SalaPersonWorkspace } from './person-workspace';

const navigation = vi.hoisted(() => ({ tab: 'reservations' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams({ tab: navigation.tab }) }));
const server = setupServer();
const nativeFetch = globalThis.fetch;
const personId = '10000000-0000-4000-8000-000000000001';
const services = [
  { id: 'muscle', name: 'Musculación', durationMinutes: 60 },
  { id: 'functional', name: 'Funcional', durationMinutes: 45 },
];
let personServicesRequests = 0;
let catalogRequests = 0;

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  navigation.tab = 'reservations';
  personServicesRequests = 0;
  catalogRequests = 0;
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'professor', firstName: 'Profesor', lastName: 'Sintético' }, roles: ['PROFESSOR'], permissions: ['SALA_RELATION_READ', 'SALA_AGENDA_MANAGE'], csrfToken: 'csrf', mustChangePassword: false } })),
    http.get(`http://localhost:3000/api/people/${personId}`, () => HttpResponse.json({ data: { id: personId, firstName: 'Alumno', lastName: 'Sintético', dni: '12345678' } })),
    http.get(`http://localhost:3000/api/sala/participations/person/${personId}`, () => HttpResponse.json({ data: [{ id: 'participation', endDate: null, plan: { name: 'Plan Base' } }] })),
    http.get(`http://localhost:3000/api/sala/people/${personId}/services`, () => { personServicesRequests++; return HttpResponse.json({ data: services }); }),
    http.get('http://localhost:3000/api/sala/service-types', () => { catalogRequests++; return HttpResponse.json({ data: [...services, { id: 'calisthenics', name: 'Calistenia', durationMinutes: 60 }] }); }),
    http.get(`http://localhost:3000/api/sala/people/${personId}/fixed-bookings`, () => HttpResponse.json({ data: [] })),
    http.get(`http://localhost:3000/api/sala/people/${personId}/reservations`, () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/availability', () => HttpResponse.json({ data: [{ slotId: 'window:09:00', scheduleSlotId: 'window', startTime: '09:00' }] })),
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
function renderWorkspace() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><SalaPersonWorkspace personId={personId}/></QueryClientProvider>);
}

it('uses the person services endpoint instead of the global catalog for a new reservation', async () => {
  renderWorkspace();
  await screen.findByText('Participación activa');
  await findBookingOption( { name: 'Musculación' });
  expect(booking().getByRole('option', { name: 'Funcional' })).toBeInTheDocument();
  expect(booking().queryByRole('option', { name: 'Calistenia' })).not.toBeInTheDocument();
  expect(personServicesRequests).toBe(1);
  expect(catalogRequests).toBe(0);
});
it.each(['reservations', 'fixed'])('shows an empty plan state and prevents creation on the %s tab', async (tab) => {
  navigation.tab = tab;
  server.use(http.get(`http://localhost:3000/api/sala/people/${personId}/services`, () => HttpResponse.json({ data: [] })));
  renderWorkspace();
  expect(await waitFor(() => booking().getByText('El Plan actual no tiene servicios disponibles para nuevas reservas.'))).toBeInTheDocument();
  expect(screen.getByRole('button', { name: tab === 'fixed' ? 'Crear turno fijo' : 'Crear reserva' })).toBeDisabled();
  expect(booking().getByLabelText('Servicio').querySelectorAll('option')).toHaveLength(1);
});
it.each([true, false])('preloads a fixed service only when the current plan permits it (allowed=%s)', async (allowed) => {
  navigation.tab = 'fixed';
  server.use(http.get(`http://localhost:3000/api/sala/people/${personId}/fixed-bookings`, () => HttpResponse.json({ data: [{
    id: 'fixed', startDate: '2026-08-31', startTime: '09:00',
    scheduleSlot: { id: 'window', weekday: 'MONDAY', startTime: '09:00' },
    serviceType: allowed ? services[0] : { id: 'calisthenics', name: 'Calistenia', durationMinutes: 60 },
  }] })));
  renderWorkspace();
  await findBookingOption( { name: 'Musculación' });
  fireEvent.click(await screen.findByRole('button', { name: 'Modificar' }));
  expect(booking().getByLabelText('Servicio')).toHaveValue(allowed ? 'muscle' : '');
  expect(booking().queryByRole('option', { name: 'Calistenia' })).not.toBeInTheDocument();
  if (!allowed) {
    expect(screen.getByText(/Calistenia · MONDAY/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    fireEvent.change(booking().getByLabelText('Servicio'), { target: { value: 'functional' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled());
  }
});
it('does not query person services without an active participation', async () => {
  server.use(http.get(`http://localhost:3000/api/sala/participations/person/${personId}`, () => HttpResponse.json({ data: [] })));
  renderWorkspace();
  await screen.findByText('Sin participación activa');
  expect(screen.getByRole('button', { name: 'Crear reserva' })).toBeDisabled();
  expect(personServicesRequests).toBe(0);
  expect(catalogRequests).toBe(0);
});

it.each(['reservations', 'fixed'])('offers only half-hour starts and submits distinct starts from one window on %s', async tab => {
  navigation.tab = tab;
  const submitted: Record<string, string>[] = [];
  server.use(
    http.get('http://localhost:3000/api/sala/availability', () => HttpResponse.json({ data: ['12:00', '12:15', '12:30', '12:45'].map(startTime => ({ slotId: `window:${startTime}`, scheduleSlotId: 'window', startTime })) })),
    http.post(`http://localhost:3000/api/sala/${tab === 'fixed' ? 'fixed-bookings' : 'reservations'}`, async ({ request }) => { submitted.push(await request.json() as Record<string, string>); return HttpResponse.json({ data: {} }, { status: 201 }); }),
  );
  renderWorkspace();
  await findBookingOption( { name: 'Musculación' });
  await findBookingOption( { name: '12:30' });
  expect(booking().getByRole('option', { name: '12:00' })).toBeInTheDocument();
  expect(booking().queryByRole('option', { name: '12:15' })).not.toBeInTheDocument();
  expect(booking().queryByRole('option', { name: '12:45' })).not.toBeInTheDocument();
  fireEvent.change(booking().getByLabelText('Servicio'), { target: { value: 'muscle' } });
  for (const [index, startTime] of ['12:00', '12:30'].entries()) {
    fireEvent.change(booking().getByLabelText('Horario'), { target: { value: `window:${startTime}` } });
    expect(booking().getByLabelText('Horario')).toHaveValue(`window:${startTime}`);
    const submit = screen.getByRole('button', { name: tab === 'fixed' ? 'Crear turno fijo' : 'Crear reserva' });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    await waitFor(() => expect(submitted).toHaveLength(index + 1));
    expect(submitted[index]).toMatchObject({ scheduleSlotId: 'window', startTime, serviceTypeId: 'muscle' });
  }
});
it.each(['12:15', '12:45'])('shows historical fixed start %s and requires a new half-hour selection', async startTime => {
  navigation.tab = 'fixed';
  let submitted: unknown;
  server.use(
    http.get(`http://localhost:3000/api/sala/people/${personId}/fixed-bookings`, () => HttpResponse.json({ data: [{ id: 'historical', startDate: '2026-08-31', startTime, scheduleSlot: { id: 'window', weekday: 'MONDAY', startTime: '12:00' }, serviceType: services[0] }] })),
    http.get('http://localhost:3000/api/sala/availability', () => HttpResponse.json({ data: ['12:00', '12:15', '12:30', '12:45'].map(startTime => ({ slotId: `window:${startTime}`, scheduleSlotId: 'window', startTime })) })),
    http.post('http://localhost:3000/api/sala/fixed-bookings/historical/change', async ({ request }) => { submitted = await request.json(); return HttpResponse.json({ data: {} }); }),
  );
  renderWorkspace();
  await findBookingOption( { name: 'Musculación' });
  expect(await screen.findByText(new RegExp(`MONDAY · ${startTime}`))).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Modificar' }));
  expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  expect(booking().queryByRole('option', { name: startTime })).not.toBeInTheDocument();
  await findBookingOption( { name: '12:30' });
  fireEvent.change(booking().getByLabelText('Horario'), { target: { value: 'window:12:30' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(submitted).toMatchObject({ scheduleSlotId: 'window', startTime: '12:30' }));
});

function booking() {
  const title = navigation.tab === 'fixed' ? /^(Crear|Modificar) turno fijo$/ : 'Nueva reserva puntual';
  return within(screen.getByRole('heading', { name: title }).closest('section')!);
}
async function findBookingOption(options: { name: string }) {
  return waitFor(() => booking().getByRole('option', options));
}

const workspaceRoutine = { id: 'routine', personId, salaParticipationId: 'participation', status: 'ACTIVE', version: 1, days: [{ position: 1, name: 'Día de fuerza', exercises: [{ exerciseDefinitionId: 'squat', exerciseDefinition: { name: 'Sentadilla' }, series: null }] }] };
function routineSession(permissions: string[]) {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'professor', firstName: 'Profesor', lastName: 'Sintético' }, roles: ['PROFESSOR'], permissions, csrfToken: 'csrf', mustChangePassword: false } })));
}
function routineHandlers() {
  let reads = 0;
  server.use(
    http.get(`http://localhost:3000/api/sala/people/${personId}/routines`, () => { reads++; return HttpResponse.json({ data: [workspaceRoutine] }); }),
    http.get('http://localhost:3000/api/sala/exercise-definitions', () => HttpResponse.json({ data: [{ id: 'squat', name: 'Sentadilla', primaryMuscle: 'Piernas', isActive: true }] })),
  );
  return () => reads;
}
it('allows routine read permission to access the tab and see the routine without management', async () => {
  navigation.tab = 'routine'; routineSession(['SALA_ROUTINE_READ']); const reads = routineHandlers(); renderWorkspace();
  expect(await screen.findByRole('link', { name: 'Rutina' })).toHaveAttribute('href', `/sala/people/${personId}?tab=routine`);
  expect(await screen.findByText('Día de fuerza')).toBeInTheDocument();
  expect(screen.getByText('Sentadilla')).toBeInTheDocument(); expect(reads()).toBe(1);
  for (const name of ['Crear rutina', 'Editar rutina', 'Duplicar rutina']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  expect(screen.queryByText('Administrar ejercicios')).not.toBeInTheDocument();
});
it.each(['summary', 'routine'])('hides routine access without read permission and avoids routine requests on %s', async (tab) => {
  navigation.tab = tab; routineSession(['SALA_ROUTINE_MANAGE']); const reads = routineHandlers(); renderWorkspace();
  await screen.findByText('Participación activa');
  expect(screen.queryByRole('link', { name: 'Rutina' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Consultar Rutina/ })).not.toBeInTheDocument();
  expect(screen.queryByText('Día de fuerza')).not.toBeInTheDocument(); expect(reads()).toBe(0);
});
it('treats an Orval HTTP 409 as a mutation error and preserves the editor without success or refresh', async () => {
  navigation.tab = 'routine'; routineSession(['SALA_ROUTINE_READ', 'SALA_ROUTINE_MANAGE']); const reads = routineHandlers();
  let writes = 0;
  server.use(http.post('http://localhost:3000/api/sala/routines', () => { writes++; return HttpResponse.json({ code: 'SALA_EXERCISE_INVALID', message: 'El ejercicio fue retirado.' }, { status: 409 }); }));
  renderWorkspace(); await screen.findByText('Día de fuerza'); fireEvent.click(screen.getByRole('button', { name: 'Editar rutina' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar rutina' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('El ejercicio fue retirado.');
  expect(writes).toBe(1); expect(reads()).toBe(1);
  expect(screen.getByLabelText('Nombre del día 1')).toHaveValue('Día de fuerza');
  expect(screen.queryByText('Rutina guardada correctamente.')).not.toBeInTheDocument();
});
it('preserves structured HTTP retirement errors so the panel displays impact before confirmation', async () => {
  navigation.tab = 'routine'; routineSession(['SALA_ROUTINE_READ', 'SALA_ROUTINE_MANAGE']); routineHandlers();
  const confirmations: boolean[] = [];
  server.use(http.post('http://localhost:3000/api/sala/exercise-definitions/squat/retire', async ({ request }) => {
    const body = await request.json() as { confirmActiveRoutineImpact: boolean }; confirmations.push(body.confirmActiveRoutineImpact);
    return body.confirmActiveRoutineImpact ? HttpResponse.json({ data: { affectedActiveRoutines: 2 } }) : HttpResponse.json({ code: 'SALA_EXERCISE_RETIRE_CONFIRMATION_REQUIRED', message: 'Confirmation required', details: { activeRoutines: 2 } }, { status: 409 });
  }));
  renderWorkspace(); await screen.findByText('Día de fuerza'); fireEvent.click(screen.getByRole('button', { name: 'Editar rutina' })); fireEvent.click(screen.getByText('Administrar ejercicios'));
  fireEvent.click(await screen.findByRole('button', { name: 'Retirar' }));
  expect(await screen.findByRole('alertdialog')).toHaveTextContent('2 Rutinas activas'); expect(confirmations).toEqual([false]);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar retiro' })); await screen.findByText('Ejercicio retirado correctamente.'); expect(confirmations).toEqual([false, true]);
});

async function startInlineCreation() {
  await screen.findByText('Día de fuerza');
  fireEvent.click(screen.getByRole('button', { name: 'Editar rutina' }));
  const scope = within(screen.getByRole('group', { name: 'Día 1' }));
  fireEvent.change(scope.getByLabelText('Series'), { target: { value: '4' } });
  fireEvent.click(scope.getByRole('button', { name: 'Nuevo ejercicio' }));
  for (const [label, value] of [['Nombre del ejercicio', 'Peso muerto'], ['Músculo principal', 'Piernas'], ['Descripción del ejercicio', 'Con barra']]) fireEvent.change(scope.getByLabelText(label!), { target: { value } });
  fireEvent.click(scope.getByRole('button', { name: 'Crear y seleccionar' }));
  return scope;
}
it('returns the actual created catalog entity through the adapter and selects it inline', async () => {
  navigation.tab = 'routine'; routineSession(['SALA_ROUTINE_READ', 'SALA_ROUTINE_MANAGE']); routineHandlers();
  const created = { id: 'deadlift', name: 'Peso muerto', primaryMuscle: 'Piernas', description: 'Con barra', isActive: true };
  const writes: unknown[] = [];
  let saved = false;
  server.use(
    http.get('http://localhost:3000/api/sala/exercise-definitions', () => HttpResponse.json({ data: saved ? [created] : [] })),
    http.post('http://localhost:3000/api/sala/exercise-definitions', async ({ request }) => {
      writes.push(await request.json()); saved = true;
      expect(request.headers.get('x-csrf-token')).toBe('csrf');
      return HttpResponse.json({ data: created }, { status: 201 });
    }),
  );
  renderWorkspace(); const scope = await startInlineCreation();
  await waitFor(() => expect(scope.getByLabelText('Ejercicio')).toHaveValue('deadlift'));
  expect(scope.getByRole('option', { name: 'Peso muerto · Piernas' })).toBeInTheDocument();
  expect(writes).toEqual([{ name: 'Peso muerto', primaryMuscle: 'Piernas', description: 'Con barra' }]);
  expect(scope.getByLabelText('Series')).toHaveValue('4'); expect(scope.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Guardar rutina' })).toBeInTheDocument();
});
it.each([400, 409])('keeps an inline HTTP %s catalog creation failure as an error', async status => {
  navigation.tab = 'routine'; routineSession(['SALA_ROUTINE_READ', 'SALA_ROUTINE_MANAGE']); routineHandlers();
  server.use(http.post('http://localhost:3000/api/sala/exercise-definitions', () => HttpResponse.json({ code: 'EXERCISE_CREATION_FAILED', message: 'No se pudo crear el ejercicio.' }, { status })));
  renderWorkspace(); const scope = await startInlineCreation();
  expect(await scope.findByRole('alert')).toHaveTextContent('No se pudo crear el ejercicio.');
  expect(scope.getByLabelText('Nombre del ejercicio')).toHaveValue('Peso muerto');
  expect(scope.getByLabelText('Músculo principal')).toHaveValue('Piernas');
  expect(scope.getByLabelText('Descripción del ejercicio')).toHaveValue('Con barra');
  expect(scope.queryByRole('option', { name: 'Peso muerto · Piernas' })).not.toBeInTheDocument();
  expect(scope.getByLabelText('Series')).toHaveValue('4'); expect(scope.getAllByRole('listitem')).toHaveLength(1);
});
it('rejects an unexpected successful creation body without a created entity', async () => {
  navigation.tab = 'routine'; routineSession(['SALA_ROUTINE_READ', 'SALA_ROUTINE_MANAGE']); routineHandlers();
  server.use(http.post('http://localhost:3000/api/sala/exercise-definitions', () => HttpResponse.json({ data: {} }, { status: 201 })));
  renderWorkspace(); const scope = await startInlineCreation();
  expect(await scope.findByRole('alert')).toHaveTextContent('La respuesta no contiene el ejercicio creado.');
  expect(scope.getByLabelText('Nombre del ejercicio')).toHaveValue('Peso muerto');
  expect(scope.queryByRole('option', { name: 'Peso muerto · Piernas' })).not.toBeInTheDocument();
});

it.each([false, true])('uses the generated template list and routine replacement endpoint for assignment (reject=%s)', async (reject) => {
  navigation.tab = 'routine'; routineSession(['SALA_ROUTINE_READ', 'SALA_ROUTINE_MANAGE']); const reads = routineHandlers();
  let templateReads = 0; const writes: unknown[] = [];
  server.use(
    http.get('http://localhost:3000/api/sala/routine-templates', () => { templateReads++; return HttpResponse.json({ data: [{ id: 'template', name: 'Preestablecida', days: [{ id: 'template-day', position: 1, name: 'Modelo', exercises: [{ id: 'template-entry', exerciseDefinitionId: 'squat', exerciseDefinition: { name: 'Sentadilla', isActive: true }, series: '4', repetitions: '10' }] }] }] }); }),
    http.post('http://localhost:3000/api/sala/routines', async ({ request }) => { expect(request.headers.get('x-csrf-token')).toBe('csrf'); writes.push(await request.json()); return reject ? HttpResponse.json({ code: 'SALA_EXERCISE_INVALID', message: 'Ejercicio retirado' }, { status: 400 }) : HttpResponse.json({ data: {} }); }),
  );
  renderWorkspace(); await screen.findByText('Día de fuerza'); fireEvent.click(screen.getByRole('button', { name: 'Usar preestablecida' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Preestablecida' }));
  expect(screen.queryByRole('button', { name: 'Guardar rutina' })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Asignar rutina' }));
  if (reject) { expect(await screen.findByRole('alert')).toHaveTextContent('Ejercicio retirado'); expect(screen.queryByText('Rutina asignada correctamente.')).not.toBeInTheDocument(); expect(reads()).toBe(1); }
  else { await screen.findByText('Rutina asignada correctamente.'); await waitFor(() => expect(reads()).toBe(2)); }
  expect(templateReads).toBe(1); expect(writes).toEqual([{ personId, salaParticipationId: 'participation', days: [{ name: 'Modelo', exercises: [{ exerciseDefinitionId: 'squat', series: '4', repetitions: '10', duration: null, load: null, rest: null, notes: null }] }] }]);
});

it('integrates pure Professor student detail into Alumnos without the administrative Person link', async () => {
  renderWorkspace();
  await screen.findByText('Participación activa');
  const breadcrumb = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
  expect(breadcrumb.getByRole('link', { name: 'Alumnos' })).toHaveAttribute('href', '/students');
  expect(within(screen.getByRole('navigation', { name: 'Navegación principal' })).getByRole('link', { name: 'Alumnos' })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('link', { name: 'Ver ficha de Persona' })).not.toBeInTheDocument();
});
it('preserves Sala and the Person link for other roles', async () => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'admin', firstName: 'Admin', lastName: 'Sintético' }, roles: ['ADMINISTRATIVE'], permissions: ['PEOPLE_READ', 'SALA_RELATION_READ', 'SALA_AGENDA_MANAGE'], csrfToken: 'csrf', mustChangePassword: false } })));
  renderWorkspace();
  await screen.findByText('Participación activa');
  expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Sala' })).toHaveAttribute('href', '/sala');
  expect(screen.getByRole('link', { name: 'Ver ficha de Persona' })).toHaveAttribute('href', `/people/${personId}`);
});

const professorPermissions = ['SALA_RELATION_READ', 'SALA_AGENDA_MANAGE', 'SALA_ROUTINE_READ', 'SALA_ROUTINE_MANAGE', 'SALA_PHYSICAL_EVALUATION_READ', 'SALA_PHYSICAL_EVALUATION_MANAGE', 'SALA_PAYMENT_READ', 'SALA_PAYMENT_MANAGE', 'SALA_CLINICAL_INDICATION_READ'];
const dashboardDate = new Date('2026-10-14T01:30:00Z'); // Still October 13 in Argentina.
function dashboardHandlers() {
  navigation.tab = 'summary';
  vi.setSystemTime(dashboardDate);
  routineSession(professorPermissions);
  server.use(
    http.get(`http://localhost:3000/api/sala/participations/person/${personId}`, () => HttpResponse.json({ data: [{ id: 'participation', plan: { id: 'plan', name: 'Plan Base', monthlyAmount: '25000' }, mainProfessor: { firstName: 'Profesor', lastName: 'Demo' } }] })),
    http.get(`http://localhost:3000/api/sala/people/${personId}/routines`, () => HttpResponse.json({ data: [workspaceRoutine] })),
    http.get(`http://localhost:3000/api/sala/people/${personId}/physical-evaluations`, () => HttpResponse.json({ data: [{ id: 'old', evaluationDate: '2026-09-30' }, { id: 'latest', evaluationDate: '2026-10-02' }] })),
    http.get(`http://localhost:3000/api/sala/people/${personId}/payments`, () => HttpResponse.json({ data: [] })),
    http.get(`http://localhost:3000/api/sala/people/${personId}/clinical-indications`, () => HttpResponse.json({ data: [] })),
  );
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('shows the Professor header, exact tabs and four explicit dashboard actions', async () => {
  dashboardHandlers(); renderWorkspace();
  expect(await screen.findByRole('heading', { name: 'Alumno Sintético' })).toBeInTheDocument();
  expect(await screen.findByText('Plan Base · Profesor principal: Profesor Demo')).toBeInTheDocument();
  expect(screen.getByText('DNI 12345678')).toBeInTheDocument();
  expect(screen.getByText('Participación activa')).toBeInTheDocument();
  expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Alumnos' })).toHaveAttribute('href', '/students');
  const tabs = within(screen.getByRole('navigation', { name: 'Secciones del alumno en Sala' }));
  expect(tabs.getAllByRole('link').map(link => link.textContent)).toEqual(['Resumen', 'Rutina', 'Evaluaciones', 'Turnos', 'Pagos']);
  expect(await screen.findByText('Activa')).toBeInTheDocument();
  expect(screen.getByText('1 día')).toBeInTheDocument();
  expect(await screen.findByText('Última: 02/10/2026')).toBeInTheDocument();
  expect(await screen.findByText('Pago pendiente')).toBeInTheDocument();
  for (const [label, tab] of [['Ver / editar rutina', 'routine'], ['Gestionar turnos', 'turns'], ['Ver evaluaciones', 'evaluations'], ['Gestionar pagos', 'payments']] as const) {
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', `/sala/people/${personId}?tab=${tab}`);
  }
  expect(screen.queryByLabelText('Mes/Año')).not.toBeInTheDocument();
  expect(screen.queryByText('Workspace Sala')).not.toBeInTheDocument();
});
it('shows empty routine/evaluation states with creation actions and no upcoming reservations', async () => {
  dashboardHandlers();
  server.use(
    http.get(`http://localhost:3000/api/sala/people/${personId}/routines`, () => HttpResponse.json({ data: [{ ...workspaceRoutine, status: 'HISTORICAL' }] })),
    http.get(`http://localhost:3000/api/sala/people/${personId}/physical-evaluations`, () => HttpResponse.json({ data: [] })),
  );
  renderWorkspace();
  expect(await screen.findByText('Sin rutina activa')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Crear rutina' })).toBeInTheDocument();
  expect(await screen.findByText('Sin evaluaciones')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Crear evaluación' })).toBeInTheDocument();
  expect(await screen.findByText('Sin turno fijo')).toBeInTheDocument();
  expect(await screen.findByText('Sin reservas próximas')).toBeInTheDocument();
});
it('finds the next non-cancelled future reservation from an unordered list using Argentina today', async () => {
  dashboardHandlers();
  server.use(
    http.get(`http://localhost:3000/api/sala/people/${personId}/fixed-bookings`, () => HttpResponse.json({ data: [{ id: 'fixed', startDate: '2026-10-01', startTime: '18:00', scheduleSlot: { id: 'slot', weekday: 'MONDAY', startTime: '18:00' } }] })),
    http.get(`http://localhost:3000/api/sala/people/${personId}/reservations`, () => HttpResponse.json({ data: [
      { id: 'past', date: '2026-10-12', scheduleSlot: { startTime: '19:00' } },
      { id: 'later', date: '2026-10-16', scheduleSlot: { startTime: '19:00' } },
      { id: 'cancelled', date: '2026-10-13', cancelledAt: '2026-10-12', scheduleSlot: { startTime: '09:00' } },
      { id: 'today-later', date: '2026-10-13', startTime: '1970-01-01T19:00:00.000Z', scheduleSlot: { startTime: '18:00' } },
      { id: 'today', date: '2026-10-13', startTime: '1970-01-01T18:30:00.000Z', scheduleSlot: { startTime: '18:00' } },
    ] })),
  );
  renderWorkspace();
  expect(await screen.findByText('Lunes · 18:00')).toBeInTheDocument();
  expect(await screen.findByText('Próxima reserva')).toBeInTheDocument();
  expect(screen.getByText('13/10/2026 · 18:30')).toBeInTheDocument();
  expect(screen.queryByText('12/10/2026 · 19:00')).not.toBeInTheDocument();
});
it.each([null, { id: 'reversal' }])('shows current-month payment only when not reversed (reversal=%s)', async reversal => {
  dashboardHandlers();
  server.use(http.get(`http://localhost:3000/api/sala/people/${personId}/payments`, () => HttpResponse.json({ data: [
    { id: 'current', year: 2026, month: 10, reversal }, { id: 'other-year', year: 2025, month: 10 }, { id: 'other-month', year: 2026, month: 9 },
  ] })));
  renderWorkspace();
  expect(await screen.findByText(reversal ? 'Pago pendiente' : 'Al día')).toBeInTheDocument();
  expect(screen.getByText('octubre 2026')).toBeInTheDocument();
});
it('keeps dashboard queries independent on HTTP errors and does not turn failures into empty states', async () => {
  dashboardHandlers();
  server.use(
    http.get(`http://localhost:3000/api/sala/people/${personId}/physical-evaluations`, () => HttpResponse.json({ message: 'private error' }, { status: 500 })),
    http.get(`http://localhost:3000/api/sala/people/${personId}/clinical-indications`, () => HttpResponse.json({ message: 'private clinical error' }, { status: 403 })),
  );
  renderWorkspace();
  expect(await screen.findByText('Activa')).toBeInTheDocument();
  expect(await screen.findByText('Pago pendiente')).toBeInTheDocument();
  await waitFor(() => expect(screen.getAllByText('No pudimos cargar esta información.')).toHaveLength(2));
  expect(screen.queryByText('Sin evaluaciones')).not.toBeInTheDocument();
  expect(screen.queryByText('Sin indicaciones especiales para entrenar.')).not.toBeInTheDocument();
  expect(screen.queryByText(/private/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ver evaluaciones' })).toBeInTheDocument();
});
it('shows safe clinical indications individually in priority order without extra clinical fields', async () => {
  dashboardHandlers();
  server.use(http.get(`http://localhost:3000/api/sala/people/${personId}/clinical-indications`, () => HttpResponse.json({ data: [
    { id: 'clear', trainingCondition: 'NO_RESTRICTIONS', lastUpdate: '2026-10-13T01:00:00Z' },
    { id: 'restricted', trainingCondition: 'RESTRICTED', affectedArea: 'Rodilla derecha', instructions: 'Evitar impacto y flexión profunda.', lastUpdate: '2026-10-13T01:00:00Z', responsibleProfessional: { firstName: 'Profesional', lastName: 'Demo' }, diagnosis: 'Diagnóstico privado', treatment: { objective: 'Objetivo clínico privado' }, evolution: 'Evolución privada', studies: 'Estudios privados' },
    { id: 'stop', trainingCondition: 'DO_NOT_TRAIN', lastUpdate: '2026-10-13T01:00:00Z' },
  ] })));
  renderWorkspace();
  expect(await screen.findByText('Con restricciones')).toBeInTheDocument();
  expect(screen.getByText('Rodilla derecha')).toBeInTheDocument();
  expect(screen.getByText('Evitar impacto y flexión profunda.')).toBeInTheDocument();
  expect(screen.getByText('Profesional: Profesional Demo')).toBeInTheDocument();
  const indications = within(screen.getByRole('heading', { name: 'Indicaciones para entrenar' }).closest('section')!);
  expect(indications.getAllByRole('heading', { level: 4 }).map(item => item.textContent)).toEqual(['No entrenar', 'Con restricciones', 'Sin restricciones']);
  expect(indications.getAllByText('Actualizado 12/10/2026')).toHaveLength(3);
  for (const text of ['Diagnóstico privado', 'Objetivo clínico privado', 'Evolución privada', 'Estudios privados']) expect(screen.queryByText(text)).not.toBeInTheDocument();
});
it('explicitly confirms no special training indications', async () => {
  dashboardHandlers(); renderWorkspace();
  expect(await screen.findByText('Sin indicaciones especiales para entrenar.')).toBeInTheDocument();
});
it('does not request or display clinical indications without the permission', async () => {
  dashboardHandlers(); routineSession(professorPermissions.filter(permission => permission !== 'SALA_CLINICAL_INDICATION_READ'));
  let reads = 0;
  server.use(http.get(`http://localhost:3000/api/sala/people/${personId}/clinical-indications`, () => { reads++; return HttpResponse.json({ data: [] }); }));
  renderWorkspace(); await screen.findByText('Activa');
  expect(screen.queryByText('Indicaciones para entrenar')).not.toBeInTheDocument(); expect(reads).toBe(0);
});
it.each(['turns', 'reservations', 'fixed'])('combines both existing booking sections for pure Professor URL %s without duplicating forms', async tab => {
  navigation.tab = tab; renderWorkspace();
  expect(await screen.findByRole('heading', { name: 'Nueva reserva puntual' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Reservas de la Persona' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Turno fijo' })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Crear reserva' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Crear turno fijo' })).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Turnos' })).toHaveAttribute('aria-current', 'page');
});
it('preserves full Professor multi-month payment registration and reversal in Pagos', async () => {
  dashboardHandlers(); navigation.tab = 'payments';
  let rows = [{ id: 'payment', year: 2026, month: 9, paidAt: '2026-09-01', amount: '25000', paymentMethod: { name: 'Efectivo' }, reversal: null as { id: string } | null }];
  const registered: unknown[] = []; const reversed: unknown[] = [];
  server.use(
    http.get(`http://localhost:3000/api/sala/people/${personId}/payments`, () => HttpResponse.json({ data: rows })),
    http.get('http://localhost:3000/api/finance/payment-methods', () => HttpResponse.json({ data: [{ id: 'cash', name: 'Efectivo', isSelectable: true }] })),
    http.post('http://localhost:3000/api/sala/payments/plan-months', async ({ request }) => { registered.push(await request.json()); expect(request.headers.get('x-csrf-token')).toBe('csrf'); return HttpResponse.json({ data: {} }, { status: 201 }); }),
    http.post('http://localhost:3000/api/sala/payments/payment/reverse', async ({ request }) => { reversed.push(await request.json()); rows = rows.map(row => ({ ...row, reversal: { id: 'reversal' } })); return HttpResponse.json({ data: {} }); }),
  );
  renderWorkspace();
  await screen.findByLabelText('Mes/Año');
  await screen.findByRole('option', { name: 'Efectivo' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar mes' })).toBeEnabled());
  for (const month of ['2026-10', '2026-11']) { fireEvent.change(screen.getByLabelText('Mes/Año'), { target: { value: month } }); fireEvent.click(screen.getByRole('button', { name: 'Agregar mes' })); }
  fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'cash' } });
  fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
  expect(await screen.findByText('Pagos registrados correctamente.')).toBeInTheDocument();
  expect(registered).toEqual([expect.objectContaining({ personId, paymentMethodId: 'cash', periods: [expect.objectContaining({ year: 2026, month: 10, operationId: expect.any(String) }), expect.objectContaining({ year: 2026, month: 11, operationId: expect.any(String) })] })]);
  fireEvent.click(screen.getByRole('button', { name: 'Revertir' }));
  fireEvent.click(screen.getByRole('button', { name: 'Revertir pago' }));
  await waitFor(() => expect(reversed).toEqual([expect.objectContaining({ reason: 'Corrección de pago', operationId: expect.any(String) })]));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Revertir' })).not.toBeInTheDocument());
});

it('shows the header and other cards while a dashboard query is still loading', async () => {
  dashboardHandlers();
  let finishRequest!: () => void;
  const pending = new Promise<void>(resolve => { finishRequest = resolve; });
  server.use(http.get(`http://localhost:3000/api/sala/people/${personId}/physical-evaluations`, async () => { await pending; return HttpResponse.json({ data: [] }); }));
  renderWorkspace();
  expect(await screen.findByText('Plan Base · Profesor principal: Profesor Demo')).toBeInTheDocument();
  expect(await screen.findByText('Activa')).toBeInTheDocument();
  expect(await screen.findByText('Pago pendiente')).toBeInTheDocument();
  expect(screen.getByText('Cargando…')).toBeInTheDocument();
  finishRequest();
  expect(await screen.findByText('Sin evaluaciones')).toBeInTheDocument();
});
it('keeps consultation available without offering routine/evaluation creation for inactive participation', async () => {
  dashboardHandlers();
  server.use(http.get(`http://localhost:3000/api/sala/participations/person/${personId}`, () => HttpResponse.json({ data: [] })));
  renderWorkspace();
  await screen.findByText('Pago pendiente');
  expect(screen.getAllByText('Sin participación activa')).toHaveLength(2);
  expect(screen.queryByRole('link', { name: 'Crear rutina' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Crear evaluación' })).not.toBeInTheDocument();
});
it('reuses the panel cache keys and updates the dashboard after payment invalidation', async () => {
  dashboardHandlers();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><SalaPersonWorkspace personId={personId}/></QueryClientProvider>);
  await screen.findByText('Pago pendiente'); await screen.findByText('Última: 02/10/2026'); await screen.findByText('Activa');
  expect(client.getQueryData(['sala-routines', personId])).toEqual([workspaceRoutine]);
  expect(client.getQueryData(['sala', 'physical-evaluations', personId])).toHaveLength(2);
  expect(client.getQueryData(['sala', 'payments', personId])).toEqual([]);
  server.use(http.get(`http://localhost:3000/api/sala/people/${personId}/payments`, () => HttpResponse.json({ data: [{ id: 'paid', year: 2026, month: 10, reversal: null }] })));
  await client.invalidateQueries({ queryKey: ['sala', 'payments', personId] });
  expect(await screen.findByText('Al día')).toBeInTheDocument();
});
it.each([['ADMINISTRATIVE'], ['GENERAL_ADMIN'], ['KINESIOLOGIST'], ['OSTEOPATH'], ['PROFESSOR', 'KINESIOLOGIST']])('preserves the existing sections for roles %s', async (...roles) => {
  navigation.tab = 'summary';
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'staff', firstName: 'Staff', lastName: 'Demo' }, roles, permissions: ['SALA_RELATION_READ', 'SALA_ROUTINE_READ', 'SALA_PAYMENT_READ', 'SALA_PAYMENT_MANAGE'], csrfToken: 'csrf', mustChangePassword: false } })),
    http.get(`http://localhost:3000/api/sala/people/${personId}/payments`, () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/finance/payment-methods', () => HttpResponse.json({ data: [] })),
  );
  renderWorkspace(); await screen.findByText('Workspace Sala');
  const tabs = within(screen.getByRole('navigation', { name: 'Secciones del alumno en Sala' }));
  expect(tabs.getAllByRole('link').map(link => link.textContent)).toEqual(['Resumen', 'Reservas', 'Turno fijo', 'Rutina', 'Evaluaciones físicas']);
  expect(await screen.findByRole('heading', { name: 'Pagos de Sala' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ver ficha de Persona' })).toBeInTheDocument();
});
