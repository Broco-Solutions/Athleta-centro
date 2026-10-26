import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExpenseRegistration } from './expense-registration';
import { todayOperational } from '../sala/student-onboarding';

const rent = { id: 'rent', name: 'Alquiler', isSelectable: true };
const supplies = { id: 'supplies', name: 'Materiales', isSelectable: true };
const sala = { id: 'area-sala', name: 'Sala', isSelectable: true, systemCode: 'SALA' };
const general = { id: 'area-general', name: 'General', isSelectable: true, systemCode: 'GENERAL' };
const custom = { id: 'area-custom', name: 'Kinesiología', isSelectable: true, systemCode: null };
let categories = [rent];
let areas: Array<{ id: string; name: string; isSelectable: boolean; systemCode: string | null }> = [sala, general];
let failCreation = false;
let failAreaCreation = false;
let categoryReads = 0;
const fetchMock = vi.fn();
beforeEach(() => {
  categories = [rent]; areas = [sala, general]; failCreation = false; failAreaCreation = false; categoryReads = 0;
  fetchMock.mockReset().mockImplementation(async (url: string, options?: RequestInit) => {
    let data: unknown;
    if (url.endsWith('expense-areas')) {
      if (options?.method === 'POST') {
        if (failAreaCreation) return { ok: false, json: async () => ({ message: 'Ya existe un área con ese nombre.' }) };
        const area = { ...custom, id: 'area-custom', name: JSON.parse(String(options.body)).name as string };
        areas = [...areas, area]; data = area;
      } else data = areas;
    } else if (url.endsWith('expense-categories')) {
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
function renderForm(canManageCategories = true, onRegistered?: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ExpenseRegistration csrfToken="synthetic-csrf" canManageCategories={canManageCategories} {...(onRegistered ? { onRegistered } : {})}/></QueryClientProvider>);
  return vi.spyOn(client, 'invalidateQueries');
}
async function fillExpense() {
  await screen.findByRole('option', { name: 'Alquiler' });
  await screen.findByRole('option', { name: 'Efectivo' });
  await screen.findByRole('option', { name: 'Sala' });
  fireEvent.change(screen.getByLabelText('Importe ($ ARS)'), { target: { value: '35000' } });
  fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'rent' } });
  fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'cash' } });
  fireEvent.change(screen.getByLabelText('Área'), { target: { value: 'area-general' } });
  fireEvent.change(screen.getByLabelText('Descripción (opcional)'), { target: { value: 'Compra sintética' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar gasto' })).toBeEnabled());
}
function expectExpensePreserved(areaId = 'area-general') {
  expect(screen.getByLabelText('Importe ($ ARS)')).toHaveValue('35000');
  expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-01');
  expect(screen.getByLabelText('Medio de pago')).toHaveValue('cash');
  expect(screen.getByLabelText('Área')).toHaveValue(areaId);
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

it.each([true, false])('resets successful expenses and calls the optional callback after invalidations (callback=%s)', async withCallback => {
  const onRegistered = vi.fn();
  const originalFetch = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, options?: RequestInit) => url.endsWith('/expenses')
    ? { ok: true, json: async () => ({ data: { id: 'expense' } }) }
    : originalFetch(url, options));
  const invalidate = renderForm(true, withCallback ? onRegistered : undefined);
  let finishInvalidations!: () => void;
  const invalidations = new Promise<void>(resolve => { finishInvalidations = resolve; });
  invalidate.mockReturnValue(invalidations);
  await fillExpense();
  fireEvent.click(screen.getByRole('button', { name: 'Registrar gasto' }));
  await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(3));
  expect(onRegistered).not.toHaveBeenCalled();
  finishInvalidations();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar gasto' })).toBeDisabled());
  if (withCallback) await waitFor(() => expect(onRegistered).toHaveBeenCalledTimes(1));
  else expect(onRegistered).not.toHaveBeenCalled();
  for (const key of ['expenses', 'totals', 'executive-totals']) expect(invalidate).toHaveBeenCalledWith({ queryKey: ['finance', key] });
  expect(screen.getByLabelText('Importe ($ ARS)')).toHaveValue('');
  expect(screen.getByLabelText('Descripción (opcional)')).toHaveValue('');
  expect(screen.getByLabelText('Fecha')).toHaveValue(todayOperational());
  expect(screen.getByLabelText('Área')).toHaveValue('area-sala');
  expect(screen.getByLabelText('Categoría')).toHaveValue('rent');
  expect(screen.getByLabelText('Medio de pago')).toHaveValue('cash');
});

it('does not call onRegistered or invalidate expenses after a backend error', async () => {
  const onRegistered = vi.fn();
  const originalFetch = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, options?: RequestInit) => url.endsWith('/expenses')
    ? { ok: false, json: async () => ({ message: 'No se pudo registrar el gasto.' }) }
    : originalFetch(url, options));
  const invalidate = renderForm(true, onRegistered);
  await fillExpense();
  fireEvent.click(screen.getByRole('button', { name: 'Registrar gasto' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo registrar el gasto.');
  expect(onRegistered).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
  expectExpensePreserved();
});

it('loads area catalog, defaults to the registered Sala ID, and sends areaId when saving', async () => {
  const originalFetch = fetchMock.getMockImplementation()!; let expenseBody: unknown;
  fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/expenses')) { expenseBody = JSON.parse(String(options?.body)); return { ok: true, json: async () => ({ data: { id: 'expense' } }) }; }
    return originalFetch(url, options);
  });
  renderForm(); await fillExpense(); fireEvent.click(screen.getByRole('button', { name: 'Registrar gasto' }));
  await waitFor(() => expect(expenseBody).toMatchObject({ areaId: 'area-general' }));
  expect(fetchMock).toHaveBeenCalledWith('/api/finance/expense-areas', expect.objectContaining({ credentials: 'include' }));
});
it('creates and selects an area inline without clearing entered expense data', async () => {
  const invalidate = renderForm(); await fillExpense();
  fireEvent.change(screen.getByLabelText('Área'), { target: { value: 'area-general' } });
  fireEvent.click(screen.getByRole('button', { name: '+ Nueva área' }));
  fireEvent.change(screen.getByLabelText('Nombre del área'), { target: { value: 'Kinesiología' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
  await screen.findByRole('option', { name: 'Kinesiología' });
  await waitFor(() => expect(screen.getByLabelText('Área')).toHaveValue('area-custom'));
  expect(fetchMock).toHaveBeenCalledWith('/api/finance/expense-areas', expect.objectContaining({ method: 'POST', credentials: 'include', body: JSON.stringify({ name: 'Kinesiología' }), headers: expect.objectContaining({ 'x-csrf-token': 'synthetic-csrf' }) }));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['finance', 'expense-areas'] });
  expectExpensePreserved('area-custom');
});
it('hides area administration without catalog permission and retains the entered gasto on creation error', async () => {
  renderForm(false); await fillExpense(); expect(screen.queryByRole('button', { name: '+ Nueva área' })).not.toBeInTheDocument();
  cleanup(); failAreaCreation = true; renderForm(true); await fillExpense();
  fireEvent.click(screen.getByRole('button', { name: '+ Nueva área' }));
  fireEvent.change(screen.getByLabelText('Nombre del área'), { target: { value: 'Kinesiología' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un área con ese nombre.');
  expectExpensePreserved(); expect(screen.getByLabelText('Nombre del área')).toHaveValue('Kinesiología');
});
