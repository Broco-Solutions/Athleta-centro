import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { PaymentPanel } from './payment-panel';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const personId = '10000000-0000-4000-8000-000000000001';
const methodId = '20000000-0000-4000-8000-000000000001';
const activePlan = { id: '30000000-0000-4000-8000-000000000001', name: 'Plan Base', monthlyAmount: '20000' };
const payment = { id: 'payment', year: 2026, month: 10, paidAt: '2026-10-01', amount: '20000', paymentMethod: { name: 'Efectivo' }, reversal: null };
const baseUrl = 'http://localhost:3000';
const paymentsUrl = `${baseUrl}/api/sala/people/${personId}/payments`;
const planPaymentsUrl = `${baseUrl}/api/sala/payments/plan-months`;

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, baseUrl) : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  server.use(
    http.get(paymentsUrl, () => HttpResponse.json({ data: [] })),
    http.get(`${baseUrl}/api/finance/payment-methods`, () => HttpResponse.json({ data: [{ id: methodId, name: 'Efectivo', isSelectable: true }] })),
  );
});
afterEach(() => { cleanup(); server.resetHandlers(); vi.useRealTimers(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

function renderPanel(canManage = true, plan: typeof activePlan | undefined = activePlan) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><PaymentPanel personId={personId} csrfToken="csrf" canManage={canManage} activePlan={plan} /></QueryClientProvider>);
  return client;
}
async function addPeriod(value = '2026-10') {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar mes' })).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mes/Año'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Agregar mes' }));
}
async function selectMethod() {
  await screen.findByRole('option', { name: 'Efectivo' });
  fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: methodId } });
}

it('shows the current Plan and monthly value without an editable amount or Plan selector', async () => {
  renderPanel();
  expect(screen.getByText(/Plan actual:/)).toHaveTextContent('Plan Base');
  expect(screen.getByText(/Valor mensual:/)).toHaveTextContent('$20.000');
  expect(screen.queryByLabelText('Importe')).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: /Plan/ })).not.toBeInTheDocument();
  await addPeriod();
  expect(screen.getByText('Octubre 2026')).toBeInTheDocument();
  expect(screen.getByText('Total: 1 × $20.000 = $20.000')).toBeInTheDocument();
});
it('selects several months, prevents repeats, shows their total and allows removal', async () => {
  renderPanel();
  for (const value of ['2026-10', '2026-11', '2026-12']) await addPeriod(value);
  expect(screen.getByText('Total: 3 × $20.000 = $60.000')).toBeInTheDocument();
  await addPeriod('2026-10');
  expect(screen.getByRole('alert')).toHaveTextContent('Ese mes ya está seleccionado.');
  expect(screen.getAllByRole('button', { name: /^Quitar / })).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Quitar Noviembre 2026' }));
  expect(screen.queryByText('Noviembre 2026')).not.toBeInTheDocument();
  expect(screen.getByText('Total: 2 × $20.000 = $40.000')).toBeInTheDocument();
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
  await screen.findByText('Octubre 2026 · $20.000 · Efectivo');
  await addPeriod();
  expect(screen.getByRole('alert')).toHaveTextContent('Ese mes ya tiene un pago registrado.');
  expect(screen.queryByRole('button', { name: /^Quitar / })).not.toBeInTheDocument();
});
it('allows a reversed month to be selected and does not offer another reversal', async () => {
  server.use(http.get(paymentsUrl, () => HttpResponse.json({ data: [{ ...payment, reversal: { id: 'reversal' } }] })));
  renderPanel();
  await screen.findByText('Octubre 2026 · $20.000 · Efectivo · Revertido');
  expect(screen.queryByRole('button', { name: 'Revertir' })).not.toBeInTheDocument();
  await addPeriod();
  expect(screen.getByRole('button', { name: 'Quitar Octubre 2026' })).toBeInTheDocument();
});
it('sends one batch without client prices, uses Buenos Aires date and clears the form after success', async () => {
  vi.setSystemTime(new Date('2026-10-08T01:00:00Z'));
  let submitted: Record<string, unknown> | undefined;
  let csrf: string | null = null;
  let reads = 0;
  server.use(
    http.get(paymentsUrl, () => { reads++; return HttpResponse.json({ data: [] }); }),
    http.post(planPaymentsUrl, async ({ request }) => { submitted = await request.json() as Record<string, unknown>; csrf = request.headers.get('x-csrf-token'); return HttpResponse.json({ data: { months: 3, totalAmount: '60000' } }, { status: 201 }); }),
  );
  renderPanel();
  for (const month of ['2026-10', '2026-11', '2026-12']) await addPeriod(month);
  await selectMethod();
  fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Pagos registrados correctamente.');
  expect(submitted).toEqual({ personId, paidAt: '2026-10-07', paymentMethodId: methodId, periods: [10, 11, 12].map((month) => ({ year: 2026, month, operationId: expect.stringMatching(/^[0-9a-f-]{36}$/) })) });
  expect(new Set((submitted!.periods as Array<{ operationId: string }>).map((period) => period.operationId)).size).toBe(3);
  expect(csrf).toBe('csrf');
  expect(screen.queryByRole('button', { name: /^Quitar / })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Medio de pago')).toHaveValue('');
  await waitFor(() => expect(reads).toBe(2));
});
it('shows API errors and keeps the same operation IDs when an unchanged request is retried', async () => {
  const submissions: unknown[] = [];
  server.use(http.post(planPaymentsUrl, async ({ request }) => {
    submissions.push(await request.json());
    return submissions.length === 1 ? HttpResponse.json({ message: 'No pudimos confirmar el pago.' }, { status: 503 }) : HttpResponse.json({ data: {} }, { status: 201 });
  }));
  renderPanel(); await addPeriod(); await selectMethod();
  fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos confirmar el pago.');
  fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
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
  renderPanel();
  fireEvent.click(await screen.findByRole('button', { name: 'Revertir' }));
  fireEvent.click(screen.getByRole('button', { name: 'Revertir pago' }));
  await screen.findByText('Octubre 2026 · $20.000 · Efectivo · Revertido');
  expect(submitted).toEqual({ reason: 'Corrección de pago', operationId: expect.any(String) });
  expect(screen.queryByRole('button', { name: 'Revertir' })).not.toBeInTheDocument();
});
it('keeps payments read-only without SALA_PAYMENT_MANAGE', async () => {
  server.use(http.get(paymentsUrl, () => HttpResponse.json({ data: [payment] })));
  renderPanel(false);
  await screen.findByText('Octubre 2026 · $20.000 · Efectivo');
  expect(screen.getByText(/Tu rol permite consultar/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Revertir' })).not.toBeInTheDocument();
});
it('requires an active participation and Plan to register payments', () => {
  render(<QueryClientProvider client={new QueryClient()}><PaymentPanel personId={personId} csrfToken="csrf" canManage /></QueryClientProvider>);
  expect(screen.getByText('Se necesita una participación activa de Sala para registrar pagos.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Mes/Año')).not.toBeInTheDocument();
});
it.each([{ methods: [] }, { methods: [{ id: methodId, name: 'Retirado', isSelectable: false }] }])('does not register without selectable payment methods ($methods)', async ({ methods }) => {
  server.use(http.get(`${baseUrl}/api/finance/payment-methods`, () => HttpResponse.json({ data: methods })));
  renderPanel(); await addPeriod();
  expect(await screen.findByText('No hay medios de pago configurados.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Registrar pago' })).toBeDisabled();
  expect(screen.queryByRole('option', { name: 'Retirado' })).not.toBeInTheDocument();
});
