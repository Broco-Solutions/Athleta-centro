import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { TrainingContextDto, TrainingRecordDetailDto } from '@athleta/api-client';
import PortalRoutine from './page';

vi.mock('next/navigation', () => ({ usePathname: () => '/portal/sala/rutina' }));
vi.mock('../../portal-ui', async importOriginal => ({ ...await importOriginal<typeof import('../../portal-ui')>(), today: () => '2026-10-26' }));
const base = 'http://localhost:3000/api/portal';
const exercise = { id: 'entry-1', exerciseDefinitionId: 'press', exerciseName: 'Press', position: 1, blockPosition: 1, series: '4', repetitions: '10', duration: null, load: '30', rest: '60 s', notes: 'Controlado', lastWeightKg: '31.5' };
const context: TrainingContextDto = { today: '2026-10-26', routine: { id: 'routine', createdOn: '2026-10-01', days: [
  { id: 'day-1', position: 1, name: 'Fuerza', exercises: [exercise, { ...exercise, id: 'entry-2', position: 2, blockPosition: 2, lastWeightKg: null }] },
  { id: 'day-2', position: 2, name: 'Movilidad', exercises: [{ ...exercise, id: 'entry-3', exerciseName: 'Remo' }] },
] } };
function saved(id = 'record', date = '2026-10-03'): TrainingRecordDetailDto {
  return { id, routineId: 'routine', routineDayId: 'day-1', date, dayName: 'Fuerza', dayPosition: 1, createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z`, exercises: context.routine!.days[0]!.exercises.map((e, i) => ({ ...e, id: `${id}-${i}`, routineExerciseId: e.id, weightKg: i ? '15' : '32.5' })) };
}
let records: TrainingRecordDetailDto[];
let requestedMonths: string[];
const server = setupServer();
const nativeFetch = globalThis.fetch;
function renderRoutine() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><PortalRoutine/></QueryClientProvider>);
}
beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  records = []; requestedMonths = [];
  server.use(
    http.get(`${base}/auth/session`, () => HttpResponse.json({ data: { csrfToken: 'csrf' } })),
    http.get(`${base}/sala/training-context`, () => HttpResponse.json({ data: context })),
    http.get(`${base}/sala/training-records/month`, ({ request }) => { const month = new URL(request.url).searchParams.get('month')!; requestedMonths.push(month); return HttpResponse.json({ data: records.filter(r => r.date.startsWith(month)) }); }),
  );
});
afterEach(() => { cleanup(); server.resetHandlers(); vi.restoreAllMocks(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it('shows one day at a time, custom names, ordered blocks and the monthly weeks including missing weights', async () => {
  records = [saved(), saved('second', '2026-10-04')];
  renderRoutine(); await screen.findByRole('heading', { name: 'Fuerza' });
  expect(screen.getByRole('heading', { name: 'Mi rutina' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Volver a Inicio' })).toHaveAttribute('href', '/portal');
  expect(screen.getByText('Bloque A — 4 series')).toBeInTheDocument(); expect(screen.getByText('Bloque B — 4 series')).toBeInTheDocument();
  expect(screen.getByText('A1 — Press')).toBeInTheDocument(); expect(screen.getByText('B1 — Press')).toBeInTheDocument();
  expect(screen.getAllByText('Controlado')).toHaveLength(2); expect(screen.queryByText(/Descanso/)).not.toBeInTheDocument();
  await screen.findAllByRole('table');
  const tables = screen.getAllByRole('table'); expect(tables).toHaveLength(2);
  expect(within(tables[0]!).getAllByText(/Semana \d/)).toHaveLength(5);
  expect(within(tables[0]!).getByText('28/09 – 04/10')).toBeInTheDocument();
  expect(within(tables[0]!).getAllByText('32,5 kg')).toHaveLength(2);
  expect(within(tables[0]!).queryByText('15 kg')).not.toBeInTheDocument();
  expect(within(tables[1]!).getAllByText('15 kg')).toHaveLength(2);
  expect(within(tables[0]!).getAllByText('Sin registro')).toHaveLength(4);
  expect(screen.queryByText('A1 — Remo')).not.toBeInTheDocument();
  const nav = screen.getByRole('navigation', { name: 'Días de la rutina' });
  expect(within(nav).getByRole('button', { name: 'Fuerza' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(within(nav).getByRole('button', { name: 'Movilidad' }));
  expect(await screen.findByText('A1 — Remo')).toBeInTheDocument();
  expect(screen.queryByText('A1 — Press')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Guardar entrenamiento' })).toHaveLength(1);
});
it('changes months, uses saved routines without an active routine, and returns to the current month', async () => {
  records = [saved('old', '2026-09-30'), { ...saved('other', '2026-09-15'), routineId: 'previous-routine', exercises: [{ ...saved().exercises[0]!, routineExerciseId: 'old-entry', exerciseName: 'Press anterior', notes: 'Indicación anterior' }] }];
  renderRoutine(); await screen.findByRole('heading', { name: 'Fuerza' });
  expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
  expect(await screen.findByRole('heading', { name: 'septiembre de 2026' })).toBeInTheDocument();
  const historical = await screen.findByRole('button', { name: /Fuerza · Histórica 15\/09/ }); fireEvent.click(historical);
  expect(screen.getByText('A1 — Press anterior')).toBeInTheDocument(); expect(screen.getByText('Indicación anterior')).toBeInTheDocument();
  expect(screen.queryByLabelText(/Peso utilizado/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Corregir entrenamiento del 15/09/2026' })).toHaveAttribute('href', '/portal/sala/entrenamientos/registrar?recordId=other');
  fireEvent.click(screen.getByRole('button', { name: 'Volver al mes actual' }));
  expect(await screen.findByRole('heading', { name: 'octubre de 2026' })).toBeInTheDocument();
  expect(await screen.findByLabelText(/Peso utilizado.*ejercicio 1/)).toBeInTheDocument();
  expect(requestedMonths).toContain('2026-09');
});
it('keeps history accessible even if no routine is currently active', async () => {
  records = [saved()];
  server.use(http.get(`${base}/sala/training-context`, () => HttpResponse.json({ data: { today: context.today, routine: null } })));
  renderRoutine(); expect(await screen.findByText('A1 — Press')).toBeInTheDocument();
  expect(screen.queryByLabelText(/Peso utilizado/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Histórica/ })).toBeInTheDocument();
});
it('saves weights through the existing flow, refreshes monthly records and clears only the saved inputs', async () => {
  let payload: unknown;
  server.use(http.post(`${base}/sala/training-records`, async ({ request }) => { expect(request.headers.get('x-csrf-token')).toBe('csrf'); payload = await request.json(); const record = saved('new', '2026-10-26'); records.push(record); return HttpResponse.json({ data: record }, { status: 201 }); }));
  renderRoutine(); const input = (await screen.findAllByLabelText(/Peso utilizado/))[0]!;
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar entrenamiento' })).toBeEnabled());
  fireEvent.change(input, { target: { value: '32,5' } }); fireEvent.click(screen.getByRole('button', { name: 'Guardar entrenamiento' }));
  expect(await screen.findByText('Entrenamiento guardado correctamente.')).toBeInTheDocument();
  expect(await screen.findByText('32,5 kg')).toBeInTheDocument();
  expect(payload).toEqual({ routineId: 'routine', routineDayId: 'day-1', date: '2026-10-26', exercises: [{ id: 'entry-1', weightKg: '32.5' }, { id: 'entry-2', weightKg: null }] });
  expect(screen.getAllByLabelText(/Peso utilizado/)[0]).toHaveValue('');
  expect(requestedMonths.filter(month => month === '2026-10').length).toBeGreaterThan(1);
});
it('requires explicit discard before changing day or month with unsaved weights', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  renderRoutine(); const input = (await screen.findAllByLabelText(/Peso utilizado/))[0]!;
  fireEvent.change(input, { target: { value: '35' } });
  fireEvent.click(screen.getByRole('button', { name: 'Movilidad' }));
  expect(confirm).toHaveBeenCalledOnce(); expect(input).toHaveValue('35');
  fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
  expect(confirm).toHaveBeenCalledTimes(2); expect(screen.getByRole('heading', { name: 'octubre de 2026' })).toBeInTheDocument();
  confirm.mockReturnValue(true); fireEvent.click(screen.getByRole('button', { name: 'Movilidad' }));
  expect(await screen.findByText('A1 — Remo')).toBeInTheDocument(); expect(screen.getByLabelText(/Peso utilizado/)).toHaveValue('');
});
it('keeps entered weights on duplicate errors and links to the existing correction route', async () => {
  server.use(http.post(`${base}/sala/training-records`, () => HttpResponse.json({ code: 'TRAINING_DUPLICATE', message: 'Ya existe.', details: { recordId: 'existing' } }, { status: 409 })));
  renderRoutine(); const input = (await screen.findAllByLabelText(/Peso utilizado/))[0]!;
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar entrenamiento' })).toBeEnabled());
  fireEvent.change(input, { target: { value: '35' } }); fireEvent.click(screen.getByRole('button', { name: 'Guardar entrenamiento' }));
  expect(await screen.findByText('Ya existe.')).toBeInTheDocument(); expect(input).toHaveValue('35');
  expect(screen.getByRole('link', { name: 'Abrir registro existente' })).toHaveAttribute('href', '/portal/sala/entrenamientos/registrar?recordId=existing');
});
it('shows safe load errors and empty months', async () => {
  server.use(http.get(`${base}/sala/training-context`, () => HttpResponse.json({ data: { today: context.today, routine: null } })));
  renderRoutine(); expect(await screen.findByText('No hay una rutina activa ni entrenamientos registrados en este mes.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
  expect(await screen.findByText('No hay entrenamientos registrados en este mes.')).toBeInTheDocument();
});
it('keeps historical data visible if the active-routine context fails', async () => {
  records = [saved()];
  server.use(http.get(`${base}/sala/training-context`, () => HttpResponse.json({ message: 'Internal detail' }, { status: 500 })));
  renderRoutine(); expect(await screen.findByText('A1 — Press')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar tu rutina. Intentá nuevamente.');
  expect(screen.queryByText('Internal detail')).not.toBeInTheDocument();
});

it('reports a monthly failure without presenting missing weights as an empty history, then retries', async () => {
  let fail = true;
  server.use(http.get(`${base}/sala/training-records/month`, () => fail ? HttpResponse.json({ message: 'Internal detail' }, { status: 500 }) : HttpResponse.json({ data: [saved()] })));
  renderRoutine();
  expect(await screen.findByText('No pudimos cargar los entrenamientos del mes.')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryByText('Internal detail')).not.toBeInTheDocument();
  fail = false; fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('32,5 kg')).toBeInTheDocument();
});
