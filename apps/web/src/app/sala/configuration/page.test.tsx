import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import SalaConfigurationPage from './page';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const session = { user: { id: 'admin', firstName: 'Lisa', lastName: 'Simpson', email: 'lisa@example.test' }, roles: ['GENERAL_ADMIN'], permissions: ['SALA_PARTICIPATION_MANAGE', 'SALA_PLAN_CATALOG_MANAGE', 'SALA_SCHEDULE_MANAGE', 'SALA_PHYSICAL_EVALUATION_READ', 'SALA_PHYSICAL_TEST_CATALOG_MANAGE'], mustChangePassword: false, csrfToken: 'csrf' };
const tests: Array<{ id: string; name: string; type: string; description: string | null; isActive: boolean }> = [];

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'bypass' });
});
beforeEach(() => {
  tests.splice(0, tests.length);
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: session })),
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/schedule', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/service-types/all', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/configuration', () => HttpResponse.json({ data: { data: { generalCapacity: 5 } } })),
    http.get('http://localhost:3000/api/sala/physical-test-definitions', () => HttpResponse.json({ data: tests })),
    http.post('http://localhost:3000/api/sala/physical-test-definitions', async ({ request }) => { tests.push({ id: 'test-1', ...(await request.json() as { name: string; type: string; description: string | null }), isActive: true }); return HttpResponse.json({ data: tests[0] }, { status: 201 }); }),
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

function renderPage(): void { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><SalaConfigurationPage /></QueryClientProvider>); }

it('shows the physical tests section and its empty state', async () => {
  renderPage();
  const section = await screen.findByText('Tests físicos');
  fireEvent.click(section);
  expect(await screen.findByText('No hay tests físicos configurados.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Crear primer test' })).toBeInTheDocument();
});

it('opens the real-field modal, creates a test and refreshes the listing', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('Tests físicos'));
  fireEvent.click(screen.getByRole('button', { name: 'Crear primer test' }));
  const dialog = await screen.findByRole('dialog', { name: 'Nuevo test físico' });
  fireEvent.change(within(dialog).getByLabelText('Nombre del test físico'), { target: { value: 'Sentadilla' } });
  fireEvent.change(within(dialog).getByLabelText('Tipo del test físico'), { target: { value: 'repeticiones' } });
  fireEvent.change(within(dialog).getByLabelText('Descripción del test físico'), { target: { value: 'Cantidad en un minuto' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nuevo test físico' })).not.toBeInTheDocument());
  expect(await screen.findByText('Sentadilla')).toBeInTheDocument();
  expect(screen.getByText(/repeticiones · Cantidad en un minuto/)).toBeInTheDocument();
});

it.each([false, true])('shows plan administration only with its permission (manage=%s), while preserving schedules', async (manage) => {
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: [manage ? 'ADMINISTRATIVE' : 'PROFESSOR'], permissions: ['SALA_PARTICIPATION_MANAGE', 'SALA_SCHEDULE_MANAGE', ...(manage ? ['SALA_PLAN_CATALOG_MANAGE'] : [])] } })),
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [{ id: 'plan', name: 'Mensual', monthlyAmount: '1000', isSelectable: true }] })),
  );
  renderPage(); fireEvent.click(await screen.findByText('Planes'));
  const section = screen.getByText('Planes').closest('details')!;
  await within(section).findByText(/Mensual/);
  await waitFor(() => expect(within(screen.getByRole('navigation', { name: 'Navegación principal' })).getByRole('link', { name: 'Sala' })).toBeInTheDocument());
  for (const name of ['Nuevo plan', 'Editar', 'Retirar']) {
    if (manage) expect(within(section).getByRole('button', { name })).toBeInTheDocument();
    else expect(within(section).queryByRole('button', { name })).not.toBeInTheDocument();
  }
  fireEvent.click(screen.getByText('Horarios semanales'));
  expect(screen.getByRole('button', { name: 'Guardar horarios' })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: '+ Agregar franja' })).toHaveLength(7);
});
