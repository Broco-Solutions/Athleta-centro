import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import PortalSala from './page';
import * as portalUi from '../portal-ui';
import { portalFetch } from '../portal-ui';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const baseBlocks = (date = '2026-09-07', available?: (time: string) => boolean) => ['09:00', '09:15', '09:30', '09:45', '10:00', '10:15', '10:30', '10:45', '11:00'].map(startTime => ({ scheduleSlotId: 'window', startTime, endTime: `${String(Number(startTime.slice(0, 2)) + (startTime.endsWith('45') ? 1 : 0)).padStart(2, '0')}:${startTime.endsWith('45') ? '00' : String(Number(startTime.slice(3)) + 15).padStart(2, '0')}`, available: available?.(startTime) ?? true, date }));
beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'bypass' });
});
beforeEach(() => {
  server.use(
    http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [], routine: null, evaluations: [], paymentState: 'PENDING' } })),
    http.get('http://localhost:3000/api/portal/sala/services', () => HttpResponse.json({ data: [{ id: 'service', name: 'Rehabilitación', durationMinutes: 45 }] })),
    http.get('http://localhost:3000/api/portal/sala/availability', ({ request }) => HttpResponse.json({ data: baseBlocks(new URL(request.url).searchParams.get('date') ?? undefined) })),
    http.get('http://localhost:3000/api/portal/auth/session', () => HttpResponse.json({ data: { csrfToken: 'csrf' } })),
  );
});
afterEach(() => { server.resetHandlers(); vi.restoreAllMocks(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
function renderPortalSala(): void { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><PortalSala /></QueryClientProvider>); }

it('shows exercise names, descriptions and only populated routine details', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: {
    reservations: [], fixed: [], evaluations: [], paymentState: 'PENDING',
    routine: { days: [{ id: 'day-1', name: 'Día 1', exercises: [
      { exerciseDefinition: { name: 'Sentadilla', description: 'Descenso controlado' }, series: '3', repetitions: '10', duration: null, load: '40 kg', rest: '60 s', notes: 'Controlar técnica' },
      { exerciseDefinition: { name: 'Plancha', description: null }, series: '3', repetitions: null, duration: '45 s', load: null, rest: '30 s', notes: null },
      { exerciseDefinition: { name: 'Movilidad', description: '' }, series: '', repetitions: '', duration: '', load: '', rest: '', notes: '' },
    ] }] },
  } })));
  renderPortalSala();
  await screen.findByRole('heading', { name: 'Día 1' });
  const routine = within(document.getElementById('rutina')!);
  expect(routine.getByText('Sentadilla · 3 series · 10 rep. · Carga 40 kg · Descanso 60 s · Observación Controlar técnica')).toBeInTheDocument();
  expect(routine.getByText('Descenso controlado')).toBeInTheDocument();
  expect(routine.getByText('Plancha · 3 series · Tiempo 45 s · Descanso 30 s')).toBeInTheDocument();
  expect(routine.getByText('Movilidad')).toBeInTheDocument();
  expect(routine.getAllByRole('listitem').map(item => item.textContent)).toEqual([
    'Sentadilla · 3 series · 10 rep. · Carga 40 kg · Descanso 60 s · Observación Controlar técnicaDescenso controlado',
    'Plancha · 3 series · Tiempo 45 s · Descanso 30 s',
    'Movilidad',
  ]);
  expect(routine.queryByText(/Ejercicio ·|— series|— rep\.|undefined|null/)).not.toBeInTheDocument();
});

