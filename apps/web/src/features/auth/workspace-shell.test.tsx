import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentSession, logout } from './auth';
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
    expect(activeLink).toHaveClass('bg-zinc-800', 'font-semibold', 'text-white');
  });

  it.each([
    ['Personas', 'PEOPLE_READ', ['Personas']],
    ['Equipo', 'TEAM_READ', ['Equipo']],
    ['Sala', 'SALA_AGENDA_MANAGE', ['Sala', 'Ingreso']],
    ['Rutinas', 'SALA_ROUTINE_MANAGE', ['Sala', 'Rutinas']],
    ['Reservas', 'SALA_RELATION_READ', ['Reservas']],
    ['Clínica', 'CLINIC_OPERATIONAL_READ', []],
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
      expect(activeLink).toHaveClass('bg-zinc-800', 'font-semibold', 'text-white');
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

it('gives pure Professor Inicio, Agenda, Alumnos, Rutinas and independent Ingreso on desktop and mobile', async () => {
  renderShell({ roles: ['PROFESSOR'], active: 'sala-students', permissions: ['PEOPLE_READ', 'PEOPLE_CREATE', 'SALA_RELATION_READ', 'SALA_PARTICIPATION_MANAGE', 'SALA_AGENDA_MANAGE', 'SALA_ROUTINE_READ', 'SALA_ROUTINE_MANAGE', 'SALA_PAYMENT_READ', 'SALA_PAYMENT_REGISTER'] });
  await screen.findByRole('link', { name: 'Alumnos' });
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  for (const name of ['Navegación principal', 'Navegación móvil']) {
    const navigation = within(screen.getByRole('navigation', { name }));
    expect(navigation.getAllByRole('link').map((link) => link.textContent)).toEqual(['Inicio', 'Agenda', 'Alumnos', 'Rutinas', 'Ingreso']);
    expect(navigation.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/', '/sala', '/students', '/routines', '/sala/ingreso']);
    expect(navigation.queryByRole('link', { name: 'Reservas' })).not.toBeInTheDocument();
    expect(navigation.getByRole('link', { name: 'Alumnos' })).toHaveAttribute('aria-current', 'page');
    expect(navigation.getByRole('link', { name: 'Ingreso' })).toHaveAttribute('href', '/sala/ingreso');
    for (const label of ['Personas', 'Sala', 'Equipo', 'Clínica', 'Finanzas']) expect(navigation.queryByRole('link', { name: label })).not.toBeInTheDocument();
  }
});
it('hides clinical navigation for PROFESSOR + KINESIOLOGIST while preserving Sala navigation', async () => {
  renderShell({ roles: ['PROFESSOR', 'KINESIOLOGIST'], permissions: ['PEOPLE_READ', 'SALA_ROUTINE_MANAGE', 'CLINIC_OPERATIONAL_READ'] });
  await screen.findByRole('link', { name: 'Personas' });
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  for (const name of ['Navegación principal', 'Navegación móvil']) expect(within(screen.getByRole('navigation', { name })).getAllByRole('link').map((link) => link.textContent)).toEqual(['Inicio', 'Personas', 'Sala', 'Rutinas']);
});

it.each([{ roles: ['GENERAL_ADMIN'] }, { roles: ['GENERAL_ADMIN', 'PROFESSOR'] }, { roles: ['GENERAL_ADMIN', 'KINESIOLOGIST'] }, { roles: ['ADMINISTRATIVE'] }, { roles: ['ADMINISTRATIVE', 'OSTEOPATH'] }])('uses administrative grouped navigation for roles %j on desktop and mobile', async ({ roles }) => {
  renderShell({ roles, permissions: ['PEOPLE_READ', 'PEOPLE_CREATE', 'PEOPLE_UPDATE_GENERAL', 'SALA_RELATION_READ', 'SALA_AGENDA_MANAGE', 'SALA_PARTICIPATION_MANAGE', 'SALA_SCHEDULE_MANAGE', 'SALA_ROUTINE_MANAGE', 'CLINIC_OPERATIONAL_READ', 'FINANCE_OPERATIONAL_READ', 'TEAM_READ'] });
  await screen.findByRole('link', { name: 'Inicio' });
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  for (const name of ['Navegación principal', 'Navegación móvil']) {
    const nav = within(screen.getByRole('navigation', { name }));
    expect(nav.getByRole('link', { name: 'Resumen' })).toHaveAttribute('href', '/finance');
    for (const [label, href] of [['Inicio', '/'], ['Agenda', '/sala'], ['Resumen', '/finance'], ['Equipo', '/team']]) expect(nav.getByRole('link', { name: label! })).toHaveAttribute('href', href);
    for (const label of ['Clínica', 'Pacientes', 'Turnos', 'Personas']) expect(nav.queryByText(label)).not.toBeInTheDocument();
    expect(nav.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-expanded');
    expect(nav.getByRole('link', { name: 'Agenda' })).toBeVisible();
    expect(nav.queryByRole('link', { name: 'Reservas' })).not.toBeInTheDocument();
  }
  const desktop = within(screen.getByRole('navigation', { name: 'Navegación principal' }));
  expect(desktop.getAllByRole('link', { name: 'Ingreso' })).toHaveLength(1);
  expect(desktop.getByRole('link', { name: 'Ingreso' })).toHaveAttribute('href', '/sala/ingreso');
  expect(desktop.getByRole('link', { name: 'Agenda' })).toHaveAttribute('href', '/sala');
  expect(desktop.getByRole('link', { name: 'Alumnos' })).toBeVisible();
  expect(desktop.getByRole('link', { name: 'Rutinas' })).toBeVisible();
  expect(desktop.getByRole('link', { name: 'Configuración' })).toBeVisible();
  expect(desktop.getAllByRole('link', { name: 'Ingreso' })).toHaveLength(1);
  expect(desktop.getByRole('link', { name: 'Ingreso' })).toBeVisible();
  const mobile = within(screen.getByRole('navigation', { name: 'Navegación móvil' }));
  expect(mobile.getAllByRole('link', { name: 'Ingreso' })).toHaveLength(1);
  expect(mobile.getByRole('link', { name: 'Ingreso' })).toHaveAttribute('href', '/sala/ingreso');
  expect(mobile.getByRole('link', { name: 'Agenda' })).toBeVisible();
  fireEvent.click(mobile.getByRole('link', { name: 'Resumen' }));
  expect(screen.queryByRole('dialog', { name: 'Menú principal' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  expect(within(screen.getByRole('navigation', { name: 'Navegación móvil' })).getByRole('link', { name: 'Ingresos' })).toBeVisible();
});

it('keeps Ingreso visible outside the open group for administrative users', async () => {
  renderShell({ roles: ['ADMINISTRATIVE'], permissions: ['SALA_AGENDA_MANAGE', 'FINANCE_OPERATIONAL_READ', 'TEAM_READ'] });
  const nav = within(await screen.findByRole('navigation', { name: 'Navegación principal' }));
  fireEvent.click(nav.getByRole('link', { name: 'Resumen' }));
  expect(nav.getByRole('link', { name: 'Ingreso' })).toBeVisible();
  fireEvent.click(nav.getByRole('link', { name: 'Equipo' }));
  expect(nav.getByRole('link', { name: 'Ingreso' })).toBeVisible();
});

it('highlights independent Ingreso with the active yellow state on desktop and mobile', async () => {
  renderShell({ roles: ['GENERAL_ADMIN'], permissions: ['SALA_AGENDA_MANAGE'], active: 'sala-check-in' });
  const desktop = within(await screen.findByRole('navigation', { name: 'Navegación principal' }));
  const desktopCheckIn = desktop.getByRole('link', { name: 'Ingreso' });
  expect(desktopCheckIn).toHaveAttribute('aria-current', 'page');
  expect(desktopCheckIn).toHaveClass('bg-zinc-800', 'font-semibold', 'text-white');
  expect(desktop.getByRole('heading', { name: 'Sala' })).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  const mobile = within(screen.getByRole('navigation', { name: 'Navegación móvil' }));
  const mobileCheckIn = mobile.getByRole('link', { name: 'Ingreso' });
  expect(mobileCheckIn).toHaveAttribute('aria-current', 'page');
  expect(mobileCheckIn).toHaveClass('bg-zinc-800', 'font-semibold', 'text-white');
});

it('hides Ingreso when the session lacks SALA_AGENDA_MANAGE', async () => {
  renderShell({ roles: ['ADMINISTRATIVE'], permissions: ['FINANCE_OPERATIONAL_READ'] });
  const desktop = within(await screen.findByRole('navigation', { name: 'Navegación principal' }));
  expect(desktop.queryByRole('link', { name: 'Ingreso' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  expect(within(screen.getByRole('navigation', { name: 'Navegación móvil' })).queryByRole('link', { name: 'Ingreso' })).not.toBeInTheDocument();
});

it('shows Administrative grouped navigation without Rutinas when it only has routine read permission', async () => {
  renderShell({ roles: ['ADMINISTRATIVE'], permissions: ['PEOPLE_READ', 'SALA_AGENDA_MANAGE', 'SALA_PARTICIPATION_MANAGE', 'SALA_SCHEDULE_MANAGE', 'SALA_ROUTINE_READ', 'CLINIC_OPERATIONAL_READ', 'FINANCE_OPERATIONAL_READ', 'TEAM_READ'] });
  const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
  expect(within(nav).getByRole('heading', { name: 'Sala' })).toBeVisible();
  expect(within(nav).getByRole('link', { name: 'Agenda' })).toBeVisible();
  expect(within(nav).getByRole('link', { name: 'Alumnos' })).toBeVisible();
  expect(within(nav).getByRole('link', { name: 'Configuración' })).toBeVisible();
  expect(within(nav).queryByRole('link', { name: 'Rutinas' })).not.toBeInTheDocument();
});

it('shows Rutinas for Administrative combined with Professor through the effective permission union', async () => {
  renderShell({ roles: ['ADMINISTRATIVE', 'PROFESSOR'], permissions: ['SALA_AGENDA_MANAGE', 'SALA_PARTICIPATION_MANAGE', 'SALA_ROUTINE_READ', 'SALA_ROUTINE_MANAGE'] });
  const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
  expect(within(nav).getByRole('heading', { name: 'Sala' })).toBeVisible();
  expect(within(nav).getByRole('link', { name: 'Rutinas' })).toHaveAttribute('href', '/routines');
});

it('keeps every permitted destination and session action in the compact sidebar', async () => {
  renderShell({ permissions: ['PEOPLE_READ', 'SALA_AGENDA_MANAGE'], active: 'people' });
  await screen.findByRole('link', { name: 'Personas' });
  fireEvent.click(screen.getByRole('button', { name: 'Ocultar menú lateral' }));
  const nav = within(screen.getByRole('navigation', { name: 'Navegación principal' }));
  expect(nav.getByRole('link', { name: 'Personas' })).toHaveAttribute('aria-current', 'page');
  expect(nav.getByRole('link', { name: 'Ingreso' })).toHaveAttribute('href', '/sala/ingreso');
  expect(screen.getByRole('link', { name: 'Mi perfil' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  fireEvent.focus(nav.getByRole('link', { name: 'Personas' }));
  expect(screen.getByRole('tooltip')).toHaveTextContent('Personas');
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar menú lateral' }));
  expect(screen.getByRole('link', { name: 'Athleta · Inicio' })).toBeVisible();
});

it('keeps a single direct Inicio and a simple Equipo tooltip', async () => {
  renderShell({ roles: ['GENERAL_ADMIN'], permissions: ['TEAM_READ'], active: 'home' });
  const nav = within(await screen.findByRole('navigation', { name: 'Navegación principal' }));
  expect(nav.getAllByRole('link', { name: 'Inicio' })).toHaveLength(1);
  expect(nav.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
  expect(nav.queryByRole('heading', { name: 'Equipo' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ocultar menú lateral' }));
  const team = nav.getByRole('link', { name: /^Equipo$/ });
  fireEvent.focus(team);
  expect(screen.getByRole('tooltip')).toHaveTextContent(/^Equipo$/);
});

it('keeps authorized groups visible and stable while selection and session data change', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const data = makeSession(['SALA_AGENDA_MANAGE', 'FINANCE_OPERATIONAL_READ'], ['GENERAL_ADMIN']);
  vi.mocked(currentSession).mockResolvedValue(data);
  const view = render(<QueryClientProvider client={client}><WorkspaceShell active="finance-income">Contenido</WorkspaceShell></QueryClientProvider>);
  const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
  const links = within(nav).getAllByRole('link');
  expect(within(nav).getByRole('link', { name: 'Agenda' })).toBeVisible();
  expect(within(nav).getByRole('link', { name: 'Ingresos' })).toHaveAttribute('aria-current', 'page');
  expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  expect(nav.querySelectorAll('[aria-expanded]')).toHaveLength(0);
  view.rerender(<QueryClientProvider client={client}><WorkspaceShell active="sala-agenda">Contenido</WorkspaceShell></QueryClientProvider>);
  expect(within(nav).getAllByRole('link')).toEqual(links);
  expect(within(nav).getByRole('link', { name: 'Agenda' })).toHaveAttribute('aria-current', 'page');
  expect(within(nav).getByRole('link', { name: 'Ingresos' })).not.toHaveAttribute('aria-current');
  expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
});

it.each(['KINESIOLOGIST', 'OSTEOPATH'])('keeps %s accounts but hides clinical navigation during this delivery', async (role) => {
  renderShell({ roles: [role], permissions: ['CLINIC_OPERATIONAL_READ'], active: 'clinic-patients' });
  const nav = within(await screen.findByRole('navigation', { name: 'Navegación principal' }));
  expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual(['Inicio']);
  for (const name of ['Clínica', 'Pacientes', 'Turnos']) expect(nav.queryByRole('link', { name })).not.toBeInTheDocument();
});

it('uses noninteractive group headings and preserves permitted destinations', async () => {
  renderShell({ roles: ['ADMINISTRATIVE'], permissions: ['SALA_PARTICIPATION_MANAGE', 'EXPENSE_HISTORY_READ'] });
  const nav = within(await screen.findByRole('navigation', { name: 'Navegación principal' }));
  expect(nav.getByRole('heading', { name: 'Sala' })).toBeVisible();
  expect(nav.getByRole('link', { name: 'Alumnos' })).toHaveAttribute('href', '/students');
  expect(nav.getByRole('heading', { name: 'Finanzas' })).toBeVisible();
  expect(nav.getByRole('link', { name: 'Gastos' })).toHaveAttribute('href', '/finance?view=expenses');
  expect(nav.queryByRole('link', { name: 'Equipo' })).not.toBeInTheDocument();
});

it.each([
  ['Inicio', '/', 'home', 'Inicio'],
  ['Agenda', '/sala', 'sala-agenda', 'Agenda'],
  ['Resumen', '/finance', 'finance-summary', 'Ingresos'],
  ['Equipo', '/team', 'team', 'Equipo'],
])('closes the mobile drawer after selecting %s and preserves all destinations', async (label, href, active, child) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(currentSession).mockResolvedValue(makeSession(['PEOPLE_READ', 'SALA_AGENDA_MANAGE', 'FINANCE_OPERATIONAL_READ', 'TEAM_READ'], ['ADMINISTRATIVE']) as never);
  const view = render(<QueryClientProvider client={client}><WorkspaceShell active="home">Contenido</WorkspaceShell></QueryClientProvider>);
  await screen.findByRole('link', { name: 'Agenda' });
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  const drawer = within(screen.getByRole('dialog', { name: 'Menú principal' }));
  const link = drawer.getByRole('link', { name: label });
  expect(link).toHaveAttribute('href', href);
  fireEvent.click(link);
  expect(screen.queryByRole('dialog', { name: 'Menú principal' })).not.toBeInTheDocument();
  view.rerender(<QueryClientProvider client={client}><WorkspaceShell active={active}>Contenido</WorkspaceShell></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  const reopened = within(screen.getByRole('dialog', { name: 'Menú principal' }));
  expect(reopened.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
  expect(reopened.getAllByRole('link', { name: child }).length).toBeGreaterThan(0);
});

it('shows a developer footer at the end of authenticated content', async () => {
  renderShell();
  const link = await screen.findByRole('link', { name: 'Desarrollado por Broco Solutions' });
  expect(link).toHaveAttribute('href', 'https://www.brocosolutions.com');
  expect(link.closest('main')).toContainElement(screen.getByRole('heading', { name: 'Contenido sintético' }));
});

it('reports a failed logout and permits a single pending retry', async () => {
  vi.mocked(logout).mockRejectedValueOnce(new Error('network'));
  renderShell();
  fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cerrar la sesión');
  vi.mocked(logout).mockImplementation(() => new Promise(() => undefined));
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByRole('button', { name: 'Cerrando sesión…' })).toBeDisabled();
});

it('traps keyboard focus and restores scroll and focus when the drawer closes', async () => {
  renderShell();
  const trigger = await screen.findByRole('button', { name: 'Abrir menú' });
  trigger.focus(); fireEvent.click(trigger);
  const drawer = within(screen.getByRole('dialog', { name: 'Menú principal' }));
  expect(document.body.style.overflow).toBe('hidden');
  const last = drawer.getByRole('button', { name: 'Cerrar sesión' });
  last.focus(); fireEvent.keyDown(last, { key: 'Tab' });
  expect(drawer.getByRole('link', { name: 'Athleta · Inicio' })).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(document.body.style.overflow).toBe(''); expect(trigger).toHaveFocus();
});

it('cancels in-flight reads and removes private query and mutation data after logout succeeds', async () => {
  vi.mocked(currentSession).mockResolvedValue(makeSession());
  vi.mocked(logout).mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['people', 'private'], { name: 'Synthetic private data' });
  const cancel = vi.spyOn(client, 'cancelQueries');
  render(<QueryClientProvider client={client}><WorkspaceShell active="home">Contenido sintético</WorkspaceShell></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
  await waitFor(() => expect(cancel).toHaveBeenCalled());
  await waitFor(() => expect(client.getQueryData(['people', 'private'])).toBeUndefined());
  expect(client.getMutationCache().getAll()).toHaveLength(0);
});
