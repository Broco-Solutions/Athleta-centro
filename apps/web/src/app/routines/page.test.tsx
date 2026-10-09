import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { RoutineTemplateDto } from '@athleta/api-client';
import RoutinesPage from './page';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const base = 'http://localhost:3000/api';
const session = { user: { id: 'professor', firstName: 'Profe', lastName: 'Sintético', email: 'professor@test.local' }, roles: ['PROFESSOR'], permissions: ['SALA_ROUTINE_MANAGE', 'SALA_ROUTINE_READ'], mustChangePassword: false, csrfToken: 'csrf' };
const exercise = { id: 'squat', name: 'Sentadilla', primaryMuscle: 'Piernas', isActive: true };
const template = { id: 'template', name: 'Fuerza general', days: [
  { id: 'day-1', position: 1, name: 'Piernas', exercises: [{ id: 'entry-1', position: 1, exerciseDefinitionId: exercise.id, exerciseDefinition: exercise, series: '3', repetitions: '10' }] },
  { id: 'day-2', position: 2, name: 'Movilidad', exercises: [] },
] };
let reads: number;
let catalogReads: number;
let rows: typeof template[];

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  reads = 0; catalogReads = 0; rows = [template];
  server.use(
    http.get(`${base}/auth/session`, () => HttpResponse.json({ data: session })),
    http.get(`${base}/sala/routine-templates`, () => { reads++; return HttpResponse.json({ data: rows }); }),
    http.get(`${base}/sala/exercise-definitions`, () => { catalogReads++; return HttpResponse.json({ data: [exercise] }); }),
  );
});
afterEach(() => { cleanup(); server.resetHandlers(); vi.restoreAllMocks(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

function renderPage(): void {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><RoutinesPage /></QueryClientProvider>);
}
async function openNew(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Nueva rutina' }));
  await screen.findByRole('option', { name: 'Sentadilla · Piernas' });
}
function nameRoutine(name = '  Nueva fuerza  '): void { fireEvent.change(screen.getByLabelText('Nombre de la rutina'), { target: { value: name } }); }
function assertContentOnly(input: RoutineTemplateDto): void {
  expect(Object.keys(input).sort()).toEqual(['days', 'name']);
  for (const day of input.days) {
    expect(day).not.toHaveProperty('id'); expect(day).not.toHaveProperty('position');
    for (const entry of day.exercises) { expect(entry).not.toHaveProperty('id'); expect(entry).not.toHaveProperty('position'); }
  }
}

it('lists names, ordered days and exercises and activates Rutinas in WorkspaceShell', async () => {
  renderPage();
  expect(await screen.findByRole('heading', { name: 'Fuerza general' })).toBeVisible();
  expect(reads).toBe(1);
  const card = screen.getByRole('heading', { name: 'Fuerza general' }).closest('article')!;
  expect(within(card).getByText('Piernas').compareDocumentPosition(within(card).getByText('Movilidad')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(card).getByText('Sentadilla · 3 series · 10 rep.')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Rutinas' })).toHaveAttribute('href', '/routines');
  expect(screen.getByRole('link', { name: 'Rutinas' })).toHaveAttribute('aria-current', 'page');
  expect(catalogReads).toBe(0);
});

it('opens the shared editor with one initial day and keeps at least one day', async () => {
  renderPage(); await openNew();
  expect(screen.getByLabelText('Nombre de la rutina')).toHaveValue('');
  expect(screen.getByLabelText('Nombre de la rutina')).toHaveAttribute('maxlength', '120');
  expect(screen.getByLabelText('Nombre del día 1')).toHaveValue('Día 1');
  expect(screen.getByRole('button', { name: 'Quitar día' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Agregar día' }));
  expect(screen.getByLabelText('Nombre del día 2')).toHaveValue('Día 2');
  fireEvent.click(within(screen.getByRole('group', { name: 'Día 2' })).getByRole('button', { name: 'Quitar día' }));
  expect(screen.queryByRole('group', { name: 'Día 2' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByLabelText('Nombre de la rutina')).not.toBeInTheDocument();
});

it('creates a trimmed RoutineTemplateDto with content only and refreshes the list', async () => {
  let posted: RoutineTemplateDto | undefined;
  let csrf: string | null = null;
  server.use(http.post(`${base}/sala/routine-templates`, async ({ request }) => {
    posted = await request.json() as RoutineTemplateDto; csrf = request.headers.get('x-csrf-token');
    rows = [{ ...template, name: posted.name }]; return HttpResponse.json({ data: rows[0] }, { status: 201 });
  }));
  renderPage(); await openNew(); nameRoutine();
  fireEvent.change(screen.getByLabelText('Ejercicio'), { target: { value: exercise.id } });
  fireEvent.change(screen.getByLabelText('Series'), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Agregar a la rutina' }));
  await screen.findByText('Sentadilla · 4 series');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('Rutina preestablecida creada correctamente.')).toBeVisible();
  expect(posted).toEqual({ name: 'Nueva fuerza', days: [{ name: 'Día 1', exercises: [{ exerciseDefinitionId: 'squat', series: '4', repetitions: null, duration: null, load: null, rest: null, notes: null }] }] });
  assertContentOnly(posted!); expect(csrf).toBe('csrf');
  expect(screen.queryByLabelText('Nombre de la rutina')).not.toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: 'Nueva fuerza' })).toBeVisible(); expect(reads).toBeGreaterThan(1);
});

it('preloads existing days and exercises and updates the template without persisted IDs or positions', async () => {
  let updated: RoutineTemplateDto | undefined;
  let target: string | readonly string[] | undefined;
  server.use(http.put(`${base}/sala/routine-templates/:id`, async ({ request, params }) => {
    target = params.id; updated = await request.json() as RoutineTemplateDto;
    expect(request.headers.get('x-csrf-token')).toBe('csrf');
    rows = [{ ...template, name: updated.name }]; return HttpResponse.json({ data: rows[0] });
  }));
  renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  expect(screen.getByLabelText('Nombre de la rutina')).toHaveValue('Fuerza general');
  expect(screen.getByLabelText('Nombre del día 1')).toHaveValue('Piernas');
  expect(screen.getByLabelText('Nombre del día 2')).toHaveValue('Movilidad');
  const firstDay = within(screen.getByRole('group', { name: 'Día 1' }));
  await firstDay.findByText('Sentadilla · 3 series · 10 rep.');
  nameRoutine('Fuerza actualizada'); fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('Rutina preestablecida actualizada correctamente.')).toBeVisible();
  expect(target).toBe(template.id);
  expect(updated).toEqual({ name: 'Fuerza actualizada', days: [
    { name: 'Piernas', exercises: [{ exerciseDefinitionId: 'squat', series: '3', repetitions: '10', duration: null, load: null, rest: null, notes: null }] },
    { name: 'Movilidad', exercises: [] },
  ] });
  assertContentOnly(updated!);
  expect(await screen.findByRole('heading', { name: 'Fuerza actualizada' })).toBeVisible();
});

it('confirms deletion, deletes the selected template and refreshes the list', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const deleted = vi.fn();
  server.use(http.delete(`${base}/sala/routine-templates/:id`, ({ request, params }) => {
    deleted(params.id, request.headers.get('x-csrf-token')); rows = []; return HttpResponse.json({ data: template });
  }));
  renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
  expect(await screen.findByText('Rutina preestablecida eliminada correctamente.')).toBeVisible();
  expect(confirm).toHaveBeenCalledWith('¿Eliminar esta rutina preestablecida?');
  expect(deleted).toHaveBeenCalledWith(template.id, 'csrf');
  expect(await screen.findByText('No hay rutinas preestablecidas.')).toBeVisible(); expect(reads).toBeGreaterThan(1);
});

it('does not delete when confirmation is cancelled', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  const deleted = vi.fn();
  server.use(http.delete(`${base}/sala/routine-templates/:id`, () => { deleted(); return HttpResponse.json({ data: template }); }));
  renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
  expect(deleted).not.toHaveBeenCalled(); expect(reads).toBe(1);
});

it('denies users without the permission and never queries templates or the catalog', async () => {
  server.use(http.get(`${base}/auth/session`, () => HttpResponse.json({ data: { ...session, permissions: [] } })));
  renderPage(); expect(await screen.findByText('No tenés permisos para administrar Rutinas.')).toBeVisible();
  expect(reads).toBe(0); expect(catalogReads).toBe(0); expect(screen.queryByRole('button', { name: 'Nueva rutina' })).not.toBeInTheDocument();
});

it.each(['create', 'update'])('keeps the editor and shows the backend error on failed %s', async (operation) => {
  const fail = () => HttpResponse.json({ message: 'No se pudo guardar esta rutina.' }, { status: 409 });
  server.use(http.post(`${base}/sala/routine-templates`, fail), http.put(`${base}/sala/routine-templates/:id`, fail));
  renderPage();
  if (operation === 'create') await openNew(); else fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  nameRoutine('Conservar contenido'); fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar esta rutina.');
  expect(screen.getByLabelText('Nombre de la rutina')).toHaveValue('Conservar contenido');
  expect(screen.queryByText(/correctamente/)).not.toBeInTheDocument(); expect(reads).toBe(1);
});

it('shows the fallback for a failed deletion without a backend message', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  server.use(http.delete(`${base}/sala/routine-templates/:id`, () => HttpResponse.json({}, { status: 500 })));
  renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar la operación.');
  expect(screen.queryByText(/eliminada correctamente/)).not.toBeInTheDocument(); expect(reads).toBe(1);
});

it('reports query errors instead of an empty list', async () => {
  server.use(http.get(`${base}/sala/routine-templates`, () => HttpResponse.json({ message: 'Consulta rechazada.' }, { status: 403 })));
  renderPage(); expect(await screen.findByRole('alert')).toHaveTextContent('Error al consultar. Consulta rechazada.');
  expect(screen.queryByText('No hay rutinas preestablecidas.')).not.toBeInTheDocument();
});

it('creates an exercise inline with CSRF and immediately selects it in DayEditor', async () => {
  const created = { id: 'row', name: 'Remo', primaryMuscle: 'Espalda', isActive: true };
  server.use(http.post(`${base}/sala/exercise-definitions`, async ({ request }) => {
    expect(request.headers.get('x-csrf-token')).toBe('csrf');
    expect(await request.json()).toEqual({ name: 'Remo', primaryMuscle: 'Espalda', description: '' });
    return HttpResponse.json({ data: created }, { status: 201 });
  }));
  renderPage(); await openNew(); fireEvent.click(screen.getByRole('button', { name: 'Nuevo ejercicio' }));
  fireEvent.change(screen.getByLabelText('Nombre del ejercicio'), { target: { value: 'Remo' } });
  fireEvent.change(screen.getByLabelText('Músculo principal'), { target: { value: 'Espalda' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear y seleccionar' }));
  await waitFor(() => expect(screen.getByLabelText('Ejercicio')).toHaveValue('row'));
  expect(screen.getByRole('option', { name: 'Remo · Espalda' })).toBeInTheDocument();
});

it('requires a name before sending a create request', async () => {
  const created = vi.fn();
  server.use(http.post(`${base}/sala/routine-templates`, () => { created(); return HttpResponse.json({ data: template }); }));
  renderPage(); await openNew(); nameRoutine('   '); fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('El nombre de la rutina es obligatorio'); expect(created).not.toHaveBeenCalled();
});
