import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { PaymentPanel } from './payment-panel';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const personId = '10000000-0000-4000-8000-000000000001';

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

function renderPanel(canManage = true) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><PaymentPanel personId={personId} csrfToken="csrf" canManage={canManage} /></QueryClientProvider>);
}

it('shows the API error when recording a Sala payment fails', async () => {
  server.use(
    http.get(`http://localhost:3000/api/sala/people/${personId}/payments`, () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/finance/payment-methods', () => HttpResponse.json({ data: [{ id: 'method', name: 'Efectivo', isSelectable: true }] })),
    http.post('http://localhost:3000/api/sala/payments', () => HttpResponse.json({ message: 'El período ya tiene un pago.' }, { status: 409 })),
  );
  renderPanel();
  await screen.findByRole('option', { name: 'Efectivo' });
  fireEvent.change(screen.getByLabelText('Importe'), { target: { value: '20000' } });
  fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'method' } });
  fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('El período ya tiene un pago.');
});

it('keeps payment movements read-only without SALA_PAYMENT_MANAGE', async () => {
  server.use(
    http.get(`http://localhost:3000/api/sala/people/${personId}/payments`, () => HttpResponse.json({ data: [{ id: 'payment', year: 2026, month: 9, paidAt: '2026-09-01', amount: '20000', paymentMethod: { name: 'Efectivo' } }] })),
    http.get('http://localhost:3000/api/finance/payment-methods', () => HttpResponse.json({ data: [{ id: 'method', name: 'Efectivo', isSelectable: true }] })),
  );
  renderPanel(false);
  expect(await screen.findByText(/Tu rol permite consultar/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
});
