import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, cleanup } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import TrainingHistoryPage from './page';
vi.mock('next/navigation', () => ({ usePathname: () => '/portal/sala/entrenamientos' }));
const nativeFetch = globalThis.fetch;
const server = setupServer(http.get('http://localhost:3000/api/portal/auth/session', () => HttpResponse.json({ data: { csrfToken: 'csrf' } })), http.get('http://localhost:3000/api/portal/sala/training-records', () => HttpResponse.json({ data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } })));
beforeAll(() => { globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost:3000') : input, init)) as typeof fetch; server.listen({ onUnhandledRequest: 'error' }); });
afterEach(cleanup); afterAll(() => { server.close(); globalThis.fetch = nativeFetch; });
it('shows the empty personal history without requiring an active routine', async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TrainingHistoryPage/></QueryClientProvider>);
  expect(await screen.findByText('Todavía no registraste entrenamientos.')).toBeInTheDocument(); expect(screen.getByRole('heading', { name: 'Mis entrenamientos' })).toBeInTheDocument();
});
