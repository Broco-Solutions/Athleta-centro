import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { delay, HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { vi } from 'vitest';
import ReservationsPage from './page';

const navigation = vi.hoisted(() => ({ search: '', router: { replace: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation.router, useSearchParams: () => new URLSearchParams(navigation.search) }));

const server = setupServer();
const nativeFetch = globalThis.fetch;
const person = { id: 'student-1', firstName: 'Ana', lastName: 'Sintética', dni: '88000001' };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const session = { user: { id: 'professor', firstName: 'Profesor', lastName: 'Sintético' }, roles: ['PROFESSOR'], permissions: ['PEOPLE_READ', 'PEOPLE_CREATE', 'SALA_RELATION_READ', 'SALA_AGENDA_MANAGE', 'SALA_PARTICIPATION_MANAGE'], csrfToken: 'csrf', mustChangePassword: false };
let agendaReads = 0;
let peopleReads = 0;
let peopleSearches: URL[] = [];
let timelineReads = 0;
beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T11:00:00Z'));
  navigation.search = '';
  agendaReads = peopleReads = timelineReads = 0;
  peopleSearches = [];
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: session })),
    http.get('http://localhost:3000/api/reservations', () => { timelineReads++; return HttpResponse.json({ data: { date: today(), startTime: '09:00', endTime: '10:00', rows: [] } }); }),
    http.get('http://localhost:3000/api/sala/agenda', () => { agendaReads++; return HttpResponse.json({ data: [{ slot: { id: 'window:09:00', scheduleSlotId: 'window', startTime: '09:00', durationMinutes: 15 }, capacity: 10, reserved: 0, available: 10, isOverbooked: false, isClosed: false, people: [] }] }); }),
    http.get('http://localhost:3000/api/people', ({ request }) => { peopleReads++; peopleSearches.push(new URL(request.url)); return HttpResponse.json({ data: [person], meta: { totalPages: 1 } }); }),
    http.get('http://localhost:3000/api/sala/people/student-1/spontaneous-options', () => HttpResponse.json({ data: { eligible: true, participationId: 'participation', plan: { id: 'plan', name: 'Base' }, services: [{ id: 'service', name: 'Musculación', durationMinutes: 15 }] } })),
  );
});
afterEach(() => { server.resetHandlers(); vi.useRealTimers(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(<QueryClientProvider client={client}><ReservationsPage /></QueryClientProvider>);
  return { client, invalidate };
}
it('reuses spontaneous incorporation for an existing person and refreshes operational queries after saving', async () => {
  let submitted: unknown;
  server.use(http.post('http://localhost:3000/api/sala/occurrences/spontaneous', async ({ request }) => { submitted = await request.json(); return HttpResponse.json({ data: {} }, { status: 201 }); }));
  server.use(http.get('http://localhost:3000/api/people', ({ request }) => { peopleReads++; peopleSearches.push(new URL(request.url)); return HttpResponse.json({ data: [{ ...person, firstName: 'Homer', lastName: 'Simpson' }] }); }));
  const { invalidate } = renderPage();
  expect(await screen.findByRole('link', { name: 'Reservas' })).toHaveAttribute('aria-current', 'page');
  expect(await screen.findByRole('heading', { name: 'Reservas' })).toBeVisible();
  await screen.findByRole('button', { name: 'Incorporación espontánea' });
  expect(agendaReads).toBe(0); expect(peopleReads).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Incorporación espontánea' }));
  await screen.findByRole('dialog', { name: 'Incorporación espontánea' });
  expect(screen.getByRole('button', { name: 'Nueva Persona' })).toBeVisible();
  expect(peopleReads).toBe(0);
  expect(screen.queryByText('Seleccionar Persona')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Buscar Persona'), { target: { value: 'Simpson' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Homer Simpson · DNI 88000001' }));
  expect(peopleReads).toBe(1);
  expect(Object.fromEntries(peopleSearches[0]!.searchParams)).toEqual({ search: 'Simpson', page: '1', pageSize: '10' });
  await screen.findByRole('option', { name: 'Musculación · 15 min' });
  fireEvent.change(screen.getByLabelText('Servicio'), { target: { value: 'service' } });
  fireEvent.change(screen.getByLabelText('Horario espontáneo'), { target: { value: 'window:09:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Incorporar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(submitted).toMatchObject({ personId: person.id, date: today(), serviceTypeId: 'service', startTime: '09:00', scheduleSlotId: 'window' });
  for (const queryKey of [['reservations', today()], ['sala', 'agenda', today()], ['sala-dashboard']]) expect(invalidate).toHaveBeenCalledWith({ queryKey });
  expect(timelineReads).toBeGreaterThan(1);
});
it.each(['ADMINISTRATIVE', 'GENERAL_ADMIN'])('redirects %s from transversal reservations into Sala', async (role) => {
  navigation.router.replace.mockClear();
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: [role] } })));
  renderPage();
  await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith('/sala'));
  expect(timelineReads).toBe(0);
});
it('does not add the Professor-specific action to combined roles', async () => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: ['PROFESSOR', 'KINESIOLOGIST'] } })));
  renderPage(); await screen.findByText('Agenda transversal');
  expect(screen.queryByRole('button', { name: 'Incorporación espontánea' })).not.toBeInTheDocument();
});

