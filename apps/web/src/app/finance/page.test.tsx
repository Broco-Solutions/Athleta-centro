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
const session = { user: { id: 'admin', firstName: 'Admin', lastName: 'Test' }, roles: ['GENERAL_ADMIN'], permissions: ['FINANCE_OPERATIONAL_READ', 'FINANCE_EXECUTIVE_READ', 'PAYMENT_METHOD_CATALOG_MANAGE', 'SALA_PAYMENT_MANAGE', 'SALA_PAYMENT_REGISTER', 'EXPENSE_CREATE', 'EXPENSE_HISTORY_READ', 'EXPENSE_CATEGORY_CATALOG_MANAGE'], csrfToken: 'csrf', mustChangePassword: false };

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
    http.get('http://localhost:3000/api/finance/income', () => HttpResponse.json({ data: [{ id: 'income', cashDate: '2026-10-14', source: 'SALA', amount: '60', registeredBy: { id: 'collector', firstName: 'Admin', lastName: 'Test' }, person: { id: 'person-1', firstName: 'Juan', lastName: 'Pérez' }, paymentMethod: { id: 'transfer', name: 'Transferencia' } }] })),
    http.get('http://localhost:3000/api/finance/expenses', () => HttpResponse.json({ data: [{ id: 'expense', cashDate: '2026-10-14', area: 'GENERAL', amount: '250000', category: { name: 'Alquiler' }, paymentMethod: { id: 'transfer', name: 'Transferencia' }, description: 'Local de Sala' }] })),
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
    expect(await within(await screen.findByRole('region', { name: 'Indicadores financieros' })).findByText('$ 60')).toBeVisible();
    const indicators = within(screen.getByRole('region', { name: 'Indicadores financieros' }));
    expect(indicators.queryByText('Clínica')).not.toBeInTheDocument();
    for (const label of ['Ingresos', 'Gastos', 'Resultado']) expect(indicators.getByText(label)).toBeVisible();
    expect(indicators.getByRole('link', { name: 'Ver ingresos' })).toHaveAttribute('href', '/finance?view=income');
    expect(indicators.getByRole('link', { name: 'Ver gastos' })).toHaveAttribute('href', '/finance?view=expenses');
    expect(indicators.queryByRole('link', { name: /resultado/i })).not.toBeInTheDocument();
    expect(indicators.getAllByRole('link')).toHaveLength(2);
    fireEvent.click(screen.getByText('Configuración · Administrar medios de pago'));
    expect(await screen.findByRole('heading', { name: 'Medios de pago' })).toBeVisible();
    expect(screen.getAllByText('Efectivo').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Ingresos' })).not.toBeInTheDocument();
  });

  it('shows readable income and hides the clinical income action for view=income', async () => {
    navigation.search = 'view=income';
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Historial de ingresos' })).toBeVisible();
    expect(await screen.findByText('14/10/2026')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Ingresos' })).toBeVisible();
    expect(screen.getByRole('button', { name: '+ Registrar pago' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('heading', { name: 'Vigencia de Sala' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sin vigencia|Vigentes/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Juan Pérez' })).toHaveAttribute('href', '/finance?view=income&personId=person-1');
    expect(screen.queryByRole('link', { name: /Admin Test/ })).not.toBeInTheDocument();
    expect(screen.getByText('Registrado por: Admin Test')).toBeVisible();
    expect(screen.getByText('$ 60')).toBeVisible();
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
    expect(await screen.findByRole('button', { name: '+ Registrar gasto' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('heading', { name: 'Registrar gasto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registros' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Registros' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Registros de gastos' })).toBeVisible();
    expect(await screen.findByText('14/10/2026')).toBeVisible();
    expect(screen.getByText('Transferencia')).toBeVisible();
    expect(screen.getByText('$ 250.000')).toBeVisible();
    expect(screen.getByText('General', { selector: 'span' })).toBeVisible();
    expect(screen.getByText('Local de Sala')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Nuevo ingreso clínico' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gastos' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByText(/Registrado por:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Registrar gasto' }));
    expect(screen.getByRole('button', { name: 'Cerrar formulario' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'Registrar gasto' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Registros de gastos' })).toBeVisible();
    expect(screen.getByText('Local de Sala')).toBeVisible();
  });
});

it.each(['renew', null])('concentrates payment context with action=%s and keeps history visible', async action => {
  navigation.search = `view=income&personId=person-1${action ? '&action=renew' : ''}`;
  let incomeReads = 0;
  server.use(
    http.get('http://localhost:3000/api/sala/plans', () => HttpResponse.json({ data: [{ id: 'plan', name: '2 veces', monthlyAmount: '10000' }] })),
    http.get('http://localhost:3000/api/people/person-1', () => HttpResponse.json({ data: { id: 'person-1', firstName: 'Lucía', lastName: 'Ejemplo', dni: '88000002' } })),
    http.get('http://localhost:3000/api/sala/participations/person/person-1', () => HttpResponse.json({ data: [{ endDate: null, plan: { id: 'plan', name: '2 veces', monthlyAmount: '10000' } }] })),
    http.get('http://localhost:3000/api/sala/people/person-1/payments', () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/finance/income', () => { incomeReads++; return HttpResponse.json({ data: [] }); }),
  );
  renderPage();
  expect(await screen.findByText('Lucía Ejemplo')).toBeVisible();
  await screen.findByRole('button', { name: '+ Registrar renovación' });
  expect(screen.getByRole('button', { name: '+ Registrar renovación' })).toHaveAttribute('aria-expanded', String(action === 'renew'));
  expect(screen.getByText('DNI 88000002')).toBeVisible();
  if (action === 'renew') expect(await screen.findByLabelText('Fecha de cobro')).toBeVisible();
  else expect(screen.queryByLabelText('Fecha de cobro')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ver ficha' })).toHaveAttribute('href', '/sala/people/person-1');
  expect(screen.getByRole('link', { name: 'Cambiar alumno' })).toHaveAttribute('href', '/finance?view=income');
  expect(screen.getByRole('heading', { name: 'Finanzas', level: 1 })).toBeVisible();
  expect(screen.getAllByText('2 veces').length).toBeGreaterThan(0);
  expect(screen.getByText('Precio actual: $10.000 / mes')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Historial de pagos' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Historial de ingresos' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '+ Registrar pago' })).not.toBeInTheDocument();
  expect(incomeReads).toBe(0);
});
it.each([['invalid', 400], ['missing', 404]])('keeps Finance usable when Persona is %s', async (personId, status) => {
  navigation.search = `view=income&personId=${personId}`;
  server.use(http.get(`http://localhost:3000/api/people/${personId}`, () => HttpResponse.json({ message: 'Persona inválida' }, { status })));
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('La Persona seleccionada no existe o no pudo cargarse.');
  expect(screen.getByRole('heading', { name: 'Finanzas', level: 1 })).toBeVisible();
  expect(screen.queryByRole('button', { name: /^Registrar pago/ })).not.toBeInTheDocument();
});
it('does not load a payment context without management permission', async () => {
  navigation.search = 'view=income&personId=person-1';
  server.use(http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: ['FINANCE_OPERATIONAL_READ'] } })));
  renderPage();
  expect(await screen.findByRole('heading', { name: 'Finanzas', level: 1 })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Registrar renovación' })).not.toBeInTheDocument();
});

it('searches active Sala students by name, surname and formatted DNI using the existing endpoint', async () => {
  navigation.search = 'view=income';
  let reads = 0;
  server.use(http.get('http://localhost:3000/api/sala/students', () => {
    reads++;
    return HttpResponse.json({ data: [
      { id: 'student-1', firstName: 'Lucía', lastName: 'Ejemplo', dni: '88000002', plan: { name: 'Plan Base' }, hasValidAccess: false, validUntil: null, lastPaymentPaidAt: null },
      { id: 'student-2', firstName: 'Pedro', lastName: 'Prueba', dni: '88000003', plan: { name: 'Plan Completo' }, hasValidAccess: true, validUntil: '2026-11-20', lastPaymentPaidAt: '2026-10-16' },
    ] });
  }));
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: '+ Registrar pago' }));
  expect(await screen.findByRole('heading', { name: 'Vigencia de Sala' })).toBeVisible();
  await waitFor(() => expect(reads).toBe(1));
  expect(await screen.findByText('Lucía Ejemplo')).toBeVisible();
  expect(screen.queryByText('Pedro Prueba')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sin vigencia 1', pressed: true })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Vigentes 1', pressed: false })).toBeVisible();
  const search = screen.getByRole('searchbox', { name: 'Nombre, apellido o DNI' });
  for (const value of ['LUCÍA', 'eJEmPlo', 'Lucía Ejemplo', '88000002', '88.000.002', '88 000 002', '88-000-002']) {
    fireEvent.change(search, { target: { value } });
    expect(await screen.findByText('Lucía Ejemplo')).toBeVisible();
    expect(screen.getByText('DNI 88000002 · Plan Base')).toBeVisible();
    expect(screen.getByText('Sin vigencia')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Renovar' })).toHaveAttribute('href', '/finance?view=income&personId=student-1&action=renew');
    expect(screen.queryByText('Pedro Prueba')).not.toBeInTheDocument();
  }
  fireEvent.click(screen.getByRole('button', { name: 'Vigentes 1' }));
  expect(screen.queryByText('Lucía Ejemplo')).not.toBeInTheDocument();
  expect(screen.queryByText('Pedro Prueba')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Vigentes 1', pressed: true })).toBeVisible();
  fireEvent.change(search, { target: { value: '88-000-003' } });
  expect(await screen.findByText('Pedro Prueba')).toBeVisible();
  expect(screen.getByText('Vigente hasta 20/11/2026')).toBeVisible();
  expect(screen.getByText('Fecha de cobro: 16/10/2026')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Ver pagos' })).toHaveAttribute('href', '/finance?view=income&personId=student-2');
  fireEvent.change(search, { target: { value: 'Alumno que no fue retornado' } });
  expect(screen.getByText('No se encontraron alumnos.')).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Renovar' })).not.toBeInTheDocument();
  expect(reads).toBe(1);
});

function expenseSubmit() {
  return within(screen.getByRole('heading', { name: 'Registrar gasto' }).closest('section')!).getByRole('button', { name: 'Registrar gasto' });
}

async function openExpenseForm() {
  fireEvent.click(await screen.findByRole('button', { name: '+ Registrar gasto' }));
}

async function fillExpense(description = '') {
  if (!screen.queryByRole('heading', { name: 'Registrar gasto' })) await openExpenseForm();
  await screen.findByRole('option', { name: 'Alquiler' });
  await screen.findByRole('option', { name: 'Efectivo' });
  fireEvent.change(screen.getByLabelText('Importe ($ ARS)'), { target: { value: '35000' } });
  fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'rent' } });
  fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'cash' } });
  if (description) fireEvent.change(screen.getByLabelText('Descripción (opcional)'), { target: { value: description } });
  await waitFor(() => expect(expenseSubmit()).toBeEnabled());
}

