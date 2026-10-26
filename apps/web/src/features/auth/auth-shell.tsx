'use client';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PanelLeftOpen } from 'lucide-react';
import { Button } from '@athleta/ui';
import { currentSession } from './auth';

export function AuthShell({ children, mobileNavigationTrigger, desktopSidebarOpen = true, onToggleDesktopSidebar }: { children: React.ReactNode; mobileNavigationTrigger?: React.ReactNode; desktopSidebarOpen?: boolean; onToggleDesktopSidebar?: () => void }): React.JSX.Element {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  if (session.isLoading) return <main className="grid min-h-screen place-items-center text-muted-foreground">Cargando sesión…</main>;
  if (session.isError) { if (typeof window !== 'undefined') window.location.assign('/login'); return <main />; }
  const current = session.data;
  if (!current) return <main />;
  if (current.mustChangePassword) { if (typeof window !== 'undefined') window.location.assign('/change-password'); return <main />; }
  return <><div className={`fixed inset-x-0 top-0 z-40 flex min-h-14 min-w-0 items-center justify-between gap-2 border-b border-border bg-surface px-3 py-1 transition-[left] duration-200 ${desktopSidebarOpen ? 'md:hidden' : 'md:left-0 md:justify-between'} md:gap-4 md:px-6`}>
    <div className="min-w-0 md:hidden">{mobileNavigationTrigger}</div>
    {!desktopSidebarOpen && onToggleDesktopSidebar ? <Button variant="ghost" aria-label="Mostrar menú lateral" className="hidden h-10 min-w-10 md:inline-flex" onClick={onToggleDesktopSidebar}><PanelLeftOpen aria-hidden="true" size={18} /></Button> : null}
  </div>{children}</>;
}
