'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import { Activity, CalendarDays, ClipboardList, Dumbbell, Menu, UserCog, Users, Wallet, X } from 'lucide-react';
import { Button } from '@athleta/ui';
import { currentSession } from './auth';
import { AuthShell } from './auth-shell';

type NavigationItem = {
  key: string;
  href: string;
  label: string;
  icon: typeof Activity;
  canAccess: (permissions: string[]) => boolean;
};
type NavigationGroup = { label: string; items: NavigationItem[] };

const hasAny = (permissions: string[], values: string[]) => values.some((value) => permissions.includes(value));
const hasDomainPermission = (permissions: string[], prefix: string) => permissions.some((permission) => permission.startsWith(prefix));

const navigation: NavigationItem[] = [
  { key: 'home', href: '/', label: 'Inicio', icon: Activity, canAccess: () => true },
  { key: 'people', href: '/people', label: 'Personas', icon: Users, canAccess: (permissions) => hasAny(permissions, ['PEOPLE_READ', 'PEOPLE_CREATE', 'PEOPLE_UPDATE_GENERAL']) },
  { key: 'team', href: '/team', label: 'Equipo', icon: UserCog, canAccess: (permissions) => hasDomainPermission(permissions, 'TEAM_') },
  { key: 'sala-agenda', href: '/sala', label: 'Sala', icon: Dumbbell, canAccess: (permissions) => hasAny(permissions, ['SALA_PARTICIPATION_MANAGE', 'SALA_SCHEDULE_MANAGE', 'SALA_AGENDA_MANAGE', 'SALA_ROUTINE_READ', 'SALA_ROUTINE_MANAGE', 'SALA_PHYSICAL_EVALUATION_READ', 'SALA_PHYSICAL_EVALUATION_MANAGE', 'SALA_PAYMENT_READ', 'SALA_PAYMENT_MANAGE']) },
  { key: 'routines', href: '/routines', label: 'Rutinas', icon: ClipboardList, canAccess: (permissions) => permissions.includes('SALA_ROUTINE_MANAGE') },
  { key: 'reservations', href: '/reservations', label: 'Reservas', icon: ClipboardList, canAccess: (permissions) => hasAny(permissions, ['SALA_RELATION_READ', 'CLINIC_OPERATIONAL_READ']) },
  { key: 'clinic', href: '/clinic', label: 'Clínica', icon: CalendarDays, canAccess: (permissions) => hasDomainPermission(permissions, 'CLINIC_') || hasDomainPermission(permissions, 'CLINICAL_HISTORY_') },
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
    { label: 'Inicio', items: [
      { key: 'home', href: '/', label: 'Resumen', icon: Activity, canAccess: () => true },
      { key: 'people', href: '/people', label: 'Personas', icon: Users, canAccess: (values) => hasAny(values, ['PEOPLE_READ', 'PEOPLE_CREATE', 'PEOPLE_UPDATE_GENERAL']) },
    ] },
    { label: 'Sala', items: [
      { key: 'sala-agenda', href: '/sala', label: 'Agenda', icon: CalendarDays, canAccess: (values) => values.includes('SALA_AGENDA_MANAGE') },
      { key: 'sala-students', href: '/students', label: 'Alumnos', icon: Users, canAccess: (values) => values.includes('SALA_PARTICIPATION_MANAGE') },
      { key: 'routines', href: '/routines', label: 'Rutinas', icon: ClipboardList, canAccess: (values) => values.includes('SALA_ROUTINE_MANAGE') },
      { key: 'sala-configuration', href: '/sala/configuration', label: 'Configuración', icon: Dumbbell, canAccess: (values) => hasAny(values, ['SALA_SCHEDULE_MANAGE', 'SALA_PLAN_CATALOG_MANAGE', 'SALA_SERVICE_DURATION_MANAGE']) },
    ] },
    { label: 'Clínica', items: [
      { key: 'clinic', href: '/clinic', label: 'Clínica', icon: CalendarDays, canAccess: (values) => hasDomainPermission(values, 'CLINIC_') || hasDomainPermission(values, 'CLINICAL_HISTORY_') },
    ] },
    { label: 'Finanzas', items: [
      { key: 'finance-summary', href: '/finance', label: 'Resumen', icon: Wallet, canAccess: (values) => values.includes('FINANCE_OPERATIONAL_READ') || values.includes('FINANCE_EXECUTIVE_READ') || values.includes('PAYMENT_METHOD_CATALOG_MANAGE') },
      { key: 'finance-income', href: '/finance?view=income', label: 'Ingresos', icon: Wallet, canAccess: (values) => values.includes('FINANCE_OPERATIONAL_READ') },
      { key: 'finance-expenses', href: '/finance?view=expenses', label: 'Gastos', icon: Wallet, canAccess: (values) => values.includes('FINANCE_OPERATIONAL_READ') || values.includes('EXPENSE_HISTORY_READ') },
    ] },
    { label: 'Equipo', items: [
      { key: 'team', href: '/team', label: 'Equipo', icon: UserCog, canAccess: (values) => hasDomainPermission(values, 'TEAM_') },
    ] },
  ];
  return groups.map((group) => ({ ...group, items: group.items.filter(allowed) })).filter((group) => group.items.length > 0);
}

