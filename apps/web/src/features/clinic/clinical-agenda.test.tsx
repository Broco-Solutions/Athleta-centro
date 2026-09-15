import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { ClinicalAgenda } from './clinical-agenda';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const appointment = {
  id: '10000000-0000-4000-8000-000000000001',
  personId: '20000000-0000-4000-8000-000000000001',
  professionalId: '30000000-0000-4000-8000-000000000001',
  startAt: '2026-09-15T13:00:00.000Z',
  durationMinutes: 60,
  status: 'SCHEDULED' as const,
  operationalNote: null,
  person: { id: '20000000-0000-4000-8000-000000000001', firstName: 'Ana', lastName: 'Sintética', dni: '45000001' },
  professional: { id: '30000000-0000-4000-8000-000000000001', firstName: 'Pablo', lastName: 'Clínico', roles: ['KINESIOLOGIST' as const] },
  hasAttention: false,
  hasEvolution: false,
  coverage: null,
  overlapCount: 0,
};

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(
    typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input,
    init,
  )) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

function renderAgenda(): void {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ClinicalAgenda csrfToken="csrf" canManage />
    </QueryClientProvider>,
  );
}

function baseHandlers(): void {
  server.use(
    http.get('http://localhost:3000/api/clinic/appointments', () => HttpResponse.json({ data: [appointment] })),
    http.get('http://localhost:3000/api/clinic/professionals', () => HttpResponse.json({ data: [appointment.professional] })),
  );
}

it('requires explicit coverage before correcting a Turno to Atendido', async () => {
  let submitted: unknown;
  baseHandlers();
  server.use(http.post('http://localhost:3000/api/clinic/appointments/:id/correct', async ({ request }) => {
    submitted = await request.json();
    return HttpResponse.json({ data: { ...appointment, status: 'ATTENDED', hasAttention: true, coverage: 'PRIVATE' } }, { status: 201 });
  }));
  renderAgenda();

  fireEvent.change(await screen.findByLabelText('Nuevo estado de Ana Sintética'), { target: { value: 'ATTENDED' } });
  const apply = screen.getByRole('button', { name: 'Aplicar estado' });
  expect(apply).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Cobertura de Ana Sintética'), { target: { value: 'PRIVATE' } });
  expect(apply).toBeEnabled();
  fireEvent.click(apply);

  await waitFor(() => expect(submitted).toEqual({ status: 'ATTENDED', coverage: 'PRIVATE' }));
  expect(await screen.findByText(/La Atención quedó sin Evolución/)).toBeInTheDocument();
});

it('requests the Buenos Aires weekly range and the past-pending filter', async () => {
  const searches: string[] = [];
  server.use(
    http.get('http://localhost:3000/api/clinic/appointments', ({ request }) => {
      searches.push(decodeURIComponent(new URL(request.url).search));
      return HttpResponse.json({ data: [] });
    }),
    http.get('http://localhost:3000/api/clinic/professionals', () => HttpResponse.json({ data: [] })),
  );
  renderAgenda();
  fireEvent.change(screen.getByLabelText('Fecha de agenda'), { target: { value: '2026-09-16' } });
  fireEvent.click(screen.getByRole('button', { name: 'Semana' }));
  await waitFor(() => expect(searches.some((search) => search.includes('from=2026-09-14T03:00:00.000Z') && search.includes('to=2026-09-21T03:00:00.000Z'))).toBe(true));

  fireEvent.click(screen.getByRole('button', { name: 'Pendientes pasados' }));
  await waitFor(() => expect(searches.some((search) => search.includes('pendingPastScheduled=YES'))).toBe(true));
});

it('shows the stable dependency conflict without exposing a payload', async () => {
  server.use(
    http.get('http://localhost:3000/api/clinic/appointments', () => HttpResponse.json({ data: [{
      ...appointment,
      status: 'ATTENDED',
      hasAttention: true,
      coverage: 'PRIVATE',
    }] })),
    http.get('http://localhost:3000/api/clinic/professionals', () => HttpResponse.json({ data: [appointment.professional] })),
    http.post('http://localhost:3000/api/clinic/appointments/:id/correct', () => HttpResponse.json({
      statusCode: 409,
      code: 'ATTENTION_HAS_DEPENDENCIES',
      message: 'internal detail',
    }, { status: 409 })),
  );
  renderAgenda();

  fireEvent.change(await screen.findByLabelText('Nuevo estado de Ana Sintética'), { target: { value: 'CANCELLED' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar estado' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('La Atención posee contenido o dependencias.');
  expect(screen.getByRole('alert')).not.toHaveTextContent('internal detail');
});