it('uses the primary style for registering an expense and secondary when closing the form', async () => {
  navigation.search = 'view=expenses'; renderPage();
  const register = await screen.findByRole('button', { name: '+ Registrar gasto' });
  expect(register).toHaveClass('bg-primary');
  expect(register).toHaveAttribute('aria-expanded', 'false');
  expect(register).toHaveAttribute('aria-controls', 'expense-registration-form');
  fireEvent.click(register);
  const close = screen.getByRole('button', { name: 'Cerrar formulario' });
  expect(close).not.toHaveClass('bg-primary');
  expect(close).toHaveClass('bg-white');
  expect(close).toHaveAttribute('aria-expanded', 'true');
});

it('defaults expenses to the operational day and Sala, limits areas and validates required fields', async () => {
  navigation.search = 'view=expenses'; renderPage();
  await openExpenseForm();
  expect(await screen.findByRole('heading', { name: 'Registrar gasto' })).toBeVisible();
  expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-14');
  expect(screen.getByLabelText('Fecha')).toHaveAttribute('max', todayOperational());
  expect(screen.getByLabelText('Área')).toHaveValue('SALA');
  expect(within(screen.getByLabelText('Área')).getAllByRole('option').map(option => option.textContent)).toEqual(['Sala', 'General']);
  expect(screen.queryByRole('option', { name: 'Clínica' })).not.toBeInTheDocument();
  await fillExpense();
  const button = expenseSubmit();
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
  fireEvent.click(expenseSubmit());
  expect(await screen.findByText('Gasto registrado correctamente.')).toBeVisible();
  expect(submitted).toEqual({ cashDate: '2026-10-14', amount: '35000', categoryId: 'rent', paymentMethodId: 'cash', area: 'SALA', ...(description ? { description } : {}), operationId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) });
  expect(csrf).toBe('csrf'); expect(contentType).toBe('application/json');
  expect(screen.getByRole('button', { name: '+ Registrar gasto' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('heading', { name: 'Registrar gasto' })).not.toBeInTheDocument();
  for (const key of ['expenses', 'totals', 'executive-totals']) expect(invalidate).toHaveBeenCalledWith({ queryKey: ['finance', key] });
  expect(await screen.findByText('$ 35.000')).toBeVisible();
  expect(screen.getByText('Alquiler', { selector: 'span' })).toBeVisible();
  expect(screen.getByText('Efectivo', { selector: 'span' })).toBeVisible();
  expect(reads).toBe(2);
  await openExpenseForm();
  expect(screen.queryByText('Gasto registrado correctamente.')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Importe ($ ARS)')).toHaveValue('');
  expect(screen.getByLabelText('Descripción (opcional)')).toHaveValue('');
  expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-14');
  expect(screen.getByLabelText('Área')).toHaveValue('SALA');
});

it('retains the expense operationId on retry, changes it after edits and after success', async () => {
  navigation.search = 'view=expenses';
  const submissions: Array<Record<string, unknown>> = [];
  server.use(http.post('http://localhost:3000/api/finance/expenses', async ({ request }) => {
    submissions.push(await request.json() as Record<string, unknown>);
    return submissions.length <= 2 ? HttpResponse.json({ message: 'No se pudo confirmar el gasto.' }, { status: 503 }) : HttpResponse.json({ data: {} }, { status: 201 });
  }));
  renderPage(); await fillExpense();
  const submit = () => fireEvent.click(expenseSubmit());
  submit(); await screen.findByText('No se pudo confirmar el gasto.');
  submit(); await waitFor(() => expect(submissions).toHaveLength(2));
  await waitFor(() => expect(expenseSubmit()).toBeEnabled());
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
  await openExpenseForm();
  expect(await screen.findByText('No hay categorías de gastos configuradas.')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Nombre de la categoría'), { target: { value: 'Alquiler' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
  await screen.findByRole('option', { name: 'Alquiler' });
  await waitFor(() => expect(screen.getByLabelText('Categoría')).toHaveValue('rent'));
  expect(categoryCsrf).toBe('csrf'); expect(reads).toBe(2);
  await fillExpense();
  expect(screen.queryByRole('button', { name: 'Crear' })).not.toBeInTheDocument();
});

it('guides users to payment method configuration and excludes retired methods', async () => {
  navigation.search = 'view=expenses';
  server.use(http.get('http://localhost:3000/api/finance/payment-methods', () => HttpResponse.json({ data: [{ id: 'retired', name: 'Retirado', isSelectable: false }] })));
  renderPage();
  await openExpenseForm();
  expect(await screen.findByText(/No hay medios de pago configurados/)).toBeVisible();
  expect(screen.getByRole('link', { name: /Ir a Resumen/ })).toHaveAttribute('href', '/finance');
  expect(screen.queryByRole('option', { name: 'Retirado' })).not.toBeInTheDocument();
  expect(expenseSubmit()).toBeDisabled();
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
  expect(screen.queryByRole('button', { name: '+ Registrar gasto' })).not.toBeInTheDocument();
});

it('does not fetch students or expose registration without SALA_PAYMENT_MANAGE', async () => {
  navigation.search = 'view=income'; let reads = 0;
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: ['FINANCE_OPERATIONAL_READ'] } })),
    http.get('http://localhost:3000/api/sala/students', () => { reads++; return HttpResponse.json({ data: [] }); }),
  );
  renderPage(); await screen.findByRole('heading', { name: 'Historial de ingresos' });
  expect(screen.queryByRole('heading', { name: 'Vigencia de Sala' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '+ Registrar pago' })).not.toBeInTheDocument();
  expect(reads).toBe(0);
});

