import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import HomePage from './page';
vi.mock('../features/auth/auth-shell', () => ({ AuthShell: ({ children }: { children: React.ReactNode }) => children }));
describe('HomePage', () => { it('renders the Athleta application shell', () => { render(<HomePage />); expect(screen.getByRole('heading', { name: 'Bienvenido a Athleta' })).toBeInTheDocument(); expect(screen.getByText('Personas')).toBeInTheDocument(); }); });