function fixedHandlers(state: { weekday: string; startTime: string; active: boolean }, onChange?: (body: Record<string, string>) => void, onAvailability?: (url: string) => void): void {
  server.use(
    http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: state.active ? [{ id: 'fixed-1', startDate: '2026-09-07', startTime: state.startTime, serviceType: { id: 'service', name: 'Rehabilitación', durationMinutes: 45 }, scheduleSlot: { id: 'window', weekday: state.weekday } }] : [], routine: null, evaluations: [], paymentState: 'PENDING' } })),
    http.get('http://localhost:3000/api/portal/sala/availability', ({ request }) => { onAvailability?.(request.url); return HttpResponse.json({ data: baseBlocks(new URL(request.url).searchParams.get('date') ?? '2026-09-07') }); }),
    http.post('http://localhost:3000/api/portal/sala/fixed-bookings/fixed-1/change', async ({ request }) => { onChange?.(await request.json() as Record<string, string>); return HttpResponse.json({ data: {} }); }),
    http.post('http://localhost:3000/api/portal/sala/fixed-bookings/fixed-1/end', () => { state.active = false; return HttpResponse.json({ data: {} }); }),
  );
}

it('shows fixed bookings as the main Sala section and no persistent editor', async () => {
  renderPortalSala();
  await screen.findByRole('heading', { name: 'Mis turnos fijos' });
  expect(screen.getByText('No tenés turnos fijos.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Agregar turno fijo' })).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Elegí el servicio' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reservar horario' })).toBeInTheDocument();
  for (const id of ['turnos-fijos', 'rutina', 'evaluaciones']) expect(document.getElementById(id)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Volver a Inicio' })).toHaveAttribute('href', '/portal');
});

it('keeps fixed occurrence statuses and presents service duration and translated weekday', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [{ id: 'fixed-1', startDate: '2026-10-12', startTime: '17:00', serviceType: { id: 'service', name: 'Musculación', durationMinutes: 60 }, scheduleSlot: { id: 'window', weekday: 'MONDAY' } }], fixedOccurrences: [
    ...(['RESERVED', 'PENDING_PAYMENT', 'CANCELLED', 'ATTENDED', 'ABSENT'] as const).map((status, index) => ({ fixedSalaBookingId: 'fixed-1', date: `2026-10-${String(12 + index).padStart(2, '0')}`, startTime: '17:00', status, cancelledForNonPayment: false })),
  ], routine: null, evaluations: [], paymentState: 'PENDING' } })));
  renderPortalSala();
  expect(await screen.findByText('Musculación · 60 min')).toBeInTheDocument();
  expect(screen.getByText('Lunes · 17:00–18:00')).toBeInTheDocument();
  for (const status of ['Reservado', 'Pendiente de pago', 'Cancelado', 'Asistió', 'Ausente']) expect(screen.getByText(status)).toBeInTheDocument();
});

it('opens a responsive common creation editor, auto-selects one service, and creates with exactly four fields', async () => {
  let submitted: Record<string, string> | undefined;
  server.use(http.post('http://localhost:3000/api/portal/sala/fixed-bookings', async ({ request }) => { submitted = await request.json() as Record<string, string>; return HttpResponse.json({ data: {} }); }));
  vi.spyOn(portalUi, 'today').mockReturnValue('2026-09-01');
  renderPortalSala();
  fireEvent.click(await screen.findByRole('button', { name: 'Agregar turno fijo' }));
  const dialog = await screen.findByRole('dialog', { name: 'Nuevo turno fijo' });
  expect(within(dialog).getByText('Elegí el horario que querés mantener cada semana.')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Rehabilitación 45 min' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Crear turno fijo' })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Lunes' }));
  await within(dialog).findByRole('button', { name: '09:00–09:45 Hay lugar' });
  fireEvent.click(within(dialog).getByRole('button', { name: '09:00–09:45 Hay lugar' }));
  const create = within(dialog).getByRole('button', { name: 'Crear turno fijo' });
  expect(create).toBeEnabled();
  fireEvent.click(create);
  await waitFor(() => expect(submitted).toEqual({ scheduleSlotId: 'window', serviceTypeId: 'service', startTime: '09:00', startDate: '2026-09-07' }));
  expect(Object.keys(submitted ?? {}).sort()).toEqual(['scheduleSlotId', 'serviceTypeId', 'startDate', 'startTime']);
  expect(await screen.findByText('Turno fijo creado.')).toBeInTheDocument();
});

