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

it('gives pure Professor exactly Inicio, Reservas, Alumnos and Rutinas on desktop and mobile', async () => {
  renderShell({ roles: ['PROFESSOR'], active: 'Alumnos', permissions: ['PEOPLE_READ', 'PEOPLE_CREATE', 'SALA_RELATION_READ', 'SALA_PARTICIPATION_MANAGE', 'SALA_AGENDA_MANAGE', 'SALA_ROUTINE_READ', 'SALA_ROUTINE_MANAGE', 'SALA_PAYMENT_READ', 'SALA_PAYMENT_MANAGE', 'EXPENSE_CREATE'] });
  await screen.findByRole('link', { name: 'Alumnos' });
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  for (const name of ['Navegación principal', 'Navegación móvil']) {
    const navigation = within(screen.getByRole('navigation', { name }));
    expect(navigation.getAllByRole('link').map((link) => link.textContent)).toEqual(['Inicio', 'Reservas', 'Alumnos', 'Rutinas']);
    expect(navigation.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/', '/reservations', '/students', '/routines']);
    expect(navigation.getByRole('link', { name: 'Alumnos' })).toHaveAttribute('aria-current', 'page');
    for (const label of ['Personas', 'Sala', 'Equipo', 'Clínica', 'Finanzas']) expect(navigation.queryByRole('link', { name: label })).not.toBeInTheDocument();
  }
});
it.each(['KINESIOLOGIST', 'ADMINISTRATIVE'])('preserves permission navigation for PROFESSOR + %s', async (role) => {
  renderShell({ roles: ['PROFESSOR', role], permissions: ['PEOPLE_READ', 'SALA_ROUTINE_MANAGE', 'CLINIC_OPERATIONAL_READ'] });
  await screen.findByRole('link', { name: 'Personas' });
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  for (const name of ['Navegación principal', 'Navegación móvil']) expect(within(screen.getByRole('navigation', { name })).getAllByRole('link').map((link) => link.textContent)).toEqual(['Inicio', 'Personas', 'Sala', 'Rutinas', 'Reservas', 'Clínica']);
});

it.each([{ roles: ['GENERAL_ADMIN'] }, { roles: ['GENERAL_ADMIN', 'PROFESSOR'] }])('uses General Admin navigation for roles %j on desktop and mobile', async ({ roles }) => {
  renderShell({ roles, permissions: ['PEOPLE_READ', 'SALA_RELATION_READ', 'SALA_ROUTINE_MANAGE', 'CLINIC_OPERATIONAL_READ', 'FINANCE_OPERATIONAL_READ', 'TEAM_READ'] });
  const expectedLabels = ['Inicio', 'Personas', 'Agenda', 'Sala', 'Clínica', 'Finanzas', 'Equipo'];
  const expectedHrefs = ['/', '/people', '/reservations', '/sala', '/clinic', '/finance', '/team'];
  await screen.findByRole('link', { name: 'Agenda' });
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  for (const name of ['Navegación principal', 'Navegación móvil']) {
    const nav = within(screen.getByRole('navigation', { name }));
    const links = nav.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(expectedLabels);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(expectedHrefs);
    for (const label of ['Reservas', 'Alumnos', 'Rutinas']) expect(nav.queryByRole('link', { name: label })).not.toBeInTheDocument();
  }
});