it('does not offer category creation without catalog permission', async () => {
  navigation.search = 'view=expenses';
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: ['EXPENSE_CREATE', 'EXPENSE_HISTORY_READ'] } })),
    http.get('http://localhost:3000/api/finance/expense-categories', () => HttpResponse.json({ data: [{ id: 'old', name: 'Retirada', isSelectable: false }] })),
  );
  renderPage();
  await openExpenseForm();
  expect(await screen.findByText('No hay categorías de gastos configuradas.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Crear' })).not.toBeInTheDocument();
  expect(expenseSubmit()).toBeDisabled();
});

it('keeps operational indicators without exposing executive net or clinical breakdown', async () => {
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: ['ADMINISTRATIVE'], permissions: ['FINANCE_OPERATIONAL_READ'] } })),
    http.get('http://localhost:3000/api/finance/totals', () => HttpResponse.json({ data: { totalIncome: '100', salaIncome: '60', clinicalIncome: '40', expenses: '20' } })),
  );
  renderPage(); await screen.findByRole('region', { name: 'Indicadores financieros' });
  const indicators = within(screen.getByRole('region', { name: 'Indicadores financieros' }));
  for (const label of ['Ingresos', 'Gastos']) expect(indicators.getByText(label)).toBeVisible();
  for (const label of ['Clínica', 'Resultado', 'Neto']) expect(indicators.queryByText(label)).not.toBeInTheDocument();
});

