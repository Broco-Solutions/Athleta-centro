'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Activity, CalendarDays, ClipboardList, Dumbbell, UserCog, Users, Wallet } from 'lucide-react';
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
  { href: '/sala', label: 'Sala', icon: Dumbbell, canAccess: (permissions) => hasDomainPermission(permissions, 'SALA_') },
  { href: '/reservations', label: 'Reservas', icon: ClipboardList, canAccess: (permissions) => hasAny(permissions, ['SALA_RELATION_READ', 'CLINIC_OPERATIONAL_READ']) },
  { href: '/clinic', label: 'Clínica', icon: CalendarDays, canAccess: (permissions) => hasDomainPermission(permissions, 'CLINIC_') || hasDomainPermission(permissions, 'CLINICAL_HISTORY_') },
  { href: '/finance', label: 'Finanzas', icon: Wallet, canAccess: (permissions) => hasDomainPermission(permissions, 'FINANCE_') || permissions.includes('PAYMENT_METHOD_CATALOG_MANAGE') },
];

export function WorkspaceShell({ children, active, context }: { children: React.ReactNode; active: string; context?: React.ReactNode }): React.JSX.Element {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const permissions = session.data?.permissions ?? [];
  const visibleNavigation = navigation.filter((item) => item.canAccess(permissions));

  return <AuthShell headerContent={context ?? <span aria-current="page">{active}</span>}>
    <main className="grid min-h-screen min-w-0 grid-cols-1 pt-14 md:grid-cols-[15rem_1fr]">
      <aside className="flex min-w-0 overflow-x-auto bg-sidebar px-4 py-4 text-sidebar-foreground md:flex-col md:overflow-visible md:py-6">
        <Link href="/" className="mr-6 shrink-0 px-3 text-xl font-bold tracking-tight md:mb-10 md:mr-0">ATHLETA</Link>
        <nav aria-label="Navegación principal" className="flex min-w-0 shrink-0 gap-1 md:block md:space-y-1">
          {visibleNavigation.map(({ href, label, icon: Icon }) => <Link key={label} aria-current={active === label ? 'page' : undefined} className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm ${active === label ? 'bg-primary font-semibold text-primary-foreground' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`} href={href}>
            <Icon aria-hidden="true" size={18} />
            <span className="hidden sm:inline">{label}</span>
          </Link>)}
        </nav>
      </aside>
      <section className="min-w-0 p-5 md:p-8">{children}</section>
    </main>
  </AuthShell>;
}
