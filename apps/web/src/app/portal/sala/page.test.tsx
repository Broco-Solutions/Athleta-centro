import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import PortalSala from './page';

const server = setupServer();
const nativeFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'bypass' });
});
beforeEach(() => {
  server.use(
    http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: { reservations: [], fixed: [], routine: null, evaluations: [], paymentState: 'PENDING' } })),
    http.get('http://localhost:3000/api/portal/sala/services', () => HttpResponse.json({ data: [{ id: 'service', name: 'Rehabilitación', durationMinutes: 45 }] })),
    http.get('http://localhost:3000/api/portal/sala/availability', () => HttpResponse.json({ data: [
      { scheduleSlotId: 'window', startTime: '09:00', endTime: '09:15', available: true, date: '2026-09-01' },
      { scheduleSlotId: 'window', startTime: '09:15', endTime: '09:30', available: true, date: '2026-09-01' },
      { scheduleSlotId: 'window', startTime: '09:30', endTime: '09:45', available: true, date: '2026-09-01' },
    ] })),
    http.get('http://localhost:3000/api/portal/auth/session', () => HttpResponse.json({ data: { csrfToken: 'csrf' } })),
    http.post('http://localhost:3000/api/portal/sala/reservations', async ({ request }) => {
      const body = await request.json();
      expect(body).toMatchObject({ scheduleSlotId: 'window', startTime: '09:00' });
      return HttpResponse.json({ data: { id: 'reservation' } }, { status: 201 });
    }),
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });

it('enables a valid Portal Sala reservation and sends the selected start', async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><PortalSala /></QueryClientProvider>);
  const reserve = await screen.findByRole('button', { name: 'Reservar horario' });
  expect(reserve).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Servicio'), { target: { value: 'service' } });
  fireEvent.change(screen.getByLabelText('Inicio'), { target: { value: 'window:09:00' } });
  await waitFor(() => expect(reserve).toBeEnabled());
  fireEvent.click(reserve);
  expect(await screen.findByText('Horario reservado.')).toBeInTheDocument();
});