it('shows only current pending fees in summary with direct collection links', async () => {
  server.use(http.get('http://localhost:3000/api/sala/students', () => HttpResponse.json({ data: [
    { id: 'pending', firstName: 'Ana', lastName: 'Pendiente', dni: '88000001', plan: { name: 'Plan Base' }, hasValidAccess: false, validUntil: null, lastPaymentPaidAt: null },
    { id: 'paid', firstName: 'Pedro', lastName: 'Pagado', dni: '88000002', plan: { name: 'Plan Base' }, hasValidAccess: true, validUntil: '2026-11-20', lastPaymentPaidAt: '2026-10-16' },
  ] })));
  renderPage();
  const pending = within(await screen.findByRole('region', { name: 'Estado actual de Sala' }));
  expect(await pending.findByText('Ana Pendiente')).toBeVisible();
  expect(pending.getByText('Alumnos sin vigencia: 1')).toBeVisible();
  expect(pending.queryByText('Pedro Pagado')).not.toBeInTheDocument();
  expect(pending.getByRole('link', { name: 'Renovar' })).toHaveAttribute('href', '/finance?view=income&personId=pending&action=renew');
  expect(screen.getByRole('region', { name: 'Indicadores financieros' })).toBeVisible();
  expect(screen.getByText('Configuración · Administrar medios de pago')).toBeVisible();
});
it('shows an empty pending state for the operational period', async () => {
  renderPage();
  expect(await screen.findByText('Todos los alumnos tienen vigencia actualmente.')).toBeVisible();
});

