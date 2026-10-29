import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { ExerciseCatalogManager } from './exercise-catalog-manager';
import type { ExerciseDefinition } from './routine-editor';

const base = 'http://localhost:3000/api/sala/exercise-definitions';
const squat: ExerciseDefinition = { id: 'squat', name: 'Sentadilla búlgara', primaryMuscle: 'Cuádriceps', description: 'Fuerza unilateral para fútbol y hockey.', isActive: true };
const plank: ExerciseDefinition = { id: 'plank', name: 'Plancha', primaryMuscle: null, description: null, isActive: true };
const server = setupServer();
const nativeFetch = globalThis.fetch;
let definitions: ExerciseDefinition[];
let writes: Array<{ method: string; id?: string; body: unknown; csrf: string | null }>;

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  definitions = [squat, plank, { ...squat, id: 'retired', name: 'Retirado', isActive: false }]; writes = [];
  server.use(
    http.get('http://localhost:3000/api/sala/movement-patterns', () => HttpResponse.json({ data: [{ id: 'pattern', name: 'Empuje' }] })),
    http.get(base, () => HttpResponse.json({ data: definitions })),
    http.post(base, async ({ request }) => {
      const body = await request.json() as { name: string; primaryMuscle: string; description: string };
      writes.push({ method: 'POST', body, csrf: request.headers.get('x-csrf-token') });
      const created = { ...body, id: 'new', isActive: true }; definitions = [...definitions, created];
      return HttpResponse.json({ data: created }, { status: 201 });
    }),
    http.patch(`${base}/:id`, async ({ params, request }) => {
      const body = await request.json() as { name: string; primaryMuscle: string; description: string };
      writes.push({ method: 'PATCH', id: String(params.id), body, csrf: request.headers.get('x-csrf-token') });
      definitions = definitions.map(item => item.id === params.id ? { ...item, ...body } : item);
      return HttpResponse.json({ data: definitions.find(item => item.id === params.id) });
    }),
    http.post(`${base}/:id/retire`, async ({ params, request }) => {
      const body = await request.json(); writes.push({ method: 'POST', id: String(params.id), body, csrf: request.headers.get('x-csrf-token') });
      definitions = definitions.map(item => item.id === params.id ? { ...item, isActive: false } : item);
      return HttpResponse.json({ data: {} });
    }),
  );
});
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

function renderCatalog(canManage = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(<QueryClientProvider client={client}><ExerciseCatalogManager csrfToken="synthetic-csrf" canManage={canManage} /></QueryClientProvider>);
  return { client, invalidate };
}
function exerciseRow(name = squat.name) { return screen.getByRole('heading', { name }).closest('li')!; }
function startNew() { fireEvent.click(screen.getByRole('button', { name: '+ Nuevo ejercicio' })); }
async function fill(name = 'Remo', primaryMuscle = 'Espalda', description = 'Con banda') {
  await screen.findByRole('option', { name: 'Empuje' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Patrón de movimiento' }), { target: { value: 'pattern' } });
  fireEvent.change(screen.getByRole('textbox', { name: /Nombre/ }), { target: { value: name } });
  fireEvent.change(screen.getByRole('textbox', { name: /Músculo principal/ }), { target: { value: primaryMuscle } });
  fireEvent.change(screen.getByRole('textbox', { name: /Descripción/ }), { target: { value: description } });
}
function expectRefreshed(invalidate: ReturnType<typeof renderCatalog>['invalidate']) {
  for (const key of ['sala-exercise-definitions', 'sala-routine-templates', 'sala-routines']) expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
}

it('lists active exercises alphabetically, omits empty optional fields and uses the shared search', async () => {
  renderCatalog(); await screen.findByRole('heading', { name: squat.name });
  expect(within(screen.getByRole('list', { name: 'Ejercicios disponibles' })).getAllByRole('listitem').map(item => within(item).getByRole('heading').textContent)).toEqual(['Plancha', squat.name]);
  expect(exerciseRow('Plancha')).not.toHaveTextContent(' · ');
  expect(within(exerciseRow('Plancha')).queryByText(/opcional|Sin músculo|Sin descripción/)).not.toBeInTheDocument();
  expect(screen.queryByText(squat.description!)).not.toBeInTheDocument(); expect(screen.queryByText('Retirado')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'BULGARA futbol' } });
  expect(screen.getByRole('heading', { name: squat.name })).toBeVisible(); expect(screen.queryByRole('heading', { name: 'Plancha' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'tenis' } });
  expect(screen.getByText('No hay ejercicios que coincidan.')).toBeVisible();
});

