import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { SaveMonthlyTrainingWeightsDto, TrainingRecordDetailDto, TrainingRoutineVersionDto } from '@athleta/api-client';
import PortalRoutine from './page';
vi.mock('next/navigation', () => ({ usePathname: () => '/portal/sala/rutina' }));
const base = 'http://localhost:3000/api/portal';
const exercise = { id: 'e1', exerciseDefinitionId: 'press', exerciseName: 'Press', position: 1, blockPosition: null, series: '4', repetitions: '10', duration: null, load: '30', rest: '60 s', notes: 'Controlado' };
function routine(n: number, effectiveFrom: string): TrainingRoutineVersionDto {
  return { id: `r${n}`, version: n, status: n === 1 ? 'ACTIVE' : 'SCHEDULED', createdOn: '2026-01-01', effectiveFrom, effectiveUntil: null, days: [{ id: `d${n}`, name: `Fuerza ${n}`, position: 1, exercises: [{ ...exercise, id: `e${n}`, exerciseName: n === 1 ? 'Press' : 'Remo' }] }, { id: `extra${n}`, name: `Movilidad ${n}`, position: 2, exercises: [{ ...exercise, id: `extra-e${n}` }] }] };
}
const server = setupServer();
const nativeFetch = globalThis.fetch;
let records: TrainingRecordDetailDto[];
let routines: TrainingRoutineVersionDto[];
let saves: SaveMonthlyTrainingWeightsDto[];
let today: string;
let months: string[];
function renderRoutine(client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  render(<QueryClientProvider client={client}><PortalRoutine/></QueryClientProvider>); return client;
}
beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  records = []; saves = []; months = []; today = '2026-11-03'; routines = [routine(1, '2026-10-01')];
  server.use(
    http.get(`${base}/auth/session`, () => HttpResponse.json({ data: { csrfToken: 'csrf' } })),
    http.get(`${base}/sala/training-context`, () => HttpResponse.json({ data: { today, routines, routine: null } })),
    http.get(`${base}/sala/training-records/month`, ({ request }) => { const month = new URL(request.url).searchParams.get('month')!; months.push(month); return HttpResponse.json({ data: records.filter(r => r.month === month || r.date?.startsWith(month)) }); }),
    http.put(`${base}/sala/training-records/monthly`, async ({ request }) => {
      expect(request.headers.get('x-csrf-token')).toBe('csrf');
      const body = await request.json() as SaveMonthlyTrainingWeightsDto; saves.push(body);
      records = body.weeks.filter(w => w.exercises.some(e => e.weightKg !== null)).map(w => ({ id: `record-${w.weekNumber}`, routineId: body.routineId, routineDayId: body.routineDayId, month: body.month, weekNumber: w.weekNumber, date: null, dayName: 'Fuerza', dayPosition: 1, createdAt: '', updatedAt: '', exercises: w.exercises.map(e => ({ ...exercise, id: `saved-${e.id}`, routineExerciseId: e.id, weightKg: e.weightKg })) }));
      return HttpResponse.json({ data: records });
    }),
  );
});
afterEach(() => { cleanup(); server.resetHandlers(); vi.restoreAllMocks(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
async function open(name = 'Press') { fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${name}`) })); }
it('has a single routine without period selector and six initially empty fields per exercise', async () => {
  renderRoutine(); await screen.findByRole('heading', { name: 'Fuerza 1' });
  expect(screen.queryByRole('region', { name: 'Períodos de rutina' })).not.toBeInTheDocument();
  const card = await screen.findByRole('button', { name: /^Press/ }); expect(card).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument(); await open();
  const inputs = screen.getAllByRole('textbox'); expect(inputs).toHaveLength(6);
  inputs.forEach(input => { expect(input).toHaveValue(''); expect(input).toBeEnabled(); });
  expect(screen.queryByText(/26\/10/)).not.toBeInTheDocument(); expect(screen.queryByLabelText('Fecha del entrenamiento')).not.toBeInTheDocument();
  expect(months).toEqual(['2026-11']);
});
it.each(['2026-11-03', '2026-11-16'])('selects the effective version on %s and keeps days from exactly one version', async date => {
  today = date; routines = [routine(1, '2026-11-01'), routine(2, '2026-11-15')];
  renderRoutine(); const expected = date.endsWith('03') ? 1 : 2;
  await screen.findByRole('heading', { name: `Fuerza ${expected}` });
  const periods = screen.getByRole('region', { name: 'Períodos de rutina' }); expect(within(periods).getAllByRole('button')).toHaveLength(2);
  const nav = screen.getByRole('navigation', { name: 'Días de la rutina' }); expect(within(nav).getAllByRole('button')).toHaveLength(2);
  expect(within(nav).queryByRole('button', { name: `Fuerza ${expected === 1 ? 2 : 1}` })).not.toBeInTheDocument();
  fireEvent.click(within(periods).getByRole('button', { name: new RegExp(`Rutina ${expected === 1 ? 2 : 1}$`) }));
  await screen.findByRole('heading', { name: `Fuerza ${expected === 1 ? 2 : 1}` });
  await open(expected === 1 ? 'Remo' : 'Press'); expect(screen.getAllByRole('textbox')).toHaveLength(6);
});
it('hides zero-period versions and keeps future assignment from replacing today', async () => {
  routines = [routine(1, '2026-10-01'), routine(2, '2026-10-01'), routine(3, '2026-12-01')];
  renderRoutine(); await screen.findByRole('heading', { name: 'Fuerza 2' });
  expect(screen.queryByRole('region', { name: 'Períodos de rutina' })).not.toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Días de la rutina' })).not.toHaveTextContent('Fuerza 1');
});
it('saves all six weeks in one request, keeps open cards and resets only after success', async () => {
  renderRoutine(); await open();
  fireEvent.change(screen.getByLabelText(/Semana 2/), { target: { value: '42,5' } });
  fireEvent.change(screen.getByLabelText(/Semana 6/), { target: { value: '0' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Guardar pesos' })[0]!);
  await screen.findByText('Pesos guardados correctamente.');
  expect(saves).toHaveLength(1); expect(saves[0]?.weeks).toHaveLength(6);
  expect(saves[0]?.weeks[1]?.exercises[0]?.weightKg).toBe('42.5'); expect(saves[0]?.weeks[5]?.exercises[0]?.weightKg).toBe('0'); expect(saves[0]?.weeks[0]?.exercises[0]?.weightKg).toBeNull();
  expect(screen.getByLabelText(/Semana 2/)).toHaveValue('42,5');
  expect(screen.getByRole('button', { name: /^Press/ })).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' })); await open();
  screen.getAllByRole('textbox').forEach(input => expect(input).toHaveValue(''));
  fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' })); await open(); expect(screen.getByLabelText(/Semana 2/)).toHaveValue('42,5');
});
it('preserves drafts and manual period choice through refetch and cancelled context changes', async () => {
  routines = [routine(1, '2026-11-01'), routine(2, '2026-11-15')]; const client = renderRoutine(); await open();
  fireEvent.change(screen.getByLabelText(/Semana 1/), { target: { value: '40' } });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' })); expect(confirm).toHaveBeenCalledWith('Tenés pesos sin guardar. ¿Querés descartarlos y continuar?'); expect(screen.getByLabelText(/Semana 1/)).toHaveValue('40');
  fireEvent.click(screen.getByRole('button', { name: /Rutina 2$/ })); expect(screen.getByLabelText(/Semana 1/)).toHaveValue('40');
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Días de la rutina' })).getByRole('button', { name: 'Movilidad 1' })); expect(screen.getByLabelText(/Semana 1/)).toHaveValue('40');
  await client.invalidateQueries({ queryKey: ['portal', 'training-context'] }); expect(screen.getByLabelText(/Semana 1/)).toHaveValue('40');
  confirm.mockReturnValue(true); fireEvent.click(screen.getByRole('button', { name: /Rutina 2$/ })); await open('Remo');
  expect(screen.getByLabelText(/Semana 1/)).toHaveValue('');
  await client.invalidateQueries({ queryKey: ['portal', 'training-context'] }); expect(screen.getByRole('heading', { name: 'Fuerza 2' })).toBeInTheDocument();
});
it('retrospectively uses the first prescription without changing its effective date', async () => {
  routines = [routine(1, '2026-11-03')]; renderRoutine(); await screen.findByRole('heading', { name: 'Fuerza 1' });
  fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' })); await screen.findByText('Carga de historial anterior'); await open();
  expect(screen.getAllByRole('textbox')).toHaveLength(6); expect(routines[0]?.effectiveFrom).toBe('2026-11-03');
});
it('keeps all values and open cards on network error and invalid input', async () => {
  server.use(http.put(`${base}/sala/training-records/monthly`, () => HttpResponse.json({ message: 'Error de guardado' }, { status: 500 })));
  renderRoutine(); await open(); fireEvent.change(screen.getByLabelText(/Semana 3/), { target: { value: '-1' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Guardar pesos' })[0]!); await screen.findByText('Ingresá un peso válido, sin valores negativos.');
  expect(screen.getByLabelText(/Semana 3/)).toHaveValue('-1');
  fireEvent.change(screen.getByLabelText(/Semana 3/), { target: { value: '45' } }); fireEvent.click(screen.getAllByRole('button', { name: 'Guardar pesos' })[0]!);
  await screen.findByText('Error de guardado'); expect(screen.getByLabelText(/Semana 3/)).toHaveValue('45'); expect(screen.getByRole('button', { name: /^Press/ })).toHaveAttribute('aria-expanded', 'true');
});

it('shows an empty assigned day without an empty weights form', async () => {
  routines[0]!.days[0]!.exercises = [];
  renderRoutine();
  expect(await screen.findByText('No hay ejercicios asignados a este día')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Guardar pesos' })).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
