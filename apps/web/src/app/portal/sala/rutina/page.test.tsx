import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { TrainingContextDto, TrainingRecordDetailDto } from '@athleta/api-client';
import PortalRoutine from './page';

vi.mock('next/navigation', () => ({ usePathname: () => '/portal/sala/rutina' }));
vi.mock('../../portal-ui', async importOriginal => ({ ...await importOriginal<typeof import('../../portal-ui')>(), today: () => '2026-10-26' }));
const base = 'http://localhost:3000/api/portal';
const exercise = { id: 'entry-1', exerciseDefinitionId: 'press', exerciseName: 'Press', position: 1, blockPosition: 1, series: '4', repetitions: '10', duration: null, load: '30', rest: '60 s', notes: 'Controlado', lastWeightKg: '31.5' };
const context: TrainingContextDto = { routines: [], today: '2026-10-26', routine: { id: 'routine', createdOn: '2026-10-01', days: [
  { id: 'day-1', position: 1, name: 'Fuerza', exercises: [exercise, { ...exercise, id: 'entry-2', position: 2, blockPosition: 2, lastWeightKg: null }] },
  { id: 'day-2', position: 2, name: 'Movilidad', exercises: [{ ...exercise, id: 'entry-3', exerciseName: 'Remo' }] },
] } };
context.routines = [{ ...context.routine!, version: 1, status: 'ACTIVE' }];
function saved(id = 'record', date = '2026-10-03'): TrainingRecordDetailDto {
  return { id, routineId: 'routine', routineDayId: 'day-1', date, dayName: 'Fuerza', dayPosition: 1, createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z`, exercises: context.routine!.days[0]!.exercises.map((e, i) => ({ ...e, id: `${id}-${i}`, routineExerciseId: e.id, weightKg: i ? '15' : '32.5' })) };
}
let records: TrainingRecordDetailDto[];
let requestedMonths: string[];
const server = setupServer();
const nativeFetch = globalThis.fetch;
async function selectWeek(number = 5, exercise = /A1 — Press/) {
  const card = await screen.findByRole('button', { name: exercise });
  if (card.getAttribute('aria-expanded') === 'false') fireEvent.click(card);
  const evolution = (await screen.findAllByRole('region', { name: /Evolución semanal/ }))[0]!;
  fireEvent.click(within(evolution).getByRole('button', { name: `Semana ${number}` }));
}
function renderRoutine(client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  return render(<QueryClientProvider client={client}><PortalRoutine/></QueryClientProvider>);
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
  fireEvent.click(screen.getByRole('button', { name: /A1 — Press/ }));
  fireEvent.click(screen.getByRole('button', { name: /B1 — Press/ }));
  expect(screen.getAllByText('Controlado')).toHaveLength(2); expect(screen.queryByText(/Descanso/)).not.toBeInTheDocument();
  await screen.findAllByRole('region', { name: /Evolución semanal/ });
  const tables = screen.getAllByRole('region', { name: /Evolución semanal/ }); expect(tables).toHaveLength(2);
  expect(within(tables[0]!).getAllByText(/Semana \d/)).toHaveLength(5);
  expect(within(tables[0]!).getByText('28/09 – 04/10')).toBeInTheDocument();
  expect(within(tables[0]!).getAllByRole('list')[0]!.children).toHaveLength(5);
  expect(within(tables[0]!).getAllByText('32,5 kg').filter(element => !element.closest('details'))).toHaveLength(1);
  expect(within(tables[0]!).getByText('Ver 2 registros')).toBeInTheDocument();
  fireEvent.click(within(tables[0]!).getByText('Ver 2 registros'));
  expect(within(tables[0]!).getAllByRole('link', { name: /Corregir entrenamiento/ })).toHaveLength(2);
  expect(within(tables[0]!).queryByText('15 kg')).not.toBeInTheDocument();
  expect(within(tables[1]!).getAllByText('15 kg').filter(element => !element.closest('details'))).toHaveLength(1);
  expect(within(tables[0]!).getAllByText('Sin registro')).toHaveLength(4);
  expect(screen.queryByText('A1 — Remo')).not.toBeInTheDocument();
  const nav = screen.getByRole('navigation', { name: 'Días de la rutina' });
  expect(within(nav).getByRole('button', { name: 'Fuerza' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(within(nav).getByRole('button', { name: 'Movilidad' }));
  expect(await screen.findByText('A1 — Remo')).toBeInTheDocument();
  expect(screen.queryByText('A1 — Press')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Guardar entrenamiento' })).not.toBeInTheDocument();
});
it('changes months, uses saved routines without an active routine, and returns to the current month', async () => {
  records = [saved('old', '2026-09-30'), { ...saved('other', '2026-09-15'), routineId: 'previous-routine', exercises: [{ ...saved().exercises[0]!, routineExerciseId: 'old-entry', exerciseName: 'Press anterior', notes: 'Indicación anterior' }] }];
  renderRoutine(); await screen.findByRole('heading', { name: 'Fuerza' });
  expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
  expect(await screen.findByRole('heading', { name: 'septiembre de 2026' })).toBeInTheDocument();
  const historical = await screen.findByRole('button', { name: /Fuerza · Histórica 15\/09/ }); fireEvent.click(historical);
  expect(screen.getByText('A1 — Press anterior')).toBeInTheDocument(); expect(screen.getByText('Indicación anterior')).toBeInTheDocument();
  expect(screen.getAllByLabelText(/Peso utilizado/)[0]).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /A1 — Press anterior/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Semana 3' }));
  expect(screen.getByRole('textbox')).toHaveValue('32,5');
  expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Volver al mes actual' }));
  expect(await screen.findByRole('heading', { name: 'octubre de 2026' })).toBeInTheDocument();
  expect(await screen.findByLabelText(/Peso utilizado.*ejercicio 1/)).toBeInTheDocument();
  expect(requestedMonths).toContain('2026-09');
});
it('keeps history accessible even if no routine is currently active', async () => {
  records = [saved()];
  server.use(http.get(`${base}/sala/training-context`, () => HttpResponse.json({ data: { today: context.today, routine: null } })));
  renderRoutine(); expect(await screen.findByText('A1 — Press')).toBeInTheDocument();
  expect(screen.getAllByLabelText(/Peso utilizado/)[0]).toBeDisabled();
  expect(screen.getByRole('button', { name: /Histórica/ })).toBeInTheDocument();
});
it('saves weights through the existing flow, refreshes monthly records and clears only the saved inputs', async () => {
  let payload: unknown;
  server.use(http.post(`${base}/sala/training-records`, async ({ request }) => { expect(request.headers.get('x-csrf-token')).toBe('csrf'); payload = await request.json(); const record = saved('new', '2026-10-26'); records.push(record); return HttpResponse.json({ data: record }, { status: 201 }); }));
  renderRoutine(); await selectWeek(); const input = (await screen.findAllByLabelText(/Peso utilizado/))[0]!;
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar entrenamiento' })).toBeEnabled());
  fireEvent.change(input, { target: { value: '32,5' } }); fireEvent.click(screen.getByRole('button', { name: 'Guardar entrenamiento' }));
  expect(await screen.findByText('Entrenamiento guardado correctamente.')).toBeInTheDocument();
  expect(await screen.findByText('32,5 kg')).toBeInTheDocument();
  expect(payload).toEqual({ allowFuture: true, routineId: 'routine', routineDayId: 'day-1', date: '2026-10-26', exercises: [{ id: 'entry-1', weightKg: '32.5' }, { id: 'entry-2', weightKg: null }] });
  expect(screen.getAllByLabelText(/Peso utilizado/)[0]).toHaveValue('32,5');
  expect(requestedMonths.filter(month => month === '2026-10').length).toBeGreaterThan(1);
});
it('requires explicit discard before changing day or month with unsaved weights', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  renderRoutine(); await selectWeek(); const input = (await screen.findAllByLabelText(/Peso utilizado/))[0]!;
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
  renderRoutine(); await selectWeek(); const input = (await screen.findAllByLabelText(/Peso utilizado/))[0]!;
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
  expect(screen.queryByRole('region', { name: /Evolución semanal/ })).not.toBeInTheDocument();
  expect(screen.queryByText('Internal detail')).not.toBeInTheDocument();
  fail = false; fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  fireEvent.click(screen.getByRole('button', { name: /A1 — Press/ }));
  expect(await screen.findByText('32,5 kg')).toBeInTheDocument();
});

it('starts all cards collapsed and preserves exact values and other cards while toggling', async () => {
  let payload: unknown;
  server.use(http.post(`${base}/sala/training-records`, async ({ request }) => { payload = await request.json(); return HttpResponse.json({ data: saved('new', '2026-10-26') }, { status: 201 }); }));
  renderRoutine();
  const first = await screen.findByRole('button', { name: /A1 — Press/ });
  const second = screen.getByRole('button', { name: /B1 — Press/ });
  expect(first).toHaveAttribute('aria-expanded', 'false');
  expect(second).toHaveAttribute('aria-expanded', 'false');
  expect(first.getAttribute('aria-controls')).not.toBe(second.getAttribute('aria-controls'));
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(first);
  await selectWeek();
  const input = screen.getByRole('textbox', { name: /ejercicio 1/ });
  fireEvent.change(input, { target: { value: '42,5' } });
  fireEvent.click(second);
  fireEvent.change(screen.getByRole('textbox', { name: /ejercicio 2/ }), { target: { value: '0' } });
  expect(first).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(first);
  expect(input).not.toBeVisible();
  fireEvent.click(first);
  expect(input).toHaveValue('42,5');
  expect(screen.getByRole('textbox', { name: /ejercicio 2/ })).toHaveValue('0');

  fireEvent.click(first);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar entrenamiento' }));
  await screen.findByText('Entrenamiento guardado correctamente.');
  expect(payload).toEqual({ allowFuture: true, routineId: 'routine', routineDayId: 'day-1', date: '2026-10-26', exercises: [{ id: 'entry-1', weightKg: '42.5' }, { id: 'entry-2', weightKg: '0' }] });
});
it('opens a collapsed card on validation errors and preserves negative-weight validation', async () => {
  renderRoutine();
  const toggle = await screen.findByRole('button', { name: /A1 — Press/ });
  fireEvent.click(toggle);
  await selectWeek();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '-5' } });
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar entrenamiento' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Ingresá un peso válido, sin valores negativos.');
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('textbox')).toHaveValue('-5');
});
it('uses one deterministic principal record without mixing historical weights', async () => {
  const first = saved('first', '2026-10-01'); first.exercises[0]!.weightKg = '42.5';
  const second = saved('second', '2026-10-02'); second.exercises[0]!.weightKg = '0';
  const last = saved('last', '2026-10-03'); last.exercises[0]!.weightKg = null;
  records = [last, first, second];
  renderRoutine(); fireEvent.click(await screen.findByRole('button', { name: /A1 — Press/ }));
  const evolution = await screen.findByRole('region', { name: 'Evolución semanal de Press' });
  const week = within(evolution).getAllByRole('listitem')[0]!;
  expect(within(week).getAllByText('Sin registro').filter(element => !element.closest('details'))).toHaveLength(1);
  expect(within(week).getByText('Ver 3 registros')).toBeInTheDocument();
  expect(within(week).getAllByRole('link', { hidden: true })).toHaveLength(3);
  await selectWeek();
  expect(within(evolution).getByText('26/10 – 01/11').closest('li')).toHaveAttribute('aria-current', 'date');
  fireEvent.click(within(evolution).getByRole('button', { name: 'Semana 1' }));
  expect(within(evolution).getByText('28/09 – 04/10').closest('li')).toHaveAttribute('aria-current', 'date');
  expect(screen.queryByText(/^Hoy ·/)).not.toBeInTheDocument();
});
it.each([['2027-02', 4], ['2026-11', 6], ['2026-09', 5]])('renders %s as %i real calendar weeks in read-only history', async (month, count) => {
  records = [saved('history', `${month}-02`)];
  // Use actual month navigation, including a future current date for the 4-week case.
  server.use(http.get(`${base}/sala/training-context`, () => HttpResponse.json({ data: { today: '2027-03-01', routine: null } })), http.get(`${base}/sala/training-records/month`, ({ request }) => HttpResponse.json({ data: records.filter(record => record.date.startsWith(new URL(request.url).searchParams.get('month')!)) })));
  renderRoutine(); await screen.findByText('No hay entrenamientos registrados en este mes.');
  fireEvent.click(screen.getByRole('button', { name: 'Volver al mes actual' }));
  await screen.findByRole('heading', { name: 'marzo de 2027' });
  for (let i = 0; i < (2027 * 12 + 2) - (Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1); i++) fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
  fireEvent.click(await screen.findByRole('button', { name: /A1 — Press/ }));
  const evolution = screen.getByRole('region', { name: 'Evolución semanal de Press' });
  expect(within(evolution).getAllByText(/Semana \d/)).toHaveLength(count);
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Guardar entrenamiento' })).not.toBeInTheDocument();
});

it('requires at least one weight even when all cards are collapsed', async () => {
  renderRoutine();
  await selectWeek();
  const save = await screen.findByRole('button', { name: 'Guardar entrenamiento' });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
  expect(await screen.findByRole('alert')).toHaveTextContent('Informá al menos un peso para guardar el entrenamiento.');
});

it('locks the month, days, date and submission while saving, then unlocks them', async () => {
  let finish!: () => void;
  const waiting = new Promise<void>(resolve => { finish = resolve; });
  server.use(http.post(`${base}/sala/training-records`, async () => { await waiting; return HttpResponse.json({ data: saved('new', '2026-10-26') }, { status: 201 }); }));
  renderRoutine();
  fireEvent.click(await screen.findByRole('button', { name: /A1 — Press/ }));
  await selectWeek();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '35' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar entrenamiento' }));
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Movilidad' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Semana 1' })).toBeDisabled();
  });
  finish();
  await screen.findByText('Entrenamiento guardado correctamente.');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeEnabled());
  expect(screen.getByRole('button', { name: 'Movilidad' })).toBeEnabled();
});


it('selects one shared week, focuses only after interaction, and retains drafts in the same week', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  renderRoutine();
  const card = await screen.findByRole('button', { name: /A1 — Press/ });
  expect(screen.queryByLabelText('Fecha del entrenamiento')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(card);
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  await selectWeek();
  const input = screen.getByRole('textbox');
  expect(input).toHaveFocus(); expect(input).toHaveAttribute('inputmode', 'decimal');
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('¿Qué día entrenaste?')).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: '45' } });
  fireEvent.click(screen.getByRole('button', { name: /B1 — Press/ }));
  const other = screen.getAllByRole('region', { name: /Evolución semanal/ })[1]!;
  expect(within(other).getByRole('button', { name: 'Semana 5' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(within(other).getByRole('button', { name: 'Semana 5' }));
  expect(screen.getByRole('textbox', { name: /ejercicio 2/ })).toHaveFocus();
  expect(input).toHaveValue('45'); expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(within(other).getByRole('button', { name: 'Semana 2' }));
  expect(confirm).toHaveBeenCalledOnce(); expect(input).toHaveValue('45');
  expect(within(other).getByRole('button', { name: 'Semana 5' })).toHaveAttribute('aria-pressed', 'true');
  confirm.mockReturnValue(true);
  fireEvent.click(within(other).getByRole('button', { name: 'Semana 2' }));
  expect(screen.getAllByRole('textbox').every(field => (field as HTMLInputElement).value === '')).toBe(true);
  expect(within(other).getByRole('button', { name: 'Semana 2' }).closest('li')).toHaveClass('border-primary!');
  expect(screen.getByRole('button', { name: 'Guardar entrenamiento' })).toBeEnabled();
});

it.each([[1, '2026-09-28'], [2, '2026-10-05'], [4, '2026-10-19'], [5, '2026-10-26']])('registers week %i directly with reference %s and all exercises', async (week, date) => {
  let payload: unknown;
  server.use(http.post(`${base}/sala/training-records`, async ({ request }) => { payload = await request.json(); return HttpResponse.json({ data: saved('new', date) }, { status: 201 }); }));
  renderRoutine(); await selectWeek(week);
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  const first = screen.getByRole('textbox'); expect(first).toHaveFocus();
  fireEvent.change(first, { target: { value: '45,5' } });
  fireEvent.click(screen.getByRole('button', { name: /B1 — Press/ }));
  fireEvent.change(screen.getByRole('textbox', { name: /ejercicio 2/ }), { target: { value: '60' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar entrenamiento' }));
  await screen.findByText('Entrenamiento guardado correctamente.');
  expect(payload).toEqual({ allowFuture: true, routineId: 'routine', routineDayId: 'day-1', date, exercises: [{ id: 'entry-1', weightKg: '45.5' }, { id: 'entry-2', weightKg: '60' }] });
});

it('allows future weeks and permits retrospective references before the first assignment', async () => {
  let payload: unknown;
  server.use(http.get(`${base}/sala/training-context`, () => HttpResponse.json({ data: { ...context, today: '2026-10-14', routine: { ...context.routine!, createdOn: '2026-10-03' } } })),
    http.post(`${base}/sala/training-records`, async ({ request }) => { payload = await request.json(); return HttpResponse.json({ data: saved('new') }, { status: 201 }); }));
  renderRoutine(); await selectWeek(1);
  expect(screen.getByRole('button', { name: 'Semana 4' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Semana 5' })).toBeEnabled();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '35' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar entrenamiento' }));
  await screen.findByText('Entrenamiento guardado correctamente.');
  expect(payload).toMatchObject({ date: '2026-09-28' });
});

it.each([false, true])('corrects a saved week inline, retaining untouched weights and saved IDs (historical: %s)', async historical => {
  const original = saved('existing', '2026-10-06'); records = [original];
  if (historical) server.use(http.get(`${base}/sala/training-context`, () => HttpResponse.json({ data: { today: context.today, routine: null } })));
  let payload: unknown;
  server.use(http.post(`${base}/sala/training-records/existing/correct`, async ({ request }) => {
    payload = await request.json();
    records = [{ ...original, exercises: original.exercises.map((e, i) => ({ ...e, weightKg: i ? e.weightKg : '45' })) }];
    return HttpResponse.json({ data: records[0] });
  }));
  renderRoutine(); await selectWeek(2);
  expect(screen.getByRole('textbox')).toHaveValue('32,5');
  fireEvent.click(screen.getByRole('button', { name: /B1 — Press/ }));
  expect(screen.getByRole('textbox', { name: /ejercicio 2/ })).toHaveValue('15');
  fireEvent.change(screen.getByRole('textbox', { name: /ejercicio 1/ }), { target: { value: '45' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await screen.findByText('Entrenamiento guardado correctamente.');
  expect(payload).toEqual({ exercises: [{ id: 'existing-0', weightKg: '45' }, { id: 'existing-1', weightKg: '15' }] });
  expect(screen.getByRole('textbox', { name: /ejercicio 2/ })).toHaveValue('15');
  expect(screen.getByText('45 kg')).toBeInTheDocument();
  // The same record can be corrected repeatedly, including clearing every weight.
  fireEvent.change(screen.getByRole('textbox', { name: /ejercicio 1/ }), { target: { value: '' } });
  fireEvent.change(screen.getByRole('textbox', { name: /ejercicio 2/ }), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(payload).toEqual({ exercises: [{ id: 'existing-0', weightKg: null }, { id: 'existing-1', weightKg: null }] }));
});

it('loads the same cross-month record from either month and discards only on confirmation', async () => {
  records = [saved('boundary', '2026-09-30')];
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  renderRoutine(); await selectWeek(1);
  const input = screen.getByRole('textbox'); expect(input).toHaveValue('32,5');
  fireEvent.change(input, { target: { value: '40' } });
  fireEvent.click(screen.getByRole('button', { name: 'Semana 2' }));
  expect(confirm).toHaveBeenCalledOnce(); expect(input).toHaveValue('40');
  confirm.mockReturnValue(true); fireEvent.click(screen.getByRole('button', { name: 'Semana 2' }));
  expect(screen.getByRole('textbox')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
  await screen.findByRole('heading', { name: 'septiembre de 2026' });
  await selectWeek(5);
  expect(screen.getByRole('textbox')).toHaveValue('32,5');
  expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
});

it('keeps the focused weight visible when the keyboard changes the visual viewport', async () => {
  const viewport = new EventTarget();
  vi.stubGlobal('visualViewport', viewport);
  try {
    renderRoutine(); await selectWeek();
    const input = screen.getByRole('textbox');
    const scroll = vi.fn();
    input.scrollIntoView = scroll;
    viewport.dispatchEvent(new Event('resize'));
    expect(scroll).toHaveBeenLastCalledWith({ block: 'center', behavior: 'instant' });
    window.dispatchEvent(new Event('resize'));
    expect(scroll).toHaveBeenCalledTimes(2);
    input.blur(); viewport.dispatchEvent(new Event('resize'));
    expect(scroll).toHaveBeenCalledTimes(2);
  } finally { cleanup(); vi.unstubAllGlobals(); }
});

it('preserves an unsaved correction through background refetches and card toggles', async () => {
  records = [saved('existing', '2026-10-06')];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderRoutine(client); await selectWeek(2);
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: '44,25' } });
  records = [{ ...records[0]!, exercises: records[0]!.exercises.map(e => ({ ...e, weightKg: '99' })) }];
  await act(async () => { await client.invalidateQueries({ queryKey: ['portal', 'training-records'] }); });
  expect(input).toHaveValue('44,25');
  fireEvent.click(screen.getByRole('button', { name: /A1 — Press/ }));
  fireEvent.click(screen.getByRole('button', { name: /A1 — Press/ }));
  expect(input).toHaveValue('44,25');
  fireEvent.click(screen.getByRole('button', { name: /B1 — Press/ }));
  expect(screen.getByRole('textbox', { name: /ejercicio 2/ })).toHaveValue('15');
});

it('saves a November future week with controls inside its row and exactly one save action', async () => {
  server.use(http.get(`${base}/sala/training-context`, () => HttpResponse.json({ data: { ...context, today: '2026-11-03' } })));
  let payload: unknown;
  server.use(http.post(`${base}/sala/training-records`, async ({ request }) => { payload = await request.json(); const record = saved('future', '2026-11-23'); records.push(record); return HttpResponse.json({ data: record }); }));
  renderRoutine(); await screen.findByRole('heading', { name: 'Fuerza' });
  fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
  await screen.findByRole('heading', { name: 'noviembre de 2026' });
  await selectWeek(5);
  const row = screen.getByRole('button', { name: 'Semana 5' }).closest('li')!;
  expect(within(row).getByText('23/11 – 29/11')).toBeInTheDocument();
  const input = within(row).getByRole('textbox');
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: '42,5' } });
  fireEvent.click(screen.getByRole('button', { name: /B1 — Press/ }));
  expect(screen.getAllByRole('button', { name: 'Guardar entrenamiento' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: /A1 — Press/ }));
  fireEvent.click(screen.getByRole('button', { name: /A1 — Press/ }));
  expect(within(row).getByRole('textbox')).toHaveValue('42,5');
  expect(input.compareDocumentPosition(within(row).getByRole('button', { name: 'Guardar entrenamiento' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(within(row).getByRole('button', { name: 'Guardar entrenamiento' }));
  await screen.findByText('Entrenamiento guardado correctamente.');
  expect(payload).toMatchObject({ allowFuture: true, date: '2026-11-23' });
  expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
});

it('creates and corrects a retrospective week before the first assignment with enabled, focused inline controls', async () => {
  const first = { ...context.routines[0]!, createdOn: '2026-11-03' };
  server.use(http.get(`${base}/sala/training-context`, () => HttpResponse.json({ data: { today: '2026-11-03', routine: { ...context.routine!, createdOn: first.createdOn }, routines: [first] } })));
  let payload: unknown;
  server.use(http.post(`${base}/sala/training-records`, async ({ request }) => {
    payload = await request.json(); records = [saved('retro', '2026-10-26')]; return HttpResponse.json({ data: records[0] }, { status: 201 });
  }), http.post(`${base}/sala/training-records/retro/correct`, async ({ request }) => {
    payload = await request.json(); records = [{ ...records[0]!, exercises: records[0]!.exercises.map((e, i) => i ? e : { ...e, weightKg: '40' }) }]; return HttpResponse.json({ data: records[0] });
  }));
  renderRoutine(); await selectWeek(5);
  expect(screen.getByRole('textbox')).toBeEnabled(); expect(screen.getByRole('textbox')).toHaveFocus();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '32,5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar entrenamiento' }));
  await screen.findByText('Entrenamiento guardado correctamente.');
  expect(payload).toMatchObject({ routineId: 'routine', date: '2026-10-26' });
  fireEvent.click(screen.getByRole('button', { name: 'Volver al mes actual' }));
  await selectWeek(1);
  expect(screen.getByRole('textbox')).toHaveValue('32,5');
  fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
  await selectWeek(5); fireEvent.change(screen.getByRole('textbox'), { target: { value: '40' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await screen.findByText('Entrenamiento guardado correctamente.');
  expect(payload).toEqual({ exercises: [{ id: 'retro-0', weightKg: '40' }, { id: 'retro-1', weightKg: '15' }] });
});
it('shows three assigned prescriptions in their own months without any training records', async () => {
  const routines = ['2026-09-01', '2026-10-01', '2026-11-01'].map((createdOn, i) => ({ ...context.routines[0]!, id: `version-${i}`, version: i + 1, createdOn, status: i === 2 ? 'ACTIVE' : 'HISTORICAL', days: [{ ...context.routine!.days[0]!, id: `day-${i}`, exercises: [{ ...exercise, id: `entry-${i}`, exerciseName: `Ejercicio ${i + 1}` }] }] }));
  server.use(http.get(`${base}/sala/training-context`, () => HttpResponse.json({ data: { today: '2026-11-03', routine: routines[2], routines } })));
  renderRoutine();
  expect(await screen.findByRole('button', { name: /A1 — Ejercicio 2/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /A1 — Ejercicio 3/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
  expect(await screen.findByRole('button', { name: /A1 — Ejercicio 1/ })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Rutina 1 · Histórica/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Volver al mes actual' }));
  expect(await screen.findByRole('button', { name: /A1 — Ejercicio 3/ })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Rutina 3 · Actual/ })).toBeInTheDocument();
});
it('separates a midmonth change and discards version drafts only with confirmation', async () => {
  const routines = [
    { ...context.routines[0]!, status: 'HISTORICAL', createdOn: '2026-09-01' },
    { ...context.routines[0]!, id: 'second', version: 2, createdOn: '2026-10-15', days: [{ ...context.routine!.days[0]!, id: 'second-day', exercises: [{ ...exercise, id: 'second-entry', exerciseName: 'Remo nuevo' }] }] },
  ];
  server.use(http.get(`${base}/sala/training-context`, () => HttpResponse.json({ data: { ...context, routine: routines[1], routines } })));
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  let payload: unknown;
  server.use(http.post(`${base}/sala/training-records`, async ({ request }) => {
    payload = await request.json(); return HttpResponse.json({ data: saved('transition', '2026-10-12') }, { status: 201 });
  }));
  renderRoutine();
  expect(await screen.findByRole('heading', { name: /Rutina 2 · Actual/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Fuerza · Rutina 1 · Histórica/ }));
  await selectWeek(3);
  expect(screen.getByRole('button', { name: 'Semana 4' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '45' } });
  const next = screen.getByRole('button', { name: /Fuerza · Rutina 2 · Actual/ });
  fireEvent.click(next); expect(confirm).toHaveBeenCalledOnce(); expect(screen.getByRole('textbox')).toHaveValue('45');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar entrenamiento' }));
  await screen.findByText('Entrenamiento guardado correctamente.');
  expect(payload).toMatchObject({ routineId: 'routine', date: '2026-10-12' });
  fireEvent.click(next);
  await selectWeek(3, /A1 — Remo nuevo/);
  expect(screen.getByRole('textbox')).toHaveValue(''); expect(screen.getByRole('textbox')).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Semana 2' })).toBeDisabled();
});
