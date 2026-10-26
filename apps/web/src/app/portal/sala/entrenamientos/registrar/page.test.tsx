import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import RegisterTrainingPage from './page';

const navigation = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.search), usePathname: () => '/portal/sala/entrenamientos/registrar' }));
const base = 'http://localhost:3000/api/portal';
const entry = { id: 'entry-1', exerciseDefinitionId: 'press', exerciseName: 'Press', position: 1, series: '3', repetitions: '10', duration: null, load: '30 kg', rest: '60 s', notes: 'Controlado', lastWeightKg: '31.5' };
const context = { today: '2026-10-26', routine: { id: 'routine', createdOn: '2026-10-20', days: [{ id: 'day-1', position: 1, name: 'Fuerza', exercises: [entry, { ...entry, id: 'entry-2', position: 2, lastWeightKg: null }] }, { id: 'day-2', position: 2, name: 'Movilidad', exercises: [{ ...entry, id: 'entry-3', exerciseName: 'Remo' }] }] } };
const server = setupServer(); const nativeFetch = globalThis.fetch;
beforeAll(() => { globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch; server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => { navigation.search = ''; server.use(http.get(`${base}/auth/session`, () => HttpResponse.json({ data: { csrfToken: 'csrf' } })), http.get(`${base}/sala/training-context`, () => HttpResponse.json({ data: context }))); });
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
function renderPage() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><RegisterTrainingPage/></QueryClientProvider>); }
const weights = () => screen.getAllByLabelText(/Peso utilizado/);
it('opens the selected day, keeps prescriptions read-only and saves comma decimal/null with the original routine ID', async () => {
  navigation.search = 'dayId=day-2';
  let payload: unknown;
  server.use(http.post(`${base}/sala/training-records`, async ({ request }) => { expect(request.headers.get('x-csrf-token')).toBe('csrf'); payload = await request.json(); return HttpResponse.json({ data: { id: 'saved' } }, { status: 201 }); }));
  renderPage(); expect(await screen.findByText('Remo')).toBeInTheDocument(); expect(screen.getByLabelText('Día de la rutina')).toHaveValue('day-2');
  expect(screen.getByLabelText('Fecha del entrenamiento')).toHaveValue('2026-10-26'); expect(screen.getByLabelText('Fecha del entrenamiento')).toHaveAttribute('min', '2026-10-20');
  fireEvent.change(screen.getByLabelText('Día de la rutina'), { target: { value: 'day-1' } });
  expect(weights()).toHaveLength(2); expect(weights()[0]).toHaveValue(''); expect(weights()[1]).toHaveValue('');
  expect(screen.getAllByText('30 kg')).toHaveLength(2); expect(screen.getByText('Último peso registrado: 31,5 kg')).toBeInTheDocument();
  expect(screen.queryByLabelText('Carga indicada')).not.toBeInTheDocument();
  fireEvent.change(weights()[0]!, { target: { value: '32,5' } }); fireEvent.click(screen.getByRole('button', { name: 'Guardar entrenamiento' }));
  await screen.findByText('Entrenamiento guardado correctamente.');
  expect(payload).toEqual({ routineId: 'routine', routineDayId: 'day-1', date: '2026-10-26', exercises: [{ id: 'entry-1', weightKg: '32.5' }, { id: 'entry-2', weightKg: null }] });
  expect(screen.getByRole('link', { name: 'Ver mi historial' })).toHaveAttribute('href', '/portal/sala/entrenamientos');
});
it('retains entered weights on errors, prevents repeated submits, and opens a duplicate for correction', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  server.use(http.post(`${base}/sala/training-records`, async () => { calls++; await gate; return HttpResponse.json({ code: 'TRAINING_DUPLICATE', message: 'Ya existe un entrenamiento.', details: { recordId: 'existing' } }, { status: 409 }); }));
  renderPage(); await screen.findAllByLabelText(/Peso utilizado/);
  fireEvent.change(weights()[0]!, { target: { value: '35,25' } }); fireEvent.click(screen.getByRole('button', { name: 'Guardar entrenamiento' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: 'Guardando…' })); release();
  expect(await screen.findByText('Ya existe un entrenamiento.')).toBeInTheDocument(); expect(weights()[0]).toHaveValue('35,25'); expect(calls).toBe(1);
  expect(screen.getByRole('link', { name: 'Abrir registro existente' })).toHaveAttribute('href', '/portal/sala/entrenamientos/registrar?recordId=existing');
});
it('validates an empty training and invalid/negative weights without sending them', async () => {
  let calls = 0; server.use(http.post(`${base}/sala/training-records`, () => { calls++; return HttpResponse.json({}); }));
  renderPage(); await screen.findAllByLabelText(/Peso utilizado/);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar entrenamiento' }));
  expect(await screen.findByText('Informá al menos un peso para guardar el entrenamiento.')).toBeInTheDocument();
  fireEvent.change(weights()[0]!, { target: { value: '-5' } }); fireEvent.click(screen.getByRole('button', { name: 'Guardar entrenamiento' }));
  expect(await screen.findByText('Ingresá un peso válido, sin valores negativos.')).toBeInTheDocument(); expect(calls).toBe(0);
});
it('corrects historical snapshot weights even with no active routine, preserving the original date and entries', async () => {
  navigation.search = 'recordId=old'; let payload: unknown;
  server.use(http.get(`${base}/sala/training-records/old`, () => HttpResponse.json({ data: { id: 'old', date: '2026-09-15', dayName: 'Fuerza anterior', dayPosition: 1, exercises: [{ ...entry, id: 'saved-entry', exerciseName: 'Press anterior', weightKg: '32.5', load: '25 kg' }] } })), http.post(`${base}/sala/training-records/old/correct`, async ({ request }) => { payload = await request.json(); return HttpResponse.json({ data: {} }); }));
  renderPage(); expect(await screen.findByText('15/09/2026 — Fuerza anterior')).toBeInTheDocument(); expect(screen.getByText('Press anterior')).toBeInTheDocument(); expect(screen.getByText('25 kg')).toBeInTheDocument();
  expect(weights()[0]).toHaveValue('32,5'); expect(screen.queryByLabelText('Fecha del entrenamiento')).not.toBeInTheDocument();
  fireEvent.change(weights()[0]!, { target: { value: '34' } }); fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección' }));
  await screen.findByText('Entrenamiento guardado correctamente.'); expect(payload).toEqual({ exercises: [{ id: 'saved-entry', weightKg: '34' }] });
});
it('does not offer a new training when no routine is active', async () => {
  server.use(http.get(`${base}/sala/training-context`, () => HttpResponse.json({ data: { today: '2026-10-26', routine: null } })));
  renderPage(); expect(await screen.findByText('No hay una rutina activa.')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Guardar entrenamiento' })).not.toBeInTheDocument();
});
