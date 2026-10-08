'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Activity, CalendarDays, ClipboardList, Dumbbell, Star, UserCog, Users, Wallet } from 'lucide-react';
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
  { href: '/reservations', label: 'Reservas', icon: ClipboardList, canAccess: (permissions) => hasAny(permissions, ['SALA_RELATION_READ', 'CLINIC_OPERATIONAL_READ']) },
  { href: '/clinic', label: 'Clínica', icon: CalendarDays, canAccess: (permissions) => hasDomainPermission(permissions, 'CLINIC_') || hasDomainPermission(permissions, 'CLINICAL_HISTORY_') },
  { href: '/finance', label: 'Finanzas', icon: Wallet, canAccess: (permissions) => hasDomainPermission(permissions, 'FINANCE_') || permissions.includes('PAYMENT_METHOD_CATALOG_MANAGE') },
];

export function WorkspaceShell({ children, active }: { children: React.ReactNode; active: string }): React.JSX.Element {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const permissions = session.data?.permissions ?? [];
  const visibleNavigation = navigation.filter((item) => item.canAccess(permissions));

  return <AuthShell>
    <main className="min-h-screen min-w-0 bg-background pt-14 md:ml-60">
      <aside className="flex min-w-0 items-center gap-4 overflow-x-auto bg-sidebar px-4 py-3 text-sidebar-foreground md:fixed md:inset-y-0 md:left-0 md:z-50 md:w-60 md:items-stretch md:flex-col md:gap-0 md:overflow-y-auto md:px-4 md:py-6">
        <Link href="/" aria-label="Athleta · Inicio" className="mr-2 shrink-0 text-center md:mb-10 md:mr-0">
          <span aria-hidden="true" className="flex justify-center gap-1 text-primary">{[0, 1, 2].map((star) => <Star key={star} size={12} fill="currentColor" />)}</span>
          <span className="block text-xl font-bold tracking-[0.22em]">ATHLETA</span>
          <span className="hidden whitespace-nowrap text-[8px] tracking-[0.04em] md:block">CENTRO DE REHABILITACIÓN Y ENTRENAMIENTO</span>
        </Link>
        <nav aria-label="Navegación principal" className="flex min-w-0 shrink-0 gap-1 md:block md:space-y-1">
          {visibleNavigation.map(({ href, label, icon: Icon }) => <Link key={label} aria-current={active === label ? 'page' : undefined} className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm ${active === label ? 'bg-primary font-semibold text-primary-foreground' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`} href={href}>
            <Icon aria-hidden="true" size={18} />
            <span>{label}</span>
          </Link>)}
        </nav>
      </aside>
      <section className="min-w-0 p-5 md:pt-8 md:px-8 md:pb-8">{children}</section>
    </main>
  </AuthShell>;
}
