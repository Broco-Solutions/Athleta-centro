import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { SalaPaymentPanel } from './sala-payment-panel';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const personId = '10000000-0000-4000-8000-000000000001';
const methodId = '20000000-0000-4000-8000-000000000001';
const activePlan = { id: '30000000-0000-4000-8000-000000000001', name: 'Plan Base', monthlyAmount: '20000' };
const otherPlan = { id: '30000000-0000-4000-8000-000000000002', name: 'Plan Plus', monthlyAmount: '30000' };
const payment = { id: 'payment', year: 2026, month: 10, paidAt: '2026-10-01', amount: '20000', paymentMethod: { name: 'Efectivo' }, reversal: null };
const baseUrl = 'http://localhost:3000';
const paymentsUrl = `${baseUrl}/api/sala/people/${personId}/payments`;
const planPaymentsUrl = `${baseUrl}/api/sala/payments/plan-months`;

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, baseUrl) : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
  server.use(
    http.get(`${baseUrl}/api/sala/plans`, () => HttpResponse.json({ data: [activePlan, otherPlan] })),
    http.get(paymentsUrl, () => HttpResponse.json({ data: [] })),
    http.get(`${baseUrl}/api/finance/payment-methods`, () => HttpResponse.json({ data: [{ id: methodId, name: 'Efectivo', isSelectable: true }] })),
  );
});
afterEach(() => { cleanup(); server.resetHandlers(); vi.useRealTimers(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

function renderPanel(canManage = true, plan: typeof activePlan | undefined = activePlan, defaultOpen = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><SalaPaymentPanel personId={personId} csrfToken="csrf" canManage={canManage} activePlan={plan} defaultOpen={defaultOpen} /></QueryClientProvider>);
  return client;
}
async function addPeriod(value = '2026-10') {
  if (!screen.queryByRole('button', { name: 'Agregar mes' })) fireEvent.click(screen.getByRole('button', { name: '+ Agregar otro mes' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar mes' })).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mes/Año'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Agregar mes' }));
}
async function selectMethod() {
  fireEvent.click(await screen.findByRole('button', { name: 'Efectivo' }));
  expect(screen.getByRole('button', { name: 'Efectivo' })).toHaveAttribute('aria-pressed', 'true');
}

it('proposes the current Plan price and an editable amount', async () => {
  renderPanel();
  expect(screen.getByText('Cuota mensual · Plan Base')).toBeVisible();
  await screen.findByRole('combobox', { name: /Plan/ });
  expect(screen.getByLabelText('Plan Octubre 2026')).toHaveValue(activePlan.id);
  await screen.findByLabelText('Precio Octubre 2026');
  expect(screen.getByLabelText('Fecha de cobro')).toHaveValue('2026-10-15');
  expect(screen.getByRole('button', { name: /^Registrar pago/ })).toBeDisabled();
  await selectMethod();
  expect(screen.getByRole('button', { name: /^Registrar pago/ })).toBeEnabled();
  expect(screen.getByLabelText('Mes a pagar')).toHaveValue('2026-10');
  expect(screen.getByLabelText('Precio Octubre 2026')).toHaveValue('20000');
  expect(screen.queryByLabelText(/Motivo de ajuste/)).not.toBeInTheDocument();
  expect(within(screen.getByRole('complementary', { name: 'Resumen del cobro' })).getByText('$20.000')).toBeInTheDocument();
});
it('selects several months, prevents repeats, shows their total and allows removal', async () => {
  renderPanel();
  for (const value of ['2026-11', '2026-12']) await addPeriod(value);
  expect(within(screen.getByRole('complementary', { name: 'Resumen del cobro' })).getByText('$60.000')).toBeInTheDocument();
  await addPeriod('2026-10');
  expect(screen.getByRole('alert')).toHaveTextContent('Ese mes ya está seleccionado.');
  expect(screen.getAllByRole('button', { name: /^Quitar / })).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Quitar Noviembre 2026' }));
  expect(screen.queryByText('Noviembre 2026')).not.toBeInTheDocument();
  expect(within(screen.getByRole('complementary', { name: 'Resumen del cobro' })).getByText('$40.000')).toBeInTheDocument();
});
it('allows past and future months without requiring consecutive periods', async () => {
  renderPanel();
  await addPeriod('2020-01'); await addPeriod('2030-06');
  expect(screen.getByText('Enero 2020')).toBeInTheDocument();
  expect(screen.getByText('Junio 2030')).toBeInTheDocument();
});
it('rejects an already paid month using only payments without reversal', async () => {
  server.use(http.get(paymentsUrl, () => HttpResponse.json({ data: [payment] })));
  renderPanel();
  await screen.findByText('Pagado', { selector: 'td' });
  expect(screen.getByText('01/10/2026')).toBeVisible();
  await addPeriod();
  expect(screen.getByRole('alert')).toHaveTextContent('Ese mes ya tiene un pago registrado.');
  expect(screen.getByLabelText('Mes a pagar')).toHaveValue('2026-11');
  expect(screen.getByText('Octubre de 2026 ya está pagado y no se puede volver a cobrar.')).toBeVisible();
  expect(screen.getByLabelText('Precio Noviembre 2026')).toHaveValue('20000');
});
it('allows a reversed month to be selected and does not offer another reversal', async () => {
  server.use(http.get(paymentsUrl, () => HttpResponse.json({ data: [{ ...payment, reversal: { id: 'reversal' } }] })));
  renderPanel();
  await screen.findByText('Revertido', { selector: 'td' });
  expect(screen.queryByRole('button', { name: 'Revertir' })).not.toBeInTheDocument();
  await screen.findByLabelText('Precio Octubre 2026');
  expect(screen.getByRole('button', { name: 'Quitar Octubre 2026' })).toBeInTheDocument();
});
it('sends independent period amounts in one batch, uses Buenos Aires date and clears the form after success', async () => {
  vi.setSystemTime(new Date('2026-10-08T01:00:00Z'));
  let submitted: Record<string, unknown> | undefined;
  let csrf: string | null = null;
  let reads = 0;
  server.use(
    http.get(paymentsUrl, () => { reads++; return HttpResponse.json({ data: submitted ? [10, 11, 12].map(month => ({ ...payment, id: `payment-${month}`, month })) : [] }); }),
    http.post(planPaymentsUrl, async ({ request }) => { submitted = await request.json() as Record<string, unknown>; csrf = request.headers.get('x-csrf-token'); return HttpResponse.json({ data: { months: 3, totalAmount: '60000' } }, { status: 201 }); }),
  );
  renderPanel();
  for (const month of ['2026-11', '2026-12']) await addPeriod(month);
  await selectMethod();
  fireEvent.click(screen.getByRole('button', { name: /^Registrar pago/ }));
  expect(await screen.findByRole('status')).toHaveTextContent('Pagos registrados correctamente.');
  expect(submitted).toEqual({ personId, paidAt: '2026-10-07', paymentMethodId: methodId, periods: [10, 11, 12].map((month) => ({ year: 2026, month, planId: activePlan.id, amount: '20000', adjustmentReason: '', operationId: expect.stringMatching(/^[0-9a-f-]{36}$/) })) });
  expect(new Set((submitted!.periods as Array<{ operationId: string }>).map((period) => period.operationId)).size).toBe(3);
  expect(csrf).toBe('csrf');
  await waitFor(() => expect(screen.getByRole('button', { name: '+ Registrar una cuota' })).toHaveAttribute('aria-expanded', 'false'));
  expect(screen.getByRole('heading', { name: 'Historial de pagos' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '+ Registrar una cuota' }));
  await waitFor(() => expect(screen.getByLabelText('Mes a pagar')).toHaveValue('2027-01'));
  expect(screen.getByRole('button', { name: 'Efectivo' })).toHaveAttribute('aria-pressed', 'false');
  await waitFor(() => expect(reads).toBe(2));
});
it('shows API errors and keeps the same operation IDs when an unchanged request is retried', async () => {
  const submissions: unknown[] = [];
  server.use(http.post(planPaymentsUrl, async ({ request }) => {
    submissions.push(await request.json());
    return submissions.length === 1 ? HttpResponse.json({ message: 'No pudimos confirmar el pago.' }, { status: 503 }) : HttpResponse.json({ data: {} }, { status: 201 });
  }));
  renderPanel(); await screen.findByLabelText('Precio Octubre 2026'); await selectMethod();
  fireEvent.click(screen.getByRole('button', { name: /^Registrar pago/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos confirmar el pago.');
  fireEvent.click(screen.getByRole('button', { name: /^Registrar pago/ }));
  expect(await screen.findByRole('status')).toHaveTextContent('Pago registrado correctamente.');
  expect(submissions[1]).toEqual(submissions[0]);
});
it('keeps reversal available for valid payments and refreshes their history', async () => {
  let reversed = false;
  let submitted: unknown;
  server.use(
    http.get(paymentsUrl, () => HttpResponse.json({ data: [{ ...payment, reversal: reversed ? { id: 'reversal' } : null }] })),
    http.post(`${baseUrl}/api/sala/payments/payment/reverse`, async ({ request }) => { submitted = await request.json(); reversed = true; return HttpResponse.json({ data: {} }, { status: 201 }); }),
  );
  const client = renderPanel(); const invalidation = vi.spyOn(client, 'invalidateQueries');
  fireEvent.click(await screen.findByRole('button', { name: 'Revertir' }));
  expect(screen.getByRole('button', { name: 'Revertir pago' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Motivo de reversión'), { target: { value: 'Cobro duplicado' } });
  fireEvent.click(screen.getByRole('button', { name: 'Revertir pago' }));
  await screen.findByText('Revertido', { selector: 'td' });
  expect(submitted).toEqual({ reason: 'Cobro duplicado', operationId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  for (const queryKey of [['sala', 'payments', personId], ['sala', 'students'], ['finance', 'income'], ['finance', 'totals']]) expect(invalidation).toHaveBeenCalledWith({ queryKey });
  expect(screen.queryByRole('button', { name: 'Revertir' })).not.toBeInTheDocument();
});
it('keeps payments read-only without SALA_PAYMENT_MANAGE', async () => {
  server.use(http.get(paymentsUrl, () => HttpResponse.json({ data: [payment] })));
  renderPanel(false);
  await screen.findByText('Pagado', { selector: 'td' });
  expect(screen.getByText('01/10/2026')).toBeVisible();
  expect(screen.getByText(/Tu rol permite consultar/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Registrar pago/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Revertir' })).not.toBeInTheDocument();
});
it('requires an active participation and Plan to register payments', () => {
  render(<QueryClientProvider client={new QueryClient()}><SalaPaymentPanel personId={personId} csrfToken="csrf" canManage /></QueryClientProvider>);
  expect(screen.getByText('Se necesita una participación activa de Sala para registrar pagos.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Registrar pago/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Mes/Año')).not.toBeInTheDocument();
});
it.each([{ methods: [] }, { methods: [{ id: methodId, name: 'Retirado', isSelectable: false }] }])('does not register without selectable payment methods ($methods)', async ({ methods }) => {
  server.use(http.get(`${baseUrl}/api/finance/payment-methods`, () => HttpResponse.json({ data: methods })));
  renderPanel(); await screen.findByLabelText('Precio Octubre 2026');
  expect(await screen.findByText('No hay medios de pago configurados.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Registrar pago/ })).toBeDisabled();
  expect(screen.queryByRole('option', { name: 'Retirado' })).not.toBeInTheDocument();
});

it('validates each amount and its adjustment reason and sends the actual total with a past cash date', async () => {
  vi.setSystemTime(new Date('2026-10-08T01:00:00Z'));
  let submitted: unknown;
  server.use(http.post(planPaymentsUrl, async ({ request }) => { submitted = await request.json(); return HttpResponse.json({ data: {} }, { status: 201 }); }));
  const client = renderPanel(); const invalidation = vi.spyOn(client, 'invalidateQueries');
  expect(screen.getByLabelText('Fecha de cobro')).toHaveValue('2026-10-07');
  expect(screen.getByLabelText('Fecha de cobro')).toHaveAttribute('max', '2026-10-07');
  await screen.findByLabelText('Precio Octubre 2026'); await addPeriod('2026-11'); await selectMethod();
  const amount = screen.getByLabelText('Precio Noviembre 2026');
  for (const value of ['0', '-1', '1.5', '']) {
    fireEvent.change(amount, { target: { value } });
    expect(screen.getByRole('button', { name: /^Registrar pago/ })).toBeDisabled();
  }
  fireEvent.change(amount, { target: { value: '9000' } });
  expect(screen.getByLabelText('Precio Octubre 2026')).toHaveValue('20000');
  expect(within(screen.getByRole('complementary', { name: 'Resumen del cobro' })).getByText('$29.000')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Registrar pago/ })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Motivo de ajuste Noviembre 2026'), { target: { value: 'Descuento' } });
  fireEvent.change(screen.getByLabelText('Fecha de cobro'), { target: { value: '2026-10-08' } });
  expect(screen.getByRole('button', { name: /^Registrar pago/ })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Fecha de cobro'), { target: { value: '2026-09-30' } });
  fireEvent.click(screen.getByRole('button', { name: /^Registrar pago/ }));
  await screen.findByRole('status');
  expect(submitted).toEqual({ personId, paidAt: '2026-09-30', paymentMethodId: methodId, periods: [
    { year: 2026, month: 10, planId: activePlan.id, amount: '20000', adjustmentReason: '', operationId: expect.any(String) },
    { year: 2026, month: 11, planId: activePlan.id, amount: '9000', adjustmentReason: 'Descuento', operationId: expect.any(String) },
  ] });
  for (const queryKey of [['sala', 'payments', personId], ['sala', 'students'], ['finance', 'income'], ['finance', 'totals']]) expect(invalidation).toHaveBeenCalledWith({ queryKey });
});
it('no longer requires a reason when the amount returns to the Plan price', async () => {
  renderPanel(); await screen.findByLabelText('Precio Octubre 2026'); await selectMethod();
  fireEvent.change(screen.getByLabelText('Precio Octubre 2026'), { target: { value: '9000' } });
  expect(screen.getByRole('button', { name: /^Registrar pago/ })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Precio Octubre 2026'), { target: { value: '20000' } });
  expect(screen.queryByLabelText(/Motivo de ajuste/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Registrar pago/ })).toBeEnabled();
});

it('waits for refreshed history before proposing the current month from stale cached payments', async () => {
  server.use(http.get(paymentsUrl, () => HttpResponse.json({ data: [payment] })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['sala', 'payments', personId], []);
  render(<QueryClientProvider client={client}><SalaPaymentPanel personId={personId} csrfToken="csrf" canManage activePlan={activePlan} defaultOpen /></QueryClientProvider>);
  await screen.findByText('Octubre de 2026 ya está pagado y no se puede volver a cobrar.');
  expect(screen.queryByLabelText('Precio Octubre 2026')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Mes a pagar')).toHaveValue('2026-11');
  await selectMethod();
  expect(screen.getByRole('button', { name: /^Registrar pago/ })).toBeEnabled();
});

it('preserves removal of the proposed month when payment history refreshes', async () => {
  const client = renderPanel();
  await screen.findByLabelText('Precio Octubre 2026');
  fireEvent.click(screen.getByRole('button', { name: 'Quitar Octubre 2026' }));
  await act(async () => { await client.invalidateQueries({ queryKey: ['sala', 'payments', personId] }); });
  expect(screen.queryByLabelText('Precio Octubre 2026')).not.toBeInTheDocument();
  await addPeriod('2026-11');
  expect(within(screen.getByRole('complementary', { name: 'Resumen del cobro' })).getByText('$20.000')).toBeInTheDocument();
});

it('proposes the first free period after two consecutive paid months, including year rollover', async () => {
  vi.setSystemTime(new Date('2026-12-15T12:00:00Z'));
  server.use(http.get(paymentsUrl, () => HttpResponse.json({ data: [{ ...payment, month: 12 }, { ...payment, id: 'next', year: 2027, month: 1 }] })));
  renderPanel();
  await waitFor(() => expect(screen.getByLabelText('Mes a pagar')).toHaveValue('2027-02'));
});
it('replaces the main period with Plan price and cleared adjustment, preventing paid or duplicate periods', async () => {
  server.use(http.get(paymentsUrl, () => HttpResponse.json({ data: [{ ...payment, month: 9 }] })));
  renderPanel(); await screen.findByLabelText('Precio Octubre 2026');
  fireEvent.change(screen.getByLabelText('Precio Octubre 2026'), { target: { value: '15000' } });
  fireEvent.change(screen.getByLabelText('Motivo de ajuste Octubre 2026'), { target: { value: 'Ajuste' } });
  await addPeriod('2026-12');
  const primary = screen.getByLabelText('Mes a pagar');
  fireEvent.change(primary, { target: { value: '2026-12' } });
  expect(screen.getByRole('alert')).toHaveTextContent('Ese mes ya está seleccionado.');
  expect(primary).toHaveValue('2026-10');
  fireEvent.change(primary, { target: { value: '2026-09' } });
  expect(screen.getByRole('alert')).toHaveTextContent('Ese mes ya tiene un pago registrado.');
  fireEvent.change(primary, { target: { value: '2026-11' } });
  expect(primary).toHaveValue('2026-11');
  expect(screen.getByLabelText('Precio Noviembre 2026')).toHaveValue('20000');
  expect(screen.queryByLabelText(/Motivo de ajuste/)).not.toBeInTheDocument();
});
it('shows adjustment and reversal reasons in payment history', async () => {
  server.use(http.get(paymentsUrl, () => HttpResponse.json({ data: [{ ...payment, adjustmentReason: 'Descuento sintético', reversal: { id: 'rev', reason: 'Error sintético' } }] })));
  renderPanel();
  expect(await screen.findByText('Motivo de ajuste: Descuento sintético')).toBeVisible();
  expect(screen.getByText('Motivo de reversión: Error sintético')).toBeVisible();
  expect(screen.getByText('01/10/2026')).toBeVisible();
  expect(screen.getByText('Revertido', { selector: 'td' })).toBeVisible();
});

it('keeps registration closed by default and history visible, then toggles registration', async () => {
  renderPanel(true, activePlan, false);
  await screen.findByText('No hay pagos registrados todavía.');
  expect(screen.getByRole('heading', { name: 'Historial de pagos' })).toBeVisible();
  expect(screen.queryByLabelText('Mes a pagar')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '+ Registrar una cuota' }));
  expect(await screen.findByLabelText('Mes a pagar')).toBeVisible();
});
it('uses independent reference Plans, prefills prices and preserves Plan on retry', async () => {
  const submissions: Array<{ periods: Array<{ planId: string; amount: string }> }> = [];
  server.use(http.post(planPaymentsUrl, async ({ request }) => {
    submissions.push(await request.json() as typeof submissions[number]);
    return submissions.length === 1 ? HttpResponse.json({ message: 'Reintentar' }, { status: 503 }) : HttpResponse.json({ data: {} }, { status: 201 });
  }));
  renderPanel();
  await screen.findByLabelText('Plan Octubre 2026');
  await screen.findByRole('option', { name: 'Plan Plus' });
  await addPeriod('2026-11');
  fireEvent.change(screen.getByLabelText('Plan Noviembre 2026'), { target: { value: otherPlan.id } });
  expect(screen.getByLabelText('Precio Noviembre 2026')).toHaveValue('30000');
  fireEvent.change(screen.getByLabelText('Precio Noviembre 2026'), { target: { value: '29000' } });
  expect(screen.getByLabelText('Motivo de ajuste Noviembre 2026')).toBeRequired();
  fireEvent.change(screen.getByLabelText('Precio Noviembre 2026'), { target: { value: '30000' } });
  expect(screen.queryByLabelText(/Motivo de ajuste/)).not.toBeInTheDocument();
  await selectMethod();
  fireEvent.click(screen.getByRole('button', { name: /^Registrar pagos/ }));
  await screen.findByText('Reintentar');
  fireEvent.click(screen.getByRole('button', { name: /^Registrar pagos/ }));
  await screen.findByText('Pagos registrados correctamente.');
  expect(submissions[0]!.periods).toEqual([expect.objectContaining({ planId: activePlan.id, amount: '20000' }), expect.objectContaining({ planId: otherPlan.id, amount: '30000' })]);
  expect(submissions[1]).toEqual(submissions[0]);
});
