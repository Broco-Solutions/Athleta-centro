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
    create: vi.fn<RoutineApi['create']>().mockResolvedValue({}), replace: vi.fn<RoutineApi['replace']>().mockResolvedValue({}),
    duplicate: vi.fn<RoutineApi['duplicate']>().mockResolvedValue({}), createExercise: vi.fn<RoutineApi['createExercise']>().mockResolvedValue({ id: 'row', name: 'Remo', primaryMuscle: 'Espalda', isActive: true }),
    updateExercise: vi.fn<RoutineApi['updateExercise']>().mockResolvedValue({}), retireExercise: vi.fn<RoutineApi['retireExercise']>().mockResolvedValue({}),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><RoutinePanel personId="person" participationId="participation" csrfToken="csrf" api={api} canManage={canManage}/></QueryClientProvider>);
  return { api, client };
}
afterEach(cleanup);
async function startEditing() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Editar rutina' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Editar rutina' }));
  await screen.findAllByRole('option', { name: 'Sentadilla · Piernas' });
}
function day(index: number) { return within(screen.getByRole('group', { name: `Día ${index}` })); }
function change(scope: ReturnType<typeof within>, label: string, value: string) { fireEvent.change(scope.getByLabelText(label), { target: { value } }); }
async function add(scope: ReturnType<typeof within>, id = 'squat') { const count = scope.queryAllByRole('button', { name: 'Quitar' }).length; change(scope, 'Ejercicio', id); fireEvent.click(scope.getByRole('button', { name: 'Agregar a la rutina' })); await waitFor(() => expect(scope.getAllByRole('button', { name: 'Quitar' })).toHaveLength(count + 1)); }
function openCatalog() { fireEvent.click(screen.getByText('Administrar ejercicios')); }
function fillCatalog() {
  fireEvent.change(screen.getByLabelText('Nombre del ejercicio'), { target: { value: 'Remo' } });
  fireEvent.change(screen.getByLabelText('Músculo principal'), { target: { value: 'Espalda' } });
  fireEvent.change(screen.getByLabelText('Descripción del ejercicio'), { target: { value: 'Con banda' } });
}

