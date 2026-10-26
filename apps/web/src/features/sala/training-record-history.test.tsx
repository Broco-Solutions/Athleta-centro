import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TrainingRecordHistory } from './training-record-history';
import type { TrainingHistoryApi } from './training-record-api';

export const savedTraining = { id: 'record', routineId: 'routine', routineDayId: 'day', date: '2026-10-26', dayName: 'Fuerza', dayPosition: 1, createdAt: '2026-10-26T10:00:00Z', updatedAt: '2026-10-26T10:00:00Z', exercises: [{ id: 'saved-entry', routineExerciseId: 'source', exerciseDefinitionId: 'definition', exerciseName: 'Press de banca', position: 1, series: '3', repetitions: '10', duration: null, load: '30 kg', rest: '60 s', notes: null, weightKg: '32.5' }, { id: 'saved-entry-2', routineExerciseId: 'source2', exerciseDefinitionId: 'definition2', exerciseName: 'Remo', position: 2, series: null, repetitions: null, duration: '30 s', load: null, rest: null, notes: null, weightKg: null }] };
function renderHistory(editable = false) {
  const api = { list: vi.fn<TrainingHistoryApi['list']>().mockResolvedValue({ data: [savedTraining], meta: { page: 1, pageSize: 1, total: 2, totalPages: 2 } }), detail: vi.fn<TrainingHistoryApi['detail']>().mockResolvedValue(savedTraining) };
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TrainingRecordHistory api={api} queryKey={['training-test']} editable={editable}/></QueryClientProvider>);
  return api;
}
afterEach(cleanup);
it('loads a paginated list, opens details only on demand and closes in place for staff', async () => {
  const api = renderHistory(); await screen.findByText('26/10/2026'); expect(api.detail).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Ver detalle del/ }));
  expect(await screen.findByText('Press de banca')).toBeInTheDocument(); expect(api.detail).toHaveBeenCalledWith('record'); expect(screen.getByText('30 kg')).toBeInTheDocument(); expect(screen.getByText('32,5 kg')).toBeInTheDocument(); expect(screen.getByText('Sin registro')).toBeInTheDocument(); expect(screen.getByText('Tiempo 30 s')).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument(); expect(screen.queryByText('Editar registro')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Cerrar detalle del/ })); expect(screen.queryByText('Press de banca')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' })); await waitFor(() => expect(api.list).toHaveBeenCalledWith(2));
});
it('offers correction only to the Portal owner', async () => {
  renderHistory(true); fireEvent.click(await screen.findByRole('button', { name: /Ver detalle del/ }));
  expect(await screen.findByRole('link', { name: 'Editar registro' })).toHaveAttribute('href', '/portal/sala/entrenamientos/registrar?recordId=record');
});
