import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  expect(routine.getByRole('link', { name: 'Registrar entrenamiento' })).toHaveAttribute('href', '/portal/sala/entrenamientos/registrar');
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

it('keeps a generic fetch error when the response is not structured', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala', () => new HttpResponse('unstructured', { status: 500 })));
  await expect(portalFetch('sala')).rejects.toThrow('No pudimos cargar esta información.');
});

it('shows registered payment without pending guidance', async () => {
  vi.spyOn(portalUi, 'today').mockReturnValue('2026-10-16');
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [], routine: null, evaluations: [], replacementWeeks: availableWeeks(), validity: { hasValidAccess: true, validUntil: '2026-11-20' } } })));
  renderPortalHome();
  expect(await screen.findByText('Vigente hasta 20/11/2026')).toBeInTheDocument();
  expect(screen.queryByText('Sin vigencia')).not.toBeInTheDocument();
  expect(screen.queryByText('Necesitás renovar tu vigencia para realizar nuevas reservas.')).not.toBeInTheDocument();
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

it('shows the only Home while loading Sala without a link back to itself', async () => {
  renderPortalHome();
  expect(screen.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
  expect(screen.getByText('Cargando Sala…')).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Volver a Inicio' })).not.toBeInTheDocument();
  await screen.findByRole('heading', { name: 'Mis turnos fijos' });
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
  expect(await screen.findByRole('heading', { name: 'Mis turnos fijos' })).toBeVisible();
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


it.each([{ replacementWeeks: [] }, { replacementWeeks: [{ weekStart: '2026-10-26', weekEnd: '2026-11-01', available: 0 }] }])('shows no replacement notice without available cancellations (%j)', async ({ replacementWeeks }) => {
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [{ id: 'replacement', date: '2026-10-30' }], fixed: [], evaluations: [], replacementWeeks, validity: { hasValidAccess: true, validUntil: '2026-11-20' } } })));
  renderPortalHome();
  await screen.findByRole('heading', { name: 'Mis turnos fijos' });
  for (const text of ['Próxima reserva', 'No tenés próximas reservas.', 'Ver mis reservas', 'Turno disponible para reprogramar', 'Reservar reemplazo', 'Elegir otro horario', 'Para reservar otro horario, primero cancelá una fecha de uno de tus turnos fijos.']) expect(screen.queryByText(text)).not.toBeInTheDocument();
});

it('links an available replacement to the sole booking interface', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { fixed: [], evaluations: [], replacementWeeks: [{ weekStart: '2026-10-26', weekEnd: '2026-11-01', available: 1 }], validity: { hasValidAccess: true, validUntil: '2026-11-20' } } })));
  renderPortalHome();
  expect(await screen.findByRole('heading', { name: 'Turno disponible para reprogramar' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Elegir otro horario' })).toHaveAttribute('href', '/portal/sala/reservar');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('Próxima reserva')).not.toBeInTheDocument();
});

it('shows only weekly fixed days and times with a link to upcoming turns', async () => {
  server.use(http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: {
    fixed: [
      { id: 'one', startDate: '2026-10-26', startTime: '08:00:00', serviceType: { name: 'Sala', durationMinutes: 60 }, scheduleSlot: { weekday: 'MONDAY' } },
      { id: 'two', startDate: '2026-10-28', startTime: '18:00', serviceType: { name: 'Sala', durationMinutes: 60 }, scheduleSlot: { weekday: 'WEDNESDAY' } },
      { id: 'ended', startDate: '2026-10-01', endDate: '2026-10-20', startTime: '10:00', scheduleSlot: { weekday: 'FRIDAY' } },
    ], fixedOccurrences: [{ fixedSalaBookingId: 'one', date: '2026-11-02', startTime: '08:00', status: 'PENDING_PAYMENT' }], evaluations: [], replacementWeeks: [], validity: { hasValidAccess: true, validUntil: '2026-11-01' },
  } })));
  renderPortalHome();
  expect(await screen.findByText('Lunes · 08:00')).toBeVisible();
  expect(screen.getByText('Miércoles · 18:00')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Ver próximos turnos' })).toHaveAttribute('href', '/portal/sala/reservas');
  for (const text of ['Sala', '60 min', 'Desde 26/10/2026', 'Desde 28/10/2026', 'Próximos turnos fijos', 'Pendiente de renovación', 'Cancelar esta fecha', 'Viernes · 10:00']) expect(screen.queryByText(text)).not.toBeInTheDocument();
});

it('hides registration on Home without an active routine', async () => {
  renderPortalHome(); await screen.findByText('No hay una rutina activa.');
  expect(screen.queryByRole('link', { name: 'Registrar entrenamiento' })).not.toBeInTheDocument();
});