it('creates a name-only exercise through the generated client, closes its form and refreshes catalog and routines', async () => {
  const { invalidate } = renderCatalog(); startNew(); await fill('  Remo  ', '', '');
  fireEvent.click(screen.getByRole('button', { name: 'Crear ejercicio' }));
  expect(await screen.findByText('Ejercicio creado correctamente.')).toBeVisible();
  expect(await screen.findByRole('heading', { name: 'Remo' })).toBeVisible();
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
  expect(writes).toEqual([{ method: 'POST', body: { name: 'Remo', primaryMuscle: '', description: '', movementPatternId: 'pattern' }, csrf: 'synthetic-csrf' }]);
  expectRefreshed(invalidate);
});

it.each([
  ['', 'Espalda', '', 'El Nombre es obligatorio.'],
  ['a'.repeat(121), '', '', 'El Nombre admite hasta 120 caracteres.'],
  ['Remo', 'a'.repeat(121), '', 'El Músculo principal admite hasta 120 caracteres.'],
  ['Remo', '', 'a'.repeat(501), 'La Descripción admite hasta 500 caracteres.'],
])('validates required name and DTO lengths before writing (%s)', async (name, muscle, description, message) => {
  renderCatalog(); startNew(); await fill(name, muscle, description);
  fireEvent.click(screen.getByRole('button', { name: 'Crear ejercicio' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(message); expect(writes).toEqual([]);
});

it('allows all fields at their maximum length', async () => {
  renderCatalog(); startNew(); await fill('n'.repeat(120), 'm'.repeat(120), 'd'.repeat(500));
  fireEvent.click(screen.getByRole('button', { name: 'Crear ejercicio' }));
  expect(await screen.findByText('Ejercicio creado correctamente.')).toBeVisible(); expect(writes).toHaveLength(1);
});

it('blocks repeated submissions while creation is pending', async () => {
  let release!: () => void;
  server.use(http.post(base, async ({ request }) => {
    writes.push({ method: 'POST', body: await request.json(), csrf: request.headers.get('x-csrf-token') });
    await new Promise<void>(resolve => { release = resolve; });
    return HttpResponse.json({ data: { ...plank, id: 'new', name: 'Remo' } }, { status: 201 });
  }));
  renderCatalog(); startNew(); await fill(); const form = screen.getByRole('form');
  fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  release(); await screen.findByText('Ejercicio creado correctamente.');
});

it('edits all fields on the existing definition without creating a new exercise', async () => {
  const { invalidate } = renderCatalog(); await screen.findByRole('heading', { name: squat.name });
  fireEvent.click(within(exerciseRow()).getByRole('button', { name: 'Editar' }));
  expect(screen.getByRole('textbox', { name: /Nombre/ })).toHaveValue(squat.name);
  expect(screen.getByRole('textbox', { name: /Músculo/ })).toHaveValue(squat.primaryMuscle);
  expect(screen.getByRole('textbox', { name: /Descripción/ })).toHaveValue(squat.description);
  await fill('Sentadilla actualizada', '', 'Estabilidad para hockey');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await screen.findByText('Ejercicio actualizado correctamente.');
  expect(await screen.findByRole('heading', { name: 'Sentadilla actualizada' })).toBeVisible();
  expect(screen.queryByText('Estabilidad para hockey')).not.toBeInTheDocument();
  expect(writes).toEqual([{ method: 'PATCH', id: 'squat', body: { name: 'Sentadilla actualizada', primaryMuscle: '', description: 'Estabilidad para hockey', movementPatternId: 'pattern' }, csrf: 'synthetic-csrf' }]);
  expectRefreshed(invalidate);
});

it('cancels an edit without saving and restores persisted values when reopened', async () => {
  renderCatalog(); await screen.findByRole('heading', { name: squat.name });
  fireEvent.click(within(exerciseRow()).getByRole('button', { name: 'Editar' })); await fill();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(writes).toEqual([]); expect(screen.queryByRole('form')).not.toBeInTheDocument();
  fireEvent.click(within(exerciseRow()).getByRole('button', { name: 'Editar' }));
  expect(screen.getByRole('textbox', { name: /Nombre/ })).toHaveValue(squat.name);
});

it.each(['create', 'update'])('preserves input and shows backend conflicts without false success (%s)', async operation => {
  const handler = operation === 'create' ? http.post(base, () => HttpResponse.json({ code: 'SALA_EXERCISE_DUPLICATE', message: 'Exercise already exists' }, { status: 409 })) : http.patch(`${base}/:id`, () => HttpResponse.json({ message: 'No se pudo guardar el ejercicio.' }, { status: 500 }));
  server.use(handler); const { invalidate } = renderCatalog(); await screen.findByRole('heading', { name: squat.name });
  if (operation === 'create') startNew(); else fireEvent.click(within(exerciseRow()).getByRole('button', { name: 'Editar' }));
  await fill(); fireEvent.click(screen.getByRole('button', { name: operation === 'create' ? 'Crear ejercicio' : 'Guardar cambios' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(operation === 'create' ? 'Ya existe un ejercicio con ese nombre.' : 'No se pudo guardar el ejercicio.');
  expect(screen.getByRole('textbox', { name: /Nombre/ })).toHaveValue('Remo');
  expect(screen.getByRole('textbox', { name: /Músculo/ })).toHaveValue('Espalda');
  expect(screen.getByRole('textbox', { name: /Descripción/ })).toHaveValue('Con banda');
  expect(screen.queryByText(/correctamente/)).not.toBeInTheDocument(); expect(invalidate).not.toHaveBeenCalled();
});

it.each([false, true])('requires explicit retirement confirmation for affected active routines (confirm=%s)', async confirm => {
  server.use(http.post(`${base}/:id/retire`, async ({ params, request }) => {
    const body = await request.json() as { confirmActiveRoutineImpact: boolean };
    writes.push({ method: 'POST', id: String(params.id), body, csrf: request.headers.get('x-csrf-token') });
    if (!body.confirmActiveRoutineImpact) return HttpResponse.json({ code: 'SALA_EXERCISE_RETIRE_CONFIRMATION_REQUIRED', details: { activeRoutines: 2 } }, { status: 409 });
    definitions = definitions.filter(item => item.id !== params.id); return HttpResponse.json({ data: {} });
  }));
  const { invalidate } = renderCatalog(); await screen.findByRole('heading', { name: squat.name });
  fireEvent.click(within(exerciseRow()).getByRole('button', { name: 'Retirar' }));
  const dialog = await screen.findByRole('alertdialog', { name: 'Confirmar retiro' });
  expect(dialog).toHaveTextContent('2 Rutinas activas'); expect(dialog).toHaveTextContent('Las Rutinas históricas no se modificarán.');
  expect(screen.queryByText('Ejercicio retirado correctamente.')).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: confirm ? 'Confirmar retiro' : 'Cancelar retiro' }));
  if (confirm) {
    await screen.findByText('Ejercicio retirado correctamente.');
    await waitFor(() => expect(screen.queryByRole('heading', { name: squat.name })).not.toBeInTheDocument());
    expectRefreshed(invalidate);
  } else { expect(writes).toHaveLength(1); expect(invalidate).not.toHaveBeenCalled(); expect(screen.getByRole('heading', { name: squat.name })).toBeVisible(); }
  expect(writes.map(write => write.body)).toEqual(confirm ? [{ confirmActiveRoutineImpact: false }, { confirmActiveRoutineImpact: true }] : [{ confirmActiveRoutineImpact: false }]);
});

it('retires immediately when no active routine is affected', async () => {
  const { invalidate } = renderCatalog(); await screen.findByRole('heading', { name: squat.name });
  fireEvent.click(within(exerciseRow()).getByRole('button', { name: 'Retirar' }));
  await screen.findByText('Ejercicio retirado correctamente.');
  await waitFor(() => expect(screen.queryByRole('heading', { name: squat.name })).not.toBeInTheDocument());
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(); expectRefreshed(invalidate);
});

it('shows retirement errors without claiming success or hiding the exercise', async () => {
  server.use(http.post(`${base}/:id/retire`, () => HttpResponse.json({ message: 'No se pudo retirar el ejercicio.' }, { status: 500 })));
  const { invalidate } = renderCatalog(); await screen.findByRole('heading', { name: squat.name });
  fireEvent.click(within(exerciseRow()).getByRole('button', { name: 'Retirar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo retirar el ejercicio.');
  expect(screen.getByRole('heading', { name: squat.name })).toBeVisible(); expect(invalidate).not.toHaveBeenCalled();
});

it('supports read-only catalog access without administration actions', async () => {
  renderCatalog(false); await screen.findByRole('heading', { name: squat.name });
  expect(screen.getByRole('searchbox')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Nuevo ejercicio|Editar|Retirar/ })).not.toBeInTheDocument();
});

it('shows localized loading and catalog read errors', async () => {
  server.use(http.get(base, () => HttpResponse.json({ message: 'No se pudo cargar el catálogo.' }, { status: 500 })));
  renderCatalog(); expect(screen.getByText('Cargando catálogo de ejercicios…')).toBeVisible();
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el catálogo.');
});

it('creates a pattern with zero exercises, selects it and renames it without losing its association', async () => {
  let patterns = [{ id: 'pattern', name: 'Empuje' }];
  server.use(
    http.get('http://localhost:3000/api/sala/movement-patterns', () => HttpResponse.json({ data: patterns })),
    http.post('http://localhost:3000/api/sala/movement-patterns', async ({ request }) => {
      const body = await request.json() as { name: string };
      patterns = [...patterns, { id: 'new-pattern', name: body.name }];
      return HttpResponse.json({ data: patterns[1] }, { status: 201 });
    }),
    http.patch('http://localhost:3000/api/sala/movement-patterns/:id', async ({ request, params }) => {
      const body = await request.json() as { name: string };
      patterns = patterns.map(item => item.id === params.id ? { ...item, name: body.name } : item);
      return HttpResponse.json({ data: patterns.find(item => item.id === params.id) });
    }),
  );
  renderCatalog(); await screen.findByRole('heading', { name: squat.name });
  fireEvent.click(screen.getByRole('button', { name: '+ Nuevo patrón' }));
  fireEvent.change(screen.getByLabelText('Nombre del patrón'), { target: { value: 'Tracción' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByRole('heading', { name: 'Tracción' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Tracción 0' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Renombrar patrón' }));
  fireEvent.change(screen.getByLabelText('Nombre del patrón'), { target: { value: 'Tracción superior' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByRole('heading', { name: 'Tracción superior' })).toBeVisible();
});

it('paginates hundreds of active exercises and combines pattern and text filters', async () => {
  definitions = Array.from({ length: 125 }, (_, index) => ({ id: String(index), name: 'Ejercicio ' + String(index).padStart(3, '0'), isActive: true, movementPatternId: index < 110 ? 'pattern' : null }));
  renderCatalog(); await screen.findByText('125 resultados');
  const list = () => within(screen.getByRole('list', { name: 'Ejercicios disponibles' }));
  expect(list().getAllByRole('listitem')).toHaveLength(20);
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  expect(screen.getByText('Página 2 de 7')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Empuje 110' }));
  expect(screen.getByText('Página 1 de 6')).toBeVisible();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Ejercicio 00' } });
  expect(screen.getByText('11 resultados')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Sin patrón 15' }));
  expect(screen.getByText('0 resultados')).toBeVisible();
});
