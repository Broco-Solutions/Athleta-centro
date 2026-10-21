'use client';

import React from 'react';
import Link from 'next/link';
import { DeveloperFooter } from '../branding/developer-footer';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { Activity, CalendarDays, ChevronDown, ChevronRight, ClipboardList, Dumbbell, LogOut, Menu, PanelLeftClose, UserCog, UserRound, Users, Wallet, X } from 'lucide-react';
import { Button } from '@athleta/ui';
import { currentSession, logout } from './auth';
import { AuthShell } from './auth-shell';

type NavigationItem = {
  key: string;
  href: string;
  label: string;
  icon: typeof Activity;
  canAccess: (permissions: string[]) => boolean;
};
type NavigationGroup = { key: 'home' | 'sala' | 'clinic' | 'finance' | 'team'; label: string; items: NavigationItem[] };

const hasAny = (permissions: string[], values: string[]) => values.some((value) => permissions.includes(value));
const hasDomainPermission = (permissions: string[], prefix: string) => permissions.some((permission) => permission.startsWith(prefix));

const clinicNavigation: NavigationItem[] = [
  { key: 'clinic-patients', href: '/clinic?tab=Pacientes', label: 'Pacientes', icon: Users, canAccess: (permissions) => permissions.includes('CLINIC_OPERATIONAL_READ') },
  { key: 'clinic-appointments', href: '/clinic?tab=Agenda', label: 'Turnos', icon: CalendarDays, canAccess: (permissions) => permissions.includes('CLINIC_OPERATIONAL_READ') },
];

const navigation: NavigationItem[] = [
  { key: 'home', href: '/', label: 'Inicio', icon: Activity, canAccess: () => true },
  { key: 'people', href: '/people', label: 'Personas', icon: Users, canAccess: (permissions) => hasAny(permissions, ['PEOPLE_READ', 'PEOPLE_CREATE', 'PEOPLE_UPDATE_GENERAL']) },
  { key: 'team', href: '/team', label: 'Equipo', icon: UserCog, canAccess: (permissions) => hasDomainPermission(permissions, 'TEAM_') },
  { key: 'sala-agenda', href: '/sala', label: 'Sala', icon: Dumbbell, canAccess: (permissions) => hasAny(permissions, ['SALA_PARTICIPATION_MANAGE', 'SALA_SCHEDULE_MANAGE', 'SALA_AGENDA_MANAGE', 'SALA_ROUTINE_READ', 'SALA_ROUTINE_MANAGE', 'SALA_PHYSICAL_EVALUATION_READ', 'SALA_PHYSICAL_EVALUATION_MANAGE', 'SALA_PAYMENT_READ', 'SALA_PAYMENT_MANAGE']) },
  { key: 'routines', href: '/routines', label: 'Rutinas', icon: ClipboardList, canAccess: (permissions) => permissions.includes('SALA_ROUTINE_MANAGE') },
  { key: 'reservations', href: '/reservations', label: 'Reservas', icon: ClipboardList, canAccess: (permissions) => hasAny(permissions, ['SALA_RELATION_READ', 'CLINIC_OPERATIONAL_READ']) },
  ...clinicNavigation,
  { key: 'finance-summary', href: '/finance', label: 'Finanzas', icon: Wallet, canAccess: (permissions) => hasDomainPermission(permissions, 'FINANCE_') || permissions.includes('PAYMENT_METHOD_CATALOG_MANAGE') },
];

const professorNavigation: NavigationItem[] = [
  { key: 'home', href: '/', label: 'Inicio', icon: Activity, canAccess: () => true },
  { key: 'reservations', href: '/reservations', label: 'Reservas', icon: CalendarDays, canAccess: () => true },
  { key: 'sala-students', href: '/students', label: 'Alumnos', icon: Users, canAccess: () => true },
  { key: 'routines', href: '/routines', label: 'Rutinas', icon: ClipboardList, canAccess: () => true },
];

