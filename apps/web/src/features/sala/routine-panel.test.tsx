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
function renderPanel(rows: Routine[] = [routine], canManage = true) {
  const api = {
    list: vi.fn<RoutineApi['list']>().mockResolvedValue(rows), exercises: vi.fn<RoutineApi['exercises']>().mockResolvedValue(definitions),
    create: vi.fn<RoutineApi['create']>().mockResolvedValue({}), replace: vi.fn<RoutineApi['replace']>().mockResolvedValue({}),
    duplicate: vi.fn<RoutineApi['duplicate']>().mockResolvedValue({}), createExercise: vi.fn<RoutineApi['createExercise']>().mockResolvedValue({}),
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
async function add(scope: ReturnType<typeof within>, id = 'squat') { const count = scope.queryAllByRole('button', { name: 'Quitar' }).length; change(scope, 'Ejercicio', id); fireEvent.click(scope.getByRole('button', { name: 'Agregar ejercicio' })); await waitFor(() => expect(scope.getAllByRole('button', { name: 'Quitar' })).toHaveLength(count + 1)); }
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
  await day(1).findByRole('button', { name: 'Agregar ejercicio' }); await add(day(1), 'plank'); await add(day(1));
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
  fireEvent.click(day(1).getByRole('button', { name: 'Agregar ejercicio' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo ejercicio' })); await screen.findByText('Ejercicio creado correctamente.');
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
  await screen.findByText('Fuerza'); openCatalog(); fillCatalog(); fireEvent.click(screen.getByRole('button', { name: 'Nuevo ejercicio' }));
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
