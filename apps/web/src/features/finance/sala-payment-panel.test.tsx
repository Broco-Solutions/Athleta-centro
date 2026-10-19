import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { SalaPaymentPanel } from './sala-payment-panel';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const personId = '10000000-0000-4000-8000-000000000001';
const methodId = '20000000-0000-4000-8000-000000000001';
const activePlan = { id: '30000000-0000-4000-8000-000000000001', name: 'Plan Base', monthlyAmount: '20000' };
const otherPlan = { id: '30000000-0000-4000-8000-000000000002', name: 'Plan Plus', monthlyAmount: '30000' };
const payment = { id: 'payment', planId: activePlan.id, planName: activePlan.name, coverageStartDate: '2026-10-20', coverageEndDate: '2026-11-20', paidAt: '2026-10-20', amount: '20000', paymentMethod: { name: 'Efectivo' }, reversal: null };
const baseUrl = 'http://localhost:3000';
const paymentsUrl = `${baseUrl}/api/sala/people/${personId}/payments`;
const createUrl = `${baseUrl}/api/sala/payments`;
beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, baseUrl) : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
  server.use(
    http.get(`${baseUrl}/api/sala/plans`, () => HttpResponse.json({ data: [activePlan, otherPlan] })),
    http.get(paymentsUrl, () => HttpResponse.json({ data: [] })),
    http.get(`${baseUrl}/api/finance/payment-methods`, () => HttpResponse.json({ data: [{ id: methodId, name: 'Efectivo', isSelectable: true }] })),
  );
});
afterEach(() => { cleanup(); server.resetHandlers(); vi.useRealTimers(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
function renderPanel(defaultOpen = true, canManage = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><SalaPaymentPanel personId={personId} csrfToken="csrf" canManage={canManage} activePlan={activePlan} defaultOpen={defaultOpen} /></QueryClientProvider>);
  return client;
}
async function selectMethod() { fireEvent.click(await screen.findByRole('button', { name: 'Efectivo' })); }
it('keeps the accordion closed by default and history visible', async () => {
  renderPanel(false);
  expect(screen.getByRole('button', { name: '+ Registrar renovación' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('heading', { name: 'Historial de pagos' })).toBeVisible();
  expect(screen.queryByLabelText('Plan')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '+ Registrar renovación' }));
  expect(await screen.findByLabelText('Plan')).toBeVisible();
});
it('opens on defaultOpen, preselects the active Plan and replaces monthly selection with a coverage preview', async () => {
  renderPanel();
  await waitFor(() => expect(screen.getByLabelText('Plan')).toHaveValue(activePlan.id));
  expect(screen.getByLabelText('Precio')).toHaveValue('20000');
  expect(screen.getByLabelText('Fecha de cobro')).toHaveValue('2026-10-20');
  expect(screen.getByText('Con este pago: 20/10/2026 → 20/11/2026')).toBeVisible();
  expect(screen.getAllByText('Vigencia actual: Sin vigencia').length).toBeGreaterThan(0);
  expect(screen.queryByLabelText('Mes a pagar')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '+ Agregar otro mes' })).not.toBeInTheDocument();
});
it('updates price on Plan selection, clears adjustment reason and requires it for a different price', async () => {
  renderPanel(); await selectMethod();
  await waitFor(() => expect(screen.getByLabelText('Plan')).toHaveValue(activePlan.id));
  fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '19000' } });
  expect(screen.getByRole('button', { name: 'Registrar pago' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Motivo de ajuste/), { target: { value: 'Descuento' } });
  expect(screen.getByRole('button', { name: 'Registrar pago' })).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Plan'), { target: { value: otherPlan.id } });
  expect(screen.getByLabelText('Precio')).toHaveValue('30000');
  expect(screen.queryByLabelText(/Motivo de ajuste/)).not.toBeInTheDocument();
});
it('previews the entire continuous chain and recalculates when the cash date changes', async () => {
  vi.setSystemTime(new Date('2026-11-25T12:00:00Z'));
  server.use(http.get(paymentsUrl, () => HttpResponse.json({ data: [payment] })));
  renderPanel(); await screen.findByText('Pagado', { selector: 'td' });
  fireEvent.change(screen.getByLabelText('Fecha de cobro'), { target: { value: '2026-11-10' } });
  expect(screen.getByText('Con este pago: 21/11/2026 → 20/12/2026')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Fecha de cobro'), { target: { value: '2026-11-25' } });
  expect(screen.getByText('Con este pago: 25/11/2026 → 25/12/2026')).toBeVisible();
});
it('includes prepays in preview and clamps the destination month', async () => {
  server.use(http.get(paymentsUrl, () => HttpResponse.json({ data: [payment, { ...payment, id: 'next', coverageStartDate: '2026-11-21', coverageEndDate: '2026-12-20' }] })));
  renderPanel(); await screen.findByText('Con este pago: 21/12/2026 → 20/01/2027');
  fireEvent.change(screen.getByLabelText('Fecha de cobro'), { target: { value: '2026-01-31' } });
  expect(screen.getByText('Con este pago: 31/01/2026 → 28/02/2026')).toBeVisible();
});
it('submits one generated createSalaPayment request with Plan, CSRF and idempotency, then closes', async () => {
  let body: Record<string, unknown> = {}; let csrf: string | null = null;
  server.use(http.post(createUrl, async ({ request }) => { body = await request.json() as typeof body; csrf = request.headers.get('x-csrf-token'); return HttpResponse.json({ data: payment }, { status: 201 }); }));
  renderPanel(); await selectMethod();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar pago' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Pago registrado correctamente.');
  expect(body).toEqual({ personId, planId: activePlan.id, paidAt: '2026-10-20', amount: '20000', paymentMethodId: methodId, operationId: expect.any(String) });
  expect(body).not.toHaveProperty('year'); expect(body).not.toHaveProperty('month');
  expect(csrf).toBe('csrf');
  expect(screen.getByRole('button', { name: '+ Registrar renovación' })).toHaveAttribute('aria-expanded', 'false');
});
it('keeps the operation on retries and clears it on an edited payment', async () => {
  const bodies: Array<Record<string, unknown>> = [];
  server.use(http.post(createUrl, async ({ request }) => { bodies.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ message: 'Intentá nuevamente' }, { status: 503 }); }));
  renderPanel(); await selectMethod();
  const submit = screen.getByRole('button', { name: 'Registrar pago' });
  fireEvent.click(submit); await screen.findByText('Intentá nuevamente');
  fireEvent.click(submit); await waitFor(() => expect(bodies).toHaveLength(2));
  expect(bodies[1]!.operationId).toBe(bodies[0]!.operationId);
  fireEvent.change(screen.getByLabelText('Fecha de cobro'), { target: { value: '2026-10-19' } });
  fireEvent.click(submit); await waitFor(() => expect(bodies).toHaveLength(3));
  expect(bodies[2]!.operationId).not.toBe(bodies[0]!.operationId);
});
it('shows historical coverage, unknown Plans and preserves reversal with its reason', async () => {
  let reversed = false;
  server.use(
    http.get(paymentsUrl, () => HttpResponse.json({ data: [{ ...payment, planId: null, planName: null, reversal: reversed ? { id: 'reversal', reason: 'Error' } : null }] })),
    http.post(`${baseUrl}/api/sala/payments/payment/reverse`, () => { reversed = true; return HttpResponse.json({ data: {} }, { status: 201 }); }),
  );
  renderPanel(false);
  expect(await screen.findByText('Plan no registrado')).toBeVisible();
  expect(screen.getByText('20/10/2026 → 20/11/2026')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Revertir' }));
  const dialog = within(screen.getByRole('alertdialog'));
  expect(dialog.getByRole('button', { name: 'Revertir pago' })).toBeDisabled();
  fireEvent.change(dialog.getByLabelText('Motivo de reversión'), { target: { value: 'Error' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Revertir pago' }));
  expect(await screen.findByText('Revertido', { selector: 'td' })).toBeVisible();
  expect(screen.getByText('20/10/2026 → 20/11/2026')).toBeVisible();
  expect(screen.getByText('Vigencia actual: Sin vigencia')).toBeVisible();
});
