import React from 'react';
import type { PhysicalTestDefinitionResponseDto } from '@athleta/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { PhysicalEvaluationPanel } from './physical-evaluation-panel';

const nativeFetch = globalThis.fetch;
const server = setupServer();
const personId = '10000000-0000-4000-8000-000000000001';
const participationId = '20000000-0000-4000-8000-000000000001';
const professorId = '30000000-0000-4000-8000-000000000001';
const testId = '40000000-0000-4000-8000-000000000001';

function renderPanel(props: Partial<React.ComponentProps<typeof PhysicalEvaluationPanel>> = {}) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><PhysicalEvaluationPanel personId={personId} participationId={participationId} professorId={professorId} csrfToken="csrf" canManage canManageTestCatalog {...props} /></QueryClientProvider>);
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
    http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [{ id: professorId, firstName: 'Bart', lastName: 'Simpson', email: 'bart@test.local', status: 'ACTIVE', roles: ['PROFESSOR'] }] })),
    http.post('http://localhost:3000/api/sala/physical-evaluations', async ({ request }) => { payload = await request.json(); evaluations = [{ id: 'evaluation', evaluationDate: '2026-09-02', professor: { firstName: 'Bart', lastName: 'Simpson' }, results: [{ resultText: '42', id: 'result', testDefinitionId: testId, testDefinition: { id: testId, name: 'Salto vertical', type: 'STRENGTH', isActive: true } }] }]; return HttpResponse.json({ data: evaluations[0] }, { status: 201 }); }),
  );
  renderPanel();
  expect(await screen.findByText('No hay evaluaciones físicas registradas.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Nueva evaluación física' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Salto vertical' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Test retirado' })).not.toBeInTheDocument();
  await screen.findByRole('option', { name: 'Simpson, Bart' });
  fireEvent.change(screen.getByLabelText('Test físico'), { target: { value: testId } });
  fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: '42' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(payload).toEqual({ personId, salaParticipationId: participationId, professorId, evaluationDate: expect.any(String), observation: null, results: [{ testDefinitionId: testId, resultText: '42' }] }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(await screen.findByText('02/09/2026')).toBeInTheDocument();
  expect(screen.getByText('Salto vertical: 42')).toBeInTheDocument();
});

it('keeps the modal open and displays a functional error when saving fails', async () => {
  server.use(
    http.get('http://localhost:3000/api/sala/physical-test-definitions', () => HttpResponse.json({ data: [{ id: testId, name: 'Salto vertical', type: 'NUMERIC', isActive: true }] })),
    http.get(`http://localhost:3000/api/sala/people/${personId}/physical-evaluations`, () => HttpResponse.json({ data: [] })),
    http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [{ id: professorId, firstName: 'Bart', lastName: 'Simpson', email: 'bart@test.local', status: 'ACTIVE', roles: ['PROFESSOR'] }] })),
    http.post('http://localhost:3000/api/sala/physical-evaluations', () => HttpResponse.json({ message: 'bad' }, { status: 409 })),
  );
  renderPanel();
  await screen.findByText('No hay evaluaciones físicas registradas.');
  fireEvent.click(screen.getByRole('button', { name: 'Nueva evaluación física' }));
  await screen.findByRole('option', { name: 'Simpson, Bart' });
  fireEvent.change(screen.getByLabelText('Test físico'), { target: { value: testId } });
  fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: '42' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar la evaluación física.');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

