import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import StudentsPage from './page';

const navigation = vi.hoisted(() => ({ filter: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.filter ? { filter: navigation.filter } : {}) }));
const server = setupServer();
const nativeFetch = globalThis.fetch;
const students = [
  { id: 'student-1', firstName: 'Ana', lastName: 'Alumna', dni: '88000001', plan: { id: 'plan-1', name: '3 veces' }, professor: { id: 'prof-1', firstName: 'Federico', lastName: 'Sintético' }, routineStatus: 'ACTIVE', paymentStatus: 'PAID' },
  { id: 'student-2', firstName: 'Lucía', lastName: 'Ejemplo', dni: '88000002', plan: { id: 'plan-2', name: '2 veces' }, professor: { id: 'prof-2', firstName: 'Ramiro', lastName: 'Demostración' }, routineStatus: 'MISSING', paymentStatus: 'PENDING' },
  { id: 'student-3', firstName: 'Pedro', lastName: 'Prueba', dni: '88000003', plan: { id: 'plan-1', name: '3 veces' }, professor: { id: 'prof-1', firstName: 'Federico', lastName: 'Sintético' }, routineStatus: 'ACTIVE', paymentStatus: 'PENDING' },
];
beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  navigation.filter = '';
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { user: { id: 'prof-1', firstName: 'Federico', lastName: 'Sintético' }, roles: ['PROFESSOR'], permissions: ['SALA_RELATION_READ', 'SALA_ROUTINE_READ', 'SALA_PAYMENT_READ'], csrfToken: 'csrf', mustChangePassword: false } })),
    http.get('http://localhost:3000/api/sala/students', () => HttpResponse.json({ data: students })),
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
function renderPage() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><StudentsPage /></QueryClientProvider>); }
function list() { return within(screen.getByRole('table', { name: 'Alumnos activos de Sala' })); }

it('shows all students, full Professor names, plan and follow-up states without creation actions', async () => {
  renderPage();
  expect(await screen.findByRole('heading', { name: 'Alumnos' })).toBeInTheDocument();
  await screen.findByText('Ana Alumna');
  expect(screen.getByText('3 alumnos')).toBeInTheDocument();
  expect(list().getByText('Lucía Ejemplo')).toBeInTheDocument();
  expect(list().getByText('Pedro Prueba')).toBeInTheDocument();
  expect(list().getByRole('columnheader', { name: 'Profesor', hidden: true })).toBeInTheDocument();
  const row = within(list().getByText('Lucía Ejemplo').closest('tr')!);
  expect(row.getByText('Ramiro Demostración', { exact: false })).toBeInTheDocument();
  expect(row.getByText('2 veces', { exact: false })).toBeInTheDocument();
  expect(row.getByText('Sin rutina')).toBeInTheDocument();
  expect(row.getByText('Pendiente')).toBeInTheDocument();
  expect(list().getAllByText('Federico Sintético', { exact: false })).toHaveLength(2);
  expect(list().getAllByText('Activa')).toHaveLength(2);
  expect(list().getByText('Al día')).toBeInTheDocument();
  expect(row.getByRole('link', { name: 'Ver ficha' })).toHaveAttribute('href', '/sala/people/student-2');
  expect(screen.queryByText('Nueva Persona')).not.toBeInTheDocument();
  expect(screen.queryByText('Nuevo alumno')).not.toBeInTheDocument();
});
it.each([['Lucía', 'Lucía Ejemplo'], ['88000001', 'Ana Alumna']])('searches locally by %s', async (term, name) => {
  renderPage(); await screen.findByText('Ana Alumna');
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar por nombre o DNI' }), { target: { value: term } });
  expect(list().getByText(name)).toBeInTheDocument();
  expect(list().getAllByRole('link', { name: 'Ver ficha' })).toHaveLength(1);
});
it.each([['Sin rutina', 1], ['Pago pendiente', 2]])('filters by %s and returns to Todos', async (name, count) => {
  renderPage(); await screen.findByText('Ana Alumna');
  fireEvent.click(screen.getByRole('button', { name }));
  expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
  expect(list().getAllByRole('link', { name: 'Ver ficha' })).toHaveLength(count);
  expect(list().queryByText('Ana Alumna')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
  expect(list().getAllByRole('link', { name: 'Ver ficha' })).toHaveLength(3);
});
it.each([['without-routine', 'Sin rutina', 1], ['pending-payment', 'Pago pendiente', 2]])('activates URL filter %s', async (filter, label, count) => {
  navigation.filter = filter; renderPage(); await screen.findByText('Lucía Ejemplo');
  expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
  expect(list().getAllByRole('link', { name: 'Ver ficha' })).toHaveLength(count);
});
it('shows a meaningful empty state', async () => {
  server.use(http.get('http://localhost:3000/api/sala/students', () => HttpResponse.json({ data: [] })));
  renderPage(); expect(await screen.findByText('No hay alumnos activos de Sala.')).toBeInTheDocument();
});
it('shows no search results and allows restoring the list', async () => {
  renderPage(); await screen.findByText('Ana Alumna');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nadie' } });
  expect(screen.getByText('Sin resultados')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
  expect(list().getAllByRole('link', { name: 'Ver ficha' })).toHaveLength(3);
});
it('reports HTTP failures instead of showing an empty list', async () => {
  server.use(http.get('http://localhost:3000/api/sala/students', () => HttpResponse.json({}, { status: 403 })));
  renderPage(); expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar los alumnos.');
});
