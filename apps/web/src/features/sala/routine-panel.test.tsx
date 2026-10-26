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
    list: vi.fn<RoutineApi['list']>().mockResolvedValue(rows), exercises: vi.fn<RoutineApi['exercises']>().mockImplementation(catalog),
    templates: vi.fn<RoutineApi['templates']>().mockResolvedValue([]),
    create: vi.fn<RoutineApi['create']>().mockResolvedValue({}), replace: vi.fn<RoutineApi['replace']>().mockResolvedValue({}),
    duplicate: vi.fn<RoutineApi['duplicate']>().mockResolvedValue({}), createExercise: vi.fn<RoutineApi['createExercise']>().mockResolvedValue({ id: 'row', name: 'Remo', primaryMuscle: 'Espalda', isActive: true }),
    updateExercise: vi.fn<RoutineApi['updateExercise']>().mockResolvedValue({}), retireExercise: vi.fn<RoutineApi['retireExercise']>().mockResolvedValue({}),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><RoutinePanel personId="person" participationId="participation" csrfToken="csrf" api={api} canManage={canManage}/></QueryClientProvider>);
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
async function startEditing() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Editar rutina' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Editar rutina' }));
  await screen.findAllByRole('option', { name: 'Sentadilla · Piernas' });
}
function day(index: number) { fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Día ${index}:`) })); return within(screen.getByRole('group', { name: `Día ${index}` })); }
function change(scope: ReturnType<typeof within>, label: string, value: string) { fireEvent.change(scope.getByLabelText(label), { target: { value } }); }
async function add(scope: ReturnType<typeof within>, id = 'squat') {
  const name = id === 'plank' ? 'Plancha' : 'Sentadilla';
  fireEvent.click(await screen.findByRole('button', { name: `Agregar ${name}` }));
  expect(scope.getAllByRole('button', { name: /^Quitar / }).length).toBeGreaterThan(0);
}
function catalog() { return within(screen.getByRole('region', { name: 'Agregar ejercicios' })); }
function row(index = 0) { return within(screen.getByRole('group', { name: /^Día \d+$/ }).querySelectorAll('li')[index]!); }
function openCatalog() { fireEvent.click(screen.getByText('Administrar ejercicios')); }
function fillCatalog() {
  fireEvent.change(screen.getByLabelText('Nombre del ejercicio'), { target: { value: 'Remo' } });
  fireEvent.change(screen.getByLabelText('Músculo principal (opcional)'), { target: { value: 'Espalda' } });
  fireEvent.change(screen.getByLabelText('Descripción del ejercicio'), { target: { value: 'Con banda' } });
}

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
  for (const [label, value] of [['Ejercicio', 'squat'], ['Series', '4'], ['Valor', '10'], ['Carga', '40 kg'], ['Descanso', '30 s'], ['Observación', 'Controlar técnica']]) expect(row().getByLabelText(label!)).toHaveValue(value);
  change(row(), 'Series', '5'); change(row(), 'Carga', 'Banda roja'); change(row(), 'Descanso', '1 min');
  day(2); expect(screen.queryByRole('group', { name: 'Día 1' })).not.toBeInTheDocument();
  expect(row().getByLabelText('Tipo')).toHaveValue('duration'); expect(row().getByLabelText('Valor')).toHaveValue('45 s');
  day(1); expect(row().getByLabelText('Series')).toHaveValue('5');
  await add(day(1), 'plank'); await add(day(1));
  fireEvent.click(row(2).getByRole('button', { name: 'Quitar Sentadilla' }));
  expect(day(1).getAllByRole('listitem')).toHaveLength(2);
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
    { name: 'Movilidad', exercises: [{ exerciseDefinitionId: 'plank', series: null, repetitions: null, duration: null, load: null, rest: null, notes: null }] },
  ] }, expect.objectContaining({ credentials: 'include', headers: { 'x-csrf-token': 'csrf' } }));
  for (const savedDay of api.replace.mock.calls[0]![1].days) expect(savedDay).not.toHaveProperty('position');
});

it('shows catalog management only while editing an active routine and clears its draft on cancel', async () => {
  renderPanel(); await screen.findByText('Fuerza');
  expect(screen.queryByText('Administrar ejercicios')).not.toBeInTheDocument();
  await startEditing(); openCatalog(); fillCatalog();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByText('Administrar ejercicios')).not.toBeInTheDocument();
  await startEditing(); openCatalog();
  expect(screen.getByLabelText('Nombre del ejercicio')).toHaveValue('');
});

it('requires only the exercise and keeps at least one visible day', async () => {
  const { api } = renderPanel([]); await startNewRoutine();
  expect(day(1).getByRole('button', { name: 'Eliminar día' })).toBeDisabled();
  await add(day(1), 'plank');
  for (const label of ['Series', 'Valor', 'Carga', 'Descanso', 'Observación']) expect(row().getByLabelText(label)).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(api.create).toHaveBeenCalled());
  expect(api.create.mock.calls[0]?.[0].days[0]?.exercises[0]).toEqual({ exerciseDefinitionId: 'plank', series: null, repetitions: null, duration: null, load: null, rest: null, notes: null });
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
it('creates a catalog exercise and clears the form while keeping the routine editor open', async () => {
  const { api } = renderPanel(); await startEditing(); openCatalog(); fillCatalog();
  fireEvent.click(within(screen.getByText('Administrar ejercicios').closest('details')!).getByRole('button', { name: 'Nuevo ejercicio' })); await screen.findByText('Ejercicio creado correctamente.');
  expect(api.createExercise).toHaveBeenCalledWith({ name: 'Remo', primaryMuscle: 'Espalda', description: 'Con banda' }, expect.any(Object));
  expect(screen.getByLabelText('Nombre del ejercicio')).toHaveValue(''); expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
  await waitFor(() => expect(api.exercises).toHaveBeenCalledTimes(2));
});
it('edits the same catalog exercise and refreshes definitions and routines', async () => {
  const { api } = renderPanel(); await screen.findByText('Fuerza'); await startEditing(); openCatalog();
  const catalog = within(screen.getByText('Administrar ejercicios').closest('details')!);
  fireEvent.click(within(catalog.getByText('Sentadilla · Piernas').closest('li')!).getByRole('button', { name: 'Editar' }));
  expect(screen.getByLabelText('Nombre del ejercicio')).toHaveValue('Sentadilla'); fillCatalog();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios del ejercicio' })); await screen.findByText('Ejercicio actualizado correctamente.');
  expect(api.updateExercise).toHaveBeenCalledWith('squat', { name: 'Remo', primaryMuscle: 'Espalda', description: 'Con banda' }, expect.any(Object));
  await waitFor(() => { expect(api.list).toHaveBeenCalledTimes(2); expect(api.exercises).toHaveBeenCalledTimes(2); });
});
it('retires directly when no active routine is affected', async () => {
  const { api } = renderPanel(); await screen.findByText('Fuerza'); await startEditing(); openCatalog();
  fireEvent.click(screen.getAllByRole('button', { name: 'Retirar' })[0]!); await screen.findByText('Ejercicio retirado correctamente.');
  expect(api.retireExercise).toHaveBeenCalledWith('squat', { confirmActiveRoutineImpact: false }, expect.any(Object));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  await waitFor(() => { expect(api.list).toHaveBeenCalledTimes(2); expect(api.exercises).toHaveBeenCalledTimes(2); });
});
it('shows distinct active routine impact and waits for explicit retirement confirmation', async () => {
  const { api } = renderPanel(); api.retireExercise.mockRejectedValueOnce(Object.assign(new Error('Confirmación requerida'), { code: 'SALA_EXERCISE_RETIRE_CONFIRMATION_REQUIRED', details: { activeRoutines: 2 } }));
  await screen.findByText('Fuerza'); await startEditing(); openCatalog(); fireEvent.click(screen.getAllByRole('button', { name: 'Retirar' })[0]!);
  expect(await screen.findByRole('alertdialog')).toHaveTextContent('Este ejercicio se utiliza en 2 Rutinas activas. Si lo retirás, se quitará de esas Rutinas. Las Rutinas históricas no se modificarán.');
  expect(api.retireExercise).toHaveBeenCalledTimes(1); expect(api.list).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar retiro' })); await screen.findByText('Ejercicio retirado correctamente.');
  expect(api.retireExercise).toHaveBeenLastCalledWith('squat', { confirmActiveRoutineImpact: true }, expect.any(Object));
});
it('keeps catalog input and reports a creation error', async () => {
  const { api } = renderPanel(); api.createExercise.mockRejectedValue(new Error('Ejercicio duplicado'));
  await screen.findByText('Fuerza'); await startEditing(); openCatalog(); fillCatalog(); fireEvent.click(within(screen.getByText('Administrar ejercicios').closest('details')!).getByRole('button', { name: 'Nuevo ejercicio' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Ejercicio duplicado'); expect(screen.getByLabelText('Nombre del ejercicio')).toHaveValue('Remo');
  expect(screen.queryByText('Ejercicio creado correctamente.')).not.toBeInTheDocument(); expect(api.exercises).toHaveBeenCalledTimes(1);
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
function fillInline() {
  fireEvent.click(catalog().getByRole('button', { name: '+ Crear nuevo ejercicio' }));
  change(catalog(), 'Nombre del ejercicio', 'Remo'); change(catalog(), 'Músculo principal (opcional)', 'Espalda'); change(catalog(), 'Descripción del ejercicio', 'Con banda');
}
it('searches all catalog fields with normalized words and adds only active definitions without restricting duplicates', async () => {
  renderPanel([], true, async () => [...definitions.map(item => ({ ...item, description: item.id === 'squat' ? 'Fuerza para fútbol' : null })), { id: 'retired', name: 'Plancha retirada', isActive: false }]); await startNewRoutine();
  await catalog().findByRole('button', { name: 'Agregar Plancha' });
  change(catalog(), 'Buscar un ejercicio en el catálogo', 'pLaNcHa');
  expect(catalog().queryByRole('button', { name: 'Agregar Sentadilla' })).not.toBeInTheDocument();
  expect(catalog().queryByRole('button', { name: 'Agregar Plancha retirada' })).not.toBeInTheDocument();
  await add(day(1), 'plank'); expect(row().getByLabelText('Ejercicio')).toHaveValue('plank');
  change(catalog(), 'Buscar un ejercicio en el catálogo', 'PIERNAS');
  expect(catalog().getByRole('button', { name: 'Agregar Sentadilla' })).toBeInTheDocument();
  change(catalog(), 'Buscar un ejercicio en el catálogo', 'SENTADILLA futbol');
  expect(catalog().getByRole('button', { name: 'Agregar Sentadilla' })).toBeInTheDocument();
  expect(catalog().queryByRole('button', { name: 'Agregar Plancha' })).not.toBeInTheDocument();
  expect(catalog().getByRole('searchbox')).toHaveAttribute('placeholder', 'Buscar por nombre, músculo o descripción');
  change(catalog(), 'Buscar un ejercicio en el catálogo', 'futbol tenis');
  expect(catalog().getByText('No hay ejercicios que coincidan.')).toBeInTheDocument();
  change(catalog(), 'Buscar un ejercicio en el catálogo', ''); await add(day(1), 'plank');
  expect(day(1).getAllByRole('listitem')).toHaveLength(2);
});
it('creates and immediately adds an exercise while preserving all local days and fields', async () => {
  const { api, client } = renderPanel(); await startEditing();
  change(day(1), 'Nombre del día 1', 'Fuerza editada'); change(row(), 'Series', '7');
  fireEvent.click(screen.getByRole('button', { name: '+ Agregar día' })); day(1);
  fillInline(); fireEvent.click(catalog().getByRole('button', { name: 'Crear y agregar' }));
  await waitFor(() => expect(day(1).getAllByRole('listitem')).toHaveLength(2));
  expect(row(1).getByLabelText('Ejercicio')).toHaveValue('row'); expect(row(1).getByRole('option', { name: 'Remo · Espalda' })).toBeInTheDocument();
  expect(api.createExercise).toHaveBeenCalledExactlyOnceWith({ name: 'Remo', primaryMuscle: 'Espalda', description: 'Con banda' }, expect.any(Object));
  expect(day(1).getByLabelText('Nombre del día 1')).toHaveValue('Fuerza editada'); expect(row().getByLabelText('Series')).toHaveValue('7');
  expect(catalog().queryByRole('group', { name: 'Nuevo ejercicio del catálogo' })).not.toBeInTheDocument();
  day(2); expect(row().getByLabelText('Valor')).toHaveValue('45 s'); day(3); expect(day(3).getByLabelText('Nombre del día 3')).toHaveValue('Día 3');
  expect(api.replace).not.toHaveBeenCalled(); expect(api.create).not.toHaveBeenCalled();
  expect(client.getQueryData(['sala-exercise-definitions'])).toBeDefined();
  fireEvent.click(catalog().getByRole('button', { name: '+ Crear nuevo ejercicio' })); expect(catalog().getByLabelText('Nombre del ejercicio')).toHaveValue('');
});
it('retains inline creation input on failure, adds no false row and allows retry', async () => {
  const { api } = renderPanel(); await startEditing(); api.createExercise.mockRejectedValueOnce(new Error('No se pudo crear el ejercicio'));
  fillInline(); fireEvent.click(catalog().getByRole('button', { name: 'Crear y agregar' }));
  expect(await catalog().findByRole('alert')).toHaveTextContent('No se pudo crear el ejercicio');
  for (const [label, value] of [['Nombre del ejercicio', 'Remo'], ['Músculo principal (opcional)', 'Espalda'], ['Descripción del ejercicio', 'Con banda']]) expect(catalog().getByLabelText(label!)).toHaveValue(value);
  expect(day(1).getAllByRole('listitem')).toHaveLength(1); expect(api.exercises).toHaveBeenCalledTimes(1);
  fireEvent.click(catalog().getByRole('button', { name: 'Crear y agregar' }));
  await waitFor(() => expect(day(1).getAllByRole('listitem')).toHaveLength(2));
});
it('requires a name and allows creating with no muscle via Enter while catalog refetch is pending', async () => {
  let finishRefetch!: (value: typeof definitions) => void;
  const { api } = renderPanel([], true, async () => []); await startNewRoutine();
  expect(await catalog().findByText('Todavía no hay ejercicios en el catálogo.')).toBeInTheDocument();
  api.exercises.mockImplementation(() => new Promise(resolve => { finishRefetch = resolve; }));
  fireEvent.click(catalog().getByRole('button', { name: '+ Crear nuevo ejercicio' })); fireEvent.click(catalog().getByRole('button', { name: 'Crear y agregar' }));
  expect(await catalog().findByRole('alert')).toHaveTextContent('El Nombre es obligatorio.');
  change(catalog(), 'Nombre del ejercicio', 'Remo'); fireEvent.keyDown(catalog().getByLabelText('Nombre del ejercicio'), { key: 'Enter' });
  await waitFor(() => expect(row().getByLabelText('Ejercicio')).toHaveValue('row'));
  expect(api.createExercise).toHaveBeenCalledExactlyOnceWith({ name: 'Remo', primaryMuscle: '', description: '' }, expect.any(Object));
  finishRefetch(definitions); await waitFor(() => expect(row().getByLabelText('Ejercicio')).toHaveValue('row'));
});
it('shows catalog failure while keeping quick creation available', async () => {
  renderPanel([], true, async () => { throw new Error('API unavailable'); }); await startNewRoutine();
  expect(await catalog().findByText('No se pudo cargar el catálogo de ejercicios.')).toBeInTheDocument();
  expect(catalog().getByLabelText('Buscar un ejercicio en el catálogo')).toBeDisabled();
  expect(catalog().getByRole('button', { name: '+ Crear nuevo ejercicio' })).toBeEnabled();
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
  expect(screen.getByText('Administrar ejercicios')).toBeInTheDocument();
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
  change(day(1), 'Ejercicio', 'plank');
  expect(row().getByLabelText('Ejercicio')).toHaveValue('plank'); expect(row().getByLabelText('Series')).toHaveValue('4');
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

it('shows exercises without muscle and permits clearing the muscle in the catalog', async () => {
  const { api } = renderPanel([], true, async () => [{ id: 'row', name: 'Plancha', primaryMuscle: null, isActive: true }, ...definitions]);
  await startNewRoutine();
  fireEvent.click((await catalog().findAllByRole('button', { name: 'Agregar Plancha' }))[0]!); expect(row().getByLabelText('Ejercicio')).toHaveValue('row'); expect(row().getByRole('option', { name: 'Plancha' })).toHaveTextContent(/^Plancha$/);
  fireEvent.click(screen.getByText('Administrar ejercicios'));
  const catalogRow = screen.getByText('Sentadilla · Piernas', { selector: 'span' }).closest('li')!;
  fireEvent.click(within(catalogRow).getByRole('button', { name: 'Editar' }));
  fireEvent.change(screen.getByLabelText('Músculo principal (opcional)'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios del ejercicio' }));
  await waitFor(() => expect(api.updateExercise).toHaveBeenCalledWith('squat', { name: 'Sentadilla', primaryMuscle: '', description: '' }, expect.any(Object)));
});

it('keeps a pending inline creation in its originating day and preserves edits made while waiting', async () => {
  const { api } = renderPanel(); await startEditing();
  let finishCreation!: (value: typeof definitions[number]) => void;
  api.createExercise.mockImplementation(() => new Promise(resolve => { finishCreation = resolve; }));
  fillInline(); fireEvent.click(catalog().getByRole('button', { name: 'Crear y agregar' }));
  await waitFor(() => expect(api.createExercise).toHaveBeenCalledTimes(1));
  day(2); change(row(), 'Series', '6');
  finishCreation({ id: 'row', name: 'Remo', primaryMuscle: 'Espalda', isActive: true });
  await waitFor(() => expect(catalog().queryByRole('group')).not.toBeInTheDocument());
  expect(screen.getByRole('group', { name: 'Día 2' })).toBeInTheDocument();
  expect(row().getByLabelText('Series')).toHaveValue('6'); expect(day(2).getAllByRole('listitem')).toHaveLength(1);
  day(1); expect(day(1).getAllByRole('listitem')).toHaveLength(2); expect(row(1).getByLabelText('Ejercicio')).toHaveValue('row');
});
it('retains an unavailable selection when the catalog refresh omits its definition', async () => {
  const { api, client } = renderPanel([{ ...routine, days: [{ position: 1, exercises: [{ exerciseDefinitionId: 'retired', series: '3' }] }] }]);
  await startEditing();
  expect(row().getByRole('option', { name: 'Ejercicio retirado · No disponible' })).toBeDisabled();
  expect(row().getByLabelText('Ejercicio')).toHaveValue('retired');
  api.exercises.mockResolvedValue([definitions[1]!]); await client.invalidateQueries({ queryKey: ['sala-exercise-definitions'] });
  await waitFor(() => expect(row().queryByRole('option', { name: 'Sentadilla · Piernas' })).not.toBeInTheDocument());
  expect(row().getByLabelText('Ejercicio')).toHaveValue('retired');
  expect(catalog().queryByRole('button', { name: /Agregar Ejercicio retirado/ })).not.toBeInTheDocument();
  change(row(), 'Ejercicio', 'plank'); expect(row().getByLabelText('Ejercicio')).toHaveValue('plank');
});
it('preserves an empty time selection across tabs and keeps it out of the payload', async () => {
  const { api } = renderPanel(); await startEditing(); change(row(), 'Tipo', 'duration');
  expect(row().getByLabelText('Valor')).toHaveValue(''); day(2); day(1);
  expect(row().getByLabelText('Tipo')).toHaveValue('duration');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' })); await waitFor(() => expect(api.replace).toHaveBeenCalled());
  expect(api.replace.mock.calls[0]![1].days[0]?.exercises[0]).toEqual({ exerciseDefinitionId: 'squat', series: '4', repetitions: null, duration: null, load: '40 kg', rest: '30 s', notes: 'Controlar técnica' });
});
