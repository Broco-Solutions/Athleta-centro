import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { vi } from 'vitest';
import CheckInPage from './page';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const session = { user: { id: 'staff', firstName: 'Staff', lastName: 'Athleta' }, roles: ['PROFESSOR'], permissions: ['SALA_AGENDA_MANAGE'], csrfToken: 'csrf', mustChangePassword: false };
beforeAll(() => { globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch; server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: session })));
});
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
function renderPage(): QueryClient { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); render(<QueryClientProvider client={client}><CheckInPage /></QueryClientProvider>); return client; }

const noBookingMessage = 'No tenés un turno reservado para este horario. Consultá con un profesor.';
const notFoundMessage = 'No encontramos un alumno activo con ese DNI. Revisalo o consultá en recepción.';

it('enfoca el DNI en una ventana activa aunque no haya puntero fino', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  renderPage();
  expect(await screen.findByLabelText('DNI del alumno')).toHaveFocus();
});

it('espera a que la ventana esté activa para enfocar el DNI', async () => {
  vi.mocked(document.hasFocus).mockReturnValue(false);
  renderPage();
  const input = await screen.findByLabelText('DNI del alumno');
  expect(input).not.toHaveFocus();

  vi.mocked(document.hasFocus).mockReturnValue(true);
  fireEvent(window, new Event('focus'));
  expect(input).toHaveFocus();
});

it('registra por DNI, muestra los datos y deja el campo vacío y enfocado', async () => {
  let submitted: unknown;
  server.use(http.post('http://localhost:3000/api/sala/check-in', async ({ request }) => { submitted = await request.json(); expect(request.headers.get('x-csrf-token')).toBe('csrf'); return HttpResponse.json({ data: { status: 'REGISTERED', message: '¡Asistencia registrada! Que tengas un buen entrenamiento.', person: 'Ana Alumna', startTime: '09:00', validUntil: '2026-10-23', renewalMessage: 'Tu plan vence hoy. Recordá renovarlo para continuar entrenando.' } }); }));
  const client = renderPage();
  const refresh = vi.spyOn(client, 'invalidateQueries').mockImplementation(() => new Promise(() => {}));
  const input = await screen.findByLabelText('DNI del alumno');
  fireEvent.change(input, { target: { value: '30123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso' }));
  expect(await screen.findByText('Ana Alumna · Turno de las 09:00')).toBeVisible();
  expect(screen.getByText('Tu plan vence hoy. Recordá renovarlo para continuar entrenando.')).toBeInTheDocument();
  expect(submitted).toEqual({ dni: '30123456' });
  expect(refresh.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
    ['sala', 'agenda'], ['sala', 'availability'], ['reservations'],
  ]);
  expect(input).toBeEnabled();
  expect(input).toHaveValue('');
  expect(input).toHaveFocus();
  expect(screen.queryByRole('button', { name: 'Registrar otro alumno' })).not.toBeInTheDocument();
});

it('muestra la falta de permiso sin exponer el formulario', async () => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: [] } })));
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso para registrar asistencias.');
  expect(screen.queryByLabelText('DNI del alumno')).not.toBeInTheDocument();
});

it('uses reception without administrative navigation and normalizes a pasted DNI preserving zeros', async () => {
  let payload: unknown;
  server.use(http.post('http://localhost:3000/api/sala/check-in', async ({ request }) => {
    payload = await request.json(); return HttpResponse.json({ data: { status: 'REGISTERED', message: 'Registrado', person: 'Alumno ficticio' } });
  }));
  renderPage();
  const input = await screen.findByLabelText('DNI del alumno');
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: '00.123.456' } });
  expect(input).toHaveValue('00123456');
  expect(payload).toBeUndefined();
  fireEvent.submit(input.closest('form')!);
  await screen.findByText('Alumno ficticio');
  expect(payload).toEqual({ dni: '00123456' });
});

it.each([
  ['NO_BOOKING', noBookingMessage],
  ['EXPIRED', 'Tu plan está vencido.'],
  ['CANCELLED', 'Tu turno fue cancelado.'],
  ['MANUAL_REVIEW', 'Consultá con un profesor para verificar tu ingreso.'],
])('mantiene el formulario y el mensaje de rechazo para %s', async (status, message) => {
  let writes = 0;
  server.use(http.post('http://localhost:3000/api/sala/check-in', () => {
    writes++;
    return HttpResponse.json({ data: { status, message } });
  }));
  renderPage();
  const input = await screen.findByLabelText('DNI del alumno');
  fireEvent.change(input, { target: { value: '30123456' } });
  fireEvent.submit(input.closest('form')!);

  expect(await screen.findByText(message)).toBeVisible();
  expect(input).toBeEnabled();
  expect(input).toHaveFocus();
  expect(writes).toBe(1);
});