it('requires a manual selection when multiple allowed services exist and shows only those services', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala/services', () => HttpResponse.json({ data: [{ id: 'muscle', name: 'Musculación', durationMinutes: 60 }, { id: 'functional', name: 'Funcional', durationMinutes: 45 }] })));
  renderPortalSala();
  fireEvent.click(await screen.findByRole('button', { name: 'Agregar turno fijo' }));
  const dialog = await screen.findByRole('dialog', { name: 'Nuevo turno fijo' });
  const muscle = within(dialog).getByRole('button', { name: 'Musculación 60 min' });
  expect(muscle).toHaveAttribute('aria-pressed', 'false');
  expect(within(dialog).getByRole('button', { name: 'Funcional 45 min' })).toHaveAttribute('aria-pressed', 'false');
  expect(within(dialog).queryByRole('button', { name: /Calistenia/ })).not.toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Crear turno fijo' })).toBeDisabled();
  fireEvent.click(muscle);
  expect(muscle).toHaveAttribute('aria-pressed', 'true');
});

it('selects weekdays with buttons and requests availability only for the selected date', async () => {
  const urls: string[] = [];
  server.use(http.get('http://localhost:3000/api/portal/sala/availability', ({ request }) => { urls.push(request.url); return HttpResponse.json({ data: baseBlocks(new URL(request.url).searchParams.get('date') ?? undefined) }); }));
  vi.spyOn(portalUi, 'today').mockReturnValue('2026-09-01');
  renderPortalSala();
  fireEvent.click(await screen.findByRole('button', { name: 'Agregar turno fijo' }));
  const dialog = await screen.findByRole('dialog', { name: 'Nuevo turno fijo' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Martes' }));
  await waitFor(() => expect(urls.some(url => url.includes('date=2026-09-01'))).toBe(true));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Miércoles' }));
  await waitFor(() => expect(urls.some(url => url.includes('date=2026-09-02'))).toBe(true));
  expect(within(dialog).getAllByRole('button', { name: /Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo/ })).toHaveLength(7);
  expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument();
});

it('shows half-hour starts only, displays full 45/60 minute ranges, and keeps full windows disabled', async () => {
  server.use(
    http.get('http://localhost:3000/api/portal/sala/services', () => HttpResponse.json({ data: [{ id: 'service', name: 'Musculación', durationMinutes: 60 }] })),
    http.get('http://localhost:3000/api/portal/sala/availability', ({ request }) => HttpResponse.json({ data: baseBlocks(new URL(request.url).searchParams.get('date') ?? '2026-09-07', time => time !== '09:15') })),
  );
  renderPortalSala();
  fireEvent.click(await screen.findByRole('button', { name: 'Agregar turno fijo' }));
  const dialog = await screen.findByRole('dialog', { name: 'Nuevo turno fijo' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Lunes' }));
  const full = await within(dialog).findByRole('button', { name: '09:00–10:00 Sin lugar' });
  expect(full).toBeDisabled();
  expect(within(dialog).queryByRole('button', { name: '09:15–10:15 Hay lugar' })).not.toBeInTheDocument();
  const available = within(dialog).getByRole('button', { name: '09:30–10:30 Hay lugar' });
  fireEvent.click(available);
  expect(available).toHaveAttribute('aria-pressed', 'true');
  expect(within(dialog).getByText(/Todos los lunes · 09:30–10:30/)).toBeInTheDocument();
});

it('opens modification in the same editor with allowed service and time preselected and preserves request contract', async () => {
  const state = { weekday: 'MONDAY', startTime: '10:00', active: true }; let changed: Record<string, string> | undefined; let availabilityUrl = '';
  fixedHandlers(state, body => { changed = body; }, url => { if (url.includes('excludeFixedBookingId')) availabilityUrl = url; });
  renderPortalSala();
  fireEvent.click(await screen.findByRole('button', { name: 'Modificar' }));
  const dialog = await screen.findByRole('dialog', { name: 'Modificar turno fijo' });
  expect(within(dialog).getByRole('button', { name: 'Rehabilitación 45 min' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(dialog).getByRole('button', { name: 'Lunes' })).toHaveAttribute('aria-pressed', 'true');
  const save = within(dialog).getByRole('button', { name: 'Guardar cambios' });
  await waitFor(() => expect(save).toBeEnabled());
  expect(availabilityUrl).toContain('excludeFixedBookingId=fixed-1');
  fireEvent.click(within(dialog).getByRole('button', { name: '09:30–10:15 Hay lugar' }));
  fireEvent.click(save);
  await waitFor(() => expect(changed).toEqual({ scheduleSlotId: 'window', serviceTypeId: 'service', startTime: '09:30', startDate: expect.any(String) }));
  expect(Object.keys(changed ?? {}).sort()).toEqual(['scheduleSlotId', 'serviceTypeId', 'startDate', 'startTime']);
  expect(changed?.startDate).toBe('2026-09-07');
  expect(await screen.findByText('Turno fijo modificado.')).toBeInTheDocument();
});

it('does not add a historical service to current options and requires a currently allowed service', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [{ id: 'old-fixed', startDate: '2026-09-07', startTime: '09:00', serviceType: { id: 'old', name: 'Calistenia' }, scheduleSlot: { id: 'window', weekday: 'MONDAY' } }], routine: null, evaluations: [], paymentState: 'PENDING' } })));
  renderPortalSala();
  expect(await screen.findByText('Calistenia')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Modificar' }));
  const dialog = await screen.findByRole('dialog', { name: 'Modificar turno fijo' });
  expect(within(dialog).queryByRole('button', { name: /Calistenia/ })).not.toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: 'Rehabilitación 45 min' })).toHaveAttribute('aria-pressed', 'false');
});