function groupedNavigation(permissions: string[]): NavigationGroup[] {
  const allowed = (item: NavigationItem) => item.canAccess(permissions);
  const groups: NavigationGroup[] = [
    { key: 'home', label: 'Inicio', items: [
      { key: 'home', href: '/', label: 'Resumen', icon: Activity, canAccess: () => true },
    ] },
    { key: 'sala', label: 'Sala', items: [
      { key: 'sala-agenda', href: '/sala', label: 'Agenda', icon: CalendarDays, canAccess: (values) => values.includes('SALA_AGENDA_MANAGE') },
      { key: 'sala-students', href: '/students', label: 'Alumnos', icon: Users, canAccess: (values) => values.includes('SALA_PARTICIPATION_MANAGE') },
      { key: 'routines', href: '/routines', label: 'Rutinas', icon: ClipboardList, canAccess: (values) => values.includes('SALA_ROUTINE_MANAGE') },
      { key: 'sala-configuration', href: '/sala/configuration', label: 'Configuración', icon: Dumbbell, canAccess: (values) => hasAny(values, ['SALA_SCHEDULE_MANAGE', 'SALA_PLAN_CATALOG_MANAGE', 'SALA_SERVICE_DURATION_MANAGE']) },
    ] },
    { key: 'finance', label: 'Finanzas', items: [
      { key: 'finance-summary', href: '/finance', label: 'Resumen', icon: Wallet, canAccess: (values) => values.includes('FINANCE_OPERATIONAL_READ') || values.includes('FINANCE_EXECUTIVE_READ') || values.includes('PAYMENT_METHOD_CATALOG_MANAGE') },
      { key: 'finance-income', href: '/finance?view=income', label: 'Ingresos', icon: Wallet, canAccess: (values) => values.includes('FINANCE_OPERATIONAL_READ') },
      { key: 'finance-expenses', href: '/finance?view=expenses', label: 'Gastos', icon: Wallet, canAccess: (values) => values.includes('FINANCE_OPERATIONAL_READ') || values.includes('EXPENSE_HISTORY_READ') },
    ] },
    { key: 'team', label: 'Equipo', items: [
      { key: 'team', href: '/team', label: 'Equipo', icon: UserCog, canAccess: (values) => hasDomainPermission(values, 'TEAM_') },
    ] },
  ];
  return groups.map((group) => ({ ...group, items: group.items.filter(allowed) })).filter((group) => group.items.length > 0);
}

