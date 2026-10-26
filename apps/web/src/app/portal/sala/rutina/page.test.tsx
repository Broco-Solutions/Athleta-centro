import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import PortalRoutine from './page';

const server = setupServer(http.get('http://localhost:3000/api/portal/auth/session', () => HttpResponse.json({ data: { csrfToken: 'csrf' } })));
const nativeFetch = globalThis.fetch;
const endpoint = 'http://localhost:3000/api/portal/sala';
function renderRoutine(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><PortalRoutine /></QueryClientProvider>);
}
beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it('renders the active routine read-only with its details and correct counts', async () => {
  server.use(http.get(endpoint, () => HttpResponse.json({ data: { routine: { days: [
    { id: 'day-1', position: 1, name: null, exercises: [
      { id: 'exercise-1', exerciseDefinitionId: 'squat', exerciseDefinition: { name: 'Sentadilla', description: 'Descenso controlado' }, series: '3', repetitions: '10', rest: '60 s', notes: 'Controlar técnica' },
      { id: 'exercise-2', exerciseDefinitionId: 'plank', exerciseDefinition: { name: 'Plancha', description: null }, duration: '45 s' },
    ] },
    { id: 'day-2', position: 2, name: 'Día 2', exercises: [{ id: 'exercise-3', exerciseDefinitionId: 'row', exerciseDefinition: { name: 'Remo', description: null }, series: '4', repetitions: '8', rest: '30 s' }] },
  ] } } })));
  renderRoutine();
  expect(await screen.findByText('2 días · 3 ejercicios')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Mi rutina' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Volver a Inicio' })).toHaveAttribute('href', '/portal');
  expect(screen.getByText('2 días · 3 ejercicios')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Día 1' })).toHaveClass('bg-primary');
  expect(screen.getByRole('heading', { name: 'Día 2' })).toHaveClass('bg-primary');
  expect(screen.getByRole('heading', { name: 'Día 1' }).closest('header')).toHaveClass('bg-surface-muted');
  for (const row of screen.getAllByRole('listitem')) expect(row.querySelector('.bg-primary')).toBeNull();
  for (const row of screen.getAllByRole('listitem')) expect(row).not.toHaveClass('bg-primary');
  expect(screen.getByRole('link', { name: 'Registrar este día: Día 1' })).toHaveAttribute('href', '/portal/sala/entrenamientos/registrar?dayId=day-1');
  expect(screen.getByRole('link', { name: 'Registrar este día: Día 2' })).toHaveAttribute('href', '/portal/sala/entrenamientos/registrar?dayId=day-2');
  expect(screen.getByRole('link', { name: 'Mis entrenamientos' })).toHaveAttribute('href', '/portal/sala/entrenamientos');
  expect(screen.getByText('Descenso controlado')).toBeInTheDocument();
  expect(screen.getByText('Tiempo 45 s')).toBeInTheDocument();
  expect(screen.getByText('Sentadilla')).toBeInTheDocument();
  expect(screen.getByText('Plancha')).toBeInTheDocument();
  expect(screen.getByText('Remo')).toBeInTheDocument();
  expect(screen.getByText((value) => value.includes('3 series') && value.includes('10 rep.') && value.includes('Descanso 60 s'))).toBeInTheDocument();
  expect(screen.getByText('Observación: Controlar técnica')).toBeInTheDocument();
  const main = within(document.querySelector('main')!);
  expect(main.queryByRole('button')).not.toBeInTheDocument();
  expect(main.queryByRole('textbox')).not.toBeInTheDocument();
  expect(main.queryByText(/Editar|Duplicar|Crear ejercicio|Asignar rutina/i)).not.toBeInTheDocument();
});

it('shows an empty state when there is no active routine and keeps the Home link', async () => {
  server.use(http.get(endpoint, () => HttpResponse.json({ data: { routine: null } })));
  renderRoutine();
  expect(await screen.findByText('No hay una rutina activa.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Volver a Inicio' })).toHaveAttribute('href', '/portal');
});

it('shows a safe error when the routine read model fails', async () => {
  server.use(http.get(endpoint, () => HttpResponse.json({ code: 'FAIL', message: 'Internal detail' }, { status: 500 })));
  renderRoutine();
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar tu rutina. Intentá nuevamente.');
  expect(screen.getByRole('link', { name: 'Volver a Inicio' })).toHaveAttribute('href', '/portal');
  expect(screen.queryByText('Internal detail')).not.toBeInTheDocument();
});