export function WorkspaceShell({ children, active }: { children: React.ReactNode; active: string }): React.JSX.Element {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const closeMenuRef = React.useRef<HTMLButtonElement>(null);
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const permissions = session.data?.permissions ?? [];
  const roles = session.data?.roles ?? [];
  const isProfessorOnly = roles.length === 1 && roles.includes('PROFESSOR');
  const hasAdministrativeNavigation = roles.includes('ADMINISTRATIVE') || roles.includes('GENERAL_ADMIN');
  const groups = hasAdministrativeNavigation ? groupedNavigation(permissions) : null;
  const visibleNavigation = roles.includes('GENERAL_ADMIN') ? (groups?.flatMap((group) => group.items) ?? []) : hasAdministrativeNavigation ? (groups?.flatMap((group) => group.items) ?? []) : isProfessorOnly ? professorNavigation : navigation.filter((item) => item.canAccess(permissions));

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

  const itemLink = ({ key, href, label, icon: Icon }: NavigationItem, onNavigate?: () => void) => <Link key={key} aria-current={active === key ? 'page' : undefined} className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm md:min-h-0 ${active === key ? 'bg-primary font-semibold text-primary-foreground' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`} href={href} onClick={() => onNavigate?.()}>
    <Icon aria-hidden="true" size={18} />
    <span>{label}</span>
  </Link>;
  const navigationContent = (onNavigate?: () => void) => groups
    ? groups.map((group) => <section key={group.label} className="space-y-1"><h2 className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-zinc-400 first:pt-0">{group.label}</h2>{group.items.map((item) => itemLink(item, onNavigate))}</section>)
    : visibleNavigation.map((item) => itemLink(item, onNavigate));

  return <AuthShell mobileNavigationTrigger={<Button variant="ghost" aria-label="Abrir menú" aria-expanded={mobileMenuOpen} aria-controls="internal-mobile-navigation" className="h-11 gap-2 px-3 md:hidden" onClick={() => setMobileMenuOpen(true)}><Menu aria-hidden="true" size={20} />Menú</Button>}>
    <main className="min-h-screen min-w-0 bg-background pt-14 md:ml-60">
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-60 min-w-0 flex-col overflow-y-auto bg-sidebar px-4 py-6 text-sidebar-foreground md:flex">
        <Link href="/" aria-label="Athleta · Inicio" className="mb-10 shrink-0 text-center">
          <Image src="/logo-athleta.png" width={1983} height={793} alt="Athleta" priority className="h-auto w-full" />
        </Link>
        <nav aria-label="Navegación principal" className="min-w-0 space-y-1">{navigationContent()}</nav>
      </aside>
      {mobileMenuOpen ? <>
        <button type="button" aria-label="Cerrar menú desde el fondo" className="fixed inset-0 z-50 bg-black/40 md:hidden" onClick={() => setMobileMenuOpen(false)} />
        <div id="internal-mobile-navigation" role="dialog" aria-label="Menú principal" className="fixed inset-y-0 left-0 z-[60] w-72 max-w-[85vw] min-w-0 overflow-y-auto bg-sidebar px-4 py-6 text-sidebar-foreground md:hidden">
          <div className="mb-8 flex min-w-0 items-start justify-between gap-3">
            <Link href="/" aria-label="Athleta · Inicio" className="min-w-0 flex-1" onClick={() => setMobileMenuOpen(false)}>
              <Image src="/logo-athleta.png" width={1983} height={793} alt="Athleta" className="h-auto w-full max-w-44" />
            </Link>
            <button ref={closeMenuRef} type="button" aria-label="Cerrar menú" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setMobileMenuOpen(false)}><X aria-hidden="true" size={20} /></button>
          </div>
          <nav aria-label="Navegación móvil" className="min-w-0 space-y-1">{navigationContent(() => setMobileMenuOpen(false))}</nav>
        </div>
      </> : null}
      <section className="min-w-0 p-4 sm:p-5 md:p-8">{children}</section>
    </main>
  </AuthShell>;
}
