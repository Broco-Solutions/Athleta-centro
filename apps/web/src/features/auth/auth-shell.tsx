'use client';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { currentSession } from './auth';

export function AuthShell({ children, mobileNavigationTrigger, mobileNavigationOpen = false }: { children: React.ReactNode; mobileNavigationTrigger?: React.ReactNode; desktopSidebarOpen?: boolean; mobileNavigationOpen?: boolean; onToggleDesktopSidebar?: () => void }): React.JSX.Element {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  if (session.isLoading) return <main className="grid min-h-screen place-items-center text-muted-foreground">Cargando sesión…</main>;
  if (session.isError) { if (typeof window !== 'undefined') window.location.assign('/login'); return <main />; }
  const current = session.data;
  if (!current) return <main />;
  if (current.mustChangePassword) { if (typeof window !== 'undefined') window.location.assign('/change-password'); return <main />; }
  return <><div inert={mobileNavigationOpen} className={`fixed inset-x-0 top-0 z-40 flex min-h-14 min-w-0 items-center justify-between gap-2 border-b border-border bg-surface px-3 py-1 transition-[left] duration-200 md:hidden md:gap-4 md:px-6`}>
    <div className="min-w-0 md:hidden">{mobileNavigationTrigger}</div>

  </div>{children}</>;
}