const testA = { id: testId, name: 'Test A', type: 'MOBILITY', description: null, isActive: true };
const testB = { id: 'test-b', name: 'Test B', type: 'OTHER', description: null, isActive: true };
const history = { id: 'evaluation', personId, salaParticipationId: participationId, professorId, evaluationDate: '2026-08-20', observation: 'Inicial', professor: { id: professorId, firstName: 'Bart', lastName: 'Simpson' }, results: [{ id: 'result-a', testDefinitionId: testId, resultText: '40 cm', testDefinition: testA }] };
function handlers(evaluations: unknown[] = [], tests: unknown[] = [testA, testB]): void {
  server.use(
    http.get('http://localhost:3000/api/sala/physical-test-definitions', () => HttpResponse.json({ data: tests })),
    http.get(`http://localhost:3000/api/sala/people/${personId}/physical-evaluations`, () => HttpResponse.json({ data: evaluations })),
    http.get('http://localhost:3000/api/sala/professors', () => HttpResponse.json({ data: [history.professor] })),
  );
}
async function openNew(): Promise<void> {
  await screen.findByText('No hay evaluaciones físicas registradas.');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Nueva evaluación física' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Nueva evaluación física' }));
  await screen.findByRole('option', { name: 'Simpson, Bart' });
}
it('sends three open results including the same test twice and internal observation without Team access', async () => {
  let payload: unknown; let teamCalls = 0; handlers();
  server.use(http.get('http://localhost:3000/api/team/users', () => { teamCalls++; return HttpResponse.json({}, { status: 403 }); }), http.post('http://localhost:3000/api/sala/physical-evaluations', async ({ request }) => { payload = await request.json(); return HttpResponse.json({ data: history }, { status: 201 }); }));
  renderPanel(); await openNew();
  expect(screen.getByRole('button', { name: 'Quitar' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Fecha de evaluación'), { target: { value: '2026-10-14' } });
  fireEvent.change(screen.getByLabelText('Observación'), { target: { value: ' Control general ' } });
  for (const [index, id, text] of [[0, testId, '170°'], [1, testId, '160°'], [2, testB.id, '48 cm']] as const) {
    if (index) fireEvent.click(screen.getByRole('button', { name: 'Agregar test' }));
    fireEvent.change(screen.getByLabelText(index ? `Test físico ${index + 1}` : 'Test físico'), { target: { value: id } });
    fireEvent.change(screen.getByLabelText(index ? `Resultado ${index + 1}` : 'Resultado'), { target: { value: text } });
  }
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(payload).toEqual({ personId, salaParticipationId: participationId, professorId, evaluationDate: '2026-10-14', observation: 'Control general', results: [{ testDefinitionId: testId, resultText: '170°' }, { testDefinitionId: testId, resultText: '160°' }, { testDefinitionId: testB.id, resultText: '48 cm' }] }));
  expect(teamCalls).toBe(0);
});
it('creates a test inline, selects its originating row and preserves the other results', async () => {
  const tests: PhysicalTestDefinitionResponseDto[] = [testA]; handlers([], tests); let payload: unknown;
  server.use(http.post('http://localhost:3000/api/sala/physical-test-definitions', async ({ request }) => { payload = await request.json(); const created = { ...testB, name: 'Salto horizontal', type: 'STRENGTH', description: 'Distancia máxima' }; tests.push(created); return HttpResponse.json({ data: created }, { status: 201 }); }));
  renderPanel(); await openNew();
  fireEvent.change(screen.getByLabelText('Test físico'), { target: { value: testId } });
  fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: '170°' } });
  fireEvent.click(screen.getByRole('button', { name: 'Agregar test' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Crear test' })[1]!);
  fireEvent.change(screen.getByLabelText('Nombre del test'), { target: { value: 'Salto horizontal' } });
  fireEvent.change(screen.getByLabelText('Tipo del test'), { target: { value: 'STRENGTH' } });
  fireEvent.change(screen.getByLabelText('Descripción del test'), { target: { value: 'Distancia máxima' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar test' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Guardar test' }));
  await waitFor(() => expect(screen.getByLabelText('Test físico 2')).toHaveValue(testB.id));
  expect(payload).toEqual({ name: 'Salto horizontal', type: 'STRENGTH', description: 'Distancia máxima' });
  expect(screen.getByLabelText('Resultado')).toHaveValue('170°');
  expect(screen.getByLabelText('Test físico')).toHaveValue(testId);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});
it('can create the first test inside an evaluation with an empty catalog', async () => {
  handlers([], []); renderPanel(); await openNew();
  fireEvent.click(screen.getByRole('button', { name: 'Crear test' }));
  expect(screen.getByLabelText('Nombre del test')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
});
it('corrects directly with date and professor displayed read-only', async () => {
  let payload: unknown; handlers([history]);
  server.use(http.patch('http://localhost:3000/api/sala/physical-evaluations/evaluation', async ({ request }) => { payload = await request.json(); return HttpResponse.json({ data: history }); }));
  renderPanel(); expect(await screen.findByText('Observación: Inicial')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Corregir' }));
  const dialog = within(screen.getByRole('dialog'));
  expect(dialog.getByText('Fecha: 20/08/2026')).toBeInTheDocument(); expect(dialog.getByText('Profesor: Bart Simpson')).toBeInTheDocument();
  expect(dialog.queryByLabelText('Fecha de evaluación')).not.toBeInTheDocument(); expect(dialog.queryByLabelText('Profesional responsable')).not.toBeInTheDocument();
  expect(dialog.getByLabelText('Observación')).toHaveValue('Inicial'); expect(dialog.getByLabelText('Resultado')).toHaveValue('40 cm');
  fireEvent.change(dialog.getByLabelText('Resultado'), { target: { value: '42 cm' } });
  fireEvent.change(dialog.getByLabelText('Observación'), { target: { value: 'Revisado' } });
  await waitFor(() => expect(dialog.getByRole('button', { name: 'Guardar' })).toBeEnabled()); fireEvent.click(dialog.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(payload).toEqual({ observation: 'Revisado', results: [{ testDefinitionId: testId, resultText: '42 cm' }] }));
});
it('keeps a retired historical result selectable only in its original row until changed', async () => {
  const retired = { ...testA, isActive: false }; handlers([{ ...history, results: [{ ...history.results[0], testDefinition: retired }] }], [testB]);
  renderPanel(); await screen.findByText('Test A (retirado): 40 cm'); fireEvent.click(screen.getByRole('button', { name: 'Corregir' }));
  expect(screen.getByRole('option', { name: 'Test A (retirado)' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: '42 cm' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Agregar test' }));
  expect(within(screen.getByLabelText('Test físico 2')).queryByRole('option', { name: 'Test A (retirado)' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Test físico'), { target: { value: testB.id } });
  expect(screen.queryByRole('option', { name: 'Test A (retirado)' })).not.toBeInTheDocument();
});
it('keeps history without participation and disables only creation', async () => {
  handlers([history]); renderPanel({ participationId: null });
  expect(await screen.findByText('Test A: 40 cm')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Nueva evaluación física' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Corregir' })).toBeEnabled();
});
it('shows administrative history with no management actions', async () => {
  handlers([history]); renderPanel({ canManage: false, canManageTestCatalog: false });
  expect(await screen.findByText('Observación: Inicial')).toBeInTheDocument();
  for (const name of ['Nueva evaluación física', 'Corregir', 'Administrar tests']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
});
it('creates, edits and retires catalog tests while refreshing internal history', async () => {
  const tests: PhysicalTestDefinitionResponseDto[] = [testA]; handlers([history], tests); const payloads: unknown[] = [];
  server.use(
    http.post('http://localhost:3000/api/sala/physical-test-definitions', async ({ request }) => { payloads.push(await request.json()); tests.push(testB); return HttpResponse.json({ data: testB }, { status: 201 }); }),
    http.patch(`http://localhost:3000/api/sala/physical-test-definitions/${testId}`, async ({ request }) => { payloads.push(await request.json()); tests[0] = { ...testA, name: 'Nombre B' }; return HttpResponse.json({ data: tests[0] }); }),
    http.post(`http://localhost:3000/api/sala/physical-test-definitions/${testId}/retire`, () => { tests.splice(0, 1); return HttpResponse.json({ data: { ...testA, isActive: false } }, { status: 201 }); }),
  );
  renderPanel(); await screen.findByText('Test A: 40 cm'); fireEvent.click(screen.getByRole('button', { name: 'Administrar tests' }));
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo test' })); fireEvent.change(screen.getByLabelText('Nombre del test'), { target: { value: 'Test B' } }); fireEvent.change(screen.getByLabelText('Tipo del test'), { target: { value: 'OTHER' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar test' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: 'Guardar test' }));
  await waitFor(() => expect(screen.queryByLabelText('Nombre del test')).not.toBeInTheDocument());
  fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]!); fireEvent.change(screen.getByLabelText('Nombre del test'), { target: { value: 'Nombre B' } }); fireEvent.change(screen.getByLabelText('Tipo del test'), { target: { value: 'MOBILITY' } }); fireEvent.change(screen.getByLabelText('Descripción del test'), { target: { value: 'Descripción B' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar test' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: 'Guardar test' })); await screen.findByText('Nombre B');
  expect(payloads).toEqual([{ name: 'Test B', type: 'OTHER', description: null }, { name: 'Nombre B', type: 'MOBILITY', description: 'Descripción B' }]);
  fireEvent.click(screen.getAllByRole('button', { name: 'Retirar' })[0]!); expect(screen.getByText(/Las Evaluaciones históricas no se modificarán/)).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Retirar' }));
  await waitFor(() => expect(screen.queryByText('Nombre B')).not.toBeInTheDocument()); expect(screen.getByText('Test A: 40 cm')).toBeInTheDocument();
});

it.each(['create', 'edit', 'retire', 'correct'])('preserves the relevant form and a functional error when %s fails', async action => {
  handlers([history]);
  server.use(
    http.post('http://localhost:3000/api/sala/physical-test-definitions', () => HttpResponse.json({ message: 'SQL failure' }, { status: 409 })),
    http.patch(`http://localhost:3000/api/sala/physical-test-definitions/${testId}`, () => HttpResponse.json({}, { status: 409 })),
    http.post(`http://localhost:3000/api/sala/physical-test-definitions/${testId}/retire`, () => HttpResponse.json({}, { status: 409 })),
    http.patch('http://localhost:3000/api/sala/physical-evaluations/evaluation', () => HttpResponse.json({}, { status: 409 })),
  );
  renderPanel(); await screen.findByText('Test A: 40 cm');
  if (action === 'correct') {
    fireEvent.click(screen.getByRole('button', { name: 'Corregir' }));
    fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: '42 cm' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar la evaluación física.');
    expect(screen.getByLabelText('Resultado')).toHaveValue('42 cm');
  } else {
    fireEvent.click(screen.getByRole('button', { name: 'Administrar tests' }));
    if (action === 'retire') {
      fireEvent.click(screen.getAllByRole('button', { name: 'Retirar' })[0]!);
      fireEvent.click(screen.getByRole('button', { name: 'Retirar' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos retirar el test.');
      expect(within(screen.getByRole('dialog')).getByText('Test A')).toBeInTheDocument();
    } else {
      fireEvent.click(action === 'create' ? screen.getByRole('button', { name: 'Nuevo test' }) : screen.getAllByRole('button', { name: 'Editar' })[0]!);
      fireEvent.change(screen.getByLabelText('Nombre del test'), { target: { value: 'Nombre cargado' } });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar test' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Guardar test' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar el test.');
      expect(screen.getByLabelText('Nombre del test')).toHaveValue('Nombre cargado');
    }
  }
  expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(screen.queryByText(/SQL failure/)).not.toBeInTheDocument();
});
it('preserves evaluation rows when inline creation fails', async () => {
  handlers(); server.use(http.post('http://localhost:3000/api/sala/physical-test-definitions', () => HttpResponse.json({}, { status: 409 })));
  renderPanel(); await openNew(); fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: '170°' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear test' })); fireEvent.change(screen.getByLabelText('Nombre del test'), { target: { value: 'Nuevo nombre' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar test' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: 'Guardar test' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar el test.'); expect(screen.getByLabelText('Resultado')).toHaveValue('170°'); expect(screen.getByLabelText('Nombre del test')).toHaveValue('Nuevo nombre');
});

it('starts physical tests without type, saves null and edits a test without type', async () => {
  const tests: PhysicalTestDefinitionResponseDto[] = [{ ...testA, type: null }];
  handlers([], tests);
  const payloads: unknown[] = [];
  server.use(
    http.post('http://localhost:3000/api/sala/physical-test-definitions', async ({ request }) => { const input = await request.json() as { name: string; type: null }; payloads.push(input); const row = { ...testB, ...input }; tests.push(row); return HttpResponse.json({ data: row }, { status: 201 }); }),
    http.patch(`http://localhost:3000/api/sala/physical-test-definitions/${testId}`, async ({ request }) => { payloads.push(await request.json()); return HttpResponse.json({ data: tests[0] }); }),
  );
  renderPanel(); await screen.findByText('No hay evaluaciones físicas registradas.');
  fireEvent.click(screen.getByRole('button', { name: 'Administrar tests' }));
  expect(screen.queryByText('Sin tipo')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo test' }));
  expect(screen.getByLabelText('Tipo del test')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('Nombre del test'), { target: { value: 'Salto vertical' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar test' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Guardar test' }));
  await waitFor(() => expect(screen.queryByLabelText('Nombre del test')).not.toBeInTheDocument());
  fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);
  expect(screen.getByLabelText('Tipo del test')).toHaveValue('');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar test' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Guardar test' }));
  await waitFor(() => expect(payloads).toEqual([{ name: 'Salto vertical', type: null, description: null }, { name: 'Test A', type: null, description: null }]));
});
