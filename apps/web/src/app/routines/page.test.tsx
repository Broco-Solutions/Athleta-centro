import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import RoutinesPage from './page';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const base = 'http://localhost:3000/api';
const session = { user: { id: 'professor', firstName: 'Profe', lastName: 'Sintético', email: 'professor@test.local' }, roles: ['PROFESSOR'], permissions: ['SALA_ROUTINE_MANAGE', 'SALA_ROUTINE_READ'], mustChangePassword: false, csrfToken: 'csrf' };
const exercise = { id: 'squat', name: 'Sentadilla', primaryMuscle: 'Piernas', isActive: true };
const template = { id: 'template', name: 'Fuerza general', days: [
  { id: 'day-1', position: 1, name: 'Piernas', exercises: [{ id: 'entry-1', position: 1, exerciseDefinitionId: exercise.id, exerciseDefinition: exercise, series: '3', repetitions: '10' }] },
  { id: 'day-2', position: 2, name: 'Movilidad', exercises: [] },
] };
let reads: number;
let catalogReads: number;
let rows: typeof template[];

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  reads = 0; catalogReads = 0; rows = [template];
  server.use(
    http.get(`${base}/auth/session`, () => HttpResponse.json({ data: session })),
    http.get(`${base}/sala/routine-templates`, () => { reads++; return HttpResponse.json({ data: rows }); }),
    http.get(`${base}/sala/exercise-definitions`, () => { catalogReads++; return HttpResponse.json({ data: [exercise] }); }),
  );
});
afterEach(() => { cleanup(); server.resetHandlers(); vi.restoreAllMocks(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

function renderPage(): void {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><RoutinesPage /></QueryClientProvider>);
}
it('shows the current preestablished routines experience with management permission', async () => {
  renderPage();
  expect(await screen.findByRole('heading', { name: 'Rutinas preestablecidas' })).toBeVisible();
  expect(await screen.findByRole('button', { name: 'Nueva rutina preestablecida' })).toBeVisible();
  expect(await screen.findByRole('heading', { name: 'Fuerza general' })).toBeVisible();
  expect(await screen.findByLabelText('Buscar rutina')).toBeVisible();
  expect(await screen.findByText('1 rutina preestablecida')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Duplicar' })).toBeVisible();
  await waitFor(() => { expect(reads).toBe(1); expect(catalogReads).toBe(1); });
});

it('activates Rutinas in WorkspaceShell', async () => {
  renderPage();
  const link = await screen.findByRole('link', { name: 'Rutinas' });
  expect(link).toHaveAttribute('href', '/routines');
  expect(link).toHaveAttribute('aria-current', 'page');
});

it('denies management without permission and does not query templates or exercises', async () => {
  server.use(http.get(`${base}/auth/session`, () => HttpResponse.json({ data: { ...session, permissions: [] } })));
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso para administrar rutinas preestablecidas.');
  expect(screen.queryByRole('button', { name: 'Nueva rutina preestablecida' })).not.toBeInTheDocument();
  expect(reads).toBe(0); expect(catalogReads).toBe(0);
});

it('keeps the current manager instead of restoring the former page editor', async () => {
  renderPage();
  await screen.findByRole('button', { name: 'Nueva rutina preestablecida' });
  expect(screen.queryByRole('button', { name: 'Nueva rutina' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Nombre de la rutina')).not.toBeInTheDocument();
});

it('switches accessible sections with the keyboard and preserves drafts in both panels', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Nueva rutina preestablecida' }));
  fireEvent.change(screen.getByLabelText('Nombre de la preestablecida'), { target: { value: 'Rutina sin guardar' } });
  const templatesTab = screen.getByRole('tab', { name: 'Rutinas preestablecidas' });
  fireEvent.keyDown(templatesTab, { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'Ejercicios' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: 'Ejercicios' })).toHaveFocus();
  const catalog = within(screen.getByRole('tabpanel', { name: 'Ejercicios' }));
  fireEvent.click(catalog.getByRole('button', { name: '+ Nuevo ejercicio' }));
  fireEvent.change(catalog.getByRole('textbox', { name: /Nombre/ }), { target: { value: 'Ejercicio sin guardar' } });
  fireEvent.change(catalog.getByRole('textbox', { name: /Descripción/ }), { target: { value: 'Descripción sin guardar' } });
  fireEvent.click(templatesTab);
  expect(screen.getByLabelText('Nombre de la preestablecida')).toHaveValue('Rutina sin guardar');
  fireEvent.click(screen.getByRole('tab', { name: 'Ejercicios' }));
  expect(catalog.getByRole('textbox', { name: /Nombre/ })).toHaveValue('Ejercicio sin guardar');
  expect(catalog.getByRole('textbox', { name: /Descripción/ })).toHaveValue('Descripción sin guardar');
});

it('creates an exercise without a routine and then finds it by description in a template draft', async () => {
  let catalogRows = [exercise]; let created = 0;
  server.use(
    http.get(`${base}/sala/exercise-definitions`, () => HttpResponse.json({ data: catalogRows })),
    http.post(`${base}/sala/exercise-definitions`, async ({ request }) => {
      const body = await request.json() as { name: string; primaryMuscle: string; description: string };
      created++; expect(request.headers.get('x-csrf-token')).toBe('csrf');
      const newExercise = { ...body, id: 'new-exercise', isActive: true };
      catalogRows = [...catalogRows, newExercise]; return HttpResponse.json({ data: newExercise }, { status: 201 });
    }),
  );
  renderPage(); fireEvent.click(await screen.findByRole('tab', { name: 'Ejercicios' }));
  fireEvent.click(screen.getByRole('button', { name: '+ Nuevo ejercicio' }));
  fireEvent.change(screen.getByRole('textbox', { name: /Nombre/ }), { target: { value: 'Sentadilla búlgara' } });
  fireEvent.change(screen.getByRole('textbox', { name: /Descripción/ }), { target: { value: 'Fuerza para fútbol' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear ejercicio' }));
  await screen.findByText('Ejercicio creado correctamente.');
  await screen.findByRole('heading', { name: 'Sentadilla búlgara' });
  expect(created).toBe(1); expect(screen.queryByLabelText('Nombre de la preestablecida')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Rutinas preestablecidas' }));
  fireEvent.click(screen.getByRole('button', { name: 'Nueva rutina preestablecida' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar un ejercicio en el catálogo' }), { target: { value: 'BULGARA futbol' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Agregar Sentadilla búlgara' }));
  expect(within(screen.getByRole('group', { name: 'Día 1' })).getByLabelText('Ejercicio')).toHaveValue('new-exercise');
});

it('allows read-only exercise consultation without template or catalog management', async () => {
  server.use(http.get(`${base}/auth/session`, () => HttpResponse.json({ data: { ...session, permissions: ['SALA_ROUTINE_READ'] } })));
  renderPage(); await screen.findByRole('heading', { name: 'Catálogo de ejercicios' });
  expect(await screen.findByRole('heading', { name: 'Sentadilla' })).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Ejercicios' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByRole('tab', { name: 'Rutinas preestablecidas' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Nuevo ejercicio|Editar|Retirar/ })).not.toBeInTheDocument();
  expect(reads).toBe(0); expect(catalogReads).toBe(1);
});
