import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import PortalHome from './page';
import * as portalUi from './portal-ui';
import { portalFetch } from './portal-ui';

const navigation = vi.hoisted(() => ({ pathname: '/portal' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

const server = setupServer();
const nativeFetch = globalThis.fetch;
const baseBlocks = (date = '2026-09-07', available?: (time: string) => boolean) => ['09:00', '09:15', '09:30', '09:45', '10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30', '11:45'].map(startTime => ({ scheduleSlotId: 'window', startTime, endTime: `${String(Number(startTime.slice(0, 2)) + (startTime.endsWith('45') ? 1 : 0)).padStart(2, '0')}:${startTime.endsWith('45') ? '00' : String(Number(startTime.slice(3)) + 15).padStart(2, '0')}`, available: available?.(startTime) ?? true, date }));
function availableWeeks() {
  const day = new Date(`${portalUi.today()}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  const end = new Date(day); end.setUTCDate(end.getUTCDate() + 6);
  return [{ weekStart: day.toISOString().slice(0, 10), weekEnd: end.toISOString().slice(0, 10), available: 1 }];
}
beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'bypass' });
});
beforeEach(() => {
  navigation.pathname = '/portal';
  server.use(
    http.get('http://localhost:3000/api/portal/clinic/appointments', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [], routine: null, evaluations: [], replacementWeeks: availableWeeks(), validity: { hasValidAccess: true, validUntil: '2026-11-20' } } })),
    http.get('http://localhost:3000/api/portal/sala/services', () => HttpResponse.json({ data: [{ id: 'service', name: 'Rehabilitación', durationMinutes: 45 }] })),
    http.get('http://localhost:3000/api/portal/sala/availability', ({ request }) => HttpResponse.json({ data: baseBlocks(new URL(request.url).searchParams.get('date') ?? undefined) })),
    http.get('http://localhost:3000/api/portal/auth/session', () => HttpResponse.json({ data: { csrfToken: 'csrf' } })),
  );
});
afterEach(() => { server.resetHandlers(); vi.restoreAllMocks(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
function renderPortalHome(): void { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><PortalHome /></QueryClientProvider>); }

it('shows a routine summary and links to its read-only detail page', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: {
    reservations: [], fixed: [], evaluations: [], replacementWeeks: availableWeeks(), validity: { hasValidAccess: true, validUntil: '2026-11-20' },
    routine: { days: [{ id: 'day-1', position: 1, name: null, exercises: [
      { exerciseDefinitionId: 'squat', exerciseDefinition: { name: 'Sentadilla', description: 'Descenso controlado' }, series: '3', repetitions: '10', duration: null, load: '40 kg', rest: '60 s', notes: 'Controlar técnica' },
      { exerciseDefinitionId: 'plank', exerciseDefinition: { name: 'Plancha', description: null }, series: '3', repetitions: null, duration: '45 s', load: null, rest: '30 s', notes: null },
      { exerciseDefinitionId: 'mobility', exerciseDefinition: { name: 'Movilidad', description: '' }, series: '', repetitions: '', duration: '', load: '', rest: '', notes: '' },
    ] }, { id: 'day-2', position: 2, name: 'Día 2', exercises: [{ exerciseDefinitionId: 'row', exerciseDefinition: { name: 'Remo', description: null }, series: '4', repetitions: '8' }] }] },
  } })));
  renderPortalHome();
  await screen.findByRole('link', { name: 'Ver rutina' });
  const routine = within(document.getElementById('rutina')!);
  expect(routine.getByRole('heading', { name: 'Mi rutina' })).toBeInTheDocument();
  expect(routine.getByText('2 días · 4 ejercicios')).toBeInTheDocument();
  expect(routine.getByRole('link', { name: 'Ver rutina' })).toHaveAttribute('href', '/portal/sala/rutina');
  expect(routine.queryByText('Sentadilla')).not.toBeInTheDocument();
  expect(routine.queryByText('Controlar técnica')).not.toBeInTheDocument();
  expect(routine.queryByRole('list')).not.toBeInTheDocument();
});

it('shows the empty state when there is no active routine', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: {
    reservations: [], fixed: [], evaluations: [], replacementWeeks: availableWeeks(), validity: { hasValidAccess: true, validUntil: '2026-11-20' }, routine: null,
  } })));
  renderPortalHome();
  await screen.findByText('No hay una rutina activa.');
  const routine = within(document.getElementById('rutina')!);
  expect(routine.getByRole('heading', { name: 'Mi rutina' })).toBeInTheDocument();
  expect(routine.getByText('No hay una rutina activa.')).toBeInTheDocument();
  expect(routine.queryByRole('list')).not.toBeInTheDocument();
  expect(routine.queryByRole('button')).not.toBeInTheDocument();
  expect(routine.queryByRole('link', { name: 'Ver rutina' })).not.toBeInTheDocument();
});

function fixedHandlers(state: { weekday: string; startTime: string; active: boolean }, onChange?: (body: Record<string, string>) => void, onAvailability?: (url: string) => void): void {
  server.use(
    http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: state.active ? [{ id: 'fixed-1', startDate: '2026-09-07', startTime: state.startTime, serviceType: { id: 'service', name: 'Rehabilitación', durationMinutes: 45 }, scheduleSlot: { id: 'window', weekday: state.weekday } }] : [], routine: null, evaluations: [], replacementWeeks: availableWeeks(), validity: { hasValidAccess: true, validUntil: '2026-11-20' } } })),
    http.get('http://localhost:3000/api/portal/sala/availability', ({ request }) => { onAvailability?.(request.url); return HttpResponse.json({ data: baseBlocks(new URL(request.url).searchParams.get('date') ?? '2026-09-07') }); }),
    http.post('http://localhost:3000/api/portal/sala/fixed-bookings/fixed-1/change', async ({ request }) => { onChange?.(await request.json() as Record<string, string>); return HttpResponse.json({ data: {} }); }),
    http.post('http://localhost:3000/api/portal/sala/fixed-bookings/fixed-1/end', () => { state.active = false; return HttpResponse.json({ data: {} }); }),
  );
}

it('shows fixed bookings as the main Sala section and no persistent editor', async () => {
  renderPortalHome();
  await screen.findByRole('heading', { name: 'Mis turnos fijos' });
  expect(screen.getByText('No tenés turnos fijos.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Agregar turno fijo' })).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Elegí el servicio' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reservar reemplazo' })).toBeInTheDocument();
  for (const id of ['turnos-fijos', 'rutina', 'evaluaciones']) expect(document.getElementById(id)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Volver a Inicio' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
});

it('keeps fixed occurrence statuses and presents service duration and translated weekday', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [{ id: 'fixed-1', startDate: '2026-10-12', startTime: '17:00', serviceType: { id: 'service', name: 'Musculación', durationMinutes: 60 }, scheduleSlot: { id: 'window', weekday: 'MONDAY' } }], fixedOccurrences: [
    ...(['RESERVED', 'PENDING_PAYMENT', 'CANCELLED', 'ATTENDED', 'ABSENT'] as const).map((status, index) => ({ fixedSalaBookingId: 'fixed-1', date: `2026-10-${String(12 + index).padStart(2, '0')}`, startTime: '17:00', status, cancelledForNonPayment: false })),
  ], routine: null, evaluations: [], replacementWeeks: availableWeeks(), validity: { hasValidAccess: true, validUntil: '2026-11-20' } } })));
  renderPortalHome();
  expect(await screen.findByText('Musculación · 60 min')).toBeInTheDocument();
  expect(screen.getByText('Lunes · 17:00–18:00')).toBeInTheDocument();
  for (const status of ['Reservado', 'Pendiente de renovación', 'Cancelado', 'Asistió', 'Ausente']) expect(screen.getByText(status)).toBeInTheDocument();
});

it('offers general Sala by default and never opens a fixed creation editor', async () => {
  const dialog = await openReservation();
  expect(within(dialog).getByRole('button', { name: /Sin servicio — Sala/ })).toHaveAttribute('aria-pressed', 'false');
  // openReservation selects an explicit real service for the service-specific tests.
  expect(screen.queryByRole('button', { name: 'Agregar turno fijo' })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Nuevo turno fijo' })).not.toBeInTheDocument();
});
it('keeps every allowed service available without selecting one automatically', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala/services', () => HttpResponse.json({ data: [{ id: 'muscle', name: 'Musculación', durationMinutes: 60 }, { id: 'functional', name: 'Funcional', durationMinutes: 45 }] })));
  vi.spyOn(portalUi, 'today').mockReturnValue('2026-10-16');
  renderPortalHome();
  fireEvent.click(await screen.findByRole('button', { name: 'Reservar reemplazo' }));
  const dialog = screen.getByRole('dialog');
  expect(await within(dialog).findByRole('button', { name: 'Musculación 60 min' })).toHaveAttribute('aria-pressed', 'false');
  expect(within(dialog).getByRole('button', { name: 'Funcional 45 min' })).toHaveAttribute('aria-pressed', 'false');
  expect(within(dialog).getByRole('button', { name: /Sin servicio — Sala/ })).toHaveAttribute('aria-pressed', 'true');
});
it('requests availability for the selected reservation date', async () => {
  const urls: string[] = [];
  server.use(http.get('http://localhost:3000/api/portal/sala/availability', ({ request }) => { urls.push(request.url); return HttpResponse.json({ data: baseBlocks(new URL(request.url).searchParams.get('date') ?? undefined) }); }));
  const dialog = await openReservation();
  fireEvent.change(within(dialog).getByLabelText('Fecha de la reserva'), { target: { value: '2026-10-17' } });
  await waitFor(() => expect(urls.some(url => url.includes('date=2026-10-17'))).toBe(true));
  expect(urls.every(url => !url.includes('excludeFixedBookingId'))).toBe(true);
});
it('offers exact-hour starts and checks all intermediate capacity blocks', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala/availability', ({ request }) => HttpResponse.json({ data: baseBlocks(new URL(request.url).searchParams.get('date') ?? undefined, time => time !== '09:15') })));
  const dialog = await openReservation('2026-10-16T11:00:00Z');
  expect(await within(dialog).findByRole('button', { name: '09:00–09:45 Sin lugar' })).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: '10:00–10:45 Hay lugar' })).toBeEnabled();
  for (const minute of ['15', '30', '45']) expect(within(dialog).queryByRole('button', { name: new RegExp(`09:${minute}–`) })).not.toBeInTheDocument();
});
it('lists the assigned fixed booking without modification controls or mutation requests', async () => {
  let changed = false;
  fixedHandlers({ weekday: 'MONDAY', startTime: '10:00', active: true }, () => { changed = true; });
  renderPortalHome();
  expect(await screen.findByText('Lunes · 10:00–10:45')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Modificar' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
  expect(changed).toBe(false);
});
it('continues showing the historical fixed service even when it is absent from current choices', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [{ id: 'old-fixed', startDate: '2026-09-07', startTime: '09:00', serviceType: { id: 'old', name: 'Calistenia' }, scheduleSlot: { id: 'window', weekday: 'MONDAY' } }], evaluations: [], replacementWeeks: availableWeeks(), validity: { hasValidAccess: true, validUntil: '2026-11-20' } } })));
  renderPortalHome();
  expect(await screen.findByText('Calistenia')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Modificar' })).not.toBeInTheDocument();
});
it.each(['09:15', '09:30', '09:45'])('preserves historical fixed start %s in the consultation view', async startTime => {
  fixedHandlers({ weekday: 'MONDAY', startTime, active: true });
  renderPortalHome();
  expect(await screen.findByText(new RegExp(`Lunes · ${startTime}`))).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Modificar' })).not.toBeInTheDocument();
});
it('preserves the fixed recurrence and offers no ending action', async () => {
  const state = { weekday: 'MONDAY', startTime: '09:00', active: true };
  fixedHandlers(state);
  renderPortalHome();
  await screen.findByText('Lunes · 09:00–09:45');
  expect(screen.queryByRole('button', { name: 'Finalizar' })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Finalizar turno fijo' })).not.toBeInTheDocument();
  expect(state.active).toBe(true);
});
it('permits general Sala without plan services and omits serviceTypeId from the reservation', async () => {
  let submitted: unknown;
  server.use(http.get('http://localhost:3000/api/portal/sala/services', () => HttpResponse.json({ data: [] })), http.post('http://localhost:3000/api/portal/sala/reservations', async ({ request }) => { submitted = await request.json(); return HttpResponse.json({ data: {} }); }));
  vi.spyOn(portalUi, 'today').mockReturnValue('2026-10-16');
  vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-16T11:00:00Z').getTime());
  renderPortalHome();
  fireEvent.click(await screen.findByRole('button', { name: 'Reservar reemplazo' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('button', { name: /Sin servicio — Sala/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(await within(dialog).findByRole('button', { name: '09:00–10:00 Hay lugar' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar reserva' }));
  await within(dialog).findByRole('heading', { name: 'Reserva confirmada' });
  expect(submitted).toEqual({ date: '2026-10-16', scheduleSlotId: 'window', startTime: '09:00' });
  expect(within(dialog).getByText('Sala')).toBeInTheDocument();
});

it('keeps a generic fetch error when the response is not structured', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala/services', () => HttpResponse.text('Unavailable', { status: 503 })));
  await expect(portalFetch('sala/services')).rejects.toThrow('No pudimos cargar esta información.');
});

it.each(['2026-10-05', '2026-10-15', '2026-10-16', '2026-10-25'])('prevents a new reservation without validity on %s', async date => {
  vi.spyOn(portalUi, 'today').mockReturnValue(date);
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [], routine: null, evaluations: [], replacementWeeks: availableWeeks(), validity: { hasValidAccess: false, validUntil: null } } })));
  renderPortalHome();
  expect(await screen.findByText('Sin vigencia')).toBeInTheDocument();
  expect(screen.getByText('Necesitás renovar tu vigencia para realizar nuevas reservas.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reservar reemplazo' })).toBeDisabled();
});
it('shows registered payment without pending guidance', async () => {
  vi.spyOn(portalUi, 'today').mockReturnValue('2026-10-16');
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [], routine: null, evaluations: [], replacementWeeks: availableWeeks(), validity: { hasValidAccess: true, validUntil: '2026-11-20' } } })));
  renderPortalHome();
  expect(await screen.findByText('Vigente hasta 20/11/2026')).toBeInTheDocument();
  expect(screen.queryByText('Sin vigencia')).not.toBeInTheDocument();
  expect(screen.queryByText('Necesitás renovar tu vigencia para realizar nuevas reservas.')).not.toBeInTheDocument();
});

async function openReservation(now = '2026-10-16T12:49:00Z'): Promise<HTMLElement> {
  vi.spyOn(portalUi, 'today').mockReturnValue('2026-10-16');
  vi.spyOn(Date, 'now').mockReturnValue(new Date(now).getTime());
  renderPortalHome();
  const open = await screen.findByRole('button', { name: 'Reservar reemplazo' });
  await waitFor(() => expect(open).toBeEnabled());
  fireEvent.click(open);
  const dialog = await screen.findByRole('dialog', { name: 'Reserva de reemplazo' });
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Rehabilitación 45 min' }));
  return dialog;
}
it('restores reservation steps, date bounds and ongoing/future starts using the service duration', async () => {
  const dialog = await openReservation('2026-10-16T13:25:00Z');
  expect(within(dialog).getByLabelText('Fecha de la reserva')).toHaveAttribute('min', '2026-10-16');
  expect(within(dialog).getByLabelText('Fecha de la reserva')).toHaveAttribute('max', '2026-11-15');
  await within(dialog).findByRole('button', { name: '10:00–10:45 Hay lugar' });
  expect(within(dialog).queryByRole('button', { name: '09:00–09:45 Hay lugar' })).not.toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: '10:00–10:45 Hay lugar' })).toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: /09:45–/ })).not.toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('Fecha de la reserva'), { target: { value: '2026-10-17' } });
  expect(await within(dialog).findByRole('button', { name: '09:00–09:45 Hay lugar' })).toBeInTheDocument();
});
it('confirms an ongoing reservation with its selected details and returns to the refreshed Home', async () => {
  let submitted: Record<string, string> | undefined;
  let reservationCreated = false;
  server.use(
    http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: reservationCreated ? [{ id: 'created', date: '2026-10-16', startTime: '10:00', serviceType: { name: 'Rehabilitación' } }] : [], fixed: [], routine: null, evaluations: [], replacementWeeks: reservationCreated ? [] : availableWeeks(), validity: { hasValidAccess: true, validUntil: '2026-11-20' } } })),
    http.post('http://localhost:3000/api/portal/sala/reservations', async ({ request }) => { submitted = await request.json() as Record<string, string>; reservationCreated = true; return HttpResponse.json({ data: {} }); }),
  );
  const dialog = await openReservation();
  fireEvent.click(await within(dialog).findByRole('button', { name: '10:00–10:45 Hay lugar' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar reserva' }));
  expect(await within(dialog).findByRole('heading', { name: 'Reserva confirmada' })).toBeInTheDocument();
  expect(within(dialog).getByText('Tu lugar quedó reservado.')).toBeInTheDocument();
  expect(within(dialog).getByText('Rehabilitación')).toBeInTheDocument();
  expect(within(dialog).getByText(/viernes 16\/10/i)).toBeInTheDocument();
  expect(within(dialog).getByText('10:00 – 10:45')).toBeInTheDocument();
  expect(submitted).toEqual({ date: '2026-10-16', scheduleSlotId: 'window', serviceTypeId: 'service', startTime: '10:00' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Volver a Inicio' }));
  expect(screen.queryByRole('dialog', { name: 'Reserva de reemplazo' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reservar reemplazo' })).not.toBeInTheDocument();
  expect(await screen.findByText('Rehabilitación · Reservado')).toBeInTheDocument();
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
    const dialog = await openReservation('2026-10-16T13:25:00Z');
    const option = await within(dialog).findByRole('button', { name: '10:00–10:45 Hay lugar' });
    fireEvent.click(option);
    const confirm = within(dialog).getByRole('button', { name: 'Confirmar reserva' });
    expect(confirm).toBeEnabled();
    const requestsBeforeTick = availabilityRequests;
    vi.mocked(Date.now).mockReturnValue(new Date('2026-10-16T13:25:00.001Z').getTime());
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole('dialog', { name: 'Reserva de reemplazo' })).toBe(dialog);
    expect(within(dialog).getByLabelText('Fecha de la reserva')).toHaveValue('2026-10-16');
    expect(within(dialog).queryByRole('button', { name: '10:00–10:45 Hay lugar' })).not.toBeInTheDocument();
    expect(confirm).toBeDisabled();
    expect(availabilityRequests).toBe(requestsBeforeTick);
    expect(within(dialog).getByRole('button', { name: '11:00–11:45 Hay lugar' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /09:45–/ })).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Volver' }));
    expect(vi.getTimerCount()).toBe(0);
    vi.mocked(Date.now).mockReturnValue(new Date('2026-10-16T13:25:00.001Z').getTime());
    fireEvent.click(screen.getByRole('button', { name: 'Reservar reemplazo' }));
    const reopened = screen.getByRole('dialog', { name: 'Reserva de reemplazo' });
    fireEvent.click(within(reopened).getByRole('button', { name: 'Rehabilitación 45 min' }));
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
  ['PORTAL_SALA_TIME_PASSED', 'Ese horario ya no admite nuevas reservas. Elegí otro horario.'],
  ['PORTAL_SALA_VALIDITY_REQUIRED', 'Tu cuota no está vigente para esta fecha. Consultá en recepción para renovarla.'],
])('shows the reservation rejection %s', async (code, message) => {
  server.use(http.post('http://localhost:3000/api/portal/sala/reservations', () => HttpResponse.json({ code, message: 'Rechazado' }, { status: 400 })));
  const dialog = await openReservation();
  fireEvent.click(await within(dialog).findByRole('button', { name: '10:00–10:45 Hay lugar' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar reserva' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
});
it('shows only the earliest active reservation even when future reservations arrive unordered', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: {
    reservations: [
      { id: 'cancelled', date: '2026-10-21', startTime: '09:00', cancelledAt: '2026-10-16T12:00:00Z' },
      { id: 'later', date: '2026-10-22', startTime: '18:00' },
      { id: 'same-day-later', date: '2026-10-20', startTime: '18:00' },
      { id: 'next', date: '2026-10-20', startTime: '17:00', serviceType: { name: 'Calistenia' } },
    ], fixed: [], evaluations: [], replacementWeeks: availableWeeks(), validity: { hasValidAccess: true, validUntil: '2026-11-20' },
  } })));
  renderPortalHome();
  const section = within((await screen.findByRole('heading', { name: 'Próxima reserva' })).closest('section')!);
  expect(section.getByText('20/10/2026 · 17:00')).toBeVisible();
  expect(section.getByText('Calistenia · Reservado')).toBeVisible();
  expect(section.queryByText(/21\/10\/2026|22\/10\/2026|18:00|Cancelado/)).not.toBeInTheDocument();
  expect(section.getAllByRole('button', { name: 'Cancelar' })).toHaveLength(1);
  expect(section.getByRole('link', { name: 'Ver mis reservas' })).toHaveAttribute('href', '/portal/sala/reservas');
});

it.each([false, true])('shows no upcoming reservations when only cancelled records remain (cancelled=%s)', async cancelled => {
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: {
    reservations: cancelled ? [{ id: 'cancelled', date: '2026-10-20', startTime: '09:30', cancelledAt: '2026-10-16T12:00:00Z' }] : [],
    fixed: [], evaluations: [], replacementWeeks: availableWeeks(), validity: { hasValidAccess: true, validUntil: '2026-11-20' },
  } })));
  renderPortalHome();
  const section = within((await screen.findByRole('heading', { name: 'Próxima reserva' })).closest('section')!);
  expect(section.getByText('No tenés próximas reservas.')).toBeVisible();
  expect(section.queryByText(/20\/10\/2026|Cancelado/)).not.toBeInTheDocument();
  expect(section.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  expect(section.getByRole('link', { name: 'Ver mis reservas' })).toHaveAttribute('href', '/portal/sala/reservas');
});

it.each([false, true])('refreshes the next reservation after cancellation with CSRF (has next=%s)', async hasNext => {
  let cancelled = false;
  let submitted: { method: string; csrf: string | null; body: string } | undefined;
  server.use(
    http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: {
      reservations: [
        { id: 'first', date: '2026-10-20', startTime: '17:00', cancelledAt: cancelled ? '2026-10-19T12:00:00Z' : null },
        ...(hasNext ? [{ id: 'second', date: '2026-10-21', startTime: '09:00' }] : []),
      ], fixed: [], evaluations: [], replacementWeeks: availableWeeks(), validity: { hasValidAccess: true, validUntil: '2026-11-20' },
    } })),
    http.post('http://localhost:3000/api/portal/sala/reservations/first/cancel', async ({ request }) => {
      submitted = { method: request.method, csrf: request.headers.get('x-csrf-token'), body: await request.text() };
      cancelled = true;
      return HttpResponse.json({ data: {} });
    }),
  );
  renderPortalHome();
  const section = within((await screen.findByRole('heading', { name: 'Próxima reserva' })).closest('section')!);
  expect(section.getByText('20/10/2026 · 17:00')).toBeVisible();
  fireEvent.click(section.getByRole('button', { name: 'Cancelar' }));
  expect(await section.findByText(hasNext ? '21/10/2026 · 09:00' : 'No tenés próximas reservas.')).toBeVisible();
  expect(submitted).toEqual({ method: 'POST', csrf: 'csrf', body: '' });
  expect(section.queryByText(/20\/10\/2026|Cancelado/)).not.toBeInTheDocument();
});

it('groups physical results by test chronologically, preserving repeated results and hiding internal observation', async () => {
  const strength = { id: 'strength', name: 'Test Fuerza' }; const mobility = { id: 'mobility', name: 'Movilidad' };
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [], routine: null, replacementWeeks: availableWeeks(), validity: { hasValidAccess: true, validUntil: '2026-11-20' }, evaluations: [
    { id: 'oct', evaluationDate: '2026-10-01', observation: 'Nota interna del Profesor', professor: { firstName: 'Secreto' }, results: [{ testDefinition: strength, resultText: '90 kg' }] },
    { id: 'aug', evaluationDate: '2026-08-01', results: [{ testDefinition: strength, resultText: '80 kg' }, { testDefinition: strength, resultText: '81 kg' }] },
    { id: 'sep', evaluationDate: '2026-09-01', results: [{ testDefinition: strength, resultText: '85 kg' }] },
    { id: 'mob', evaluationDate: '2026-08-15', results: [{ testDefinition: mobility, resultText: '35°' }] },
  ] } })));
  renderPortalHome(); await screen.findByRole('heading', { name: 'Test Fuerza' });
  const section = document.getElementById('evaluaciones')!;
  const strengthGroup = screen.getByRole('heading', { name: 'Test Fuerza' }).closest('article')!;
  expect(within(strengthGroup).getAllByRole('listitem').map(item => item.textContent)).toEqual(['01/08/2026 · 80 kg', '01/08/2026 · 81 kg', '01/09/2026 · 85 kg', '01/10/2026 · 90 kg']);
  expect(within(screen.getByRole('heading', { name: 'Movilidad' }).closest('article')!).getByText('15/08/2026 · 35°')).toBeInTheDocument();
  expect(section.querySelector('canvas, svg')).toBeNull(); expect(section.textContent).not.toMatch(/Nota interna|Secreto|%|mejora|tendencia/i);
});

it.each(['RESERVED', 'PENDING_PAYMENT', 'CANCELLED', 'ATTENDED', 'ABSENT'])('offers date cancellation only for eligible %s occurrences', async status => {
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [], evaluations: [], replacementWeeks: availableWeeks(), validity: { hasValidAccess: true, validUntil: '2026-11-20' }, fixedOccurrences: [{ fixedSalaBookingId: 'fixed-1', date: '2026-10-20', startTime: '17:00', status, cancelledForNonPayment: false }] } })));
  renderPortalHome();
  await screen.findByRole('heading', { name: 'Próximos turnos fijos' });
  const button = screen.queryByRole('button', { name: 'Cancelar esta fecha' });
  if (status === 'RESERVED' || status === 'PENDING_PAYMENT') expect(button).toBeInTheDocument();
  else expect(button).not.toBeInTheDocument();
  expect(screen.getByText(({ RESERVED: 'Reservado', PENDING_PAYMENT: 'Pendiente de renovación', CANCELLED: 'Cancelado', ATTENDED: 'Asistió', ABSENT: 'Ausente' })[status]!)).toBeInTheDocument();
});

it.each([false, true])('confirms one date with CSRF and preserves the recurrence (error=%s)', async fail => {
  vi.spyOn(portalUi, 'today').mockReturnValue('2026-10-16');
  let cancelled = false;
  let submitted: { method: string; csrf: string | null; body: string } | undefined;
  server.use(
    http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [{ id: 'fixed-1', startDate: '2026-10-13', startTime: '17:00', serviceType: { id: 'service', name: 'Rehabilitación', durationMinutes: 45 }, scheduleSlot: { id: 'window', weekday: 'TUESDAY' } }], fixedOccurrences: [{ fixedSalaBookingId: 'fixed-1', date: '2026-10-20', startTime: '17:00', status: cancelled ? 'CANCELLED' : 'RESERVED', cancelledForNonPayment: false }], evaluations: [], replacementWeeks: cancelled ? [{ weekStart: '2026-10-19', weekEnd: '2026-10-25', available: 1 }] : [], validity: { hasValidAccess: true, validUntil: '2026-11-20' } } })),
    http.post('http://localhost:3000/api/portal/sala/fixed-bookings/fixed-1/occurrences/2026-10-20/cancel', async ({ request }) => {
      submitted = { method: request.method, csrf: request.headers.get('x-csrf-token'), body: await request.text() };
      if (fail) return HttpResponse.json({ code: 'PORTAL_FIXED_OCCURRENCE_STARTED', message: 'El turno ya comenzó.' }, { status: 409 });
      cancelled = true;
      return HttpResponse.json({ data: { id: 'occurrence-1', fixedSalaBookingId: 'fixed-1', date: '2026-10-20', status: 'CANCELLED' } });
    }),
  );
  renderPortalHome();
  fireEvent.click(await screen.findByRole('button', { name: 'Cancelar esta fecha' }));
  const dialog = screen.getByRole('dialog', { name: 'Cancelar esta fecha' });
  expect(within(dialog).getByText('Se cancelará únicamente el turno del 20/10/2026 a las 17:00.')).toBeInTheDocument();
  expect(within(dialog).getByText('Tu turno fijo continuará las semanas siguientes.')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Volver' })).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar esta fecha' }));
  await waitFor(() => expect(submitted).toEqual({ method: 'POST', csrf: 'csrf', body: '' }));
  if (fail) {
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('El turno ya comenzó.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('Fecha cancelada.')).not.toBeInTheDocument();
    expect(screen.getByText('Reservado')).toBeInTheDocument();
  } else {
    expect(await screen.findByText('Fecha cancelada. Ahora podés reservar un reemplazo para esta semana.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reservar reemplazo' })).toBeEnabled();
    await screen.findByText('Cancelado');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar esta fecha' })).not.toBeInTheDocument();
  }
  expect(screen.getByText('Martes · 17:00–17:45')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Modificar' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Finalizar' })).not.toBeInTheDocument();
});

it.each([['2026-10-20', '2026-10-20'], ['2026-12-20', '2026-11-15']])('caps reservation dates at coverage %s and the general 30-day window', async (validUntil, expectedMax) => {
  vi.spyOn(portalUi, 'today').mockReturnValue('2026-10-16');
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [], routine: null, evaluations: [], replacementWeeks: availableWeeks(), validity: { hasValidAccess: true, validUntil } } })));
  renderPortalHome();
  const open = await screen.findByRole('button', { name: 'Reservar reemplazo' });
  await waitFor(() => expect(open).toBeEnabled()); fireEvent.click(open);
  expect(await screen.findByLabelText('Fecha de la reserva')).toHaveAttribute('max', expectedMax);
});

it('shows the only Home while loading Sala without a link back to itself', async () => {
  renderPortalHome();
  expect(screen.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
  expect(screen.getByText('Cargando Sala…')).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Volver a Inicio' })).not.toBeInTheDocument();
  await screen.findByRole('heading', { name: 'Próxima reserva' });
  expect(screen.queryByRole('heading', { name: 'Tu Sala' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Athleta · Inicio' })).toHaveAttribute('href', '/portal');
  expect(screen.queryAllByRole('link').some(link => link.getAttribute('href')?.startsWith('/portal/sala#'))).toBe(false);
});

it('does not request or show clinical appointments on Portal home', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-08T15:00:00Z').getTime());
  let reads = 0;
  server.use(http.get('http://localhost:3000/api/portal/clinic/appointments', () => { reads++; return HttpResponse.json({ data: [] }); }));
  renderPortalHome();
  expect(await screen.findByRole('heading', { name: 'Mis turnos fijos' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Clínica' })).not.toBeInTheDocument();
  expect(reads).toBe(0);
});

it('keeps Inicio and Mis datos usable when Sala is unavailable without querying Clínica', async () => {
  let reads = 0;
  server.use(
    http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ code: 'PORTAL_SALA_UNAVAILABLE', message: 'Unavailable' }, { status: 403 })),
    http.get('http://localhost:3000/api/portal/clinic/appointments', () => { reads++; return HttpResponse.json({ data: [] }); }),
  );
  renderPortalHome();
  await waitFor(() => expect(screen.queryByText('Cargando Sala…')).not.toBeInTheDocument());
  expect(screen.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
  for (const nav of screen.getAllByRole('navigation', { name: 'Navegación del Portal' })) expect(within(nav).getByRole('link', { name: 'Mis datos' })).toHaveAttribute('href', '/portal/profile');
  expect(screen.queryByRole('button', { name: 'Reservar reemplazo' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Mis turnos fijos' })).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(reads).toBe(0);
});

it('keeps the Home and profile navigation available on a Sala fetch error', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ code: 'FAIL', message: 'Internal detail' }, { status: 500 })));
  renderPortalHome();
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar Sala.');
  expect(screen.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Volver a Inicio' })).not.toBeInTheDocument();
  expect(screen.queryByText('Internal detail')).not.toBeInTheDocument();
});

it('keeps Sala available without requesting the clinical query', async () => {
  let reads = 0;
  server.use(http.get('http://localhost:3000/api/portal/clinic/appointments', () => { reads++; return HttpResponse.json({ code: 'FAIL', message: 'Internal detail' }, { status: 500 }); }));
  renderPortalHome();
  expect(await screen.findByRole('heading', { name: 'Próxima reserva' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Clínica' })).not.toBeInTheDocument();
  expect(screen.queryByText('Internal detail')).not.toBeInTheDocument();
  expect(reads).toBe(0);
});

it.each(['/portal', '/portal/sala/rutina', '/portal/sala/reservas', '/portal/sala/reservar', '/portal/clinic', '/portal/clinic/turnos', '/portal/change-pin', '/portal/profile', '/portal/declaracion-salud'])('keeps Portal navigation with one active link on %s', pathname => {
  navigation.pathname = pathname;
  render(<portalUi.PortalNav />);
  const nav = within(screen.getByRole('navigation', { name: 'Navegación del Portal' }));
  expect(nav.getAllByRole('link').map(link => link.textContent)).toEqual(['Inicio', 'Mis datos', 'Declaración de salud']);
  expect(nav.queryByRole('link', { name: 'Sala' })).not.toBeInTheDocument();
  expect(nav.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/portal');
  const activeLabel = pathname === '/portal/profile' ? 'Mis datos' : pathname === '/portal/declaracion-salud' ? 'Declaración de salud' : 'Inicio';
  expect(nav.getByRole('link', { name: activeLabel })).toHaveAttribute('aria-current', 'page');
  expect(nav.getAllByRole('link').filter(link => link.getAttribute('aria-current') === 'page')).toHaveLength(1);
  expect(nav.getByRole('link', { name: 'Declaración de salud' })).toHaveAttribute('href', '/portal/declaracion-salud');
});

it('does not offer free reservations when there is no replacement week', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [], evaluations: [], replacementWeeks: [], validity: { hasValidAccess: true, validUntil: '2026-11-20' } } })));
  renderPortalHome();
  expect(await screen.findByText('Para reservar otro horario, primero cancelá una fecha de uno de tus turnos fijos.')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Reservar/ })).not.toBeInTheDocument();
});
it('starts in the credited week and rejects dates in another week without querying availability', async () => {
  vi.spyOn(portalUi, 'today').mockReturnValue('2026-10-16');
  let availabilityCalls = 0;
  server.use(
    http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [], evaluations: [], replacementWeeks: [{ weekStart: '2026-10-19', weekEnd: '2026-10-25', available: 1 }], validity: { hasValidAccess: true, validUntil: '2026-11-20' } } })),
    http.get('http://localhost:3000/api/portal/sala/availability', ({ request }) => { availabilityCalls++; return HttpResponse.json({ data: baseBlocks(new URL(request.url).searchParams.get('date')!) }); }),
  );
  renderPortalHome(); fireEvent.click(await screen.findByRole('button', { name: 'Reservar reemplazo' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Reserva de reemplazo' }));
  expect(dialog.getByLabelText('Fecha de la reserva')).toHaveValue('2026-10-19');
  await dialog.findByRole('button', { name: '09:00–10:00 Hay lugar' });
  const calls = availabilityCalls;
  fireEvent.change(dialog.getByLabelText('Fecha de la reserva'), { target: { value: '2026-10-26' } });
  expect(dialog.getByText('Elegí una fecha dentro de la semana habilitada por tu cancelación.')).toBeVisible();
  expect(dialog.getByRole('button', { name: 'Confirmar reserva' })).toBeDisabled();
  expect(availabilityCalls).toBe(calls);
});
