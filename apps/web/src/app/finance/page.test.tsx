import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import FinancePage from './page';
import { todayOperational } from '../../features/sala/student-onboarding';

const navigation = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.search) }));

const server = setupServer();
const nativeFetch = globalThis.fetch;
const session = { user: { id: 'admin', firstName: 'Admin', lastName: 'Test' }, roles: ['GENERAL_ADMIN'], permissions: ['FINANCE_OPERATIONAL_READ', 'FINANCE_EXECUTIVE_READ', 'PAYMENT_METHOD_CATALOG_MANAGE', 'SALA_PAYMENT_MANAGE', 'EXPENSE_CREATE', 'EXPENSE_HISTORY_READ', 'EXPENSE_CATEGORY_CATALOG_MANAGE'], csrfToken: 'csrf', mustChangePassword: false };

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  navigation.search = '';
  vi.setSystemTime(new Date('2026-10-15T01:00:00Z'));
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: session })),
    http.get('http://localhost:3000/api/sala/students', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/finance/expense-categories', () => HttpResponse.json({ data: [{ id: 'rent', name: 'Alquiler', isSelectable: true }, { id: 'retired', name: 'Retirada', isSelectable: false }] })),
    http.get('http://localhost:3000/api/finance/executive-totals', () => HttpResponse.json({ data: { totalIncome: '100', salaIncome: '60', clinicalIncome: '40', expenses: '20', net: '80' } })),
    http.get('http://localhost:3000/api/finance/payment-methods', () => HttpResponse.json({ data: [{ id: 'cash', name: 'Efectivo', isSelectable: true }] })),
    http.get('http://localhost:3000/api/finance/income', () => HttpResponse.json({ data: [{ id: 'income', cashDate: '2026-10-14', source: 'SALA', amount: '60', person: { firstName: 'Juan', lastName: 'Pérez' }, paymentMethod: { name: 'Transferencia' } }] })),
    http.get('http://localhost:3000/api/finance/expenses', () => HttpResponse.json({ data: [{ id: 'expense', cashDate: '2026-10-14', area: 'GENERAL', amount: '250000', category: { name: 'Alquiler' }, paymentMethod: { name: 'Transferencia' }, description: 'Local de Sala' }] })),
  );
});
afterEach(() => { cleanup(); server.resetHandlers(); vi.useRealTimers(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><FinancePage /></QueryClientProvider>);
  return client;
}

describe('Finance views', () => {
  it('uses /finance for indicators and payment methods', async () => {
    renderPage();
    expect(await screen.findByText('$ 100')).toBeVisible();
    fireEvent.click(screen.getByText('Configuración · Administrar medios de pago'));
    expect(await screen.findByRole('heading', { name: 'Medios de pago' })).toBeVisible();
    expect(screen.getByText('Efectivo')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Ingresos' })).not.toBeInTheDocument();
  });

  it('shows readable income and hides the clinical income action for view=income', async () => {
    navigation.search = 'view=income';
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Ingresos' })).toBeVisible();
    expect(await screen.findByText('14/10/2026')).toBeVisible();
    expect(screen.getByText('Juan Pérez')).toBeVisible();
    expect(screen.getByText('Transferencia')).toBeVisible();
    expect(screen.getByText('Sala', { exact: true })).toBeVisible();
    expect(screen.queryByText('SALA', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nuevo ingreso clínico' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Medios de pago' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ingresos' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows the expense list for view=expenses', async () => {
    navigation.search = 'view=expenses';
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Gastos' })).toBeVisible();
    expect(await screen.findByText('14/10/2026')).toBeVisible();
    expect(screen.getByText('Transferencia')).toBeVisible();
    expect(screen.getByText('$ 250.000')).toBeVisible();
    expect(screen.getByText('General', { selector: 'span' })).toBeVisible();
    expect(screen.getByText('Local de Sala')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Nuevo ingreso clínico' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gastos' })).toHaveAttribute('aria-current', 'page');
  });
});

it('loads selected Persona and Sala payments before filtered income', async () => {
  navigation.search = 'view=income&personId=person-1';
  let requestedPerson: string | null = null;
  server.use(
    http.get('http://localhost:3000/api/people/person-1', () => HttpResponse.json({ data: { id: 'person-1', firstName: 'Lucía', lastName: 'Ejemplo', dni: '88000002' } })),
    http.get('http://localhost:3000/api/sala/participations/person/person-1', () => HttpResponse.json({ data: [{ endDate: null, plan: { id: 'plan', name: '2 veces', monthlyAmount: '10000' } }] })),
    http.get('http://localhost:3000/api/sala/people/person-1/payments', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/finance/income', ({ request }) => { requestedPerson = new URL(request.url).searchParams.get('personId'); return HttpResponse.json({ data: [] }); }),
  );
  renderPage();
  expect(await screen.findByText('Lucía Ejemplo')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Pago de Sala' })).toBeVisible();
  expect(screen.getByText('DNI 88000002')).toBeVisible();
  expect(await screen.findByLabelText('Fecha de cobro')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Volver a la ficha de Sala' })).toHaveAttribute('href', '/sala/people/person-1');
  expect(screen.getByRole('link', { name: 'Cambiar alumno' })).toHaveAttribute('href', '/finance?view=income');
  expect(screen.getByText(/Plan actual:/)).toHaveTextContent('2 veces');
  expect(screen.getByText(/Precio actual del Plan:/)).toHaveTextContent('$10.000');
  expect(requestedPerson).toBe('person-1');
});
it.each([['invalid', 400], ['missing', 404]])('keeps Finance usable when Persona is %s', async (personId, status) => {
  navigation.search = `view=income&personId=${personId}`;
  server.use(http.get(`http://localhost:3000/api/people/${personId}`, () => HttpResponse.json({ message: 'Persona inválida' }, { status })));
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('La Persona seleccionada no existe o no pudo cargarse.');
  expect(screen.getByRole('heading', { name: 'Ingresos' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument();
});
it('does not load a payment context without management permission', async () => {
  navigation.search = 'view=income&personId=person-1';
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: ['FINANCE_OPERATIONAL_READ'] } })));
  renderPage();
  expect(await screen.findByRole('heading', { name: 'Ingresos' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Pago de Sala' })).not.toBeInTheDocument();
});

it('searches active Sala students by name, surname and formatted DNI using the existing endpoint', async () => {
  navigation.search = 'view=income';
  let reads = 0;
  server.use(http.get('http://localhost:3000/api/sala/students', () => {
    reads++;
    return HttpResponse.json({ data: [
      { id: 'student-1', firstName: 'Lucía', lastName: 'Ejemplo', dni: '88000002', plan: { name: 'Plan Base' }, paymentStatus: 'PENDING' },
      { id: 'student-2', firstName: 'Pedro', lastName: 'Prueba', dni: '88000003', plan: { name: 'Plan Completo' }, paymentStatus: 'PAID' },
    ] });
  }));
  renderPage();
  expect(await screen.findByRole('heading', { name: 'Registrar cuota' })).toBeVisible();
  await waitFor(() => expect(reads).toBe(1));
  expect(screen.queryByText('Lucía Ejemplo')).not.toBeInTheDocument();
  const search = screen.getByRole('searchbox', { name: 'Nombre, apellido o DNI' });
  for (const value of ['LUCÍA', 'eJEmPlo', '88.000.002']) {
    fireEvent.change(search, { target: { value } });
    expect(await screen.findByText('Lucía Ejemplo')).toBeVisible();
    expect(screen.getByText('DNI 88000002 · Plan Base')).toBeVisible();
    expect(screen.getByText('Pago pendiente')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Registrar cuota' })).toHaveAttribute('href', '/finance?view=income&personId=student-1');
    expect(screen.queryByText('Pedro Prueba')).not.toBeInTheDocument();
  }
  fireEvent.change(search, { target: { value: '88-000-003' } });
  expect(await screen.findByText('Pedro Prueba')).toBeVisible();
  expect(screen.getByText('Pago registrado')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Ver pagos' })).toHaveAttribute('href', '/finance?view=income&personId=student-2');
  fireEvent.change(search, { target: { value: 'Alumno que no fue retornado' } });
  expect(screen.getByText('No se encontraron alumnos.')).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Registrar cuota' })).not.toBeInTheDocument();
  expect(reads).toBe(1);
});

async function fillExpense(description = '') {
  await screen.findByRole('option', { name: 'Alquiler' });
  await screen.findByRole('option', { name: 'Efectivo' });
  fireEvent.change(screen.getByLabelText('Importe ($ ARS)'), { target: { value: '35000' } });
  fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'rent' } });
  fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'cash' } });
  if (description) fireEvent.change(screen.getByLabelText('Descripción (opcional)'), { target: { value: description } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar gasto' })).toBeEnabled());
}

it('defaults expenses to the operational day and Sala, limits areas and validates required fields', async () => {
  navigation.search = 'view=expenses'; renderPage();
  expect(await screen.findByRole('heading', { name: 'Registrar gasto' })).toBeVisible();
  expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-14');
  expect(screen.getByLabelText('Fecha')).toHaveAttribute('max', todayOperational());
  expect(screen.getByLabelText('Área')).toHaveValue('SALA');
  expect(within(screen.getByLabelText('Área')).getAllByRole('option').map(option => option.textContent)).toEqual(['Sala', 'General']);
  expect(screen.queryByRole('option', { name: 'Clínica' })).not.toBeInTheDocument();
  await fillExpense();
  const button = screen.getByRole('button', { name: 'Registrar gasto' });
  for (const value of ['0', '-1', '2.5', '']) {
    fireEvent.change(screen.getByLabelText('Importe ($ ARS)'), { target: { value } });
    await waitFor(() => expect(button).toBeDisabled());
  }
  fireEvent.change(screen.getByLabelText('Importe ($ ARS)'), { target: { value: '250000' } });
  await waitFor(() => expect(button).toBeEnabled());
  for (const [field, invalid, valid] of [['Fecha', '2026-10-15', '2026-10-14'], ['Categoría', '', 'rent'], ['Medio de pago', '', 'cash']]) {
    fireEvent.change(screen.getByLabelText(field!), { target: { value: invalid } });
    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.change(screen.getByLabelText(field!), { target: { value: valid } });
    await waitFor(() => expect(button).toBeEnabled());
  }
  expect(screen.queryByRole('option', { name: 'Retirada' })).not.toBeInTheDocument();
});

it.each(['', 'Compra de materiales'])('registers an expense with optional description "%s", CSRF and refreshes history', async description => {
  navigation.search = 'view=expenses';
  let submitted: Record<string, unknown> | undefined;
  let csrf: string | null = null;
  let contentType: string | null = null;
  let reads = 0;
  server.use(
    http.get('http://localhost:3000/api/finance/expenses', () => { reads++; return HttpResponse.json({ data: submitted ? [{ ...submitted, id: 'new-expense', category: { name: 'Alquiler' }, paymentMethod: { name: 'Efectivo' } }] : [] }); }),
    http.post('http://localhost:3000/api/finance/expenses', async ({ request }) => { submitted = await request.json() as Record<string, unknown>; csrf = request.headers.get('x-csrf-token'); contentType = request.headers.get('content-type'); return HttpResponse.json({ data: submitted }, { status: 201 }); }),
  );
  const client = renderPage(); const invalidate = vi.spyOn(client, 'invalidateQueries');
  await fillExpense(description);
  fireEvent.click(screen.getByRole('button', { name: 'Registrar gasto' }));
  expect(await screen.findByText('Gasto registrado correctamente.')).toBeVisible();
  expect(submitted).toEqual({ cashDate: '2026-10-14', amount: '35000', categoryId: 'rent', paymentMethodId: 'cash', area: 'SALA', ...(description ? { description } : {}), operationId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) });
  expect(csrf).toBe('csrf'); expect(contentType).toBe('application/json');
  await waitFor(() => expect(reads).toBe(2));
  expect(await screen.findByText('$ 35.000')).toBeVisible();
  expect(screen.getByText('Alquiler', { selector: 'span' })).toBeVisible();
  expect(screen.getByText('Efectivo', { selector: 'span' })).toBeVisible();
  expect(screen.getByLabelText('Importe ($ ARS)')).toHaveValue('');
  expect(screen.getByLabelText('Descripción (opcional)')).toHaveValue('');
  expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-14');
  expect(screen.getByLabelText('Área')).toHaveValue('SALA');
  for (const key of ['expenses', 'totals', 'executive-totals']) expect(invalidate).toHaveBeenCalledWith({ queryKey: ['finance', key] });
});

it('retains the expense operationId on retry, changes it after edits and after success', async () => {
  navigation.search = 'view=expenses';
  const submissions: Array<Record<string, unknown>> = [];
  server.use(http.post('http://localhost:3000/api/finance/expenses', async ({ request }) => {
    submissions.push(await request.json() as Record<string, unknown>);
    return submissions.length <= 2 ? HttpResponse.json({ message: 'No se pudo confirmar el gasto.' }, { status: 503 }) : HttpResponse.json({ data: {} }, { status: 201 });
  }));
  renderPage(); await fillExpense();
  const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Registrar gasto' }));
  submit(); await screen.findByText('No se pudo confirmar el gasto.');
  submit(); await waitFor(() => expect(submissions).toHaveLength(2));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar gasto' })).toBeEnabled());
  expect(submissions[1]).toEqual(submissions[0]);
  fireEvent.change(screen.getByLabelText('Descripción (opcional)'), { target: { value: 'Corregido' } });
  submit(); await screen.findByText('Gasto registrado correctamente.');
  expect(submissions[2]!.operationId).not.toBe(submissions[1]!.operationId);
  await fillExpense(); submit();
  await waitFor(() => expect(submissions).toHaveLength(4));
  expect(submissions[3]!.operationId).not.toBe(submissions[2]!.operationId);
});

it('creates the first selectable category in context and allows expense entry to continue', async () => {
  navigation.search = 'view=expenses';
  let created = false; let reads = 0; let categoryCsrf: string | null = null;
  server.use(
    http.get('http://localhost:3000/api/finance/expense-categories', () => { reads++; return HttpResponse.json({ data: created ? [{ id: 'rent', name: 'Alquiler', isSelectable: true }] : [] }); }),
    http.post('http://localhost:3000/api/finance/expense-categories', async ({ request }) => { expect(await request.json()).toEqual({ name: 'Alquiler' }); categoryCsrf = request.headers.get('x-csrf-token'); created = true; return HttpResponse.json({ data: { id: 'rent', name: 'Alquiler', isSelectable: true } }, { status: 201 }); }),
  );
  renderPage();
  expect(await screen.findByText('No hay categorías de gastos configuradas.')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Alquiler' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));
  await screen.findByRole('option', { name: 'Alquiler' });
  await waitFor(() => expect(screen.getByLabelText('Categoría')).toHaveValue('rent'));
  expect(categoryCsrf).toBe('csrf'); expect(reads).toBe(2);
  await fillExpense();
  expect(screen.queryByRole('button', { name: 'Crear categoría' })).not.toBeInTheDocument();
});

it('guides users to payment method configuration and excludes retired methods', async () => {
  navigation.search = 'view=expenses';
  server.use(http.get('http://localhost:3000/api/finance/payment-methods', () => HttpResponse.json({ data: [{ id: 'retired', name: 'Retirado', isSelectable: false }] })));
  renderPage();
  expect(await screen.findByText(/No hay medios de pago configurados/)).toBeVisible();
  expect(screen.getByRole('link', { name: /Ir a Resumen/ })).toHaveAttribute('href', '/finance');
  expect(screen.queryByRole('option', { name: 'Retirado' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Registrar gasto' })).toBeDisabled();
});

it('preserves expense history without creation permissions and translates clinical historical areas', async () => {
  navigation.search = 'view=expenses';
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: ['EXPENSE_HISTORY_READ'] } })),
    http.get('http://localhost:3000/api/finance/expenses', () => HttpResponse.json({ data: [{ id: 'clinical', cashDate: '2026-10-01T00:00:00.000Z', area: 'CLINIC', amount: '2000', category: { name: 'Materiales' }, paymentMethod: { name: 'Efectivo' } }] })),
  );
  renderPage();
  expect(await screen.findByText('Materiales')).toBeVisible();
  expect(screen.getByText('Clínica')).toBeVisible();
  expect(screen.getByText('01/10/2026')).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Registrar gasto' })).not.toBeInTheDocument();
});

it('does not fetch students or expose registration without SALA_PAYMENT_MANAGE', async () => {
  navigation.search = 'view=income'; let reads = 0;
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: ['FINANCE_OPERATIONAL_READ'] } })),
    http.get('http://localhost:3000/api/sala/students', () => { reads++; return HttpResponse.json({ data: [] }); }),
  );
  renderPage(); await screen.findByRole('heading', { name: 'Ingresos' });
  expect(screen.queryByRole('heading', { name: 'Registrar cuota' })).not.toBeInTheDocument();
  expect(reads).toBe(0);
});

it('does not offer category creation without catalog permission', async () => {
  navigation.search = 'view=expenses';
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: ['EXPENSE_CREATE', 'EXPENSE_HISTORY_READ'] } })),
    http.get('http://localhost:3000/api/finance/expense-categories', () => HttpResponse.json({ data: [{ id: 'old', name: 'Retirada', isSelectable: false }] })),
  );
  renderPage();
  expect(await screen.findByText('No hay categorías de gastos configuradas.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Crear categoría' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Registrar gasto' })).toBeDisabled();
});