it.each(['09:15', '09:45'])('keeps historical start %s as a reference and requires a valid new start', async startTime => {
  let submitted: Record<string, string> | undefined;
  fixedHandlers({ weekday: 'MONDAY', startTime, active: true }, body => { submitted = body; });
  renderPortalSala();
  fireEvent.click(await screen.findByRole('button', { name: 'Modificar' }));
  const dialog = await screen.findByRole('dialog', { name: 'Modificar turno fijo' });
  expect(within(dialog).getByText(`Horario actual · ${startTime}`)).toBeInTheDocument();
  expect(within(dialog).getByText('Este horario ya no está disponible para nuevas configuraciones.')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  fireEvent.click(await within(dialog).findByRole('button', { name: '09:30–10:15 Hay lugar' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(submitted).toMatchObject({ scheduleSlotId: 'window', startTime: '09:30' }));
});

it('preserves finish confirmation and removes the fixed booking after success', async () => {
  const state = { weekday: 'TUESDAY', startTime: '09:00', active: true }; fixedHandlers(state);
  renderPortalSala();
  fireEvent.click(await screen.findByRole('button', { name: 'Finalizar' }));
  const dialog = await screen.findByRole('dialog', { name: 'Finalizar turno fijo' });
  expect(within(dialog).getByText('El turno dejará de generar compromisos futuros. La actividad anterior se conservará.')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Finalizar turno' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Finalizar turno fijo' })).not.toBeInTheDocument());
  expect(await screen.findByText('No tenés turnos fijos.')).toBeInTheDocument();
});

it('shows no-service plan message and disables adding a fixed booking', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala/services', () => HttpResponse.json({ data: [] })));
  renderPortalSala();
  expect(await screen.findByText('Tu Plan actual no tiene servicios disponibles. Consultá con Athleta.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Agregar turno fijo' })).toBeDisabled();
});

it('keeps a generic fetch error when the response is not structured', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala/services', () => HttpResponse.text('Unavailable', { status: 503 })));
  await expect(portalFetch('sala/services')).rejects.toThrow('No pudimos cargar esta información.');
});