it('reads every day and optional value, including historical definitions absent from the active catalog', async () => {
  renderPanel([routine, { ...routine, id: 'old', status: 'HISTORICAL', version: 1, days: [{ position: 1, name: 'Histórico', exercises: [{ exerciseDefinitionId: 'retired', exerciseDefinition: { name: 'Ejercicio retirado' }, series: null }] }] }]);
  expect(await screen.findByText('Fuerza')).toBeInTheDocument();
  expect(screen.getByText('Core')).toBeInTheDocument();
  expect(screen.getByText('Sentadilla · 4 series · 10 rep. · Carga 40 kg · Descanso 30 s · Observación Controlar técnica')).toBeInTheDocument();
  expect(screen.getByText('Plancha · Tiempo 45 s')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Rutinas históricas (1)'));
  expect(screen.getByText('Ejercicio retirado')).toBeInTheDocument();
  expect(screen.queryByText(/— series/)).not.toBeInTheDocument();
});

it('edits all days and entries, adds and removes days and saves the complete ordered version', async () => {
  const { api } = renderPanel(); await startEditing();
  expect(day(1).getByLabelText('Nombre del día 1')).toHaveValue('Fuerza');
  expect(day(2).getByLabelText('Nombre del día 2')).toHaveValue('Core');
  fireEvent.click(day(1).getByRole('button', { name: 'Editar' }));
  for (const [label, value] of [['Ejercicio', 'squat'], ['Series', '4'], ['Repeticiones', '10'], ['Carga', '40 kg'], ['Descanso', '30 s'], ['Observación', 'Controlar técnica']]) expect(day(1).getByLabelText(label!)).toHaveValue(value);
  change(day(1), 'Series', '5'); fireEvent.click(day(1).getByRole('button', { name: 'Guardar ejercicio' }));
  await day(1).findByRole('button', { name: 'Agregar a la rutina' }); await add(day(1), 'plank'); await add(day(1));
  fireEvent.click(day(1).getAllByRole('button', { name: 'Quitar' })[2]!);
  fireEvent.click(day(2).getByRole('button', { name: 'Editar' }));
  expect(day(2).getByLabelText('Tiempo')).toHaveValue('45 s');
  expect(day(2).getByLabelText('Repeticiones')).toBeDisabled();
  fireEvent.click(day(2).getByRole('button', { name: 'Cancelar edición' }));
  fireEvent.click(screen.getByRole('button', { name: 'Agregar día' }));
  change(day(3), 'Nombre del día 3', 'Movilidad'); await add(day(3), 'plank');
  fireEvent.click(day(2).getByRole('button', { name: 'Quitar día' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar rutina' }));
  await screen.findByText('Rutina guardada correctamente.');
  expect(api.replace).toHaveBeenCalledWith('routine', {
    personId: 'person', salaParticipationId: 'participation', days: [
      { position: 1, name: 'Fuerza', exercises: [
        { exerciseDefinitionId: 'squat', series: '5', repetitions: '10', duration: null, load: '40 kg', rest: '30 s', notes: 'Controlar técnica' },
        { exerciseDefinitionId: 'plank', series: null, repetitions: null, duration: null, load: null, rest: null, notes: null },
      ] },
      { position: 2, name: 'Movilidad', exercises: [{ exerciseDefinitionId: 'plank', series: null, repetitions: null, duration: null, load: null, rest: null, notes: null }] },
    ],
  }, expect.objectContaining({ credentials: 'include', headers: { 'x-csrf-token': 'csrf' } }));
});

it('requires only the exercise and keeps at least one visible day', async () => {
  const { api } = renderPanel([]);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Crear rutina' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Crear rutina' }));
  expect(day(1).getByLabelText('Nombre del día 1')).toHaveValue('Día 1');
  expect(day(1).getByRole('button', { name: 'Quitar día' })).toBeDisabled();
  fireEvent.click(day(1).getByRole('button', { name: 'Agregar a la rutina' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Seleccioná un ejercicio');
  await screen.findByRole('option', { name: 'Plancha · Core' }); await add(day(1), 'plank');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar rutina' }));
  await waitFor(() => expect(api.create).toHaveBeenCalled());
  expect(api.create.mock.calls[0]?.[0].days[0]?.exercises[0]).toEqual({ exerciseDefinitionId: 'plank', series: null, repetitions: null, duration: null, load: null, rest: null, notes: null });
});

it('prevents simultaneous repetitions and time without discarding values and validates an invalid existing entry', async () => {
  renderPanel([{ ...routine, days: [{ position: 1, exercises: [{ exerciseDefinitionId: 'squat', repetitions: '10', duration: '45 s' }] }] }]);
  await startEditing(); fireEvent.click(day(1).getByRole('button', { name: 'Editar' }));
  expect(day(1).getByRole('alert')).toHaveTextContent('Elegí Repeticiones o Tiempo, no ambos.');
  fireEvent.click(day(1).getByRole('button', { name: 'Guardar ejercicio' }));
  expect(day(1).getByLabelText('Repeticiones')).toHaveValue('10'); expect(day(1).getByLabelText('Tiempo')).toHaveValue('45 s');
  change(day(1), 'Tiempo', ''); expect(day(1).getByLabelText('Tiempo')).toBeDisabled();
  change(day(1), 'Repeticiones', ''); change(day(1), 'Tiempo', '30 s'); expect(day(1).getByLabelText('Repeticiones')).toBeDisabled();
  fireEvent.click(day(1).getByRole('button', { name: 'Guardar ejercicio' }));
  await waitFor(() => expect(day(1).queryByRole('alert')).not.toBeInTheDocument());
});

it('duplicates a visible routine using its ID, refreshes and reports success', async () => {
  const { api } = renderPanel(); await screen.findByText('Fuerza');
  fireEvent.click(screen.getByRole('button', { name: 'Duplicar rutina' }));
  expect(await screen.findByText('Rutina duplicada correctamente.')).toBeInTheDocument();
  expect(api.duplicate).toHaveBeenCalledWith('routine', expect.any(Object));
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
});
it('reports duplication errors without success or invalidation', async () => {
  const { api } = renderPanel(); api.duplicate.mockRejectedValue(new Error('No se puede duplicar'));
  await screen.findByText('Fuerza'); fireEvent.click(screen.getByRole('button', { name: 'Duplicar rutina' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se puede duplicar');
  expect(screen.queryByText('Rutina duplicada correctamente.')).not.toBeInTheDocument(); expect(api.list).toHaveBeenCalledTimes(1);
});
it('creates a catalog exercise and clears the form while keeping the routine editor open', async () => {
  const { api } = renderPanel(); await startEditing(); openCatalog(); fillCatalog();
  fireEvent.click(within(screen.getByText('Administrar ejercicios').closest('details')!).getByRole('button', { name: 'Nuevo ejercicio' })); await screen.findByText('Ejercicio creado correctamente.');
  expect(api.createExercise).toHaveBeenCalledWith({ name: 'Remo', primaryMuscle: 'Espalda', description: 'Con banda' }, expect.any(Object));
  expect(screen.getByLabelText('Nombre del ejercicio')).toHaveValue(''); expect(screen.getByRole('button', { name: 'Guardar rutina' })).toBeInTheDocument();
  await waitFor(() => expect(api.exercises).toHaveBeenCalledTimes(2));
});
it('edits the same catalog exercise and refreshes definitions and routines', async () => {
  const { api } = renderPanel(); await screen.findByText('Fuerza'); openCatalog();
  fireEvent.click(within(screen.getByText('Sentadilla · Piernas').closest('li')!).getByRole('button', { name: 'Editar' }));
  expect(screen.getByLabelText('Nombre del ejercicio')).toHaveValue('Sentadilla'); fillCatalog();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios del ejercicio' })); await screen.findByText('Ejercicio actualizado correctamente.');
  expect(api.updateExercise).toHaveBeenCalledWith('squat', { name: 'Remo', primaryMuscle: 'Espalda', description: 'Con banda' }, expect.any(Object));
  await waitFor(() => { expect(api.list).toHaveBeenCalledTimes(2); expect(api.exercises).toHaveBeenCalledTimes(2); });
});
it('retires directly when no active routine is affected', async () => {
  const { api } = renderPanel(); await screen.findByText('Fuerza'); openCatalog();
  fireEvent.click(screen.getAllByRole('button', { name: 'Retirar' })[0]!); await screen.findByText('Ejercicio retirado correctamente.');
  expect(api.retireExercise).toHaveBeenCalledWith('squat', { confirmActiveRoutineImpact: false }, expect.any(Object));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  await waitFor(() => { expect(api.list).toHaveBeenCalledTimes(2); expect(api.exercises).toHaveBeenCalledTimes(2); });
});
it('shows distinct active routine impact and waits for explicit retirement confirmation', async () => {
  const { api } = renderPanel(); api.retireExercise.mockRejectedValueOnce(Object.assign(new Error('Confirmación requerida'), { code: 'SALA_EXERCISE_RETIRE_CONFIRMATION_REQUIRED', details: { activeRoutines: 2 } }));
  await screen.findByText('Fuerza'); openCatalog(); fireEvent.click(screen.getAllByRole('button', { name: 'Retirar' })[0]!);
  expect(await screen.findByRole('alertdialog')).toHaveTextContent('Este ejercicio se utiliza en 2 Rutinas activas. Si lo retirás, se quitará de esas Rutinas. Las Rutinas históricas no se modificarán.');
  expect(api.retireExercise).toHaveBeenCalledTimes(1); expect(api.list).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar retiro' })); await screen.findByText('Ejercicio retirado correctamente.');
  expect(api.retireExercise).toHaveBeenLastCalledWith('squat', { confirmActiveRoutineImpact: true }, expect.any(Object));
});
it('keeps catalog input and reports a creation error', async () => {
  const { api } = renderPanel(); api.createExercise.mockRejectedValue(new Error('Ejercicio duplicado'));
  await screen.findByText('Fuerza'); openCatalog(); fillCatalog(); fireEvent.click(within(screen.getByText('Administrar ejercicios').closest('details')!).getByRole('button', { name: 'Nuevo ejercicio' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Ejercicio duplicado'); expect(screen.getByLabelText('Nombre del ejercicio')).toHaveValue('Remo');
  expect(screen.queryByText('Ejercicio creado correctamente.')).not.toBeInTheDocument(); expect(api.exercises).toHaveBeenCalledTimes(1);
});
it('allows read-only users to see active and historical routines without management or catalog requests', async () => {
  const { api } = renderPanel([routine, { ...routine, id: 'old', version: 1, status: 'HISTORICAL' }], false);
  await screen.findAllByText('Fuerza'); fireEvent.click(screen.getByText('Rutinas históricas (1)'));
  expect(screen.getByText('Rutina v1')).toBeInTheDocument();
  for (const name of ['Crear rutina', 'Editar rutina', 'Duplicar rutina']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  expect(screen.queryByText('Administrar ejercicios')).not.toBeInTheDocument(); expect(api.exercises).not.toHaveBeenCalled();
});

const deadlift = { id: 'deadlift', name: 'Peso muerto', primaryMuscle: 'Piernas', description: 'Con barra', isActive: true };
async function startNewRoutine() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Crear rutina' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Crear rutina' }));
}
function fillInline(index = 1) {
  const scope = day(index);
  fireEvent.click(scope.getByRole('button', { name: 'Nuevo ejercicio' }));
  change(scope, 'Nombre del ejercicio', 'Peso muerto');
  change(scope, 'Músculo principal', 'Piernas');
  change(scope, 'Descripción del ejercicio', 'Con barra');
}
it('explains an empty catalog and validates selection without adding an empty entry', async () => {
  renderPanel([], true, async () => []); await startNewRoutine();
  expect(day(1).getByLabelText('Ejercicio').querySelectorAll('option')).toHaveLength(1);
  expect(day(1).getByRole('option')).toHaveTextContent('Seleccionar ejercicio');
  expect(day(1).getByText('Todavía no hay ejercicios en el catálogo. Creá uno nuevo para continuar.')).toBeInTheDocument();
  expect(day(1).getByRole('button', { name: 'Nuevo ejercicio' })).toBeVisible();
  fireEvent.click(day(1).getByRole('button', { name: 'Agregar a la rutina' }));
  expect(await day(1).findByRole('alert')).toHaveTextContent('Seleccioná un ejercicio');
  expect(day(1).queryByRole('listitem')).not.toBeInTheDocument();
});
it('creates and selects inline, preserves the draft and saves the full multi-day routine only after adding', async () => {
  const { api, client } = renderPanel([], true, async () => []); await startNewRoutine();
  change(day(1), 'Nombre del día 1', 'Fuerza');
  fireEvent.click(screen.getByRole('button', { name: 'Agregar día' }));
  change(day(1), 'Series', '4'); change(day(1), 'Repeticiones', '8'); change(day(1), 'Carga', '60 kg');
  change(day(1), 'Descanso', '30 s'); change(day(1), 'Observación', 'Controlar técnica');
  api.createExercise.mockResolvedValue(deadlift); api.exercises.mockResolvedValue([deadlift]);
  fillInline(); fireEvent.click(day(1).getByRole('button', { name: 'Crear y seleccionar' }));
  await waitFor(() => expect(day(1).getByLabelText('Ejercicio')).toHaveValue('deadlift'));
  expect(api.createExercise).toHaveBeenCalledExactlyOnceWith({ name: 'Peso muerto', primaryMuscle: 'Piernas', description: 'Con barra' }, expect.objectContaining({ credentials: 'include', headers: { 'x-csrf-token': 'csrf' } }));
  expect(day(1).getByRole('option', { name: 'Peso muerto · Piernas' })).toBeInTheDocument();
  expect(screen.getByText('Nueva rutina')).toBeInTheDocument();
  expect(day(1).queryByRole('listitem')).not.toBeInTheDocument(); expect(api.create).not.toHaveBeenCalled();
  for (const [label, value] of [['Nombre del día 1', 'Fuerza'], ['Series', '4'], ['Repeticiones', '8'], ['Carga', '60 kg'], ['Descanso', '30 s'], ['Observación', 'Controlar técnica']]) expect(day(1).getByLabelText(label!)).toHaveValue(value);
  expect(day(2).getByLabelText('Nombre del día 2')).toHaveValue('Día 2');
  expect(client.getQueryData(['sala-exercise-definitions'])).toEqual([deadlift]);
  await waitFor(() => expect(api.exercises).toHaveBeenCalledTimes(2));
  fireEvent.click(day(1).getByRole('button', { name: 'Agregar a la rutina' }));
  expect(await day(1).findByRole('listitem')).toHaveTextContent('Peso muerto · 4 series · 8 rep. · Carga 60 kg');
  change(day(2), 'Tiempo', '45 s'); await add(day(2), 'deadlift');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar rutina' }));
  await waitFor(() => expect(api.create).toHaveBeenCalledExactlyOnceWith({ personId: 'person', salaParticipationId: 'participation', days: [
    { position: 1, name: 'Fuerza', exercises: [{ exerciseDefinitionId: 'deadlift', series: '4', repetitions: '8', duration: null, load: '60 kg', rest: '30 s', notes: 'Controlar técnica' }] },
    { position: 2, name: 'Día 2', exercises: [{ exerciseDefinitionId: 'deadlift', series: null, repetitions: null, duration: '45 s', load: null, rest: null, notes: null }] },
  ] }, expect.any(Object)));
});
it('selects the created exercise only in its originating day and preserves time and existing entries', async () => {
  const { api } = renderPanel(); await startEditing();
  change(day(1), 'Ejercicio', 'squat'); change(day(2), 'Tiempo', '45 s');
  api.createExercise.mockResolvedValue(deadlift); api.exercises.mockResolvedValue([...definitions, deadlift]);
  fillInline(2); fireEvent.click(day(2).getByRole('button', { name: 'Crear y seleccionar' }));
  await waitFor(() => expect(day(2).getByLabelText('Ejercicio')).toHaveValue('deadlift'));
  expect(day(1).getByLabelText('Ejercicio')).toHaveValue('squat'); expect(day(2).getByLabelText('Tiempo')).toHaveValue('45 s');
  expect(day(1).getAllByRole('listitem')).toHaveLength(1); expect(day(2).getAllByRole('listitem')).toHaveLength(1);
});
it('keeps inline creation fields and the whole routine after a creation error and allows retry', async () => {
  const { api } = renderPanel(); await startEditing();
  change(day(1), 'Series', '4'); change(day(1), 'Ejercicio', 'squat');
  api.createExercise.mockRejectedValueOnce(new Error('No se pudo crear el ejercicio'));
  fillInline(); fireEvent.click(day(1).getByRole('button', { name: 'Crear y seleccionar' }));
  expect(await day(1).findByRole('alert')).toHaveTextContent('No se pudo crear el ejercicio');
  for (const [label, value] of [['Nombre del ejercicio', 'Peso muerto'], ['Músculo principal', 'Piernas'], ['Descripción del ejercicio', 'Con barra'], ['Series', '4'], ['Ejercicio', 'squat']]) expect(day(1).getByLabelText(label!)).toHaveValue(value);
  expect(day(1).queryByRole('option', { name: 'Peso muerto · Piernas' })).not.toBeInTheDocument();
  expect(day(1).getAllByRole('listitem')).toHaveLength(1); expect(day(2).getByLabelText('Nombre del día 2')).toHaveValue('Core');
  expect(api.exercises).toHaveBeenCalledTimes(1);
  api.createExercise.mockResolvedValue(deadlift); api.exercises.mockResolvedValue([...definitions, deadlift]);
  fireEvent.click(day(1).getByRole('button', { name: 'Crear y seleccionar' }));
  await waitFor(() => expect(day(1).getByLabelText('Ejercicio')).toHaveValue('deadlift'));
  fireEvent.click(day(1).getByRole('button', { name: 'Nuevo ejercicio' }));
  expect(day(1).getByLabelText('Nombre del ejercicio')).toHaveValue('');
});
it('validates required catalog fields without clearing the inline form', async () => {
  const { api } = renderPanel([]); await startNewRoutine();
  fireEvent.click(day(1).getByRole('button', { name: 'Nuevo ejercicio' }));
  fireEvent.click(day(1).getByRole('button', { name: 'Crear y seleccionar' }));
  expect(await day(1).findByRole('alert')).toHaveTextContent('El Nombre es obligatorio.');
  change(day(1), 'Nombre del ejercicio', 'Peso muerto');
  fireEvent.click(day(1).getByRole('button', { name: 'Crear y seleccionar' }));
  expect(await day(1).findByText('El Músculo principal es obligatorio.')).toBeInTheDocument();
  expect(day(1).getByLabelText('Nombre del ejercicio')).toHaveValue('Peso muerto'); expect(api.createExercise).not.toHaveBeenCalled();
});
it('shows catalog failure beside the selector and prevents a misleading selection validation', async () => {
  renderPanel([], true, async () => { throw new Error('API unavailable'); }); await startNewRoutine();
  expect(await day(1).findByText('No se pudo cargar el catálogo de ejercicios.')).toBeInTheDocument();
  expect(day(1).queryByText(/Todavía no hay ejercicios/)).not.toBeInTheDocument();
  expect(day(1).getByRole('button', { name: 'Agregar a la rutina' })).toBeDisabled();
  fireEvent.submit(day(1).getByLabelText('Ejercicio').closest('form')!);
  await waitFor(() => expect(day(1).queryByText('Seleccioná un ejercicio')).not.toBeInTheDocument());
});
it('shows catalog loading instead of an empty catalog', async () => {
  let resolveCatalog!: (value: typeof definitions) => void;
  renderPanel([], true, () => new Promise(resolve => { resolveCatalog = resolve; })); await startNewRoutine();
  expect(day(1).getByText('Cargando catálogo de ejercicios…')).toBeInTheDocument();
  expect(day(1).queryByText(/Todavía no hay ejercicios/)).not.toBeInTheDocument();
  expect(day(1).getByRole('button', { name: 'Agregar a la rutina' })).toBeDisabled();
  resolveCatalog(definitions); await day(1).findByRole('option', { name: 'Sentadilla · Piernas' });
  expect(day(1).getByRole('button', { name: 'Agregar a la rutina' })).toBeEnabled();
});

it('selects immediately while catalog refetch is pending and supports optional description via Enter', async () => {
  let finishRefetch!: (value: typeof definitions) => void;
  const { api } = renderPanel([], true, async () => []); await startNewRoutine();
  api.exercises.mockImplementation(() => new Promise(resolve => { finishRefetch = resolve; }));
  api.createExercise.mockResolvedValue(deadlift);
  fillInline(); change(day(1), 'Descripción del ejercicio', '');
  fireEvent.keyDown(day(1).getByLabelText('Nombre del ejercicio'), { key: 'Enter' });
  await waitFor(() => expect(day(1).getByLabelText('Ejercicio')).toHaveValue('deadlift'));
  expect(api.createExercise).toHaveBeenCalledExactlyOnceWith({ name: 'Peso muerto', primaryMuscle: 'Piernas', description: '' }, expect.any(Object));
  expect(day(1).queryByRole('listitem')).not.toBeInTheDocument();
  expect(day(1).getByRole('button', { name: 'Agregar a la rutina' })).toBeEnabled();
  finishRefetch([deadlift]);
  await waitFor(() => expect(day(1).getByLabelText('Ejercicio')).toHaveValue('deadlift'));
});
