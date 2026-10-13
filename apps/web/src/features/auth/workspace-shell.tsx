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
  href: string;
  label: string;
  icon: typeof Activity;
  canAccess: (permissions: string[]) => boolean;
};

const hasAny = (permissions: string[], values: string[]) => values.some((value) => permissions.includes(value));
const hasDomainPermission = (permissions: string[], prefix: string) => permissions.some((permission) => permission.startsWith(prefix));

const navigation: NavigationItem[] = [
  { href: '/', label: 'Inicio', icon: Activity, canAccess: () => true },
  { href: '/people', label: 'Personas', icon: Users, canAccess: (permissions) => hasAny(permissions, ['PEOPLE_READ', 'PEOPLE_CREATE', 'PEOPLE_UPDATE_GENERAL']) },
  { href: '/team', label: 'Equipo', icon: UserCog, canAccess: (permissions) => hasDomainPermission(permissions, 'TEAM_') },
  { href: '/sala', label: 'Sala', icon: Dumbbell, canAccess: (permissions) => hasAny(permissions, ['SALA_PARTICIPATION_MANAGE', 'SALA_SCHEDULE_MANAGE', 'SALA_AGENDA_MANAGE', 'SALA_ROUTINE_READ', 'SALA_ROUTINE_MANAGE', 'SALA_PHYSICAL_EVALUATION_READ', 'SALA_PHYSICAL_EVALUATION_MANAGE', 'SALA_PAYMENT_READ', 'SALA_PAYMENT_MANAGE']) },
  { href: '/routines', label: 'Rutinas', icon: ClipboardList, canAccess: (permissions) => permissions.includes('SALA_ROUTINE_MANAGE') },
  { href: '/reservations', label: 'Reservas', icon: ClipboardList, canAccess: (permissions) => hasAny(permissions, ['SALA_RELATION_READ', 'CLINIC_OPERATIONAL_READ']) },
  { href: '/clinic', label: 'Clínica', icon: CalendarDays, canAccess: (permissions) => hasDomainPermission(permissions, 'CLINIC_') || hasDomainPermission(permissions, 'CLINICAL_HISTORY_') },
  { href: '/finance', label: 'Finanzas', icon: Wallet, canAccess: (permissions) => hasDomainPermission(permissions, 'FINANCE_') || permissions.includes('PAYMENT_METHOD_CATALOG_MANAGE') },
];

const professorNavigation = [
  { href: '/', label: 'Inicio', icon: Activity },
  { href: '/reservations', label: 'Reservas', icon: CalendarDays },
  { href: '/students', label: 'Alumnos', icon: Users },
  { href: '/routines', label: 'Rutinas', icon: ClipboardList },
];

const generalAdminNavigation = [
  { href: '/', label: 'Inicio', icon: Activity },
  { href: '/people', label: 'Personas', icon: Users },
  { href: '/reservations', label: 'Agenda', icon: CalendarDays },
  { href: '/sala', label: 'Sala', icon: Dumbbell },
  { href: '/clinic', label: 'Clínica', icon: ClipboardList },
  { href: '/finance', label: 'Finanzas', icon: Wallet },
  { href: '/team', label: 'Equipo', icon: UserCog },
];

export function WorkspaceShell({ children, active }: { children: React.ReactNode; active: string }): React.JSX.Element {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const closeMenuRef = React.useRef<HTMLButtonElement>(null);
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const permissions = session.data?.permissions ?? [];
  const roles = session.data?.roles ?? [];
  const isProfessorOnly = roles.length === 1 && roles.includes('PROFESSOR');
  const isGeneralAdmin = roles.includes('GENERAL_ADMIN');
  const visibleNavigation = isGeneralAdmin ? generalAdminNavigation : isProfessorOnly ? professorNavigation : navigation.filter((item) => item.canAccess(permissions));

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

  const navigationLinks = (onNavigate?: () => void) => visibleNavigation.map(({ href, label, icon: Icon }) => <Link key={label} aria-current={active === label ? 'page' : undefined} className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm md:min-h-0 ${active === label ? 'bg-primary font-semibold text-primary-foreground' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`} href={href} onClick={() => onNavigate?.()}>
    <Icon aria-hidden="true" size={18} />
    <span>{label}</span>
  </Link>);

  return <AuthShell mobileNavigationTrigger={<Button variant="ghost" aria-label="Abrir menú" aria-expanded={mobileMenuOpen} aria-controls="internal-mobile-navigation" className="h-11 gap-2 px-3 md:hidden" onClick={() => setMobileMenuOpen(true)}><Menu aria-hidden="true" size={20} />Menú</Button>}>
    <main className="min-h-screen min-w-0 bg-background pt-14 md:ml-60">
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-60 min-w-0 flex-col overflow-y-auto bg-sidebar px-4 py-6 text-sidebar-foreground md:flex">
        <Link href="/" aria-label="Athleta · Inicio" className="mb-10 shrink-0 text-center">
          <Image src="/logo-athleta.png" width={1983} height={793} alt="Athleta" priority className="h-auto w-full" />
        </Link>
        <nav aria-label="Navegación principal" className="min-w-0 space-y-1">
          {navigationLinks()}
        </nav>
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
          <nav aria-label="Navegación móvil" className="min-w-0 space-y-1">{navigationLinks(() => setMobileMenuOpen(false))}</nav>
        </div>
      </> : null}
      <section className="min-w-0 p-4 sm:p-5 md:p-8">{children}</section>
    </main>
  </AuthShell>;
}