it.each(['2026-10-05', '2026-10-15', '2026-10-16', '2026-10-25'])('shows the same pending payment guidance for operational date %s', async date => {
  vi.spyOn(portalUi, 'today').mockReturnValue(date);
  renderPortalSala();
  expect(await screen.findByText('Pago pendiente')).toBeInTheDocument();
  expect(screen.getByText('Con el pago pendiente podés reservar únicamente fechas del 1 al 15 inclusive.')).toBeInTheDocument();
});
it('shows registered payment without pending guidance', async () => {
  vi.spyOn(portalUi, 'today').mockReturnValue('2026-10-16');
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [], routine: null, evaluations: [], paymentState: 'PAID' } })));
  renderPortalSala();
  expect(await screen.findByText('Pago registrado')).toBeInTheDocument();
  expect(screen.queryByText('Pago pendiente')).not.toBeInTheDocument();
  expect(screen.queryByText('Con el pago pendiente podés reservar únicamente fechas del 1 al 15 inclusive.')).not.toBeInTheDocument();
});

async function openReservation(now = '2026-10-16T12:49:00Z'): Promise<HTMLElement> {
  vi.spyOn(portalUi, 'today').mockReturnValue('2026-10-16');
  vi.spyOn(Date, 'now').mockReturnValue(new Date(now).getTime());
  renderPortalSala();
  const open = await screen.findByRole('button', { name: 'Reservar horario' });
  await waitFor(() => expect(open).toBeEnabled());
  fireEvent.click(open);
  return screen.findByRole('dialog', { name: 'Reserva puntual' });
}
it('restores reservation steps, date bounds and ongoing/future starts using the service duration', async () => {
  const dialog = await openReservation('2026-10-16T12:55:00Z');
  expect(within(dialog).getByLabelText('Fecha de la reserva')).toHaveAttribute('min', '2026-10-16');
  expect(within(dialog).getByLabelText('Fecha de la reserva')).toHaveAttribute('max', '2026-11-15');
  await within(dialog).findByRole('button', { name: '09:30–10:15 Hay lugar' });
  expect(within(dialog).queryByRole('button', { name: '09:00–09:45 Hay lugar' })).not.toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: '10:00–10:45 Hay lugar' })).toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: /09:45–/ })).not.toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('Fecha de la reserva'), { target: { value: '2026-10-17' } });
  expect(await within(dialog).findByRole('button', { name: '09:00–09:45 Hay lugar' })).toBeInTheDocument();
});
it('creates an ongoing reservation through the existing endpoint with only the selected fields', async () => {
  let submitted: Record<string, string> | undefined;
  server.use(http.post('http://localhost:3000/api/portal/sala/reservations', async ({ request }) => { submitted = await request.json() as Record<string, string>; return HttpResponse.json({ data: {} }); }));
  const dialog = await openReservation();
  fireEvent.click(await within(dialog).findByRole('button', { name: '09:30–10:15 Hay lugar' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar reserva' }));
  expect(await screen.findByText('Reserva creada.')).toBeInTheDocument();
  expect(submitted).toEqual({ date: '2026-10-16', scheduleSlotId: 'window', serviceTypeId: 'service', startTime: '09:30' });
});
it('expires a selected start automatically below 20 minutes and refreshes the clock when reopening', async () => {
  let availabilityRequests = 0;
  server.use(http.get('http://localhost:3000/api/portal/sala/availability', ({ request }) => {
    availabilityRequests += 1;
    return HttpResponse.json({ data: baseBlocks(new URL(request.url).searchParams.get('date') ?? undefined) });
  }));
  // Keep fetch/Query timers real; only the local interval needs to advance.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  try {
    const dialog = await openReservation('2026-10-16T12:55:00Z');
    const option = await within(dialog).findByRole('button', { name: '09:30–10:15 Hay lugar' });
    fireEvent.click(option);
    const confirm = within(dialog).getByRole('button', { name: 'Confirmar reserva' });
    expect(confirm).toBeEnabled();
    const requestsBeforeTick = availabilityRequests;
    vi.mocked(Date.now).mockReturnValue(new Date('2026-10-16T12:55:00.001Z').getTime());
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole('dialog', { name: 'Reserva puntual' })).toBe(dialog);
    expect(within(dialog).getByLabelText('Fecha de la reserva')).toHaveValue('2026-10-16');
    expect(within(dialog).queryByRole('button', { name: '09:30–10:15 Hay lugar' })).not.toBeInTheDocument();
    expect(confirm).toBeDisabled();
    expect(availabilityRequests).toBe(requestsBeforeTick);
    expect(within(dialog).getByRole('button', { name: '10:00–10:45 Hay lugar' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /09:45–/ })).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Volver a Sala' }));
    expect(vi.getTimerCount()).toBe(0);
    vi.mocked(Date.now).mockReturnValue(new Date('2026-10-16T13:25:00.001Z').getTime());
    fireEvent.click(screen.getByRole('button', { name: 'Reservar horario' }));
    const reopened = screen.getByRole('dialog', { name: 'Reserva puntual' });
    expect(within(reopened).queryByRole('button', { name: '10:00–10:45 Hay lugar' })).not.toBeInTheDocument();
    expect(within(reopened).getByRole('button', { name: 'Confirmar reserva' })).toBeDisabled();
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    cleanup();
    vi.useRealTimers();
  }
});
it.each([
  ['PORTAL_SALA_TIME_PASSED', 'Ese horario ya no admite reservas porque quedan menos de 20 minutos de actividad. Elegí otro horario.'],
  ['PORTAL_SALA_PAYMENT_REQUIRED', 'Para reservar esta fecha necesitás tener abonado el mes correspondiente.'],
])('shows the reservation rejection %s', async (code, message) => {
  server.use(http.post('http://localhost:3000/api/portal/sala/reservations', () => HttpResponse.json({ code, message: 'Rechazado' }, { status: 400 })));
  const dialog = await openReservation();
  fireEvent.click(await within(dialog).findByRole('button', { name: '09:30–10:15 Hay lugar' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar reserva' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
});
it('shows a cancelled future reservation without a cancel action', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [{ id: 'cancelled', date: '2026-10-20', startTime: '09:30', cancelledAt: '2026-10-16T12:00:00Z', serviceType: { name: 'Rehabilitación' } }], fixed: [], evaluations: [], paymentState: 'PENDING' } })));
  renderPortalSala();
  expect(await screen.findByText('Rehabilitación · Cancelado')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
});