it.each([true, false])('filters summary periods, aggregates methods and gates executive results (%s)', async executive => {
  const incomeUrls: URL[] = []; const expenseUrls: URL[] = []; const studentUrls: URL[] = [];
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: session.permissions.filter(permission => executive || permission !== 'FINANCE_EXECUTIVE_READ') } })),
    http.get('http://localhost:3000/api/finance/payment-methods', () => HttpResponse.json({ data: [{ id: 'cash', name: 'Efectivo', isSelectable: true }, { id: 'transfer', name: 'Transferencia', isSelectable: true }, { id: 'card', name: 'Tarjeta', isSelectable: true }] })),
    http.get('http://localhost:3000/api/finance/income', ({ request }) => { incomeUrls.push(new URL(request.url)); return HttpResponse.json({ data: [{ amount: '320000', paymentMethod: { id: 'cash', name: 'Efectivo' } }, { amount: '480000', paymentMethod: { id: 'transfer', name: 'Transferencia' } }] }); }),
    http.get('http://localhost:3000/api/finance/expenses', ({ request }) => { expenseUrls.push(new URL(request.url)); return HttpResponse.json({ data: [{ amount: '80000', paymentMethod: { id: 'cash', name: 'Efectivo' } }, { amount: '140000', paymentMethod: { id: 'transfer', name: 'Transferencia' } }] }); }),
    http.get('http://localhost:3000/api/sala/students', ({ request }) => { const url = new URL(request.url); studentUrls.push(url); return HttpResponse.json({ data: [{ id: 'sept', firstName: 'Septiembre', lastName: 'Pendiente', plan: { name: 'Base' }, hasValidAccess: false, validUntil: null }] }); }),
  );
  renderPage();
  await screen.findByRole('heading', { name: 'Finanzas', level: 1 });
  const buttons = ['Este mes', 'Mes anterior', 'Este año', 'Total', 'Personalizado'];
  for (const name of buttons) expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', String(name === 'Este mes'));
  expect(await screen.findByText('Octubre de 2026')).toBeVisible();
  await waitFor(() => expect(incomeUrls.length).toBeGreaterThan(0));
  expect(incomeUrls.at(-1)?.searchParams.get('from')).toBe('2026-10-01');
  expect(incomeUrls.at(-1)?.searchParams.get('to')).toBe('2026-10-31');
  expect(incomeUrls.at(-1)?.searchParams.get('area')).toBe('SALA');
  expect(expenseUrls.at(-1)?.searchParams.get('from')).toBe('2026-10-01');
  expect(expenseUrls.at(-1)?.searchParams.get('to')).toBe('2026-10-31');
  await screen.findByText('$ 800.000');
  const indicators = within(screen.getByRole('region', { name: 'Indicadores financieros' }));
  expect(Boolean(indicators.queryByText('Resultado'))).toBe(executive);
  const table = within(screen.getByRole('table', { name: 'Movimientos por medio de pago' }));
  const cash = within(table.getByRole('rowheader', { name: 'Efectivo' }).closest('tr')!);
  expect(cash.getByText('$ 320.000')).toBeVisible(); expect(cash.getByText('$ 80.000')).toBeVisible();
  expect(Boolean(cash.queryByText('$ 240.000'))).toBe(executive);
  const transfer = within(table.getByRole('rowheader', { name: 'Transferencia' }).closest('tr')!);
  expect(transfer.getByText('$ 480.000')).toBeVisible(); expect(transfer.getByText('$ 140.000')).toBeVisible();
  expect(Boolean(table.queryByRole('columnheader', { name: 'Neto' }))).toBe(executive);
  expect(within(table.getByRole('rowheader', { name: 'Tarjeta' }).closest('tr')!).getAllByText('$ 0')).toHaveLength(executive ? 3 : 2);
  const initialStudentReads = studentUrls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
  expect(await screen.findByText('Septiembre Pendiente')).toBeVisible();
  expect(screen.getByText('Septiembre de 2026')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Mes anterior' })).toHaveAttribute('aria-pressed', 'true');
  await waitFor(() => expect(incomeUrls.at(-1)?.searchParams.get('from')).toBe('2026-09-01'));
  expect(incomeUrls.at(-1)?.searchParams.get('to')).toBe('2026-09-30'); expect(incomeUrls.at(-1)?.searchParams.get('area')).toBe('SALA');
  expect(expenseUrls.at(-1)?.searchParams.get('from')).toBe('2026-09-01'); expect(expenseUrls.at(-1)?.searchParams.get('to')).toBe('2026-09-30');
  fireEvent.click(screen.getByRole('button', { name: 'Este año' }));
  await waitFor(() => expect(incomeUrls.at(-1)?.searchParams.get('from')).toBe('2026-01-01'));
  expect(incomeUrls.at(-1)?.searchParams.get('to')).toBe(todayOperational());
  expect(expenseUrls.at(-1)?.searchParams.get('from')).toBe('2026-01-01');
  expect(expenseUrls.at(-1)?.searchParams.get('to')).toBe(todayOperational());
  expect(screen.getByText('2026')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Total' }));
  await waitFor(() => expect(incomeUrls.at(-1)?.searchParams.get('area')).toBe('SALA'));
  expect(incomeUrls.at(-1)?.searchParams.has('from')).toBe(false);
  expect(incomeUrls.at(-1)?.searchParams.has('to')).toBe(false);
  expect(expenseUrls.at(-1)?.searchParams.has('from')).toBe(false);
  expect(expenseUrls.at(-1)?.searchParams.has('to')).toBe(false);
  expect(screen.getByText('Todo el historial')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Personalizado' }));
  expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-01');
  expect(screen.getByLabelText('Hasta')).toHaveValue(todayOperational());
  expect(screen.getByLabelText('Hasta')).toHaveAttribute('max', todayOperational());
  const beforeDraft = incomeUrls.length;
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-07-01' } });
  fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-30' } });
  expect(incomeUrls).toHaveLength(beforeDraft);
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
  await waitFor(() => expect(incomeUrls.at(-1)?.searchParams.get('from')).toBe('2026-07-01'));
  expect(incomeUrls.at(-1)?.searchParams.get('to')).toBe('2026-09-30');
  expect(incomeUrls.at(-1)?.searchParams.get('area')).toBe('SALA');
  expect(expenseUrls.at(-1)?.searchParams.get('from')).toBe('2026-07-01');
  expect(expenseUrls.at(-1)?.searchParams.get('to')).toBe('2026-09-30');
  expect(screen.getByText('01/07/2026 — 30/09/2026')).toBeVisible();
  expect(studentUrls).toHaveLength(initialStudentReads);
  expect(studentUrls.every(url => !url.searchParams.has('from') && !url.searchParams.has('to') && !url.searchParams.has('year') && !url.searchParams.has('month'))).toBe(true);
  expect(screen.getByRole('region', { name: 'Estado actual de Sala' })).toBeVisible();
});

it('rejects invalid custom ranges without requesting them', async () => {
  const incomeUrls: URL[] = [];
  server.use(http.get('http://localhost:3000/api/finance/income', ({ request }) => { incomeUrls.push(new URL(request.url)); return HttpResponse.json({ data: [] }); }));
  renderPage();
  await screen.findByRole('heading', { name: 'Finanzas', level: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Personalizado' }));
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-20' } });
  fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-10' } });
  await waitFor(() => expect(incomeUrls.at(-1)?.searchParams.get('from')).toBe('2026-10-01'));
  const requestCount = incomeUrls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('La fecha Desde no puede ser posterior a Hasta.');
  expect(incomeUrls).toHaveLength(requestCount);
});

it.each(['', 'view=income', 'view=expenses', 'view=income&personId=student&action=renew'])('denies Professor direct Finance access without financial requests (%s)', async search => {
  navigation.search = search; const requests = vi.fn();
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, roles: ['PROFESSOR'], permissions: ['SALA_RELATION_READ', 'SALA_ROUTINE_READ', 'SALA_PAYMENT_READ', 'SALA_PAYMENT_REGISTER'] } })),
    http.get('http://localhost:3000/api/finance/:resource', () => { requests(); return HttpResponse.json({ data: [] }); }),
  );
  renderPage();
  expect(await screen.findByText('No tenés permisos para acceder a Finanzas.')).toBeVisible();
  for (const name of ['Indicadores financieros', 'Historial de ingresos', 'Registrar gasto', 'Estado actual de Sala', 'Medios de pago']) expect(screen.queryByText(name)).not.toBeInTheDocument();
  expect(requests).not.toHaveBeenCalled();
});

