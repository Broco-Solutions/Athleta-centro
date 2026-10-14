import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import { getReservationsTimeline, getSalaDashboard } from '@athleta/api-client';
import { currentSession, type SafeSession } from '../features/auth/auth';
import HomePage from './page';
vi.mock('../features/auth/auth-shell', () => ({ AuthShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('../features/auth/auth', () => ({ currentSession: vi.fn() }));
vi.mock('@athleta/api-client', () => ({ getSalaDashboard: vi.fn(), getReservationsTimeline: vi.fn() }));
const session: SafeSession = { user: { id: 'prof', firstName: 'Federico', lastName: 'Sintético', email: 'prof@test.local' }, roles: ['PROFESSOR'], permissions: ['PEOPLE_READ', 'SALA_RELATION_READ'], csrfToken: 'csrf', mustChangePassword: false };
const summary = { date: '2026-10-31', expected: 7, attended: 2, cancelledOrAbsent: 1, upcoming: [{ startTime: '09:00', total: 5, people: [{ id: 'student', firstName: 'Ana', lastName: 'Sintética', origin: 'FIXED' as const }] }], withoutRoutine: { count: 0, personIds: [] }, pendingPayment: { count: 3, personIds: [] } };
function renderPage(): void { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HomePage /></QueryClientProvider>); }
beforeEach(() => {
  vi.mocked(currentSession).mockResolvedValue(session);
  vi.mocked(getSalaDashboard).mockImplementation(async (params) => ({ status: 200, headers: new Headers(), data: { data: { ...summary, date: params.date, upcoming: [{ ...summary.upcoming[0]!, people: [{ ...summary.upcoming[0]!.people[0]!, firstName: params.date === '2026-11-01' ? 'Marta' : 'Ana' }] }] } } }));
  vi.mocked(getReservationsTimeline).mockResolvedValue({ status: 200, headers: new Headers(), data: { date: '2026-10-31', startTime: '08:00', endTime: '18:00', rows: [{ kind: 'PROFESSIONAL', bookings: [{ id: 'clinic-attended', source: 'CLINIC', status: 'ATTENDED' }, { id: 'clinic-scheduled-1', source: 'CLINIC', status: 'SCHEDULED' }, { id: 'clinic-scheduled-2', source: 'CLINIC', status: 'SCHEDULED' }, { id: 'clinic-cancelled', source: 'CLINIC', status: 'CANCELLED' }, { id: 'sala-attended', source: 'SALA', status: 'ATTENDED' }] }] } } as never);
  // 02:30 UTC is still October 31 in Argentina, regardless of host timezone.
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-01T02:30:00Z'));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('shows operational Sala information and changes from today to tomorrow in Argentina', async () => {
  renderPage();
  expect(await screen.findByText('Hola, Federico')).toBeVisible();
  for (const text of ['Próximos horarios', 'Alumnos esperados', 'Asistencias', 'Cancelados / Ausentes', 'Sin rutina activa', 'Pago pendiente', 'Hoy', 'Mañana']) expect(await screen.findByText(text)).toBeVisible();
  expect(await screen.findByText('Ana Sintética')).toBeVisible();
  expect(screen.getByText('+ 4 alumnos')).toBeVisible();
  expect(screen.getByText('0')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Ver Reservas' })).toHaveAttribute('href', '/reservations');
  expect(screen.getByRole('link', { name: /Sin rutina activa/ })).toHaveAttribute('href', '/students?filter=without-routine');
  expect(screen.getByRole('link', { name: /Pago pendiente/ })).toHaveAttribute('href', '/students?filter=pending-payment');
  expect(getSalaDashboard).toHaveBeenCalledWith({ date: '2026-10-31' }, { credentials: 'include' });
  fireEvent.click(screen.getByRole('button', { name: 'Mañana' }));
  expect(await screen.findByText('Marta Sintética')).toBeVisible();
  expect(getSalaDashboard).toHaveBeenCalledWith({ date: '2026-11-01' }, { credentials: 'include' });
  expect(screen.queryByText('Ana Sintética')).not.toBeInTheDocument();
});
it.each([['ADMINISTRATIVE'], ['KINESIOLOGIST'], ['PROFESSOR', 'KINESIOLOGIST']])('preserves general Home for roles %j', async (...roles) => {
  vi.mocked(currentSession).mockResolvedValue({ ...session, roles });
  renderPage(); expect(await screen.findByRole('heading', { name: 'Bienvenido a Athleta' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Personas' })).toBeVisible(); expect(screen.queryByText('Próximos horarios')).not.toBeInTheDocument(); expect(getSalaDashboard).not.toHaveBeenCalled();
});
it('shows the General Admin global overview from the real Sala, Clinic and Finance sources', async () => {
  vi.mocked(currentSession).mockResolvedValue({ ...session, roles: ['GENERAL_ADMIN'] });
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost:3000');
    if (url.pathname === '/api/finance/executive-totals') return { ok: true, json: async () => ({ data: { salaIncome: '125000', clinicalIncome: '50000', totalIncome: '175000', expenses: '45000', net: '130000' } }) } as Response;
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  renderPage();
  expect(await screen.findByRole('heading', { name: 'Hola, Federico' })).toBeVisible();
  for (const text of ['Resumen general de Athleta', 'Operación de hoy', 'Seguimiento', 'Sin rutina activa', 'Pago pendiente', 'Finanzas del mes', 'Ingresos', 'Gastos', 'Resultado']) expect(await screen.findByText(text)).toBeVisible();
  expect(await screen.findByRole('heading', { name: 'Sala' })).toBeVisible();
  expect(await screen.findByRole('heading', { name: 'Clínica' })).toBeVisible();
  const clinicCard = screen.getByRole('heading', { name: 'Clínica' }).closest('article')!;
  expect(within(clinicCard).getByText('Turnos del día').parentElement).toHaveTextContent('4');
  expect(within(clinicCard).getByText('Atendidos').parentElement).toHaveTextContent('1');
  expect(within(clinicCard).getByText('Pendientes').parentElement).toHaveTextContent('2');
  expect(screen.getAllByRole('link', { name: 'Ver Agenda' })).toHaveLength(2);
  const salaCard = screen.getByRole('heading', { name: 'Sala' }).closest('article')!;
  expect(within(salaCard).getByRole('link', { name: 'Ver Agenda' })).toHaveAttribute('href', '/sala');
  expect(within(clinicCard).getByRole('link', { name: 'Ver Agenda' })).toHaveAttribute('href', '/clinic?tab=Agenda');
  expect(screen.getByRole('link', { name: 'Ver alumnos de Sala' })).toHaveAttribute('href', '/sala?view=students');
  expect(screen.getByRole('link', { name: 'Ver Finanzas' })).toHaveAttribute('href', '/finance');
  expect(getSalaDashboard).toHaveBeenCalledWith({ date: '2026-10-31' }, { credentials: 'include' });
  expect(getReservationsTimeline).toHaveBeenCalledWith({ date: '2026-10-31' }, { credentials: 'include' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const financeUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost:3000');
  expect(financeUrl.pathname).toBe('/api/finance/executive-totals');
  expect(financeUrl.searchParams.get('from')).toBe('2026-10-01');
  expect(financeUrl.searchParams.get('to')).toBe('2026-10-31');
  expect(screen.getByText(/175\.000/)).toBeVisible();
});
it('keeps the upcoming empty state and zero counters visible', async () => {
  vi.mocked(getSalaDashboard).mockResolvedValue({ status: 200, headers: new Headers(), data: { data: { ...summary, upcoming: [], expected: 0, attended: 0, cancelledOrAbsent: 0, pendingPayment: { count: 0, personIds: [] } } } });
  renderPage(); expect(await screen.findByText('No hay alumnos previstos para los próximos horarios.')).toBeVisible(); expect(screen.getAllByText('0')).toHaveLength(5);
});
it('keeps loading and errors localized inside the workspace', async () => {
  vi.mocked(getSalaDashboard).mockImplementation(() => new Promise(() => {}));
  const rendered = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HomePage /></QueryClientProvider>);
  expect(await screen.findByText('Cargando resumen de Sala…')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Mañana' })).toBeEnabled();
  rendered.unmount(); vi.mocked(getSalaDashboard).mockRejectedValue(new Error('technical details'));
  renderPage(); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar el resumen de Sala.'));
  expect(screen.queryByText('technical details')).not.toBeInTheDocument(); expect(screen.getByRole('link', { name: 'Alumnos' })).toBeVisible();
});