it('groups physical results by test chronologically, preserving repeated results and hiding internal observation', async () => {
  const strength = { id: 'strength', name: 'Test Fuerza' }; const mobility = { id: 'mobility', name: 'Movilidad' };
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [], routine: null, paymentState: 'PENDING', evaluations: [
    { id: 'oct', evaluationDate: '2026-10-01', observation: 'Nota interna del Profesor', professor: { firstName: 'Secreto' }, results: [{ testDefinition: strength, resultText: '90 kg' }] },
    { id: 'aug', evaluationDate: '2026-08-01', results: [{ testDefinition: strength, resultText: '80 kg' }, { testDefinition: strength, resultText: '81 kg' }] },
    { id: 'sep', evaluationDate: '2026-09-01', results: [{ testDefinition: strength, resultText: '85 kg' }] },
    { id: 'mob', evaluationDate: '2026-08-15', results: [{ testDefinition: mobility, resultText: '35°' }] },
  ] } })));
  renderPortalSala(); await screen.findByRole('heading', { name: 'Test Fuerza' });
  const section = document.getElementById('evaluaciones')!;
  const strengthGroup = screen.getByRole('heading', { name: 'Test Fuerza' }).closest('article')!;
  expect(within(strengthGroup).getAllByRole('listitem').map(item => item.textContent)).toEqual(['01/08/2026 · 80 kg', '01/08/2026 · 81 kg', '01/09/2026 · 85 kg', '01/10/2026 · 90 kg']);
  expect(within(screen.getByRole('heading', { name: 'Movilidad' }).closest('article')!).getByText('15/08/2026 · 35°')).toBeInTheDocument();
  expect(section.querySelector('canvas, svg')).toBeNull(); expect(section.textContent).not.toMatch(/Nota interna|Secreto|%|mejora|tendencia/i);
});
