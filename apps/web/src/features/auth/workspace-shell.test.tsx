import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentSession } from './auth';
import { WorkspaceShell } from './workspace-shell';

vi.mock('./auth', () => ({
  currentSession: vi.fn(),
  logout: vi.fn(),
}));

const makeSession = (permissions: string[] = [], roles: string[] = []) => ({
  user: { id: 'synthetic-user', firstName: 'Ana', lastName: 'Demo', email: 'ana@example.test' },
  roles,
  permissions,
  mustChangePassword: false,
  csrfToken: 'synthetic-csrf-token',
});

function renderShell({ permissions = [], roles = [], active = 'Inicio' }: { permissions?: string[]; roles?: string[]; active?: string } = {}) {
  vi.mocked(currentSession).mockResolvedValue(makeSession(permissions, roles) as never);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><WorkspaceShell active={active}><h1>Contenido sintético</h1></WorkspaceShell></QueryClientProvider>);
}

describe('WorkspaceShell', () => {
  beforeEach(() => {
    vi.mocked(currentSession).mockResolvedValue(makeSession() as never);
  });

  afterEach(() => {
    cleanup();
  });

  it('muestra la marca como enlace a Inicio y mantiene un único Inicio de navegación sin título redundante', async () => {
    renderShell();

    const brand = await screen.findByRole('link', { name: 'Athleta · Inicio' });
    expect(brand).toHaveAttribute('href', '/');
    expect(within(brand).getByText('ATHLETA')).toBeInTheDocument();

    const navigation = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(within(navigation).getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
    expect(within(navigation).getAllByText('Inicio')).toHaveLength(1);
    expect(screen.queryByText('Athleta Manager')).not.toBeInTheDocument();
  });

  it('conserva el resaltado amarillo del acceso activo', async () => {
    renderShell({ permissions: ['PEOPLE_READ'], active: 'Personas' });

    const activeLink = await screen.findByRole('link', { name: 'Personas' });
    expect(activeLink).toHaveAttribute('aria-current', 'page');
    expect(activeLink).toHaveClass('bg-primary', 'font-semibold', 'text-primary-foreground');
  });

  it.each([
    ['Personas', 'PEOPLE_READ', ['Personas']],
    ['Equipo', 'TEAM_READ', ['Equipo']],
    ['Sala', 'SALA_AGENDA_MANAGE', ['Sala']],
    ['Reservas', 'SALA_RELATION_READ', ['Reservas']],
    ['Clínica', 'CLINIC_OPERATIONAL_READ', ['Reservas', 'Clínica']],
    ['Finanzas', 'FINANCE_OPERATIONAL_READ', ['Finanzas']],
  ])('mantiene la regla de acceso actual de %s', async (_label, permission, expectedLabels) => {
    renderShell({ permissions: [permission] });

    const navigation = await screen.findByRole('navigation', { name: 'Navegación principal' });
    for (const label of expectedLabels) expect(within(navigation).getByRole('link', { name: label })).toBeInTheDocument();
    for (const hiddenLabel of ['Personas', 'Equipo', 'Sala', 'Reservas', 'Clínica', 'Finanzas']) {
      if (!expectedLabels.includes(hiddenLabel)) expect(within(navigation).queryByRole('link', { name: hiddenLabel })).not.toBeInTheDocument();
    }
    expect(within(navigation).getByRole('link', { name: 'Inicio' })).toBeInTheDocument();
  });

  it('muestra las acciones de usuario para una sesión interna normal', async () => {
    renderShell({ permissions: ['PEOPLE_READ'] });

    expect(await screen.findByRole('link', { name: 'Mi perfil' })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('oculta Mi perfil para BROCO_SUPPORT y conserva Cerrar sesión', async () => {
    renderShell({ roles: ['BROCO_SUPPORT'] });

    await screen.findByRole('navigation', { name: 'Navegación principal' });
    expect(screen.queryByRole('link', { name: 'Mi perfil' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });
});
