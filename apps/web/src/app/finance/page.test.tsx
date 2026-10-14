import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import FinancePage from './page';

const navigation = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.search) }));

const server = setupServer();
const nativeFetch = globalThis.fetch;
const session = { user: { id: 'admin', firstName: 'Admin', lastName: 'Test' }, roles: ['GENERAL_ADMIN'], permissions: ['FINANCE_OPERATIONAL_READ', 'FINANCE_EXECUTIVE_READ', 'PAYMENT_METHOD_CATALOG_MANAGE'], csrfToken: 'csrf', mustChangePassword: false };

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  navigation.search = '';
  server.use(
    http.get('http://localhost:3000/api/auth/session', () => HttpResponse.json({ data: session })),
    http.get('http://localhost:3000/api/finance/executive-totals', () => HttpResponse.json({ data: { totalIncome: '100', salaIncome: '60', clinicalIncome: '40', expenses: '20', net: '80' } })),
    http.get('http://localhost:3000/api/finance/payment-methods', () => HttpResponse.json({ data: [{ id: 'cash', name: 'Efectivo', isSelectable: true }] })),
    http.get('http://localhost:3000/api/finance/income', () => HttpResponse.json({ data: [{ id: 'income', cashDate: '2026-10-14', source: 'SALA', amount: '60' }] })),
    http.get('http://localhost:3000/api/finance/expenses', () => HttpResponse.json({ data: [{ id: 'expense', cashDate: '2026-10-14', area: 'Sala', amount: '20' }] })),
  );
});
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

function renderPage(): void {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FinancePage /></QueryClientProvider>);
}

describe('Finance views', () => {
  it('uses /finance for indicators and payment methods', async () => {
    renderPage();
    expect(await screen.findByText('$ 100')).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Medios de pago' })).toBeVisible();
    expect(screen.getByText('Efectivo')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Ingresos' })).not.toBeInTheDocument();
  });

  it('shows the income list and clinical income action for view=income', async () => {
    navigation.search = 'view=income';
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Ingresos' })).toBeVisible();
    expect(await screen.findByText(/2026-10-14 · SALA/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Nuevo ingreso clínico' })).toHaveAttribute('href', '/finance/clinical-income/new');
    expect(screen.queryByRole('heading', { name: 'Medios de pago' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ingresos' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows the expense list for view=expenses', async () => {
    navigation.search = 'view=expenses';
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Gastos' })).toBeVisible();
    expect(await screen.findByText(/2026-10-14 · Sala/)).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Nuevo ingreso clínico' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gastos' })).toHaveAttribute('aria-current', 'page');
  });
});
