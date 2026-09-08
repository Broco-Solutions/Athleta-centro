import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import HomePage from './page';
vi.mock('../features/auth/auth-shell', () => ({ AuthShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('../features/auth/auth', () => ({ currentSession: vi.fn().mockResolvedValue({ permissions: ['PEOPLE_READ'] }) }));
describe('HomePage', () => { it('renders the Athleta application shell', async () => { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HomePage /></QueryClientProvider>); expect(screen.getByRole('heading', { name: 'Bienvenido a Athleta' })).toBeInTheDocument(); expect(await screen.findByText('Personas')).toBeInTheDocument(); }); });