it('lets a pure Professor open the existing new Person form in spontaneous incorporation today', async () => {
  server.use(
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/clinic/social-works', () => HttpResponse.json({ data: [] })),
  );
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Incorporación espontánea' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Nueva Persona' }));
  expect(screen.getByLabelText('Nombre')).toBeVisible();
  expect(screen.getByLabelText('Plan')).toBeVisible();
  expect(screen.getByLabelText('Profesor principal')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Persona existente' })).toBeVisible();
});
it('keeps new Person unavailable without PEOPLE_CREATE', async () => {
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: session.permissions.filter(permission => permission !== 'PEOPLE_CREATE') } })));
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Incorporación espontánea' }));
  await screen.findByRole('dialog', { name: 'Incorporación espontánea' });
  expect(screen.queryByRole('button', { name: 'Nueva Persona' })).not.toBeInTheDocument();
});

const booking = { id: 'booking', source: 'SALA', person, startTime: '09:00', durationMinutes: 60, serviceName: 'Musculación', status: 'RESERVED', origin: 'FIXED', scheduleSlotId: 'window', sourceId: 'fixed-booking' };
function mockBookings(bookings = [booking]): void {
  server.use(http.get('http://localhost:3000/api/reservations', ({ request }) => {
    timelineReads++;
    return HttpResponse.json({ data: { date: new URL(request.url).searchParams.get('date'), startTime: '09:00', endTime: '10:00', rows: [{ kind: 'SALA', bookings }] } });
  }));
}
function deepLink(date = today()): void {
  navigation.search = new URLSearchParams({ date, personId: person.id, startTime: '09:00', origin: 'FIXED' }).toString();
}
it('opens the exact Sala booking from Home and attends it through the existing operation once', async () => {
  deepLink();
  // The same person/time in another source or origin must not be selected.
  mockBookings([{ ...booking, id: 'clinic', source: 'CLINIC', origin: 'APPOINTMENT' }, { ...booking, id: 'one-off', origin: 'ONE_OFF' }, booking]);
  let submitted: unknown;
  let csrf: string | null = null;
  server.use(http.post('http://localhost:3000/api/sala/occurrences/attend', async ({ request }) => {
    submitted = await request.json(); csrf = request.headers.get('x-csrf-token');
    return HttpResponse.json({ data: {} });
  }));
  const { invalidate } = renderPage();
  const dialog = await screen.findByRole('dialog', { name: 'Ana Sintética' });
  expect(screen.getByLabelText('Fecha de reservas')).toHaveValue(today());
  expect(within(dialog).getByText('Detalle del turno')).toBeVisible();
  for (const name of ['Asistió', 'Ausente', 'Cancelar']) expect(within(dialog).getByRole('button', { name })).toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Asistió' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(submitted).toEqual({ personId: 'student-1', scheduleSlotId: 'window', date: today(), startTime: '09:00', sourceId: 'fixed-booking' });
  expect(csrf).toBe('csrf');
  for (const queryKey of [['reservations', today()], ['sala', 'agenda', today()], ['sala-dashboard'], ['sala', 'students']]) expect(invalidate).toHaveBeenCalledWith({ queryKey });
  expect(timelineReads).toBeGreaterThan(1);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('does not reopen a closed initial selection after refetch', async () => {
  deepLink(); mockBookings();
  const { client } = renderPage();
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
  await act(async () => { await client.invalidateQueries({ queryKey: ['reservations', today()] }); });
  expect(timelineReads).toBeGreaterThan(1);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it.each(['ATTENDED', 'ABSENT', 'CANCELLED', 'PENDING_PAYMENT'])('preserves existing detail rules for %s opened from Home', async (status) => {
  deepLink(); mockBookings([{ ...booking, status }]); renderPage();
  const dialog = await screen.findByRole('dialog');
  if (status === 'PENDING_PAYMENT') {
    expect(within(dialog).getByText('El lugar está reservado, pero la fecha no está cubierta por la vigencia actual. La vigencia debe renovarse antes del inicio.')).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: 'Corregir estado' })).not.toBeInTheDocument();
  } else expect(within(dialog).getByRole('button', { name: 'Corregir estado' })).toBeVisible();
  for (const name of ['Asistió', 'Ausente', 'Cancelar']) expect(within(dialog).queryByRole('button', { name })).not.toBeInTheDocument();
});
it.each([
  'personId=student-1&startTime=invalid&origin=FIXED',
  'date=invalid&personId=student-1&startTime=9:00&origin=FIXED',
  'date=2026-10-16&personId=&startTime=09:00&origin=FIXED',
  'date=2026-10-16&personId=student-1&startTime=09:00&origin=OTHER',
  'date=2026-10-16&personId=student-1&origin=FIXED',
  'date=2026-10-16&personId=missing&startTime=09:00&origin=FIXED',
])('opens normally with incomplete, invalid or unmatched selection: %s', async (search) => {
  navigation.search = search; mockBookings(); renderPage();
  await screen.findByTestId('sala-reservations-agenda');
  expect(screen.getByLabelText('Fecha de reservas')).toHaveValue(!new URLSearchParams(search).get('date') || search.includes('date=invalid') ? today() : '2026-10-16');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('does not choose an ambiguous Sala booking', async () => {
  deepLink(); mockBookings([booking, { ...booking, id: 'duplicate', sourceId: 'other-fixed-booking' }]); renderPage();
  await screen.findByTestId('sala-reservations-agenda');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('shares five centered date buttons and localizes loading to Agenda when changing date', async () => {
  navigation.search = 'date=2026-10-16';
  const requested: string[] = [];
  server.use(http.get('http://localhost:3000/api/reservations', async ({ request }) => {
    const date = new URL(request.url).searchParams.get('date')!;
    requested.push(date);
    if (date === '2026-10-17') await delay(200);
    return HttpResponse.json({ data: { date, startTime: '09:00', endTime: '10:00', rows: [{ kind: 'SALA', bookings: [booking] }] } });
  }));
  renderPage(); await screen.findByTestId('sala-reservations-agenda');
  const heading = screen.getByRole('heading', { name: 'Reservas' });
  const days = screen.getByRole('group', { name: 'Días de reservas' });
  for (const label of ['miércoles, 14 de octubre', 'jueves, 15 de octubre', 'viernes, 16 de octubre', 'sábado, 17 de octubre', 'domingo, 18 de octubre']) expect(within(days).getByRole('button', { name: label })).toBeVisible();
  expect(within(days).getByRole('button', { name: 'viernes, 16 de octubre' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(within(days).getByRole('button', { name: 'sábado, 17 de octubre' }));
  expect(within(days).getByRole('button', { name: 'sábado, 17 de octubre' })).toHaveAttribute('aria-pressed', 'true');
  const loading = await screen.findByText('Cargando reservas…');
  expect(loading.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('heading', { name: 'Reservas' })).toBe(heading);
  expect(screen.getByRole('button', { name: 'Incorporación espontánea' })).toBeVisible();
  expect(days).toBeVisible();
  expect(screen.queryByText('Cargando…', { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Ana Sintética 09:00/ })).not.toBeInTheDocument();
  await screen.findByTestId('sala-reservations-agenda');
  expect(requested).toEqual(['2026-10-16', '2026-10-17']);
});
it('keeps previous/next, manual date and Argentina Today, closing detail on date change', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-17T02:30:00Z'));
  deepLink('2026-10-16'); mockBookings(); renderPage();
  await screen.findByRole('dialog');
  const input = screen.getByLabelText('Fecha de reservas');
  fireEvent.click(screen.getByRole('button', { name: 'Día anterior' }));
  expect(input).toHaveValue('2026-10-15');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await screen.findByTestId('sala-reservations-agenda');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Día siguiente' }));
  expect(input).toHaveValue('2026-10-16');
  await screen.findByTestId('sala-reservations-agenda');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: '2026-11-01' } });
  expect(input).toHaveValue('2026-11-01');
  await screen.findByTestId('sala-reservations-agenda');
  fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
  expect(input).toHaveValue('2026-10-16');
});

it('opens a ONE_OFF booking and matches the five-minute time representation', async () => {
  navigation.search = new URLSearchParams({ date: today(), personId: person.id, startTime: '09:00', origin: 'ONE_OFF' }).toString();
  mockBookings([{ ...booking, origin: 'ONE_OFF', startTime: '09:00:00' }]); renderPage();
  expect(within(await screen.findByRole('dialog')).getByText('Reserva puntual')).toBeVisible();
});
it.each(['2026-10-15', '2026-10-17'])('keeps new Person unavailable in spontaneous incorporation for %s', async (date) => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-16T15:00:00Z'));
  navigation.search = `date=${date}`; renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Incorporación espontánea' }));
  const dialog = await screen.findByRole('dialog', { name: 'Incorporación espontánea' });
  expect(within(dialog).queryByRole('button', { name: 'Nueva Persona' })).not.toBeInTheDocument();
  if (date === '2026-10-17') expect(within(dialog).getByText('La incorporación espontánea no se utiliza para fechas futuras. Para una fecha futura usá una Reserva puntual o un Turno fijo.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('shows the month of the selected day across month boundaries', async () => {
  navigation.search = 'date=2026-10-16'; mockBookings(); renderPage();
  expect(await screen.findByText('Octubre 2026')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Fecha de reservas'), { target: { value: '2026-11-01' } });
  expect(await screen.findByText('Noviembre 2026')).toBeVisible();
  expect(screen.queryByText('Octubre 2026')).not.toBeInTheDocument();
});
it('places current and previous bookings in separate accessible sections with counts', async () => {
  vi.setSystemTime(new Date('2026-10-16T15:28:00Z'));
  mockBookings([{ ...booking, startTime: '09:00', durationMinutes: 45 }, { ...booking, id: 'upcoming', startTime: '12:30', person: { ...person, id: 'second', firstName: 'Próxima' } }]);
  renderPage();
  const previous = within(await screen.findByRole('region', { name: 'Horarios anteriores' }));
  const upcoming = within(screen.getByRole('region', { name: 'Ahora y próximos' }));
  expect(previous.getByRole('button', { name: /Ana Sintética 09:00/ })).toBeVisible();
  expect(previous.queryByRole('button', { name: /Próxima/ })).not.toBeInTheDocument();
  expect(upcoming.getByRole('button', { name: /Próxima/ })).toBeVisible();
  expect(upcoming.queryByRole('button', { name: /Ana Sintética/ })).not.toBeInTheDocument();
  expect(previous.getByText('1 turno')).toBeVisible(); expect(upcoming.getByText('1 turno')).toBeVisible();
});
it.each([
  ['2026-10-16', '12:28', ['12:30', '12:45']],
  ['2026-10-16', '12:30', ['12:30', '12:45']],
  ['2026-10-16', '12:31', ['12:45']],
  ['2026-10-15', '12:28', ['12:15', '12:30', '12:45']],
  ['2026-10-16', '13:00', []],
] as const)('filters spontaneous times for %s at %s Argentina', async (date, clock, expected) => {
  vi.setSystemTime(new Date(`2026-10-16T${clock}:45-03:00`));
  navigation.search = `date=${date}`;
  server.use(http.get('http://localhost:3000/api/sala/agenda', () => HttpResponse.json({ data: ['12:15', '12:30', '12:45', '13:00'].map(time => ({ slot: { id: `window:${time}`, scheduleSlotId: 'window', startTime: time, durationMinutes: 15 }, capacity: 1, reserved: time === '12:45' ? 1 : 0, available: time === '12:45' ? 0 : 1, isClosed: time === '13:00', people: [] })) })));
  renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'Incorporación espontánea' }));
  await screen.findByRole('dialog', { name: 'Incorporación espontánea' });
  fireEvent.change(screen.getByLabelText('Buscar Persona'), { target: { value: 'Sintética' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Ana Sintética · DNI 88000001' }));
  const select = await screen.findByLabelText('Horario espontáneo');
  const options = within(select).getAllByRole('option').slice(1).map(item => item.textContent?.slice(0, 5));
  expect(options).toEqual(expected);
  if (expected.some(time => time === '12:45')) expect(within(select).getByRole('option', { name: '12:45 · Sin lugar' })).toBeVisible();
  if (!expected.length) {
    expect(screen.getByText('No quedan horarios disponibles para hoy.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Incorporar' })).toBeDisabled();
  }
});
it('shows a backend time-passed error when the minute changes before confirmation', async () => {
  server.use(http.post('http://localhost:3000/api/sala/occurrences/spontaneous', () => HttpResponse.json({ code: 'SALA_SPONTANEOUS_TIME_PASSED' }, { status: 400 })));
  renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'Incorporación espontánea' }));
  await screen.findByRole('dialog');
  fireEvent.change(screen.getByLabelText('Buscar Persona'), { target: { value: 'Sintética' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Ana Sintética · DNI 88000001' }));
  await screen.findByRole('option', { name: 'Musculación · 15 min' });
  fireEvent.change(screen.getByLabelText('Servicio'), { target: { value: 'service' } });
  fireEvent.change(screen.getByLabelText('Horario espontáneo'), { target: { value: 'window:09:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Incorporar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Ese horario ya pasó. Elegí un horario actual o posterior.');
});