it('retira la confirmación sin borrar un DNI que se empieza a escribir', async () => {
  let release: (() => void) | undefined;
  server.use(http.post('http://localhost:3000/api/sala/check-in', async () => {
    await new Promise<void>(resolve => { release = resolve; });
    return HttpResponse.json({ data: { status: 'REGISTERED', message: '¡Asistencia registrada!' } });
  }));
  renderPage();
  const input = await screen.findByLabelText('DNI del alumno');
  fireEvent.change(input, { target: { value: '30123456' } });
  fireEvent.submit(input.closest('form')!);
  await waitFor(() => expect(release).toBeDefined());

  vi.useFakeTimers();
  try {
    await act(async () => { release!(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('¡Asistencia registrada!')).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    fireEvent.change(input, { target: { value: '302' } });
    expect(screen.queryByText('¡Asistencia registrada!')).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(input).toHaveValue('302');
    expect(input).toHaveFocus();
  } finally {
    vi.useRealTimers();
  }
});

it('keeps the incorrect DNI editable, never refreshes agenda, and preserves a correction after 3 seconds', async () => {
  let writes = 0;
  server.use(http.post('http://localhost:3000/api/sala/check-in', () => { writes++; return HttpResponse.json({ data: { status: 'NOT_FOUND', message: notFoundMessage } }); }));
  const client = renderPage();
  const refresh = vi.spyOn(client, 'invalidateQueries');
  const input = await screen.findByLabelText('DNI del alumno');
  fireEvent.change(input, { target: { value: '30123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso' }));
  await screen.findByText(notFoundMessage);
  expect(input).toBeEnabled();
  expect(input).toHaveFocus();
  expect(input).toHaveValue('30123456');
  expect(refresh).not.toHaveBeenCalled();
  vi.useFakeTimers();
  try {
    fireEvent.change(input, { target: { value: '30123457' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_100); });
    expect(input).toHaveValue('30123457');
    expect(screen.queryByText(notFoundMessage)).not.toBeInTheDocument();
  } finally { vi.useRealTimers(); }
  fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso' }));
  await waitFor(() => expect(writes).toBe(2));
});
it('mantiene el DNI ante un error técnico y permite volver a enviarlo', async () => {
  const submitted: unknown[] = [];
  server.use(http.post('http://localhost:3000/api/sala/check-in', async ({ request }) => {
    submitted.push(await request.json());
    if (submitted.length === 1) return HttpResponse.json({}, { status: 500 });
    return HttpResponse.json({ data: { status: 'REGISTERED', message: 'Ingreso confirmado tras reintentar.' } });
  }));
  renderPage();
  const input = await screen.findByLabelText('DNI del alumno');
  fireEvent.change(input, { target: { value: '30123456' } });
  fireEvent.submit(input.closest('form')!);
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos verificar tu asistencia.');
  expect(input).toHaveValue('30123456');
  expect(input).toHaveFocus();
  expect(input).toBeEnabled();

  fireEvent.submit(input.closest('form')!);
  expect(await screen.findByText('Ingreso confirmado tras reintentar.')).toBeVisible();
  expect(submitted).toEqual([{ dni: '30123456' }, { dni: '30123456' }]);
  expect(input).toHaveValue('');
  expect(input).toHaveFocus();
});

it('dismisses only the incorrect-DNI message after exactly 3 seconds', async () => {
  let release: (() => void) | undefined;
  server.use(http.post('http://localhost:3000/api/sala/check-in', async () => { await new Promise<void>(resolve => { release = resolve; }); return HttpResponse.json({ data: { status: 'NOT_FOUND', message: notFoundMessage } }); }));
  renderPage(); const input = await screen.findByLabelText('DNI del alumno');
  fireEvent.change(input, { target: { value: '30123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso' }));
  await waitFor(() => expect(release).toBeDefined());
  vi.useFakeTimers();
  try {
    await act(async () => { release!(); for (let i = 0; i < 20; i++) await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_999); });
    expect(screen.getByText(notFoundMessage)).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.queryByText(notFoundMessage)).not.toBeInTheDocument();
    expect(input).toHaveValue('30123456');
  } finally { vi.useRealTimers(); }
});

it('acepta dos DNI consecutivos y bloquea envíos mientras el primero está pendiente', async () => {
  const submitted: unknown[] = [];
  let release: (() => void) | undefined;
  server.use(http.post('http://localhost:3000/api/sala/check-in', async ({ request }) => {
    const payload = await request.json();
    submitted.push(payload);
    if (submitted.length === 1) {
      await new Promise<void>(resolve => { release = resolve; });
      return HttpResponse.json({ data: { status: 'ALREADY_REGISTERED', message: 'Tu ingreso ya estaba registrado.' } });
    }
    return HttpResponse.json({ data: { status: 'REGISTERED', message: '¡Asistencia registrada!', person: 'Segundo alumno' } });
  }));
  renderPage();
  const input = await screen.findByLabelText('DNI del alumno');
  const form = input.closest('form')!;
  expect(screen.getByText(/Esperando DNI/)).toBeVisible();
  fireEvent.change(input, { target: { value: '30123456' } });
  expect(submitted).toEqual([]);
  // jsdom no ejecuta el envío implícito de formularios al presionar Enter.
  act(() => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
  await waitFor(() => expect(release).toBeDefined());
  expect(input).toBeDisabled();
  expect(screen.getByText('Verificando DNI…')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Verificando…' })).toBeDisabled();
  fireEvent.submit(form);
  release!();

  expect(await screen.findByRole('heading', { name: 'Ingreso ya registrado' })).toBeVisible();
  expect(input).toBeEnabled();
  expect(input).toHaveFocus();
  expect(input).toHaveValue('');
  expect(submitted).toEqual([{ dni: '30123456' }]);

  fireEvent.change(input, { target: { value: '30123457' } });
  expect(screen.queryByText('Tu ingreso ya estaba registrado.')).not.toBeInTheDocument();
  fireEvent.submit(form);
  expect(await screen.findByText('Segundo alumno')).toBeVisible();
  expect(input).toHaveValue('');
  expect(input).toHaveFocus();
  expect(submitted).toEqual([{ dni: '30123456' }, { dni: '30123457' }]);
});
