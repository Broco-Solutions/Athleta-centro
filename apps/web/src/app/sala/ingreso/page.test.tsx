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
beforeEach(() => server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: session }))));
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
function renderPage(): QueryClient { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); render(<QueryClientProvider client={client}><CheckInPage /></QueryClientProvider>); return client; }

const noBookingMessage = 'No tenés un turno reservado para este horario. Consultá con un profesor.';
const notFoundMessage = 'No encontramos un alumno activo con ese DNI. Revisalo o consultá en recepción.';
async function showResult(status: string, message: string): Promise<void> {
  server.use(http.post('http://localhost:3000/api/sala/check-in', () => HttpResponse.json({ data: { status, message } })));
  renderPage();
  fireEvent.change(await screen.findByLabelText('DNI del alumno'), { target: { value: '30123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso' }));
  expect(await screen.findByText(message)).toBeInTheDocument();
}
async function startDeferredResult(message: string): Promise<() => void> {
  let releaseResponse: (() => void) | undefined;
  server.use(http.post('http://localhost:3000/api/sala/check-in', async () => {
    await new Promise<void>((resolve) => { releaseResponse = resolve; });
    return HttpResponse.json({ data: { status: 'NO_BOOKING', message } });
  }));
  renderPage();
  fireEvent.change(await screen.findByLabelText('DNI del alumno'), { target: { value: '30123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso' }));
  await waitFor(() => expect(releaseResponse).toBeDefined());
  return releaseResponse!;
}

it('registra por DNI, presenta el resultado y habilita otro alumno después', async () => {
  let submitted: unknown;
  server.use(http.post('http://localhost:3000/api/sala/check-in', async ({ request }) => { submitted = await request.json(); expect(request.headers.get('x-csrf-token')).toBe('csrf'); return HttpResponse.json({ data: { status: 'REGISTERED', message: '¡Asistencia registrada! Que tengas un buen entrenamiento.', person: 'Ana Alumna', startTime: '09:00', validUntil: '2026-10-23', renewalMessage: 'Tu plan vence hoy. Recordá renovarlo para continuar entrenando.' } }); }));
  renderPage();
  fireEvent.change(await screen.findByLabelText('DNI del alumno'), { target: { value: '30123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso' }));
  expect(await screen.findByText('Ana Alumna · Turno de las 09:00')).toBeInTheDocument();
  expect(screen.getByText('Tu plan vence hoy. Recordá renovarlo para continuar entrenando.')).toBeInTheDocument();
  expect(submitted).toEqual({ dni: '30123456' });
  expect(screen.queryByLabelText('DNI del alumno')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Registrar otro alumno' }));
  expect(screen.getByLabelText('DNI del alumno')).toHaveValue('');
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
  ['NOT_FOUND', notFoundMessage],
])('presenta exactamente el mensaje del backend para %s', async (status, message) => {
  await showResult(status, message);
});

it.each([true, false])('vuelve a los 10 segundos y enfoca solo con puntero fino (%s)', async finePointer => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: finePointer })));
  const releaseResponse = await startDeferredResult(noBookingMessage);
  vi.useFakeTimers();
  try {
    await act(async () => { releaseResponse(); for (let index = 0; index < 20; index += 1) await Promise.resolve(); });
    expect(screen.getByText(noBookingMessage)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(9_999); });
    expect(screen.getByText(noBookingMessage)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const input = screen.getByLabelText('DNI del alumno');
    expect(input).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Registrar ingreso' })).toBeInTheDocument();
    expect(screen.queryByText(noBookingMessage)).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(16); });
    if (finePointer) expect(input).toHaveFocus();
    else expect(input).not.toHaveFocus();
  } finally {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

it('el reset manual cancela el timeout del resultado anterior', async () => {
  const releaseResponse = await startDeferredResult(noBookingMessage);
  vi.useFakeTimers();
  try {
    await act(async () => { releaseResponse(); for (let index = 0; index < 20; index += 1) await Promise.resolve(); });
    expect(screen.getByText(noBookingMessage)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar otro alumno' }));
    expect(screen.getByLabelText('DNI del alumno')).toHaveValue('');
    expect(screen.queryByText(noBookingMessage)).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(screen.getByLabelText('DNI del alumno')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar ingreso' })).toBeInTheDocument();
    expect(screen.queryByText(noBookingMessage)).not.toBeInTheDocument();
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
  expect(input).toBeEnabled(); expect(refresh).not.toHaveBeenCalled();
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
it('keeps technical errors visible with an immediate retry and prevents duplicate writes', async () => {
  let writes = 0;
  server.use(http.post('http://localhost:3000/api/sala/check-in', () => { writes++; return HttpResponse.json({}, { status: 500 }); }));
  renderPage(); fireEvent.change(await screen.findByLabelText('DNI del alumno'), { target: { value: '30123456' } });
  const button = screen.getByRole('button', { name: 'Registrar ingreso' });
  fireEvent.click(button); fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos verificar tu asistencia.');
  expect(writes).toBe(1); expect(button).toBeEnabled();
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

it('does not register while typing and announces verification before showing an already registered arrival', async () => {
  let writes = 0;
  let release: (() => void) | undefined;
  server.use(http.post('http://localhost:3000/api/sala/check-in', async () => {
    writes++;
    await new Promise<void>(resolve => { release = resolve; });
    return HttpResponse.json({ data: { status: 'ALREADY_REGISTERED', message: 'Tu ingreso ya estaba registrado.' } });
  }));
  renderPage();
  const input = await screen.findByLabelText('DNI del alumno');
  expect(screen.getByText(/Esperando DNI/)).toBeVisible();
  fireEvent.change(input, { target: { value: '30123456' } });
  expect(writes).toBe(0);
  fireEvent.submit(input.closest('form')!);
  await waitFor(() => expect(release).toBeDefined());
  expect(screen.getByText('Verificando DNI…')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Verificando…' })).toBeDisabled();
  release!();
  expect(await screen.findByRole('heading', { name: 'Ingreso ya registrado' })).toBeVisible();
  expect(screen.getByText('Tu ingreso ya estaba registrado.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Registrar otro alumno' }));
  expect(screen.getByLabelText('DNI del alumno')).toHaveValue('');
});
