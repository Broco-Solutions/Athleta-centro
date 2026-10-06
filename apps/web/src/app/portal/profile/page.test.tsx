import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import Profile from './page';

const server = setupServer();
const nativeFetch = globalThis.fetch;
const uuid = '550e8400-e29b-41d4-a716-446655440000';
const profile = { firstName: 'Ana', lastName: 'Sintética', dni: '20123456', phone: '3415551234', birthDate: '1990-01-01' };
beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch;
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => server.use(
  http.get('http://localhost:3000/api/portal/sala', () => HttpResponse.json({ data: {} })),
  http.get('http://localhost:3000/api/portal/clinic/appointments', () => HttpResponse.json({ data: [] })),
));
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
function renderProfile() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Profile /></QueryClientProvider>);
}
it('shows optional coverage by name and affiliate number without displaying the technical ID', async () => {
  server.use(http.get('http://localhost:3000/api/portal/me', () => HttpResponse.json({ data: { ...profile, socialWorkId: uuid, socialWorkName: 'OSDE', affiliateNumber: '123456' } })));
  renderProfile();
  expect(await screen.findByText('OSDE')).toBeInTheDocument();
  expect(screen.getByText('Obra social')).toBeInTheDocument();
  expect(screen.getByText('Número de afiliado')).toBeInTheDocument();
  expect(screen.getByText('123456')).toBeInTheDocument();
  expect(screen.queryByText(uuid)).not.toBeInTheDocument();
});
it.each([{}, { socialWorkId: uuid }])('omits absent optional rows and never falls back to an ID: %j', async (extra) => {
  server.use(http.get('http://localhost:3000/api/portal/me', () => HttpResponse.json({ data: { ...profile, ...extra } })));
  renderProfile();
  await screen.findByText('Ana Sintética');
  expect(screen.queryByText('Obra social')).not.toBeInTheDocument();
  expect(screen.queryByText('Número de afiliado')).not.toBeInTheDocument();
  expect(screen.queryByText(uuid)).not.toBeInTheDocument();
  expect(screen.queryByText('Sin informar')).not.toBeInTheDocument();
});