export function WorkspaceShell({ children, active }: { children: React.ReactNode; active: string }): React.JSX.Element {
  const activeKey = active === 'clinic' ? 'clinic-patients' : active;
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = React.useState(true);
  const closeMenuRef = React.useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const signOut = useMutation({ mutationFn: (csrfToken: string) => logout(csrfToken), onSuccess: () => { queryClient.removeQueries({ queryKey: ['auth', 'session'] }); window.location.assign('/login'); } });
  const permissions = session.data?.permissions ?? [];
  const roles = session.data?.roles ?? [];
  const roleLabels: Record<string, string> = {
    PROFESSOR: 'Profesor',
    KINESIOLOGIST: 'Kinesiólogo',
    OSTEOPATH: 'Osteópata',
    ADMINISTRATIVE: 'Administrativo',
    GENERAL_ADMIN: 'Administrador general',
    BROCO_SUPPORT: 'Soporte Broco',
  };
  const fullName = `${session.data?.user.firstName ?? ''} ${session.data?.user.lastName ?? ''}`.trim();
  const rolesLabel = roles.map((role) => roleLabels[role] ?? role).join(' · ');
  const accountContent = (onNavigate?: () => void) => <footer className="mt-auto min-w-0 border-t border-zinc-700 pt-4">
    <div className="min-w-0 px-3" title={[fullName, rolesLabel].filter(Boolean).join(' · ')}>
      <div className="truncate text-sm font-medium text-white">{fullName}</div>
      <div className="truncate text-xs text-zinc-400">{rolesLabel}</div>
    </div>
    <div className="mt-3 space-y-1">
      {!roles.includes('BROCO_SUPPORT') ? <Link href="/profile" aria-label="Mi perfil" title="Mi perfil" onClick={() => onNavigate?.()} className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><UserRound aria-hidden="true" size={18} />Mi perfil</Link> : null}
      <Button aria-label="Cerrar sesión" title="Cerrar sesión" variant="ghost" className="h-11 w-full justify-start gap-3 px-3 text-zinc-300 hover:bg-zinc-800 hover:text-white" disabled={signOut.isPending} onClick={() => signOut.mutate(session.data!.csrfToken)}><LogOut aria-hidden="true" size={18} />Cerrar sesión</Button>
    </div>
  </footer>;
  const isProfessorOnly = roles.length === 1 && roles.includes('PROFESSOR');
  const hasAdministrativeNavigation = roles.includes('ADMINISTRATIVE') || roles.includes('GENERAL_ADMIN');
  const groups = hasAdministrativeNavigation ? groupedNavigation(permissions) : null;
  const activeGroupKey = groups?.find((group) => group.items.some((item) => item.key === activeKey))?.key;
  const [openGroupKey, setOpenGroupKey] = React.useState<NavigationGroup['key'] | undefined>(activeGroupKey);
  const visibleNavigation = roles.includes('GENERAL_ADMIN') ? (groups?.flatMap((group) => group.items) ?? []) : hasAdministrativeNavigation ? (groups?.flatMap((group) => group.items) ?? []) : isProfessorOnly ? professorNavigation : navigation.filter((item) => item.canAccess(permissions));

  React.useEffect(() => {
    setOpenGroupKey(activeGroupKey);
  }, [activeGroupKey]);

  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeMenuRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      trigger?.focus();
    };
  }, [mobileMenuOpen]);

  const itemLink = ({ key, href, label, icon: Icon }: NavigationItem, onNavigate?: () => void) => <Link key={key} aria-current={activeKey === key ? 'page' : undefined} className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm md:min-h-0 ${activeKey === key ? 'bg-primary font-semibold text-primary-foreground' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`} href={href} onClick={() => onNavigate?.()}>
    <Icon aria-hidden="true" size={18} />
    <span>{label}</span>
  </Link>;
  const navigationContent = (idSuffix: string, onNavigate?: () => void) => groups
    ? groups.map((group) => {
      const isOpen = openGroupKey === group.key;
      const contentId = `navigation-group-${group.key}-${idSuffix}`;
      const Chevron = isOpen ? ChevronDown : ChevronRight;
      return <section key={group.key} className="space-y-1">
        <h2 className="pt-2 first:pt-0">
          <Link href={group.items[0]!.href} aria-expanded={isOpen} aria-controls={contentId} className="flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setOpenGroupKey(group.key); onNavigate?.(); }}>
            <span>{group.label}</span>
            <Chevron aria-hidden="true" size={16} className="transition-transform duration-150" />
          </Link>
        </h2>
        <div id={contentId} hidden={!isOpen} className="space-y-1">{group.items.map((item) => itemLink(item, onNavigate))}</div>
      </section>;
    })
    : visibleNavigation.map((item) => <React.Fragment key={item.key}>{item.key === 'clinic-patients' && <h2 className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-zinc-300">Clínica</h2>}{itemLink(item, onNavigate)}</React.Fragment>);

  return <AuthShell desktopSidebarOpen={desktopSidebarOpen} onToggleDesktopSidebar={() => setDesktopSidebarOpen((open) => !open)} mobileNavigationTrigger={<Button variant="ghost" aria-label="Abrir menú" aria-expanded={mobileMenuOpen} aria-controls="internal-mobile-navigation" className="h-11 gap-2 px-3 md:hidden" onClick={() => setMobileMenuOpen(true)}><Menu aria-hidden="true" size={20} />Menú</Button>}>
    <main className={`flex min-h-screen min-w-0 flex-col bg-background pt-14 transition-[margin] duration-200 ${desktopSidebarOpen ? 'md:ml-60 md:pt-0' : 'md:ml-0 md:pt-14'}`}>
      {desktopSidebarOpen ? <aside className="fixed inset-y-0 left-0 z-50 hidden w-60 min-w-0 flex-col overflow-y-auto bg-sidebar px-4 py-6 text-sidebar-foreground md:flex">
        <div className="mb-8 flex min-w-0 items-center gap-2">
          <Link href="/" aria-label="Athleta · Inicio" className="min-w-0 flex-1 text-center">
            <Image src="/logo-athleta.png" width={1983} height={793} alt="Athleta" priority className="h-auto w-full" />
          </Link>
          <Button variant="ghost" aria-label="Ocultar menú lateral" className="h-10 w-10 shrink-0 px-0 text-zinc-300 hover:bg-zinc-800 hover:text-white" onClick={() => setDesktopSidebarOpen(false)}><PanelLeftClose aria-hidden="true" size={18} /></Button>
        </div>
        <nav aria-label="Navegación principal" className="min-w-0 flex-1 space-y-1">{navigationContent('desktop')}</nav>
        {accountContent()}
      </aside> : null}
      {mobileMenuOpen ? <>
        <button type="button" aria-label="Cerrar menú desde el fondo" className="fixed inset-0 z-50 bg-black/40 md:hidden" onClick={() => setMobileMenuOpen(false)} />
        <div id="internal-mobile-navigation" role="dialog" aria-label="Menú principal" className="fixed inset-y-0 left-0 z-[60] flex w-72 max-w-[85vw] min-w-0 flex-col overflow-y-auto bg-sidebar px-4 py-6 text-sidebar-foreground md:hidden">
          <div className="mb-8 flex min-w-0 items-start justify-between gap-3">
            <Link href="/" aria-label="Athleta · Inicio" className="min-w-0 flex-1" onClick={() => setMobileMenuOpen(false)}>
              <Image src="/logo-athleta.png" width={1983} height={793} alt="Athleta" className="h-auto w-full max-w-44" />
            </Link>
            <button ref={closeMenuRef} type="button" aria-label="Cerrar menú" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setMobileMenuOpen(false)}><X aria-hidden="true" size={20} /></button>
          </div>
          <nav aria-label="Navegación móvil" className="min-w-0 flex-1 space-y-1">{navigationContent('mobile', () => setMobileMenuOpen(false))}</nav>
          {accountContent(() => setMobileMenuOpen(false))}
        </div>
      </> : null}
      <section className="min-w-0 flex-1 p-4 sm:p-5 md:p-8">{children}</section>
      <footer className="border-t border-border px-4 py-5 text-center sm:px-5 md:px-8"><DeveloperFooter /></footer>
    </main>
  </AuthShell>;
}
