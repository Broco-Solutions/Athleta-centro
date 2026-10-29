import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { RoutineTemplateManager, type RoutineTemplateApi } from './routine-template-manager';
import type { RoutineTemplate } from './routine-editor';

const definitions = [{ id: 'squat', name: 'Sentadilla', primaryMuscle: 'Piernas', movementPatternId: 'push', isActive: true }, { id: 'plank', name: 'Plancha', primaryMuscle: 'Core', movementPatternId: 'core', isActive: true }, { id: 'free', name: 'Movilidad libre', primaryMuscle: 'Movilidad', movementPatternId: null, isActive: true }];
const patterns = [{ id: 'push', name: 'Empuje' }, { id: 'core', name: 'Core' }];
const template = { id: 'template', name: 'Modelo fuerza', days: [
  { position: 1, name: 'Fuerza', exercises: [{ exerciseDefinitionId: 'squat', exerciseDefinition: { name: 'Sentadilla', description: 'Descenso controlado', isActive: true }, series: '4', repetitions: '10', load: '60 kg', rest: '90 s', notes: 'Técnica' }] },
  { position: 2, name: 'Core', exercises: [{ exerciseDefinitionId: 'plank', exerciseDefinition: { name: 'Plancha', isActive: true }, duration: '45 s' }] },
] };
function renderManager(rows: RoutineTemplate[] = [template], catalogDefinitions: Awaited<ReturnType<RoutineTemplateApi['exercises']>> = definitions) {
  const api = {
    list: vi.fn<RoutineTemplateApi['list']>().mockResolvedValue(rows), create: vi.fn<RoutineTemplateApi['create']>().mockResolvedValue({}), update: vi.fn<RoutineTemplateApi['update']>().mockResolvedValue({}), delete: vi.fn<RoutineTemplateApi['delete']>().mockResolvedValue({}),
    exercises: vi.fn<RoutineTemplateApi['exercises']>().mockResolvedValue(catalogDefinitions), patterns: vi.fn<RoutineTemplateApi['patterns']>().mockResolvedValue(patterns),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><RoutineTemplateManager csrfToken="csrf" api={api}/></QueryClientProvider>);
  return { api, client };
}
const day = (index: number) => { fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Día ${index}:`) })); return within(screen.getByRole('group', { name: `Día ${index}` })); };
const change = (scope: ReturnType<typeof within>, label: string, value: string) => fireEvent.change(scope.getByLabelText(label), { target: { value } });
async function add(index: number, id: string) { day(index); change(catalog(), 'Buscar ejercicio', id === 'squat' ? 'Sentadilla' : 'Plancha'); fireEvent.click(await screen.findByRole('button', { name: `Agregar ${id === 'squat' ? 'Sentadilla' : 'Plancha'}` })); }
const catalog = () => within(screen.getByRole('region', { name: 'Agregar ejercicios' }));
const row = (index = 0) => within(screen.getByRole('group', { name: /^Día \d+$/ }).querySelectorAll('li')[index]!);
afterEach(cleanup);
it('uses the shared description and accent-insensitive search while preserving template edits', async () => {
  renderManager([template], [...definitions.map(item => ({ ...item, description: item.id === 'squat' ? 'Fuerza para fútbol' : null })), { id: 'retired', name: 'Sentadilla retirada', description: 'Fútbol', isActive: false }]);
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  change(row(), 'Series', '7');
  change(catalog(), 'Buscar ejercicio', 'SENTADILLA futbol');
  expect(catalog().getByRole('button', { name: 'Agregar Sentadilla' })).toBeInTheDocument();
  expect(catalog().queryByRole('button', { name: 'Agregar Plancha' })).not.toBeInTheDocument();
  expect(catalog().queryByRole('button', { name: 'Agregar Sentadilla retirada' })).not.toBeInTheDocument();
  fireEvent.click(catalog().getByRole('button', { name: 'Agregar Sentadilla' }));
  expect(day(1).getAllByRole('listitem')).toHaveLength(2); expect(row().getByLabelText('Series')).toHaveValue('7');
});
it('lists ordered days and exercises with optional fields', async () => {
  renderManager(); await screen.findByRole('article', { name: 'Modelo fuerza' });
  expect(screen.getByText('Fuerza')).toBeInTheDocument(); expect(screen.getByText('Core')).toBeInTheDocument();
  expect(screen.getByText('Sentadilla')).toBeInTheDocument(); expect(screen.getByText('4 series · 10 rep. · Carga 60 kg · Descanso 90 s')).toBeInTheDocument();
  expect(screen.getByText('Observación: Técnica')).toBeInTheDocument(); expect(screen.getByText('Plancha')).toBeInTheDocument(); expect(screen.getByText('Tiempo 45 s')).toBeInTheDocument();
  expect(screen.getByText('Descenso controlado')).toBeInTheDocument();
  expect(screen.getByText('Rutina seleccionada')).toBeInTheDocument(); expect(screen.getByRole('button', { name: /Modelo fuerza/ })).toHaveAttribute('aria-pressed', 'true');
});
it('creates several days and exercises, including optional content and an exercise-only entry', async () => {
  const { api } = renderManager([]); fireEvent.click(screen.getByRole('button', { name: 'Nueva rutina preestablecida' }));
  change(catalog(), 'Buscar ejercicio', 'Sentadilla');
  await catalog().findByRole('button', { name: 'Agregar Sentadilla' });
  fireEvent.change(screen.getByLabelText('Nombre de la preestablecida'), { target: { value: '  Modelo nuevo  ' } });
  await add(1, 'squat');
  for (const [label, value] of [['Series', '4'], ['Valor', '10'], ['Carga', '60 kg'], ['Descanso', '90 s'], ['Observación', 'Técnica']]) change(day(1), label!, value!);
  await add(1, 'plank'); change(row(1), 'Tipo', 'duration'); change(row(1), 'Valor', '45 s');
  fireEvent.click(screen.getByRole('button', { name: '+ Agregar día' })); await add(2, 'squat');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' })); await screen.findByText('Rutina preestablecida guardada correctamente.');
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
  change(day(1), 'Series', '5'); day(2);
  expect(screen.queryByRole('group', { name: 'Día 1' })).not.toBeInTheDocument();
  day(1); expect(row().getByLabelText('Series')).toHaveValue('5');
  fireEvent.click(day(2).getByRole('button', { name: 'Eliminar día' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' })); await screen.findByText('Rutina preestablecida guardada correctamente.');
  expect(api.update).toHaveBeenCalledTimes(1); const [id, input] = api.update.mock.calls[0]!;
  expect(id).toBe('template'); expect(input.name).toBe('Actualizada'); expect(input.days).toHaveLength(1); expect(input.days[0]?.exercises[0]?.series).toBe('5');
  expect(input).not.toHaveProperty('personId'); expect(input).not.toHaveProperty('salaParticipationId'); expect(template).toEqual(original);
});
it('omits exercise totals in the routine editor and uses muted surfaces for its three editing blocks', async () => {
  const singleDay: RoutineTemplate = { id: 'single', name: 'Una jornada', days: [{ position: 1, name: 'Fuerza', exercises: [
    { exerciseDefinitionId: 'squat', exerciseDefinition: { name: 'Sentadilla', isActive: true }, series: '4' },
    { exerciseDefinitionId: 'plank', exerciseDefinition: { name: 'Plancha', isActive: true }, duration: '45 s' },
  ] }] };
  renderManager([singleDay]); fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  const nameBlock = screen.getByLabelText('Nombre de la preestablecida').parentElement!.parentElement!;
  expect(nameBlock).toHaveClass('bg-surface-muted');
  expect(nameBlock).toHaveTextContent('1 día');
  expect(nameBlock).not.toHaveTextContent(/ejercicios/);
  const tab = screen.getByRole('button', { name: /^Día 1:/ });
  expect(tab).not.toHaveTextContent(/Día 1\s+1/);
  const editorDay = screen.getByRole('group', { name: 'Día 1' });
  expect(editorDay).toHaveClass('bg-surface-muted');
  expect(within(editorDay).queryByText(/1 ejercicio/)).not.toBeInTheDocument();
  const exercisePicker = screen.getByRole('region', { name: 'Agregar ejercicios' });
  expect(exercisePicker).toHaveClass('bg-surface-muted');
});
it('requires confirmation before deletion and supports cancellation', async () => {
  const { api } = renderManager(); await screen.findByRole('article', { name: 'Modelo fuerza' });
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
  expect(screen.getByRole('alertdialog')).toHaveTextContent('¿Eliminar esta rutina preestablecida? Las rutinas ya asignadas a alumnos no se modificarán.'); expect(api.delete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar eliminación' })); expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar' })); fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }));
  await screen.findByText('Rutina preestablecida eliminada correctamente.'); expect(api.delete).toHaveBeenCalledExactlyOnceWith('template', expect.any(Object)); await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
});
it('keeps catalog management outside template editing', async () => {
  renderManager(); fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  expect(catalog().getByText('Patrones de movimiento')).toBeInTheDocument();
  for (const name of ['+ Nuevo ejercicio', '+ Nuevo patrón', 'Renombrar patrón', 'Editar', 'Retirar', 'Crear ejercicio']) expect(catalog().queryByRole('button', { name })).not.toBeInTheDocument();
  expect(catalog().getByRole('searchbox')).toBeInTheDocument();
  expect(row().queryByRole('combobox', { name: 'Ejercicio' })).not.toBeInTheDocument();
});
it('filters exercises by movement pattern and combines the pattern with search', async () => {
  renderManager(); fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  expect(catalog().getByRole('button', { name: /Todos los ejercicios/ })).toBeInTheDocument();
  expect(catalog().getByRole('button', { name: /Empuje/ })).toBeInTheDocument();
  expect(catalog().getByRole('button', { name: /Core/ })).toBeInTheDocument();
  fireEvent.click(catalog().getByRole('button', { name: /Empuje/ }));
  expect(catalog().getByRole('button', { name: 'Agregar Sentadilla' })).toBeInTheDocument();
  expect(catalog().queryByRole('button', { name: 'Agregar Plancha' })).not.toBeInTheDocument();
  expect(catalog().queryByRole('button', { name: 'Agregar Movilidad libre' })).not.toBeInTheDocument();
  change(catalog(), 'Buscar ejercicio', 'press');
  expect(catalog().getByText('No hay ejercicios que coincidan.')).toBeInTheDocument();
  change(catalog(), 'Buscar ejercicio', 'sentadilla');
  expect(catalog().getByRole('button', { name: 'Agregar Sentadilla' })).toBeInTheDocument();
});
it('paginates the template exercise picker and keeps added exercise edits across page changes', async () => {
  const many = Array.from({ length: 10 }, (_, index) => ({ id: `exercise-${index}`, name: `Ejercicio ${index}`, movementPatternId: 'push', isActive: true }));
  renderManager([], many); fireEvent.click(screen.getByRole('button', { name: 'Nueva rutina preestablecida' }));
  await catalog().findByRole('button', { name: 'Agregar Ejercicio 0' });
  expect(catalog().getAllByRole('button', { name: /^Agregar Ejercicio/ })).toHaveLength(8);
  expect(catalog().getByText('Página 1 de 2')).toBeVisible();
  fireEvent.click(catalog().getByRole('button', { name: 'Siguiente' }));
  fireEvent.click(catalog().getByRole('button', { name: 'Agregar Ejercicio 8' }));
  change(row(), 'Series', '4');
  fireEvent.click(catalog().getByRole('button', { name: 'Anterior' }));
  expect(row().getByLabelText('Series')).toHaveValue('4');
  fireEvent.click(catalog().getByRole('button', { name: 'Siguiente' }));
  fireEvent.click(catalog().getByRole('button', { name: /Empuje/ }));
  expect(catalog().getByText('Página 1 de 2')).toBeVisible();
  fireEvent.click(catalog().getByRole('button', { name: 'Siguiente' }));
  change(catalog(), 'Buscar ejercicio', 'Ejercicio 9');
  expect(catalog().getByText('Página 1 de 1')).toBeVisible();
  expect(row().getByLabelText('Series')).toHaveValue('4');
});
it('offers Sin patrón only when active exercises have no pattern and filters those exercises', async () => {
  renderManager(); fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  fireEvent.click(catalog().getByRole('button', { name: /Sin patrón/ }));
  expect(catalog().getByRole('button', { name: 'Agregar Movilidad libre' })).toBeInTheDocument();
  expect(catalog().queryByRole('button', { name: 'Agregar Sentadilla' })).not.toBeInTheDocument();
  expect(catalog().queryByRole('button', { name: 'Agregar Plancha' })).not.toBeInTheDocument();
});
it('cancels template editing without persistence or source mutation and places both actions at the end', async () => {
  const { api } = renderManager(); const original = structuredClone(template);
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  expect(screen.queryByRole('group', { name: 'Día 2' })).not.toBeInTheDocument();
  change(day(1), 'Series', '99'); day(2); day(1); expect(row().getByLabelText('Series')).toHaveValue('99');
  expect(screen.getAllByRole('button', { name: 'Cancelar' })).toHaveLength(1);
  const editor = screen.getByRole('region', { name: 'Contenido de la rutina' });
  for (const name of ['Cancelar', 'Guardar cambios']) expect(editor.compareDocumentPosition(screen.getByRole('button', { name })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(api.update).not.toHaveBeenCalled(); expect(api.create).not.toHaveBeenCalled(); expect(template).toEqual(original);
  fireEvent.click(screen.getByRole('button', { name: 'Editar' })); expect(row().getByLabelText('Series')).toHaveValue('4');
});
it('validates the trimmed mandatory name without sending a request', async () => {
  const { api } = renderManager([]); fireEvent.click(screen.getByRole('button', { name: 'Nueva rutina preestablecida' }));
  fireEvent.change(screen.getByLabelText('Nombre de la preestablecida'), { target: { value: '   ' } }); fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
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
    http.get('http://localhost:3000/api/sala/movement-patterns', () => HttpResponse.json({ data: patterns })),
    http.post('http://localhost:3000/api/sala/routine-templates', () => HttpResponse.json({ message: 'HTTP rechazado' }, { status: 400 })),
    http.put('http://localhost:3000/api/sala/routine-templates/template', () => HttpResponse.json({ message: 'HTTP rechazado' }, { status: 400 })),
    http.delete('http://localhost:3000/api/sala/routine-templates/template', () => HttpResponse.json({ message: 'HTTP rechazado' }, { status: 404 })),
  );
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><RoutineTemplateManager csrfToken="csrf"/></QueryClientProvider>);
  if (operation === 'delete') { fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' })); fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' })); }
  else {
    if (operation === 'update') fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    else { fireEvent.click(screen.getByRole('button', { name: 'Nueva rutina preestablecida' })); fireEvent.change(screen.getByLabelText('Nombre de la preestablecida'), { target: { value: 'Nuevo' } }); }
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  }
  expect(await screen.findByRole('alert')).toHaveTextContent('HTTP rechazado'); expect(screen.queryByText(/correctamente/)).not.toBeInTheDocument(); expect(listCalls).toBe(1);
});

it('filters the template list, keeps the selected detail clear and duplicates through the existing create operation', async () => {
  const second = { ...template, id: 'template-two', name: 'Movilidad diaria' };
  const { api } = renderManager([template, second]);
  await screen.findByRole('article', { name: 'Modelo fuerza' });
  expect(screen.getByText('2 rutinas preestablecidas')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Buscar rutina'), { target: { value: 'MOVILIDAD' } });
  expect(screen.getByRole('button', { name: /Movilidad diaria/ })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByRole('button', { name: /Modelo fuerza/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Movilidad diaria/ }));
  expect(screen.getByRole('article', { name: 'Movilidad diaria' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Buscar rutina'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: /Modelo fuerza/ }));
  expect(screen.getByRole('button', { name: /Modelo fuerza/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));
  expect(screen.getByLabelText('Nombre de la preestablecida')).toHaveValue('Copia de Modelo fuerza');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await screen.findByText('Rutina preestablecida guardada correctamente.');
  expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Copia de Modelo fuerza', days: expect.any(Array) }), expect.any(Object));
  expect(api.update).not.toHaveBeenCalled();
});
