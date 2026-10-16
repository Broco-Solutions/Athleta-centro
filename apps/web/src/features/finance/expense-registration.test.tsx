import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExpenseRegistration } from './expense-registration';

const rent = { id: 'rent', name: 'Alquiler', isSelectable: true };
const supplies = { id: 'supplies', name: 'Materiales', isSelectable: true };
let categories = [rent];
let failCreation = false;
let categoryReads = 0;
const fetchMock = vi.fn();
beforeEach(() => {
  categories = [rent]; failCreation = false; categoryReads = 0;
  fetchMock.mockReset().mockImplementation(async (url: string, options?: RequestInit) => {
    let data: unknown;
    if (url.endsWith('expense-categories')) {
      if (options?.method === 'POST') {
        if (failCreation) return { ok: false, json: async () => ({ message: 'La categoría ya existe.' }) };
        const category = { ...supplies, id: categories.some(item => item.id === supplies.id) ? 'other' : supplies.id, name: JSON.parse(String(options.body)).name as string };
        categories = [...categories, category]; data = category;
      } else { categoryReads++; data = categories; }
    } else if (url.endsWith('payment-methods')) data = [{ id: 'cash', name: 'Efectivo', isSelectable: true }];
    else throw new Error(`Unexpected request: ${url}`);
    return { ok: true, json: async () => ({ data }) };
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function renderForm(canManageCategories = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ExpenseRegistration csrfToken="synthetic-csrf" canManageCategories={canManageCategories}/></QueryClientProvider>);
  return vi.spyOn(client, 'invalidateQueries');
}
async function fillExpense() {
  await screen.findByRole('option', { name: 'Alquiler' });
  await screen.findByRole('option', { name: 'Efectivo' });
  fireEvent.change(screen.getByLabelText('Importe ($ ARS)'), { target: { value: '35000' } });
  fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'rent' } });
  fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'cash' } });
  fireEvent.change(screen.getByLabelText('Área'), { target: { value: 'GENERAL' } });
  fireEvent.change(screen.getByLabelText('Descripción (opcional)'), { target: { value: 'Compra sintética' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar gasto' })).toBeEnabled());
}
function expectExpensePreserved() {
  expect(screen.getByLabelText('Importe ($ ARS)')).toHaveValue('35000');
  expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-01');
  expect(screen.getByLabelText('Medio de pago')).toHaveValue('cash');
  expect(screen.getByLabelText('Área')).toHaveValue('GENERAL');
  expect(screen.getByLabelText('Descripción (opcional)')).toHaveValue('Compra sintética');
}
it('keeps category required and excludes Clínica from areas', async () => {
  renderForm(); await fillExpense();
  expect(screen.getByLabelText('Categoría')).toBeRequired();
  const categorySection = screen.getByRole('region', { name: 'Categorías de gastos' });
  expect(categorySection).toContainElement(screen.getByRole('button', { name: '+ Agregar categoría' }));
  expect(screen.getByLabelText('Categoría').closest('form')).not.toContainElement(categorySection);
  fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: '' } });
  expect(await screen.findByText('Seleccioná una categoría.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Registrar gasto' })).toBeDisabled();
  expect(screen.queryByRole('option', { name: 'Clínica' })).not.toBeInTheDocument();
});
it('creates a second category inline, refreshes and selects it without losing the expense', async () => {
  const invalidate = renderForm(); await fillExpense();
  expect(screen.queryByLabelText('Nombre de la categoría')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '+ Agregar categoría' }));
  fireEvent.change(screen.getByLabelText('Nombre de la categoría'), { target: { value: 'Materiales' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
  await waitFor(() => expect(screen.getByLabelText('Categoría')).toHaveValue('supplies'));
  expect(fetchMock).toHaveBeenCalledWith('/api/finance/expense-categories', expect.objectContaining({ method: 'POST', credentials: 'include', body: JSON.stringify({ name: 'Materiales' }), headers: expect.objectContaining({ 'x-csrf-token': 'synthetic-csrf' }) }));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['finance', 'expense-categories'] });
  expect(categoryReads).toBe(2);
  expectExpensePreserved();
  expect(screen.queryByLabelText('Nombre de la categoría')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '+ Agregar categoría' }));
  expect(screen.getByLabelText('Nombre de la categoría')).toHaveValue('');
});
it('cancels category creation without modifying the expense', async () => {
  renderForm(); await fillExpense();
  fireEvent.click(screen.getByRole('button', { name: '+ Agregar categoría' }));
  fireEvent.change(screen.getByLabelText('Nombre de la categoría'), { target: { value: 'Descartar' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expectExpensePreserved();
  expect(screen.getByLabelText('Categoría')).toHaveValue('rent');
  expect(screen.queryByLabelText('Nombre de la categoría')).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
});
it('creates the first category immediately and keeps Agregar categoría available', async () => {
  categories = []; renderForm();
  expect(await screen.findByText('No hay categorías de gastos configuradas.')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Nombre de la categoría'), { target: { value: 'Materiales' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
  await waitFor(() => expect(screen.getByLabelText('Categoría')).toHaveValue('supplies'));
  expect(screen.getByRole('button', { name: '+ Agregar categoría' })).toBeVisible();
  expect(screen.queryByLabelText('Nombre de la categoría')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '+ Agregar categoría' }));
  fireEvent.change(screen.getByLabelText('Nombre de la categoría'), { target: { value: 'Otra categoría' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
  await waitFor(() => expect(categoryReads).toBe(3));
});
it('shows backend conflicts without losing expense or simulating success', async () => {
  failCreation = true; renderForm(); await fillExpense();
  fireEvent.click(screen.getByRole('button', { name: '+ Agregar categoría' }));
  fireEvent.change(screen.getByLabelText('Nombre de la categoría'), { target: { value: 'Alquiler' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('La categoría ya existe.');
  expectExpensePreserved();
  expect(screen.getByLabelText('Categoría')).toHaveValue('rent');
  expect(screen.getByLabelText('Nombre de la categoría')).toHaveValue('Alquiler');
  expect(categoryReads).toBe(1);
});
it('allows existing category selection without catalog management permission', async () => {
  renderForm(false); await fillExpense();
  expect(screen.getByLabelText('Categoría')).toHaveValue('rent');
  expect(screen.queryByRole('button', { name: '+ Agregar categoría' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Nombre de la categoría')).not.toBeInTheDocument();
});
