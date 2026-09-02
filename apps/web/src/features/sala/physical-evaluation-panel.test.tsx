import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { PhysicalEvaluationPanel } from './physical-evaluation-panel';

const nativeFetch = globalThis.fetch;
const server = setupServer();
const personId = '10000000-0000-4000-8000-000000000001';
const participationId = '20000000-0000-4000-8000-000000000001';
const professorId = '30000000-0000-4000-8000-000000000001';
const testId = '40000000-0000-4000-8000-000000000001';

function renderPanel() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><PhysicalEvaluationPanel personId={personId} participationId={participationId} professorId="admin" csrfToken="csrf" /></QueryClientProvider>);
}

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it('shows the internal history, active tests and saves a real evaluation', async () => {
  let evaluations: unknown[] = [];
  let payload: unknown;
  server.use(
    http.get('http://localhost:3000/api/sala/physical-test-definitions', () => HttpResponse.json({ data: [{ id: testId, name: 'Salto vertical', type: 'NUMERIC', isActive: true }, { id: 'retired', name: 'Test retirado', type: 'TEXT', isActive: false }] })),
    http.get(`http://localhost:3000/api/sala/people/${personId}/physical-evaluations`, () => HttpResponse.json({ data: evaluations })),
    http.get('http://localhost:3000/api/team/users', () => HttpResponse.json({ data: [{ id: professorId, firstName: 'Bart', lastName: 'Simpson', email: 'bart@test.local', status: 'ACTIVE', roles: ['PROFESSOR'] }] })),
    http.post('http://localhost:3000/api/sala/physical-evaluations', async ({ request }) => { payload = await request.json(); evaluations = [{ id: 'evaluation', evaluationDate: '2026-09-02', professor: { firstName: 'Bart', lastName: 'Simpson' }, results: [{ resultText: '42', testDefinition: { name: 'Salto vertical' } }] }]; return HttpResponse.json({ data: evaluations[0] }, { status: 201 }); }),
  );
  renderPanel();
  expect(await screen.findByText('No hay evaluaciones físicas registradas.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Nueva evaluación física' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Salto vertical' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Test retirado' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: '42' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(payload).toEqual({ personId, salaParticipationId: participationId, professorId, evaluationDate: expect.any(String), results: [{ testDefinitionId: testId, resultText: '42' }] }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(await screen.findByText('02/09/2026')).toBeInTheDocument();
  expect(screen.getByText('Salto vertical: 42')).toBeInTheDocument();
});

it('keeps the modal open and displays a functional error when saving fails', async () => {
  server.use(
    http.get('http://localhost:3000/api/sala/physical-test-definitions', () => HttpResponse.json({ data: [{ id: testId, name: 'Salto vertical', type: 'NUMERIC', isActive: true }] })),
    http.get(`http://localhost:3000/api/sala/people/${personId}/physical-evaluations`, () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/team/users', () => HttpResponse.json({ data: [{ id: professorId, firstName: 'Bart', lastName: 'Simpson', email: 'bart@test.local', status: 'ACTIVE', roles: ['PROFESSOR'] }] })),
    http.post('http://localhost:3000/api/sala/physical-evaluations', () => HttpResponse.json({ message: 'bad' }, { status: 409 })),
  );
  renderPanel();
  await screen.findByText('No hay evaluaciones físicas registradas.');
  fireEvent.click(screen.getByRole('button', { name: 'Nueva evaluación física' }));
  fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: '42' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar la evaluación física.');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
