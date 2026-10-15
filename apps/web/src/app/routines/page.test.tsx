import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
