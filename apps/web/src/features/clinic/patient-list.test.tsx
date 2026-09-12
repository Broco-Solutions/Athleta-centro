import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { PatientList } from './patient-list';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const patient = {
  id: '10000000-0000-4000-8000-000000000001',
  firstName: 'Ana',
  lastName: 'Sintética',
  dni: '20.123.456',
  status: 'ACTIVE',
  lastAttentionAt: null,
};

function renderList(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><PatientList /></QueryClientProvider>);
}

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  server.use(http.get('http://localhost:3000/api/clinic/patients/overview', () => HttpResponse.json({ data: [patient], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } })));
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it('renders operational patient information without clinical content', async () => {
  renderList();
  expect(await screen.findByText('Sintética, Ana')).toBeInTheDocument();
  expect(screen.getByText('Activo')).toBeInTheDocument();
  expect(screen.getByText('Sin atenciones')).toBeInTheDocument();
  expect(screen.queryByText(/motivo de consulta/i)).not.toBeInTheDocument();
});

it('sends En curso and recent-attention filters to the patient overview API', async () => {
  let treatmentInProgress = '';
  let withoutRecentAttentionDays = '';
  server.use(http.get('http://localhost:3000/api/clinic/patients/overview', ({ request }) => {
    const params = new URL(request.url).searchParams;
    treatmentInProgress = params.get('treatmentInProgress') ?? '';
    withoutRecentAttentionDays = params.get('withoutRecentAttentionDays') ?? '';
    return HttpResponse.json({ data: [patient], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } });
  }));
  renderList();
  await screen.findByText('Sintética, Ana');
  fireEvent.change(screen.getByLabelText('Tratamiento En curso'), { target: { value: 'YES' } });
  await waitFor(() => expect(treatmentInProgress).toBe('YES'));
  fireEvent.change(screen.getByLabelText('Sin Atención reciente'), { target: { value: '60' } });
  await waitFor(() => expect(withoutRecentAttentionDays).toBe('60'));
});