it('allows expense creation without requesting or showing the expense history', async () => {
  navigation.search = 'view=expenses';
  const historyRead = vi.fn();
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: ['EXPENSE_CREATE'] } })),
    http.get('http://localhost:3000/api/finance/expenses', () => { historyRead(); return HttpResponse.json({ data: [] }); }),
  );
  renderPage();
  await fillExpense();
  expect(screen.getByRole('heading', { name: 'Registrar gasto' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Registros de gastos' })).not.toBeInTheDocument();
  expect(historyRead).not.toHaveBeenCalled();
});

it('opens and closes Sala validity while keeping history visible and defers student loading', async () => {
  navigation.search = 'view=income';
  const studentReads = vi.fn();
  const incomeReads = vi.fn();
  server.use(
    http.get('http://localhost:3000/api/finance/income', () => { incomeReads(); return HttpResponse.json({ data: [] }); }),
    http.get('http://localhost:3000/api/sala/students', () => {
      studentReads();
      return HttpResponse.json({ data: Array.from({ length: 6 }, (_, index) => ({
        id: `student-${index}`, firstName: 'Alumno', lastName: `Sintético ${index}`, dni: `8800000${index}`,
        plan: { name: 'Base' }, hasValidAccess: index >= 2, validUntil: index >= 2 ? '2026-11-20' : null,
      })) });
    }),
  );
  renderPage();
  const toggle = await screen.findByRole('button', { name: '+ Registrar pago' });
  await waitFor(() => expect(incomeReads).toHaveBeenCalled());
  expect(studentReads).not.toHaveBeenCalled();
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(toggle).toHaveAttribute('aria-controls', 'sala-payment-registration');
  expect(toggle).toHaveClass('bg-primary');
  expect(screen.queryByRole('heading', { name: 'Vigencia de Sala' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Historial de ingresos' })).toBeVisible();

  fireEvent.click(toggle);
  expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveAttribute('aria-expanded', 'true');
  expect(toggle).not.toHaveClass('bg-primary');
  expect(toggle).toHaveClass('bg-white');
  expect(screen.getByRole('heading', { name: 'Vigencia de Sala' }).closest('section')).toHaveAttribute('id', 'sala-payment-registration');
  expect(await screen.findByRole('button', { name: 'Sin vigencia 2', pressed: true })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Vigentes 4' })).toBeVisible();
  expect(screen.getByRole('searchbox', { name: 'Nombre, apellido o DNI' })).toBeVisible();
  expect(screen.getAllByRole('searchbox')).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Historial de ingresos' })).toBeVisible();
  expect(studentReads).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Vigentes 4' }));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Sintético 3' } });

  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  expect(screen.queryByRole('heading', { name: 'Vigencia de Sala' })).not.toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Historial de ingresos' })).toBeVisible();
  expect(screen.getByRole('button', { name: '+ Registrar pago' })).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  expect(screen.getByRole('searchbox', { name: 'Nombre, apellido o DNI' })).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Sin vigencia 2', pressed: true })).toBeVisible();
});

it('keeps clinical income names as plain text', async () => {
  navigation.search = 'view=income';
  server.use(http.get('http://localhost:3000/api/finance/income', () => HttpResponse.json({ data: [{
    id: 'clinical-income', cashDate: '2026-10-14', source: 'CLINIC', amount: '100',
    person: { id: 'patient-1', firstName: 'Nombre', lastName: 'Paciente' },
    registeredBy: { id: 'collector', firstName: 'Admin', lastName: 'Test' },
  }] })));
  renderPage();
  expect(await screen.findByText('Nombre Paciente')).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Nombre Paciente' })).not.toBeInTheDocument();
  expect(screen.getByText('Registrado por: Admin Test')).toBeVisible();
});

it('shows income history without payment management controls for operational readers', async () => {
  navigation.search = 'view=income';
  const studentReads = vi.fn();
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: { ...session, permissions: ['FINANCE_OPERATIONAL_READ'] } })),
    http.get('http://localhost:3000/api/sala/students', () => { studentReads(); return HttpResponse.json({ data: [] }); }),
  );
  renderPage();
  expect(await screen.findByText('Juan Pérez')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Historial de ingresos' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '+ Registrar pago' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Vigencia de Sala' })).not.toBeInTheDocument();
  expect(studentReads).not.toHaveBeenCalled();
});

it('shows safe loading and error states in Sala validity', async () => {
  navigation.search = 'view=income';
  let finishRequest!: () => void;
  const pending = new Promise<void>(resolve => { finishRequest = resolve; });
  server.use(http.get('http://localhost:3000/api/sala/students', async () => { await pending; return HttpResponse.json({ message: 'Technical detail' }, { status: 500 }); }));
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: '+ Registrar pago' }));
  const picker = within(screen.getByRole('heading', { name: 'Vigencia de Sala' }).closest('section')!);
  expect(picker.getByRole('status')).toHaveTextContent('Cargando alumnos…');
  finishRequest();
  expect(await picker.findByRole('alert')).toHaveTextContent('No pudimos cargar los alumnos de Sala.');
  expect(picker.queryByText('Technical detail')).not.toBeInTheDocument();
});
