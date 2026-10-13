import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { RoutineTemplateManager, type RoutineTemplateApi } from './routine-template-manager';

const definitions = [{ id: 'squat', name: 'Sentadilla', primaryMuscle: 'Piernas', isActive: true }, { id: 'plank', name: 'Plancha', primaryMuscle: 'Core', isActive: true }];
const template = { id: 'template', name: 'Modelo fuerza', days: [
  { position: 1, name: 'Fuerza', exercises: [{ exerciseDefinitionId: 'squat', exerciseDefinition: { name: 'Sentadilla', isActive: true }, series: '4', repetitions: '10', load: '60 kg', rest: '90 s', notes: 'Técnica' }] },
  { position: 2, name: 'Core', exercises: [{ exerciseDefinitionId: 'plank', exerciseDefinition: { name: 'Plancha', isActive: true }, duration: '45 s' }] },
] };
function renderManager(rows = [template]) {
  const api = {
    list: vi.fn<RoutineTemplateApi['list']>().mockResolvedValue(rows), create: vi.fn<RoutineTemplateApi['create']>().mockResolvedValue({}), update: vi.fn<RoutineTemplateApi['update']>().mockResolvedValue({}), delete: vi.fn<RoutineTemplateApi['delete']>().mockResolvedValue({}),
    exercises: vi.fn<RoutineTemplateApi['exercises']>().mockResolvedValue(definitions), createExercise: vi.fn<RoutineTemplateApi['createExercise']>().mockResolvedValue({ id: 'new', name: 'Remo', primaryMuscle: 'Espalda', isActive: true }),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><RoutineTemplateManager csrfToken="csrf" api={api}/></QueryClientProvider>);
  return { api, client };
}
const day = (index: number) => within(screen.getByRole('group', { name: `Día ${index}` }));
const change = (scope: ReturnType<typeof within>, label: string, value: string) => fireEvent.change(scope.getByLabelText(label), { target: { value } });
async function add(index: number, id: string) { change(day(index), 'Ejercicio', id); fireEvent.click(day(index).getByRole('button', { name: 'Agregar a la rutina' })); await day(index).findByRole('button', { name: 'Quitar' }); }
afterEach(cleanup);
it('lists ordered days and exercises with optional fields', async () => {
  renderManager(); await screen.findByRole('article', { name: 'Modelo fuerza' });
  expect(screen.getByText('Fuerza')).toBeInTheDocument(); expect(screen.getByText('Core')).toBeInTheDocument();
  expect(screen.getByText('Sentadilla · 4 series · 10 rep. · Carga 60 kg · Descanso 90 s · Observación Técnica')).toBeInTheDocument();
  expect(screen.getByText('Plancha · Tiempo 45 s')).toBeInTheDocument(); expect(screen.queryByText(/— series/)).not.toBeInTheDocument();
});
it('creates several days and exercises, including optional content and an exercise-only entry', async () => {
  const { api } = renderManager([]); fireEvent.click(screen.getByRole('button', { name: 'Nueva rutina preestablecida' }));
  await day(1).findByRole('option', { name: 'Sentadilla · Piernas' });
  fireEvent.change(screen.getByLabelText('Nombre de la preestablecida'), { target: { value: '  Modelo nuevo  ' } });
  for (const [label, value] of [['Series', '4'], ['Repeticiones', '10'], ['Carga', '60 kg'], ['Descanso', '90 s'], ['Observación', 'Técnica']]) change(day(1), label!, value!);
  await add(1, 'squat'); change(day(1), 'Tiempo', '45 s'); await add(1, 'plank');
  fireEvent.click(screen.getByRole('button', { name: 'Agregar día' })); await add(2, 'squat');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar preestablecida' })); await screen.findByText('Rutina preestablecida guardada correctamente.');
  expect(api.create).toHaveBeenCalledExactlyOnceWith({ name: 'Modelo nuevo', days: [
    { name: 'Día 1', exercises: [{ exerciseDefinitionId: 'squat', series: '4', repetitions: '10', duration: null, load: '60 kg', rest: '90 s', notes: 'Técnica' }, { exerciseDefinitionId: 'plank', series: null, repetitions: null, duration: '45 s', load: null, rest: null, notes: null }] },
    { name: 'Día 2', exercises: [{ exerciseDefinitionId: 'squat', series: null, repetitions: null, duration: null, load: null, rest: null, notes: null }] },
  ] }, expect.objectContaining({ credentials: 'include', headers: { 'x-csrf-token': 'csrf' } }));
  expect(api.update).not.toHaveBeenCalled(); await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2)); expect(api.exercises).toHaveBeenCalledTimes(1);
});
it('edits the complete template without any person and without mutating the source', async () => {
  const { api } = renderManager(); const original = structuredClone(template);
  await screen.findByRole('article', { name: 'Modelo fuerza' }); fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  expect(day(1).getByLabelText('Nombre del día 1')).toHaveValue('Fuerza'); expect(day(2).getByLabelText('Nombre del día 2')).toHaveValue('Core');
  fireEvent.change(screen.getByLabelText('Nombre de la preestablecida'), { target: { value: 'Actualizada' } });
  fireEvent.click(day(1).getByRole('button', { name: 'Editar' })); change(day(1), 'Series', '5'); fireEvent.click(day(1).getByRole('button', { name: 'Guardar ejercicio' }));
  await waitFor(() => expect(day(1).getByText(/5 series/)).toBeInTheDocument());
  fireEvent.click(day(2).getByRole('button', { name: 'Quitar día' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar preestablecida' })); await screen.findByText('Rutina preestablecida guardada correctamente.');
  expect(api.update).toHaveBeenCalledTimes(1); const [id, input] = api.update.mock.calls[0]!;
  expect(id).toBe('template'); expect(input.name).toBe('Actualizada'); expect(input.days).toHaveLength(1); expect(input.days[0]?.exercises[0]?.series).toBe('5');
  expect(input).not.toHaveProperty('personId'); expect(input).not.toHaveProperty('salaParticipationId'); expect(template).toEqual(original);
});
it('requires confirmation before deletion and supports cancellation', async () => {
  const { api } = renderManager(); await screen.findByRole('article', { name: 'Modelo fuerza' });
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
  expect(screen.getByRole('alertdialog')).toHaveTextContent('¿Eliminar esta rutina preestablecida? Las rutinas ya asignadas a alumnos no se modificarán.'); expect(api.delete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar eliminación' })); expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar' })); fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }));
  await screen.findByText('Rutina preestablecida eliminada correctamente.'); expect(api.delete).toHaveBeenCalledExactlyOnceWith('template', expect.any(Object)); await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
});
it('creates an inline exercise and preserves draft fields, days and the optional description', async () => {
  const { api } = renderManager([]); fireEvent.click(screen.getByRole('button', { name: 'Nueva rutina preestablecida' })); await day(1).findByRole('option', { name: 'Sentadilla · Piernas' });
  fireEvent.change(screen.getByLabelText('Nombre de la preestablecida'), { target: { value: 'Con remo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Agregar día' })); change(day(1), 'Series', '3');
  api.exercises.mockResolvedValue([...definitions, { id: 'new', name: 'Remo', primaryMuscle: 'Espalda', isActive: true }]);
  fireEvent.click(day(1).getByRole('button', { name: 'Nuevo ejercicio' })); change(day(1), 'Nombre del ejercicio', 'Remo'); change(day(1), 'Músculo principal', 'Espalda');
  fireEvent.click(day(1).getByRole('button', { name: 'Crear y seleccionar' })); await waitFor(() => expect(day(1).getByLabelText('Ejercicio')).toHaveValue('new'));
  expect(api.createExercise).toHaveBeenCalledWith({ name: 'Remo', primaryMuscle: 'Espalda', description: '' }, expect.any(Object)); expect(day(1).getByLabelText('Series')).toHaveValue('3'); expect(day(2).getByLabelText('Nombre del día 2')).toHaveValue('Día 2');
  fireEvent.click(day(1).getByRole('button', { name: 'Agregar a la rutina' })); await day(1).findByText('Remo · 3 series'); fireEvent.click(screen.getByRole('button', { name: 'Guardar preestablecida' })); await waitFor(() => expect(api.create).toHaveBeenCalled());
  expect(api.create.mock.calls[0]![0].days[0]?.exercises[0]).toMatchObject({ exerciseDefinitionId: 'new', series: '3' });
});
it('validates the trimmed mandatory name without sending a request', async () => {
  const { api } = renderManager([]); fireEvent.click(screen.getByRole('button', { name: 'Nueva rutina preestablecida' }));
  fireEvent.change(screen.getByLabelText('Nombre de la preestablecida'), { target: { value: '   ' } }); fireEvent.click(screen.getByRole('button', { name: 'Guardar preestablecida' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('El Nombre es obligatorio.'); expect(api.create).not.toHaveBeenCalled();
});

const server = setupServer();
const nativeFetch = globalThis.fetch;
beforeAll(() => { globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch; server.listen({ onUnhandledRequest: 'error' }); });
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
it.each(['create', 'update', 'delete'])('reports real HTTP errors without claiming success (%s)', async (operation) => {
  let listCalls = 0;
  server.use(
    http.get('http://localhost:3000/api/sala/routine-templates', () => { listCalls++; return HttpResponse.json({ data: operation === 'create' ? [] : [template] }); }),
    http.get('http://localhost:3000/api/sala/exercise-definitions', () => HttpResponse.json({ data: definitions })),
    http.post('http://localhost:3000/api/sala/routine-templates', () => HttpResponse.json({ message: 'HTTP rechazado' }, { status: 400 })),
    http.put('http://localhost:3000/api/sala/routine-templates/template', () => HttpResponse.json({ message: 'HTTP rechazado' }, { status: 400 })),
    http.delete('http://localhost:3000/api/sala/routine-templates/template', () => HttpResponse.json({ message: 'HTTP rechazado' }, { status: 404 })),
  );
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><RoutineTemplateManager csrfToken="csrf"/></QueryClientProvider>);
  if (operation === 'delete') { fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' })); fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' })); }
  else {
    if (operation === 'update') fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    else { fireEvent.click(screen.getByRole('button', { name: 'Nueva rutina preestablecida' })); fireEvent.change(screen.getByLabelText('Nombre de la preestablecida'), { target: { value: 'Nuevo' } }); }
    fireEvent.click(screen.getByRole('button', { name: 'Guardar preestablecida' }));
  }
  expect(await screen.findByRole('alert')).toHaveTextContent('HTTP rechazado'); expect(screen.queryByText(/correctamente/)).not.toBeInTheDocument(); expect(listCalls).toBe(1);
});
