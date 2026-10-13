import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import SalaConfigurationPage from './page';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const session = { user: { id: 'admin', firstName: 'Lisa', lastName: 'Simpson', email: 'lisa@example.test' }, roles: ['GENERAL_ADMIN'], permissions: ['SALA_PARTICIPATION_MANAGE', 'SALA_PLAN_CATALOG_MANAGE', 'SALA_SCHEDULE_MANAGE', 'SALA_SERVICE_DURATION_MANAGE', 'SALA_PHYSICAL_EVALUATION_READ', 'SALA_PHYSICAL_TEST_CATALOG_MANAGE'], mustChangePassword: false, csrfToken: 'csrf' };
const services = [
  { id: '10000000-0000-4000-8000-000000000001', name: 'Musculación', durationMinutes: 60, isSelectable: true },
  { id: '10000000-0000-4000-8000-000000000002', name: 'Funcional', durationMinutes: 45, isSelectable: true },
  { id: '10000000-0000-4000-8000-000000000003', name: 'Calistenia', durationMinutes: 60, isSelectable: true },
  { id: '10000000-0000-4000-8000-000000000004', name: 'Servicio retirado', durationMinutes: 60, isSelectable: false },
];
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
    http.get('http://localhost:3000/api/sala/service-types/all', () => HttpResponse.json({ data: services })),
    http.get('http://localhost:3000/api/sala/service-types', () => HttpResponse.json({ data: services.filter(service => service.isSelectable) })),
    http.get('http://localhost:3000/api/sala/configuration', () => HttpResponse.json({ data: { generalCapacity: 5 } })),
    http.get('http://localhost:3000/api/sala/physical-test-definitions', () => HttpResponse.json({ data: tests })),
    http.post('http://localhost:3000/api/sala/physical-test-definitions', async ({ request }) => { tests.push({ id: 'test-1', ...(await request.json() as { name: string; type: string; description: string | null }), isActive: true }); return HttpResponse.json({ data: tests[0] }, { status: 201 }); }),
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

function renderPage(): void { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><SalaConfigurationPage /></QueryClientProvider>); }

it('shows the effective capacity returned by the backend', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('Capacidad'));
  await waitFor(() => expect(screen.getByLabelText('Capacidad general')).toHaveValue(5));
  expect(screen.getByText('Capacidad general: 5 personas')).toBeInTheDocument();
});

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
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: manage ? ['ADMINISTRATIVE'] : ['PROFESSOR', 'KINESIOLOGIST'], permissions: ['SALA_PARTICIPATION_MANAGE', 'SALA_SCHEDULE_MANAGE', ...(manage ? ['SALA_PLAN_CATALOG_MANAGE'] : [])] } })),
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [{ id: 'plan', name: 'Mensual', monthlyAmount: '1000', isSelectable: true, services: [] }] })),
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

it('creates a plan only after selecting services and sends the selected IDs', async () => {
  let submitted: unknown;
  server.use(http.post('http://localhost:3000/api/sala/plans', async ({ request }) => {
    submitted = await request.json();
    return HttpResponse.json({ data: { id: 'new-plan' } }, { status: 201 });
  }));
  renderPage();
  fireEvent.click(await screen.findByText('Planes'));
  fireEvent.click(await screen.findByRole('button', { name: 'Nuevo plan' }));
  const form = screen.getByRole('button', { name: 'Guardar' }).closest('form')!;
  const muscle = await within(form).findByRole('checkbox', { name: 'Musculación · 60 min' });
  const functional = within(form).getByRole('checkbox', { name: 'Funcional · 45 min' });
  expect(within(form).queryByRole('checkbox', { name: /Servicio retirado/ })).not.toBeInTheDocument();
  fireEvent.change(within(form).getByLabelText('Nombre'), { target: { value: 'Plan Base' } });
  fireEvent.change(within(form).getByLabelText('Precio mensual'), { target: { value: '20000' } });
  expect(within(form).getByRole('button', { name: 'Guardar' })).toBeDisabled();
  fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }));
  expect(submitted).toBeUndefined();
  fireEvent.click(muscle);
  fireEvent.click(functional);
  expect(within(form).getByRole('button', { name: 'Guardar' })).toBeEnabled();
  fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(submitted).toEqual({ name: 'Plan Base', monthlyAmount: 20000, serviceTypeIds: [services[0]!.id, services[1]!.id] }));
});
it('preloads plan services and sends the complete replacement selection', async () => {
  let submitted: unknown;
  server.use(
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [{ id: 'plan', name: 'Plan Base', monthlyAmount: '20000', isSelectable: true, services: services.slice(0, 2) }] })),
    http.patch('http://localhost:3000/api/sala/plans/plan', async ({ request }) => {
      submitted = await request.json();
      return HttpResponse.json({ data: { id: 'plan' } });
    }),
  );
  renderPage();
  fireEvent.click(await screen.findByText('Planes'));
  expect(await screen.findByText('Musculación · Funcional')).toBeInTheDocument();
  fireEvent.click(await within(screen.getByText('Planes').closest('details')!).findByRole('button', { name: 'Editar' }));
  const form = screen.getByRole('button', { name: 'Guardar' }).closest('form')!;
  const muscle = await within(form).findByRole('checkbox', { name: 'Musculación · 60 min' });
  const functional = within(form).getByRole('checkbox', { name: 'Funcional · 45 min' });
  const calisthenics = within(form).getByRole('checkbox', { name: 'Calistenia · 60 min' });
  expect(muscle).toBeChecked();
  expect(functional).toBeChecked();
  expect(calisthenics).not.toBeChecked();
  fireEvent.click(functional);
  fireEvent.click(calisthenics);
  fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(submitted).toEqual({ name: 'Plan Base', monthlyAmount: 20000, serviceTypeIds: [services[0]!.id, services[2]!.id] }));
});
it('shows legacy plans without inventing services and allows configuring them', async () => {
  server.use(http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [{ id: 'legacy', name: 'Plan anterior', monthlyAmount: '1000', isSelectable: true, services: [] }] })));
  renderPage();
  fireEvent.click(await screen.findByText('Planes'));
  expect(await screen.findByText('Sin servicios configurados')).toBeInTheDocument();
  fireEvent.click(await within(screen.getByText('Planes').closest('details')!).findByRole('button', { name: 'Editar' }));
  const form = screen.getByRole('button', { name: 'Guardar' }).closest('form')!;
  await within(form).findByRole('checkbox', { name: 'Musculación · 60 min' });
  for (const checkbox of within(form).getAllByRole('checkbox')) expect(checkbox).not.toBeChecked();
  expect(within(form).getByRole('button', { name: 'Guardar' })).toBeDisabled();
});
it('preloads retired linked services and requires removing them before saving', async () => {
  server.use(http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [{ id: 'plan', name: 'Plan Base', monthlyAmount: '1000', isSelectable: true, services: [services[0], services[3]] }] })));
  renderPage();
  fireEvent.click(await screen.findByText('Planes'));
  fireEvent.click(await within(screen.getByText('Planes').closest('details')!).findByRole('button', { name: 'Editar' }));
  const form = screen.getByRole('button', { name: 'Guardar' }).closest('form')!;
  const retired = within(form).getByRole('checkbox', { name: /Servicio retirado/ });
  expect(retired).toBeChecked();
  expect(within(form).getByRole('button', { name: 'Guardar' })).toBeDisabled();
  fireEvent.click(retired);
  expect(retired).not.toBeChecked();
  expect(retired).toBeDisabled();
  expect(within(form).getByRole('button', { name: 'Guardar' })).toBeEnabled();
});
