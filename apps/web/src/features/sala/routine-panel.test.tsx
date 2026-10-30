import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RoutinePanel, type Routine, type RoutineApi } from './routine-panel';

const definitions = [
  { id: 'squat', name: 'Sentadilla', primaryMuscle: 'Piernas', isActive: true },
  { id: 'plank', name: 'Plancha', primaryMuscle: 'Core', isActive: true },
];
const routine: Routine = {
  id: 'routine', personId: 'person', salaParticipationId: 'participation', status: 'ACTIVE', version: 2,
  days: [
    { position: 1, name: 'Fuerza', exercises: [{ exerciseDefinitionId: 'squat', series: '4', repetitions: '10', load: '40 kg', rest: '30 s', notes: 'Controlar técnica' }] },
    { position: 2, name: 'Core', exercises: [{ exerciseDefinitionId: 'plank', series: null, duration: '45 s' }] },
  ],
};
function renderPanel(rows: Routine[] = [routine], canManage = true, catalog: RoutineApi['exercises'] = async () => definitions) {
  const api = {
    training: { list: vi.fn().mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }), detail: vi.fn() },
    list: vi.fn<RoutineApi['list']>().mockResolvedValue(rows), exercises: vi.fn<RoutineApi['exercises']>().mockImplementation(catalog), patterns: vi.fn<RoutineApi['patterns']>().mockResolvedValue([{ id: 'push', name: 'Empuje' }]),
    templates: vi.fn<RoutineApi['templates']>().mockResolvedValue([]),
    create: vi.fn<RoutineApi['create']>().mockResolvedValue({}), replace: vi.fn<RoutineApi['replace']>().mockResolvedValue({}),
    duplicate: vi.fn<RoutineApi['duplicate']>().mockResolvedValue({}),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><RoutinePanel personName="Alumno Prueba" personId="person" participationId="participation" csrfToken="csrf" api={api} canManage={canManage}/></QueryClientProvider>);
  return { api, client };
}
afterEach(cleanup);
it('keeps exercise catalog management out of the initial empty routine view', async () => {
  renderPanel([]);
  await screen.findByText('No hay una rutina activa.');
  expect(screen.getByRole('button', { name: 'Crear desde cero' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Usar preestablecida' })).toBeInTheDocument();
  expect(screen.queryByText('Administrar ejercicios')).not.toBeInTheDocument();
});
it('shows the shared movement pattern filter when editing a student routine', async () => {
  renderPanel([]); await startNewRoutine();
  expect(catalog().getByText('Patrones de movimiento')).toBeInTheDocument();
  expect(catalog().getByRole('button', { name: /Todos los ejercicios/ })).toBeInTheDocument();
  expect(catalog().getByRole('button', { name: /Empuje/ })).toBeInTheDocument();
});
it('paginates the student routine exercise picker and preserves the edited day while navigating', async () => {
  const many = Array.from({ length: 10 }, (_, index) => ({ id: `exercise-${index}`, name: `Ejercicio ${index}`, movementPatternId: 'push', isActive: true }));
  renderPanel([], true, async () => many); await startNewRoutine();
  expect(catalog().getAllByRole('button', { name: /^Agregar Ejercicio/ })).toHaveLength(8);
  expect(catalog().getByText('Página 1 de 2')).toBeVisible();
  expect(catalog().getByRole('button', { name: 'Anterior' })).toBeDisabled();
  fireEvent.click(catalog().getByRole('button', { name: 'Siguiente' }));
  expect(catalog().getByText('Página 2 de 2')).toBeVisible();
  fireEvent.click(catalog().getByRole('button', { name: 'Agregar Ejercicio 8' }));
  fireEvent.click(screen.getByRole('button', { name: 'Disminuir series del bloque A' }));
  fireEvent.click(catalog().getByRole('button', { name: 'Anterior' }));
  expect(day(1).getByLabelText('Series del bloque A')).toHaveTextContent('3');
  fireEvent.click(catalog().getByRole('button', { name: 'Siguiente' }));
  expect(catalog().getByText('Página 2 de 2')).toBeVisible();
  fireEvent.click(catalog().getByRole('button', { name: /Empuje/ }));
  expect(catalog().getByText('Página 1 de 2')).toBeVisible();
  fireEvent.click(catalog().getByRole('button', { name: 'Siguiente' }));
  change(catalog(), 'Buscar ejercicio', 'Ejercicio 9');
  expect(catalog().getByText('Página 1 de 1')).toBeVisible();
  expect(day(1).getByLabelText('Series del bloque A')).toHaveTextContent('3');
});
async function startEditing() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Editar rutina' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Editar rutina' }));
  await screen.findByRole('region', { name: 'Agregar ejercicios' });
}
function day(index: number) { fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Día ${index}:`) })); return within(screen.getByRole('group', { name: `Día ${index}` })); }
function change(scope: ReturnType<typeof within>, label: string, value: string) { fireEvent.change(scope.getByLabelText(label), { target: { value } }); }
async function add(scope: ReturnType<typeof within>, id = 'squat') {
  const name = id === 'plank' ? 'Plancha' : 'Sentadilla';
  fireEvent.change(catalog().getByRole('searchbox'), { target: { value: name } });
  fireEvent.click(await screen.findByRole('button', { name: `Agregar ${name}` }));
  expect(scope.getAllByRole('button', { name: /^Quitar / }).length).toBeGreaterThan(0);
}
function catalog() { if (!screen.queryByRole('region', { name: 'Agregar ejercicios' })) fireEvent.click(screen.getAllByRole('button', { name: /^Buscar ejercicios para el bloque/ })[0]!);
  return within(screen.getByRole('region', { name: 'Agregar ejercicios' })); }
function row(index = 0) { return within(screen.getByRole('group', { name: /^Día \d+$/ }).querySelectorAll('li')[index]!); }

it('reads every day and optional value, including historical definitions absent from the active catalog', async () => {
  renderPanel([routine, { ...routine, id: 'old', status: 'HISTORICAL', version: 1, days: [{ position: 1, name: 'Histórico', exercises: [{ exerciseDefinitionId: 'retired', exerciseDefinition: { name: 'Ejercicio retirado', description: 'Descripción conservada' }, series: null }] }] }]);
  expect(await screen.findByText('Fuerza')).toBeInTheDocument();
  expect(screen.getByText('Core')).toBeInTheDocument();
  expect(screen.getByText('Sentadilla')).toBeInTheDocument(); expect(screen.getByText('4 series · 10 rep. · Carga 40 kg · Descanso 30 s')).toBeInTheDocument(); expect(screen.getByText('Observación: Controlar técnica')).toBeInTheDocument();
  expect(screen.getByText('Plancha')).toBeInTheDocument(); expect(screen.getByText('Tiempo 45 s')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Rutinas históricas (1)'));
  expect(screen.getByText('Ejercicio retirado')).toBeInTheDocument();
  expect(screen.getByText('Descripción conservada')).toBeInTheDocument();
  expect(screen.queryByText('Sin parámetros adicionales')).not.toBeInTheDocument();
  expect(screen.queryByText(/— series/)).not.toBeInTheDocument();
});

it('mounts only the active day, retains inline changes and saves every day in order', async () => {
  const { api } = renderPanel(); await startEditing();
  expect(screen.getByRole('group', { name: 'Día 1' })).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Día 2' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Día 1:/ })).toHaveAttribute('aria-pressed', 'true');
  expect(day(1).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  for (const [label, value] of [['Series', '4'], ['Valor', '10'], ['Carga', '40 kg'], ['Descanso', '30 s'], ['Observación', 'Controlar técnica']]) expect(row().getByLabelText(label!)).toHaveValue(value);
  change(row(), 'Series', '5'); change(row(), 'Carga', 'Banda roja'); change(row(), 'Descanso', '1 min');
  day(2); expect(screen.queryByRole('group', { name: 'Día 1' })).not.toBeInTheDocument();
  expect(row().getByLabelText('Tipo')).toHaveValue('duration'); expect(row().getByLabelText('Valor')).toHaveValue('45 s');
  day(1); expect(row().getByLabelText('Series')).toHaveValue('5');
  await add(day(1), 'plank'); await add(day(1));
  fireEvent.click(row(2).getByRole('button', { name: 'Quitar Sentadilla' }));
  expect(day(1).getAllByRole('button', { name: /^Quitar / })).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: '+ Agregar día' }));
  expect(screen.getByRole('group', { name: 'Día 3' })).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Día 1' })).not.toBeInTheDocument();
  fireEvent.click(day(3).getByRole('button', { name: 'Eliminar día' }));
  expect(screen.getByRole('group', { name: 'Día 2' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '+ Agregar día' }));
  change(day(3), 'Nombre del día 3', 'Movilidad'); await add(day(3), 'plank');
  expect(api.replace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' })); await screen.findByText('Rutina guardada correctamente.');
  expect(api.replace).toHaveBeenCalledWith('routine', { personId: 'person', salaParticipationId: 'participation', days: [
    { name: 'Fuerza', exercises: [
      { exerciseDefinitionId: 'squat', series: '5', repetitions: '10', duration: null, load: 'Banda roja', rest: '1 min', notes: 'Controlar técnica' },
      { exerciseDefinitionId: 'plank', series: null, repetitions: null, duration: null, load: null, rest: null, notes: null },
    ] },
    { name: 'Core', exercises: [{ exerciseDefinitionId: 'plank', series: null, repetitions: null, duration: '45 s', load: null, rest: null, notes: null }] },
    { name: 'Movilidad', exercises: [{ exerciseDefinitionId: 'plank', blockPosition: 1, series: '4', repetitions: null, duration: null, load: null, rest: null, notes: null }] },
  ] }, expect.objectContaining({ credentials: 'include', headers: { 'x-csrf-token': 'csrf' } }));
  for (const savedDay of api.replace.mock.calls[0]![1].days) expect(savedDay).not.toHaveProperty('position');
});

it('keeps management and exercise selectors out of routine editing', async () => {
  renderPanel(); await startEditing();
  expect(screen.queryByText('Administrar ejercicios')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '+ Crear nuevo ejercicio' })).not.toBeInTheDocument();
  expect(catalog().getByRole('searchbox')).toBeInTheDocument();
  expect(row().queryByRole('combobox', { name: 'Ejercicio' })).not.toBeInTheDocument();
});
it('requires only the exercise and keeps at least one visible day', async () => {
  const { api } = renderPanel([]); await startNewRoutine();
  expect(day(1).getByRole('button', { name: 'Eliminar día' })).toBeDisabled();
  await add(day(1), 'plank');
  for (const label of ['Valor', 'Carga', 'Observación']) expect(row().getByLabelText(label)).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(api.create).toHaveBeenCalled());
  expect(api.create.mock.calls[0]?.[0].days[0]?.exercises[0]).toEqual({ exerciseDefinitionId: 'plank', blockPosition: 1, series: '4', repetitions: null, duration: null, load: null, rest: null, notes: null });
});
it('keeps invalid historical alternatives until explicitly resolved and blocks saving', async () => {
  const { api } = renderPanel([{ ...routine, days: [{ position: 1, exercises: [{ exerciseDefinitionId: 'squat', repetitions: '10', duration: '45 s' }] }] }]);
  await startEditing(); expect(day(1).getByRole('alert')).toHaveTextContent('Elegí Repeticiones o Tiempo, no ambos.');
  expect(day(1).getByRole('alert')).toHaveTextContent('Repeticiones: 10. Tiempo: 45 s.');
  expect(row().getByLabelText('Tipo')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(1));
  expect(api.replace).not.toHaveBeenCalled();
  change(row(), 'Tipo', 'duration'); expect(row().getByLabelText('Valor')).toHaveValue('45 s');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(api.replace).toHaveBeenCalled());
  expect(api.replace.mock.calls[0]![1].days[0]?.exercises[0]).toMatchObject({ repetitions: null, duration: '45 s' });
});
it.each(['repetitions', 'duration'])('maps the inline %s selector to the existing payload fields', async (mode) => {
  const { api } = renderPanel(); await startEditing();
  change(row(), 'Tipo', mode);
  if (mode === 'duration') expect(row().getByLabelText('Valor')).toHaveValue('');
  change(row(), 'Valor', mode === 'duration' ? '45 s' : '10');
  day(2); day(1); expect(row().getByLabelText('Valor')).toHaveValue(mode === 'duration' ? '45 s' : '10');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(api.replace).toHaveBeenCalled());
  expect(api.replace.mock.calls[0]![1].days[0]?.exercises[0]).toMatchObject({ repetitions: mode === 'repetitions' ? '10' : null, duration: mode === 'duration' ? '45 s' : null });
});

it('keeps the active routine editable without a reuse action', async () => {
  renderPanel(); await screen.findByText('Fuerza');
  const activeArticle = screen.getByRole('heading', { name: 'Rutina v2' }).closest('article')!;
  expect(screen.getByRole('button', { name: 'Editar rutina' })).toBeInTheDocument();
  expect(within(activeArticle).queryByRole('button', { name: 'Usar nuevamente' })).not.toBeInTheDocument();
  expect(within(activeArticle).queryByRole('button', { name: 'Duplicar rutina' })).not.toBeInTheDocument();
});
it('asks before reusing a historical routine, then activates it and refreshes', async () => {
  const historical = { ...routine, id: 'historical', status: 'HISTORICAL' as const, version: 1 };
  const { api } = renderPanel([routine, historical]); await screen.findAllByText('Fuerza');
  fireEvent.click(screen.getByText('Rutinas históricas (1)'));
  const historicalArticle = screen.getByRole('heading', { name: 'Rutina v1' }).closest('article')!;
  expect(within(historicalArticle).getByRole('button', { name: 'Usar nuevamente' })).toBeInTheDocument();
  expect(within(historicalArticle).queryByRole('button', { name: 'Duplicar rutina' })).not.toBeInTheDocument();
  fireEvent.click(within(historicalArticle).getByRole('button', { name: 'Usar nuevamente' }));
  const dialog = await screen.findByRole('alertdialog', { name: 'Usar nuevamente esta rutina' });
  expect(dialog).toHaveTextContent('Esta rutina pasará a ser la rutina activa del alumno.');
  expect(dialog).toHaveTextContent('La rutina actual quedará en el historial.');
  expect(api.duplicate).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Usar nuevamente' }));
  expect(await screen.findByText('Rutina activada correctamente.')).toBeInTheDocument();
  expect(api.duplicate).toHaveBeenCalledWith('historical', expect.any(Object));
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
});
it('omits the active routine notice when reusing history without an active routine', async () => {
  const historical = { ...routine, id: 'historical', status: 'HISTORICAL' as const, version: 1 };
  const { api } = renderPanel([historical]); await screen.findByText('Fuerza'); fireEvent.click(screen.getByText('Rutinas históricas (1)'));
  fireEvent.click(screen.getByRole('button', { name: 'Usar nuevamente' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(dialog).toHaveTextContent('Esta rutina pasará a ser la rutina activa del alumno.');
  expect(dialog).not.toHaveTextContent('La rutina actual quedará en el historial.');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Usar nuevamente' }));
  await screen.findByText('Rutina activada correctamente.'); expect(api.duplicate).toHaveBeenCalledWith('historical', expect.any(Object));
});
it('cancels historical reuse without calling the API or showing success', async () => {
  const historical = { ...routine, id: 'historical', status: 'HISTORICAL' as const, version: 1 };
  const { api } = renderPanel([routine, historical]); await screen.findAllByText('Fuerza'); fireEvent.click(screen.getByText('Rutinas históricas (1)'));
  fireEvent.click(screen.getByRole('button', { name: 'Usar nuevamente' }));
  const dialog = await screen.findByRole('alertdialog'); fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Rutina v1' })).toBeInTheDocument();
  expect(api.duplicate).not.toHaveBeenCalled(); expect(screen.queryByText('Rutina activada correctamente.')).not.toBeInTheDocument();
});
it('preserves the confirmation context and reports reuse errors without success or invalidation', async () => {
  const historical = { ...routine, id: 'historical', status: 'HISTORICAL' as const, version: 1 };
  const { api } = renderPanel([routine, historical]); api.duplicate.mockRejectedValue(new Error('Participación activa requerida'));
  await screen.findAllByText('Fuerza'); fireEvent.click(screen.getByText('Rutinas históricas (1)'));
  fireEvent.click(screen.getByRole('button', { name: 'Usar nuevamente' }));
  const dialog = await screen.findByRole('alertdialog'); fireEvent.click(within(dialog).getByRole('button', { name: 'Usar nuevamente' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Participación activa requerida');
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  expect(screen.queryByText('Rutina activada correctamente.')).not.toBeInTheDocument();
  expect(api.list).toHaveBeenCalledTimes(1);
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
});
it('allows read-only users to see active and historical routines without management or catalog requests', async () => {
  const { api } = renderPanel([routine, { ...routine, id: 'old', version: 1, status: 'HISTORICAL' }], false);
  await screen.findAllByText('Fuerza'); fireEvent.click(screen.getByText('Rutinas históricas (1)'));
  expect(screen.getByText('Rutina v1')).toBeInTheDocument();
  for (const name of ['Crear desde cero', 'Usar preestablecida', 'Editar rutina', 'Usar nuevamente', 'Duplicar rutina', '+ Crear nuevo ejercicio']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  expect(screen.queryByText('Administrar ejercicios')).not.toBeInTheDocument(); expect(api.exercises).not.toHaveBeenCalled();
});

async function startNewRoutine() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Crear desde cero' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Crear desde cero' }));
}
it('searches all catalog fields with normalized words and adds only active definitions without restricting duplicates', async () => {
  renderPanel([], true, async () => [...definitions.map(item => ({ ...item, description: item.id === 'squat' ? 'Fuerza para fútbol' : null })), { id: 'retired', name: 'Plancha retirada', isActive: false }]); await startNewRoutine();
  change(catalog(), 'Buscar ejercicio', 'Plancha');
  await catalog().findByRole('button', { name: 'Agregar Plancha' });
  change(catalog(), 'Buscar ejercicio', 'pLaNcHa');
  expect(catalog().queryByRole('button', { name: 'Agregar Sentadilla' })).not.toBeInTheDocument();
  expect(catalog().queryByRole('button', { name: 'Agregar Plancha retirada' })).not.toBeInTheDocument();
  await add(day(1), 'plank'); expect(row().getByText('A1 — Plancha')).toBeInTheDocument();
  change(catalog(), 'Buscar ejercicio', 'PIERNAS');
  expect(catalog().getByRole('button', { name: 'Agregar Sentadilla' })).toBeInTheDocument();
  change(catalog(), 'Buscar ejercicio', 'SENTADILLA futbol');
  expect(catalog().getByRole('button', { name: 'Agregar Sentadilla' })).toBeInTheDocument();
  expect(catalog().queryByRole('button', { name: 'Agregar Plancha' })).not.toBeInTheDocument();
  expect(catalog().getByRole('searchbox')).toHaveAttribute('placeholder', 'Buscar por nombre, músculo o descripción');
  change(catalog(), 'Buscar ejercicio', 'futbol tenis');
  expect(catalog().getByText('No hay ejercicios que coincidan.')).toBeInTheDocument();
  change(catalog(), 'Buscar ejercicio', ''); await add(day(1), 'plank');
  expect(day(1).getAllByRole('button', { name: /^Quitar / })).toHaveLength(2);
});
it('reports catalog failure without exposing quick creation', async () => {
  renderPanel([], true, async () => { throw new Error('API unavailable'); }); await startNewRoutine();
  expect(await catalog().findByText('No se pudo cargar el catálogo de ejercicios.')).toBeInTheDocument();
  expect(catalog().getByRole('alert')).toHaveTextContent('No se pudo cargar');
  expect(catalog().queryByRole('button', { name: '+ Crear nuevo ejercicio' })).not.toBeInTheDocument();
  expect(catalog().queryByText(/Todavía no hay ejercicios/)).not.toBeInTheDocument();
});
it('shows catalog loading without a misleading empty state', async () => {
  renderPanel([], true, () => new Promise(() => {})); await startNewRoutine();
  expect(catalog().getByRole('status')).toHaveTextContent('Cargando catálogo de ejercicios…');
  expect(catalog().queryByText(/Todavía no hay ejercicios/)).not.toBeInTheDocument();
});
it('cancels the routine draft without persisting and restores its original values on reopen', async () => {
  const { api } = renderPanel(); await startEditing(); change(row(), 'Series', '99');
  expect(screen.getAllByRole('button', { name: 'Cancelar' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Guardar cambios' })).toHaveLength(1);
  const content = screen.getByRole('region', { name: 'Contenido de la rutina' });
  expect(content.compareDocumentPosition(screen.getByRole('button', { name: 'Guardar cambios' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(api.replace).not.toHaveBeenCalled(); expect(api.create).not.toHaveBeenCalled();
  await startEditing(); expect(row().getByLabelText('Series')).toHaveValue('4');
});

const template = {
  id: 'template', name: 'Fuerza general', days: [
    { id: 'template-day-1', position: 1, name: 'Modelo fuerza', exercises: [{ id: 'template-entry-1', position: 1, exerciseDefinitionId: 'squat', exerciseDefinition: { name: 'Sentadilla', isActive: true }, series: '4', repetitions: '10', load: '60 kg', rest: '90 s', notes: 'Técnica' }] },
    { id: 'template-day-2', position: 2, name: 'Modelo core', exercises: [{ id: 'template-entry-2', exerciseDefinitionId: 'plank', exerciseDefinition: { name: 'Plancha', isActive: true }, duration: '45 s' }] },
  ],
};
async function previewTemplate() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Usar preestablecida' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Usar preestablecida' }));
  fireEvent.click(await screen.findByRole('button', { name: template.name }));
  await screen.findByRole('button', { name: 'Asignar rutina' });
}
it.each([false, true])('previews all content and assigns an independent copy without opening the editor (active=%s)', async (hasActive) => {
  const { api } = renderPanel(hasActive ? [routine] : []);
  api.templates.mockResolvedValue([template]); await previewTemplate();
  expect(screen.getByText('Modelo fuerza')).toBeInTheDocument(); expect(screen.getByText('Modelo core')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Vista previa de preestablecida' })).getByText('Sentadilla')).toBeInTheDocument(); expect(screen.getByText('4 series · 10 rep. · Carga 60 kg · Descanso 90 s')).toBeInTheDocument(); expect(screen.getByText('Observación: Técnica')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Vista previa de preestablecida' })).getByText('Plancha')).toBeInTheDocument(); expect(within(screen.getByRole('region', { name: 'Vista previa de preestablecida' })).getByText('Tiempo 45 s')).toBeInTheDocument();
  expect(screen.queryByText('Administrar ejercicios')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Nombre del día 1')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Vista previa de preestablecida' })).getByRole('button', { name: 'Editar' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Asignar rutina' }));
  await screen.findByText('Rutina asignada correctamente.');
  const payload = hasActive ? api.replace.mock.calls[0]![1] : api.create.mock.calls[0]![0];
  expect(payload).toEqual({ personId: 'person', salaParticipationId: 'participation', days: [
    { name: 'Modelo fuerza', exercises: [{ exerciseDefinitionId: 'squat', series: '4', repetitions: '10', duration: null, load: '60 kg', rest: '90 s', notes: 'Técnica' }] },
    { name: 'Modelo core', exercises: [{ exerciseDefinitionId: 'plank', series: null, repetitions: null, duration: '45 s', load: null, rest: null, notes: null }] },
  ] });
  expect(payload).not.toHaveProperty('routineTemplateId');
  expect(api.replace).toHaveBeenCalledTimes(hasActive ? 1 : 0); expect(api.create).toHaveBeenCalledTimes(hasActive ? 0 : 1);
  if (hasActive) expect(api.replace.mock.calls[0]![0]).toBe('routine');
  expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
});
it('personalizes every template day without changing the original template', async () => {
  const { api } = renderPanel(); api.templates.mockResolvedValue([template]);
  const original = structuredClone(template); await previewTemplate();
  expect(screen.queryByText('Administrar ejercicios')).not.toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('region', { name: 'Vista previa de preestablecida' })).getByRole('button', { name: 'Editar' }));
  expect(screen.getByText('Personalizar rutina')).toBeInTheDocument();
  expect(screen.queryByText('Administrar ejercicios')).not.toBeInTheDocument();
  expect(day(1).getByLabelText('Nombre del día 1')).toHaveValue('Modelo fuerza');
  expect(day(2).getByLabelText('Nombre del día 2')).toHaveValue('Modelo core');
  change(day(1), 'Series', '3'); change(day(1), 'Valor', '8');
  expect(row().getByLabelText('Series')).toHaveValue('3');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await screen.findByText('Rutina guardada correctamente.');
  expect(api.replace.mock.calls[0]![1].days[0]?.exercises[0]).toMatchObject({ series: '3', repetitions: '8' });
  expect(api.replace.mock.calls[0]![1].days).toHaveLength(2);
  expect(template).toEqual(original);
});
it('explains the empty template list and preserves creation from scratch', async () => {
  renderPanel([]); await waitFor(() => expect(screen.getByRole('button', { name: 'Usar preestablecida' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: 'Usar preestablecida' }));
  await screen.findByText('No hay rutinas preestablecidas disponibles. Podés crear la rutina desde cero.');
  fireEvent.click(screen.getByRole('button', { name: 'Crear desde cero' }));
  expect(day(1).getByLabelText('Nombre del día 1')).toHaveValue('Día 1');
  expect(day(1).queryByRole('listitem')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
});
it('blocks direct assignment of retired entries but permits replacement in the editor', async () => {
  const { api } = renderPanel([]);
  api.templates.mockResolvedValue([{ ...template, days: [{ ...template.days[0]!, exercises: [{ ...template.days[0]!.exercises[0]!, exerciseDefinition: { name: 'Sentadilla', isActive: false } }] }] }]);
  await previewTemplate(); expect(within(screen.getByRole('region', { name: 'Vista previa de preestablecida' })).getByText(/No disponible/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Asignar rutina' })).toBeDisabled();
  expect(screen.getByText('Esta rutina contiene ejercicios que ya no están disponibles. Editala para reemplazarlos o quitarlos.')).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('region', { name: 'Vista previa de preestablecida' })).getByRole('button', { name: 'Editar' }));
  fireEvent.click(row().getByRole('button', { name: /^Quitar/ })); await add(day(1), 'plank');
  expect(row().getByText('Plancha')).toBeInTheDocument(); change(row(), 'Series', '4');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(api.create).toHaveBeenCalled());
  expect(api.create.mock.calls[0]![0].days[0]?.exercises[0]?.exerciseDefinitionId).toBe('plank');
});
it('reports assignment failure without success and allows retry', async () => {
  const { api } = renderPanel([]); api.templates.mockResolvedValue([template]); api.create.mockRejectedValueOnce(new Error('Ejercicio no disponible'));
  await previewTemplate(); fireEvent.click(screen.getByRole('button', { name: 'Asignar rutina' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Ejercicio no disponible');
  expect(screen.queryByText('Rutina asignada correctamente.')).not.toBeInTheDocument(); expect(api.list).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Asignar rutina' })); await screen.findByText('Rutina asignada correctamente.');
});
it('does not request templates for read-only users', async () => {
  const { api } = renderPanel([routine], false); await screen.findByText('Fuerza');
  expect(screen.queryByRole('button', { name: 'Usar preestablecida' })).not.toBeInTheDocument(); expect(api.templates).not.toHaveBeenCalled();
});

it('retains an unavailable selection when the catalog refresh omits its definition', async () => {
  const { api, client } = renderPanel([{ ...routine, days: [{ position: 1, exercises: [{ exerciseDefinitionId: 'retired', series: '3' }] }] }]);
  await startEditing();
  expect(row().queryByRole('combobox', { name: 'Ejercicio' })).not.toBeInTheDocument();
  expect(row().getByText('Ejercicio retirado · No disponible')).toBeInTheDocument();
  api.exercises.mockResolvedValue([definitions[1]!]); await client.invalidateQueries({ queryKey: ['sala-exercise-definitions'] });
  await waitFor(() => expect(row().queryByRole('option', { name: 'Sentadilla · Piernas' })).not.toBeInTheDocument());
  expect(row().getByText('Ejercicio retirado · No disponible')).toBeInTheDocument();
  expect(catalog().queryByRole('button', { name: /Agregar Ejercicio retirado/ })).not.toBeInTheDocument();
  fireEvent.click(row().getByRole('button', { name: /^Quitar/ })); await add(day(1), 'plank'); expect(row().getByText('Plancha')).toBeInTheDocument();
});
it('preserves an empty time selection across tabs and keeps it out of the payload', async () => {
  const { api } = renderPanel(); await startEditing(); change(row(), 'Tipo', 'duration');
  expect(row().getByLabelText('Valor')).toHaveValue(''); day(2); day(1);
  expect(row().getByLabelText('Tipo')).toHaveValue('duration');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' })); await waitFor(() => expect(api.replace).toHaveBeenCalled());
  expect(api.replace.mock.calls[0]![1].days[0]?.exercises[0]).toEqual({ exerciseDefinitionId: 'squat', series: '4', repetitions: null, duration: null, load: '40 kg', rest: '30 s', notes: 'Controlar técnica' });
});

it('places training history between the active routine and historical routines', async () => {
  renderPanel([routine, { ...routine, id: 'old', status: 'HISTORICAL', version: 1 }], false);
  await screen.findByText('Rutina v2');
  const training = screen.getByRole('region', { name: 'Historial de entrenamientos' });
  const active = screen.getByText('Rutina v2'); const historical = screen.getByText('Rutinas históricas (1)');
  expect(active.compareDocumentPosition(training) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(training.compareDocumentPosition(historical) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Editar rutina' })).not.toBeInTheDocument();
});

it.each([true, false])('prints active and specific historical routines without writes (manage=%s)', async canManage => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  try {
    const { api } = renderPanel([routine, { ...routine, id: 'old', status: 'HISTORICAL', version: 1, days: [{ position: 1, name: 'Histórico exclusivo', exercises: [] }] }], canManage);
    await screen.findByText('Rutina v2');
    fireEvent.click(screen.getAllByRole('button', { name: 'Imprimir / PDF' })[0]!);
    let root = document.getElementById('athleta-routine-print-root')!;
    expect(root).toHaveTextContent('Alumno: Alumno Prueba');
    expect(root).toHaveTextContent('Estado: Activa · Versión: 2');
    expect(root).not.toHaveTextContent('Histórico exclusivo');
    expect(root).not.toHaveTextContent('Historial de entrenamientos');
    fireEvent(window, new Event('afterprint'));
    fireEvent.click(screen.getByText('Rutinas históricas (1)'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Imprimir / PDF' })[1]!);
    root = document.getElementById('athleta-routine-print-root')!;
    expect(root).toHaveTextContent('Estado: Histórica · Versión: 1');
    expect(root).toHaveTextContent('Histórico exclusivo');
    expect(root).not.toHaveTextContent('Controlar técnica');
    for (const write of [api.create, api.replace, api.duplicate]) expect(write).not.toHaveBeenCalled();
  } finally { print.mockRestore(); }
});
it('prints the selected template preview without assignment', async () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  try {
    const { api } = renderPanel([]);
    await screen.findByText('No hay una rutina activa.');
    expect(screen.queryByRole('button', { name: 'Imprimir / PDF' })).not.toBeInTheDocument();
    api.templates.mockResolvedValue([{ id: 'template', name: 'Modelo previo', days: routine.days }]);
    fireEvent.click(screen.getByRole('button', { name: 'Usar preestablecida' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Modelo previo' }));
    const preview = within(screen.getByRole('region', { name: 'Vista previa de preestablecida' }));
    expect(preview.getAllByRole('button').map(button => button.textContent)).toEqual(['Asignar rutina', 'Imprimir / PDF', 'Editar', 'Volver']);
    fireEvent.click(preview.getByRole('button', { name: 'Imprimir / PDF' }));
    expect(document.getElementById('athleta-routine-print-root')).toHaveTextContent('Rutina: Modelo previo');
    expect(document.getElementById('athleta-routine-print-root')).not.toHaveTextContent('Alumno:');
    for (const write of [api.create, api.replace, api.duplicate]) expect(write).not.toHaveBeenCalled();
  } finally { print.mockRestore(); }
});

it('assigns and personalizes grouped templates without source IDs or source mutations', async () => {
  const { api } = renderPanel([]);
  const grouped = { ...template, days: template.days.map(d => ({ ...d, exercises: d.exercises.map(e => ({ ...e, blockPosition: 1, series: '4' })) })) };
  api.templates.mockResolvedValue([grouped]); const original = structuredClone(grouped);
  await previewTemplate(); expect(screen.getAllByText('Bloque A — 4 series')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Asignar rutina' })); await waitFor(() => expect(api.create).toHaveBeenCalled());
  const saved = api.create.mock.calls[0]![0]; expect(saved.days[0]!.exercises[0]).toMatchObject({ blockPosition: 1, series: '4' });
  expect(saved.days[0]).not.toHaveProperty('id'); expect(saved.days[0]!.exercises[0]).not.toHaveProperty('id'); expect(grouped).toEqual(original);
});

it('shows grouped units outside editable values, rejects new letters and preserves strings in the payload', async () => {
  const { api } = renderPanel([]); await startNewRoutine(); await add(day(1));
  expect(screen.getByLabelText('Series del bloque A')).toHaveTextContent('4');
  fireEvent.click(screen.getByRole('button', { name: 'Aumentar series del bloque A' })); expect(screen.getByLabelText('Series del bloque A')).toHaveTextContent('5');
  fireEvent.click(screen.getByRole('button', { name: 'Disminuir series del bloque A' })); expect(screen.getByLabelText('Series del bloque A')).toHaveTextContent('4');
  expect(row().queryByLabelText('Descanso')).not.toBeInTheDocument(); expect(row().queryByLabelText('Series')).not.toBeInTheDocument();
  expect(row().getByText('rep.')).toBeInTheDocument(); expect(row().getByText('kg')).toBeInTheDocument();
  change(row(), 'Valor', '8+8'); expect(row().getByLabelText('Valor')).toHaveValue('8+8');
  change(row(), 'Tipo', 'duration'); expect(row().getByText('seg.')).toBeInTheDocument();
  expect(row().getByLabelText('Valor')).toHaveAttribute('inputmode', 'numeric');
  change(row(), 'Valor', 'abc'); expect(row().getByLabelText('Valor')).toHaveValue('');
  change(row(), 'Valor', '45'); change(row(), 'Valor', '45 s'); expect(row().getByLabelText('Valor')).toHaveValue('45');
  change(row(), 'Carga', '20'); change(row(), 'Carga', '20 kg'); expect(row().getByLabelText('Carga')).toHaveValue('20');
  change(row(), 'Carga', '12.5'); expect(row().getByLabelText('Carga')).toHaveValue('12.5');
  change(row(), 'Carga', '12,5'); expect(row().getByLabelText('Carga')).toHaveAttribute('inputmode', 'decimal');
  await add(day(1), 'plank'); change(row(1), 'Valor', '10+10');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' })); await waitFor(() => expect(api.create).toHaveBeenCalled());
  expect(api.create.mock.calls[0]![0].days[0]!.exercises).toEqual([
    expect.objectContaining({ series: '4', repetitions: null, duration: '45', load: '12,5', rest: null }),
    expect.objectContaining({ series: '4', repetitions: '10+10', duration: null, rest: null }),
  ]);
});
