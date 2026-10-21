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

function renderShell({ permissions = [], roles = [], active = 'home' }: { permissions?: string[]; roles?: string[]; active?: string } = {}) {
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
    renderShell({ permissions: ['PEOPLE_READ'], active: 'people' });

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
    ['Clínica', 'CLINIC_OPERATIONAL_READ', ['Reservas', 'Pacientes', 'Turnos']],
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
    renderShell({ permissions: ['PEOPLE_READ'], active: 'people' });

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

  it('muestra identidad y acciones de sesión dentro del sidebar y no en el header', async () => {
    renderShell({ permissions: ['PEOPLE_READ'], roles: ['PROFESSOR'] });

    const sidebar = within(await screen.findByRole('complementary'));
    expect(sidebar.getByText('Ana Demo')).toBeVisible();
    expect(sidebar.getByText('Profesor')).toBeVisible();
    expect(sidebar.getByRole('link', { name: 'Mi perfil' })).toHaveAttribute('href', '/profile');
    expect(sidebar.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    const header = document.querySelector('.fixed.inset-x-0.top-0');
    expect(header).not.toHaveTextContent('Ana Demo');
    expect(header).not.toHaveTextContent('Profesor');
    expect(header).not.toHaveTextContent('Mi perfil');
    expect(header).not.toHaveTextContent('Cerrar sesión');
  });

  it('muestra los roles combinados en el orden recibido', async () => {
    renderShell({ roles: ['KINESIOLOGIST', 'OSTEOPATH'] });

    const sidebar = within(await screen.findByRole('complementary'));
    expect(sidebar.getByText('Ana Demo')).toBeVisible();
    expect(sidebar.getByText('Kinesiólogo · Osteópata')).toBeVisible();
    expect(sidebar.getByRole('link', { name: 'Mi perfil' })).toBeInTheDocument();
    expect(sidebar.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('muestra la etiqueta de Administrador general', async () => {
    renderShell({ roles: ['GENERAL_ADMIN'] });

    expect(within(await screen.findByRole('complementary')).getByText('Administrador general')).toBeVisible();
  });

  it('oculta Mi perfil para BROCO_SUPPORT y conserva Cerrar sesión', async () => {
    renderShell({ roles: ['BROCO_SUPPORT'] });

    const sidebar = within(await screen.findByRole('complementary'));
    expect(sidebar.getByText('Ana Demo')).toBeVisible();
    expect(sidebar.getByText('Soporte Broco')).toBeVisible();
    expect(sidebar.queryByRole('link', { name: 'Mi perfil' })).not.toBeInTheDocument();
    expect(sidebar.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('muestra identidad y acciones al pie del drawer mobile y cierra al ir a Mi perfil', async () => {
    renderShell({ roles: ['PROFESSOR'] });
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir menú' }));
    const drawer = within(screen.getByRole('dialog', { name: 'Menú principal' }));
    expect(drawer.getByText('Ana Demo')).toBeVisible();
    expect(drawer.getByText('Profesor')).toBeVisible();
    expect(drawer.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    const profile = drawer.getByRole('link', { name: 'Mi perfil' });
    expect(profile).toHaveAttribute('href', '/profile');
    fireEvent.click(profile);
    expect(screen.queryByRole('dialog', { name: 'Menú principal' })).not.toBeInTheDocument();
  });
});

it('shows Rutinas inside Sala for routine managers', async () => {
  renderShell({ permissions: ['SALA_ROUTINE_MANAGE'], active: 'routines' });
  const link = await screen.findByRole('link', { name: 'Rutinas' });
  expect(link).toHaveAttribute('href', '/routines'); expect(link).toHaveAttribute('aria-current', 'page');
  expect(within(screen.getByRole('navigation', { name: 'Navegación principal' })).getAllByRole('link').map((item) => item.textContent)).toEqual(['Inicio', 'Sala', 'Rutinas']);
});
it('hides Rutinas for users with only routine read permission', async () => {
  renderShell({ permissions: ['SALA_ROUTINE_READ'] }); await screen.findByRole('link', { name: 'Sala' });
  expect(screen.queryByRole('link', { name: 'Rutinas' })).not.toBeInTheDocument();
});

it('gives pure Professor exactly Inicio, Reservas, Alumnos and Rutinas on desktop and mobile', async () => {
  renderShell({ roles: ['PROFESSOR'], active: 'sala-students', permissions: ['PEOPLE_READ', 'PEOPLE_CREATE', 'SALA_RELATION_READ', 'SALA_PARTICIPATION_MANAGE', 'SALA_AGENDA_MANAGE', 'SALA_ROUTINE_READ', 'SALA_ROUTINE_MANAGE', 'SALA_PAYMENT_READ', 'SALA_PAYMENT_REGISTER'] });
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
it('preserves permission navigation for PROFESSOR + KINESIOLOGIST', async () => {
  renderShell({ roles: ['PROFESSOR', 'KINESIOLOGIST'], permissions: ['PEOPLE_READ', 'SALA_ROUTINE_MANAGE', 'CLINIC_OPERATIONAL_READ'] });
  await screen.findByRole('link', { name: 'Personas' });
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  for (const name of ['Navegación principal', 'Navegación móvil']) expect(within(screen.getByRole('navigation', { name })).getAllByRole('link').map((link) => link.textContent)).toEqual(['Inicio', 'Personas', 'Sala', 'Rutinas', 'Reservas', 'Pacientes', 'Turnos']);
});

it.each([{ roles: ['GENERAL_ADMIN'] }, { roles: ['GENERAL_ADMIN', 'PROFESSOR'] }, { roles: ['GENERAL_ADMIN', 'KINESIOLOGIST'] }, { roles: ['ADMINISTRATIVE'] }, { roles: ['ADMINISTRATIVE', 'OSTEOPATH'] }])('uses administrative grouped navigation for roles %j on desktop and mobile', async ({ roles }) => {
  renderShell({ roles, permissions: ['PEOPLE_READ', 'PEOPLE_CREATE', 'PEOPLE_UPDATE_GENERAL', 'SALA_RELATION_READ', 'SALA_AGENDA_MANAGE', 'SALA_PARTICIPATION_MANAGE', 'SALA_SCHEDULE_MANAGE', 'SALA_ROUTINE_MANAGE', 'CLINIC_OPERATIONAL_READ', 'FINANCE_OPERATIONAL_READ', 'TEAM_READ'] });
  await screen.findByRole('link', { name: 'Inicio' });
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  for (const name of ['Navegación principal', 'Navegación móvil']) {
    const nav = within(screen.getByRole('navigation', { name }));
    expect(nav.getByRole('link', { name: 'Resumen' })).toHaveAttribute('href', '/');
    for (const [label, href] of [['Inicio', '/'], ['Sala', '/sala'], ['Finanzas', '/finance'], ['Equipo', '/team']]) expect(nav.getByRole('link', { name: label! })).toHaveAttribute('href', href);
    for (const label of ['Clínica', 'Pacientes', 'Turnos', 'Personas']) expect(nav.queryByText(label)).not.toBeInTheDocument();
    expect(nav.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-expanded', 'true');
    expect(nav.queryByRole('link', { name: 'Agenda' })).not.toBeInTheDocument();
    expect(nav.queryByRole('link', { name: 'Reservas' })).not.toBeInTheDocument();
  }
  const desktop = within(screen.getByRole('navigation', { name: 'Navegación principal' }));
  fireEvent.click(desktop.getByRole('link', { name: 'Sala' }));
  expect(desktop.getByRole('link', { name: 'Agenda' })).toHaveAttribute('href', '/sala');
  expect(desktop.getByRole('link', { name: 'Alumnos' })).toBeVisible();
  expect(desktop.getByRole('link', { name: 'Rutinas' })).toBeVisible();
  expect(desktop.getByRole('link', { name: 'Configuración' })).toBeVisible();
  const mobile = within(screen.getByRole('navigation', { name: 'Navegación móvil' }));
  expect(mobile.getByRole('link', { name: 'Agenda' })).toBeVisible();
  fireEvent.click(mobile.getByRole('link', { name: 'Finanzas' }));
  expect(screen.queryByRole('dialog', { name: 'Menú principal' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  expect(within(screen.getByRole('navigation', { name: 'Navegación móvil' })).getByRole('link', { name: 'Ingresos' })).toBeVisible();
});

it('shows Administrative grouped navigation without Rutinas when it only has routine read permission', async () => {
  renderShell({ roles: ['ADMINISTRATIVE'], permissions: ['PEOPLE_READ', 'SALA_AGENDA_MANAGE', 'SALA_PARTICIPATION_MANAGE', 'SALA_SCHEDULE_MANAGE', 'SALA_ROUTINE_READ', 'CLINIC_OPERATIONAL_READ', 'FINANCE_OPERATIONAL_READ', 'TEAM_READ'] });
  const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
  const sala = within(nav).getByRole('link', { name: 'Sala' });
  fireEvent.click(sala);
  expect(within(nav).getByRole('link', { name: 'Agenda' })).toBeVisible();
  expect(within(nav).getByRole('link', { name: 'Alumnos' })).toBeVisible();
  expect(within(nav).getByRole('link', { name: 'Configuración' })).toBeVisible();
  expect(within(nav).queryByRole('link', { name: 'Rutinas' })).not.toBeInTheDocument();
});

it('shows Rutinas for Administrative combined with Professor through the effective permission union', async () => {
  renderShell({ roles: ['ADMINISTRATIVE', 'PROFESSOR'], permissions: ['SALA_AGENDA_MANAGE', 'SALA_PARTICIPATION_MANAGE', 'SALA_ROUTINE_READ', 'SALA_ROUTINE_MANAGE'] });
  const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
  fireEvent.click(within(nav).getByRole('link', { name: 'Sala' }));
  expect(within(nav).getByRole('link', { name: 'Rutinas' })).toHaveAttribute('href', '/routines');
});

it('collapses and restores the complete desktop sidebar including its session footer', async () => {
  const { container } = renderShell({ roles: ['GENERAL_ADMIN'] });
  const sidebar = within(await screen.findByRole('complementary'));
  expect(screen.getByRole('button', { name: 'Ocultar menú lateral' })).toBeInTheDocument();
  expect(sidebar.getByText('Ana Demo')).toBeVisible();
  expect(sidebar.getByText('Administrador general')).toBeVisible();
  expect(sidebar.getByRole('link', { name: 'Mi perfil' })).toBeInTheDocument();
  expect(sidebar.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Ocultar menú lateral' }));
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Mostrar menú lateral' })).toBeInTheDocument();
  expect(container.querySelector('main')).toHaveClass('md:ml-0');
  expect(container.querySelector('main')).toHaveClass('md:pt-14');
  expect(container.querySelector('.fixed.inset-x-0.top-0')).toHaveClass('md:left-0');
  expect(screen.queryByText('Ana Demo')).not.toBeInTheDocument();
  expect(screen.queryByText('Administrador general')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Mi perfil' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Mostrar menú lateral' }));
  const restoredSidebar = within(await screen.findByRole('complementary'));
  expect(screen.getByRole('button', { name: 'Ocultar menú lateral' })).toBeInTheDocument();
  expect(container.querySelector('main')).toHaveClass('md:ml-60');
  expect(container.querySelector('main')).toHaveClass('md:pt-0');
  expect(restoredSidebar.getByText('Ana Demo')).toBeVisible();
  expect(restoredSidebar.getByText('Administrador general')).toBeVisible();
  expect(restoredSidebar.getByRole('link', { name: 'Mi perfil' })).toBeInTheDocument();
  expect(restoredSidebar.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  expect(container.querySelector('.fixed.inset-x-0.top-0')).toHaveClass('md:hidden');
});

it('keeps the active group open when its heading is selected', async () => {
  renderShell({ roles: ['GENERAL_ADMIN'], permissions: ['PEOPLE_READ'], active: 'home' });
  const nav = within(await screen.findByRole('navigation', { name: 'Navegación principal' }));
  const home = nav.getByRole('link', { name: 'Inicio' });
  expect(home).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(home);
  expect(home).toHaveAttribute('aria-expanded', 'true');
  expect(nav.getByRole('link', { name: 'Resumen' })).toBeVisible();
  expect(nav.queryByRole('link', { name: 'Personas' })).not.toBeInTheDocument();
});

it('opens the active General Admin group and only one group at a time, with active updates', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(currentSession).mockResolvedValue(makeSession(['PEOPLE_READ', 'SALA_AGENDA_MANAGE', 'SALA_PARTICIPATION_MANAGE', 'SALA_ROUTINE_MANAGE', 'FINANCE_OPERATIONAL_READ'], ['GENERAL_ADMIN']) as never);
  const view = render(<QueryClientProvider client={queryClient}><WorkspaceShell active="finance-income"><h1>Contenido sintético</h1></WorkspaceShell></QueryClientProvider>);
  const nav = within(await screen.findByRole('navigation', { name: 'Navegación principal' }));
  expect(nav.getByRole('link', { name: 'Finanzas' })).toHaveAttribute('aria-expanded', 'true');
  expect(nav.getByRole('link', { name: 'Ingresos' })).toHaveAttribute('aria-current', 'page');
  expect(nav.queryByRole('link', { name: 'Agenda' })).not.toBeInTheDocument();

  fireEvent.click(nav.getByRole('link', { name: 'Sala' }));
  fireEvent.click(nav.getByRole('link', { name: 'Finanzas' }));
  expect(nav.getByRole('link', { name: 'Sala' })).toHaveAttribute('aria-expanded', 'false');
  expect(nav.getByRole('link', { name: 'Finanzas' })).toHaveAttribute('aria-expanded', 'true');
  expect(nav.queryByRole('link', { name: 'Agenda' })).not.toBeInTheDocument();
  expect(nav.getByRole('link', { name: 'Ingresos' })).toBeVisible();

  fireEvent.click(nav.getByRole('link', { name: 'Finanzas' }));
  expect(nav.getByRole('link', { name: 'Finanzas' })).toHaveAttribute('aria-expanded', 'true');
  expect(nav.getByRole('link', { name: 'Ingresos' })).toBeVisible();

  view.rerender(<QueryClientProvider client={queryClient}><WorkspaceShell active="sala-agenda"><h1>Contenido sintético</h1></WorkspaceShell></QueryClientProvider>);
  expect(nav.getByRole('link', { name: 'Sala' })).toHaveAttribute('aria-expanded', 'true');
  expect(nav.getByRole('link', { name: 'Agenda' })).toHaveAttribute('aria-current', 'page');
});

it.each(['KINESIOLOGIST', 'OSTEOPATH'])('exposes Patients and Appointments through effective permissions for %s', async (role) => {
  renderShell({ roles: [role], permissions: ['CLINIC_OPERATIONAL_READ'], active: 'clinic-patients' });
  const nav = within(await screen.findByRole('navigation', { name: 'Navegación principal' }));
  expect(await nav.findByRole('link', { name: 'Pacientes' })).toHaveAttribute('href', '/clinic?tab=Pacientes');
  expect(nav.getByRole('link', { name: 'Turnos' })).toHaveAttribute('href', '/clinic?tab=Agenda');
  expect(nav.getByRole('link', { name: 'Pacientes' })).toHaveAttribute('aria-current', 'page');
  expect(nav.queryByRole('link', { name: 'Clínica' })).not.toBeInTheDocument();
});

it('links group headings to the first permitted item', async () => {
  renderShell({ roles: ['ADMINISTRATIVE'], permissions: ['SALA_PARTICIPATION_MANAGE', 'EXPENSE_HISTORY_READ'] });
  const nav = within(await screen.findByRole('navigation', { name: 'Navegación principal' }));
  expect(nav.getByRole('link', { name: 'Sala' })).toHaveAttribute('href', '/students');
  expect(nav.getByRole('link', { name: 'Finanzas' })).toHaveAttribute('href', '/finance?view=expenses');
  expect(nav.queryByRole('link', { name: 'Equipo' })).not.toBeInTheDocument();
});

it.each([
  ['Inicio', '/', 'home', 'Resumen'],
  ['Sala', '/sala', 'sala-agenda', 'Agenda'],
  ['Finanzas', '/finance', 'finance-summary', 'Ingresos'],
  ['Equipo', '/team', 'team', 'Equipo'],
])('closes the mobile drawer after selecting %s and reopens the active group', async (label, href, active, child) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(currentSession).mockResolvedValue(makeSession(['PEOPLE_READ', 'SALA_AGENDA_MANAGE', 'FINANCE_OPERATIONAL_READ', 'TEAM_READ'], ['ADMINISTRATIVE']) as never);
  const view = render(<QueryClientProvider client={client}><WorkspaceShell active="home">Contenido</WorkspaceShell></QueryClientProvider>);
  await screen.findByRole('link', { name: 'Sala' });
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  const drawer = within(screen.getByRole('dialog', { name: 'Menú principal' }));
  const heading = drawer.getByRole('heading', { name: label });
  const link = within(heading).getByRole('link', { name: label });
  expect(link).toHaveAttribute('href', href);
  fireEvent.click(link);
  expect(screen.queryByRole('dialog', { name: 'Menú principal' })).not.toBeInTheDocument();
  view.rerender(<QueryClientProvider client={client}><WorkspaceShell active={active}>Contenido</WorkspaceShell></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  const reopened = within(screen.getByRole('dialog', { name: 'Menú principal' }));
  expect(within(reopened.getByRole('heading', { name: label })).getByRole('link')).toHaveAttribute('aria-expanded', 'true');
  expect(reopened.getAllByRole('link', { name: child }).length).toBeGreaterThan(0);
});

it('shows a developer footer at the end of authenticated content', async () => {
  renderShell();
  const link = await screen.findByRole('link', { name: 'Desarrollado por Broco Solutions' });
  expect(link).toHaveAttribute('href', 'https://www.brocosolutions.com');
  expect(link.closest('main')).toContainElement(screen.getByRole('heading', { name: 'Contenido sintético' }));
});
