import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
    expect(within(brand).getByRole('img', { name: 'Athleta' })).toHaveAttribute('src', expect.stringContaining('logo-athleta.png'));

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
    ['Rutinas', 'SALA_ROUTINE_MANAGE', ['Sala', 'Rutinas']],
    ['Reservas', 'SALA_RELATION_READ', ['Reservas']],
    ['Clínica', 'CLINIC_OPERATIONAL_READ', ['Reservas', 'Clínica']],
    ['Finanzas', 'FINANCE_OPERATIONAL_READ', ['Finanzas']],
  ])('mantiene la regla de acceso actual de %s', async (_label, permission, expectedLabels) => {
    renderShell({ permissions: [permission] });

    const desktopNavigation = await screen.findByRole('navigation', { name: 'Navegación principal' });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    const drawer = screen.getByRole('dialog', { name: 'Menú principal' });
    for (const navigation of [desktopNavigation, within(drawer).getByRole('navigation')]) {
      expect(within(navigation).getAllByRole('link').map((link) => link.textContent)).toEqual(['Inicio', ...expectedLabels]);
    }
  });

  it('abre el drawer cerrado inicialmente y conserva la marca y el activo amarillo en ambas navegaciones', async () => {
    renderShell({ permissions: ['PEOPLE_READ'], active: 'Personas' });

    const trigger = await screen.findByRole('button', { name: 'Abrir menú' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls', 'internal-mobile-navigation');
    expect(screen.queryByRole('dialog', { name: 'Menú principal' })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const drawer = screen.getByRole('dialog', { name: 'Menú principal' });
    expect(drawer).toHaveAttribute('id', 'internal-mobile-navigation');
    const brand = within(drawer).getByRole('link', { name: 'Athleta · Inicio' });
    expect(brand).toHaveAttribute('href', '/');
    expect(within(brand).getByRole('img', { name: 'Athleta' })).toBeInTheDocument();
    for (const navigation of [drawer, screen.getByRole('navigation', { name: 'Navegación principal' })]) {
      const activeLink = within(navigation).getByRole('link', { name: 'Personas' });
      expect(activeLink).toHaveAttribute('aria-current', 'page');
      expect(activeLink).toHaveClass('bg-primary', 'font-semibold', 'text-primary-foreground');
    }
  });

  it.each(['botón', 'overlay', 'acceso', 'marca', 'Escape'])('cierra el drawer mediante %s', async (method) => {
    renderShell({ permissions: ['PEOPLE_READ'] });
    const trigger = await screen.findByRole('button', { name: 'Abrir menú' });
    fireEvent.click(trigger);
    const drawer = screen.getByRole('dialog', { name: 'Menú principal' });

    if (method === 'botón') fireEvent.click(within(drawer).getByRole('button', { name: 'Cerrar menú' }));
    if (method === 'overlay') fireEvent.click(screen.getByRole('button', { name: 'Cerrar menú desde el fondo' }));
    if (method === 'acceso') fireEvent.click(within(drawer).getByRole('link', { name: 'Personas' }));
    if (method === 'marca') fireEvent.click(within(drawer).getByRole('link', { name: 'Athleta · Inicio' }));
    if (method === 'Escape') fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Menú principal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar menú desde el fondo' })).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
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

it('shows Rutinas immediately after Sala for routine managers', async () => {
  renderShell({ permissions: ['SALA_ROUTINE_MANAGE'], active: 'Rutinas' });
  const link = await screen.findByRole('link', { name: 'Rutinas' });
  expect(link).toHaveAttribute('href', '/routines'); expect(link).toHaveAttribute('aria-current', 'page');
  expect(within(screen.getByRole('navigation', { name: 'Navegación principal' })).getAllByRole('link').map((item) => item.textContent)).toEqual(['Inicio', 'Sala', 'Rutinas']);
});
it('hides Rutinas for users with only routine read permission', async () => {
  renderShell({ permissions: ['SALA_ROUTINE_READ'] }); await screen.findByRole('link', { name: 'Sala' });
  expect(screen.queryByRole('link', { name: 'Rutinas' })).not.toBeInTheDocument();
});
