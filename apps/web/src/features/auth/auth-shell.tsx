'use client';
import React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, UserRound } from 'lucide-react';
import { Button } from '@athleta/ui';
import { currentSession, logout } from './auth';

export function AuthShell({ children, mobileNavigationTrigger }: { children: React.ReactNode; mobileNavigationTrigger?: React.ReactNode }): React.JSX.Element {
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const signOut = useMutation({ mutationFn: logout, onSuccess: () => { queryClient.removeQueries({ queryKey: ['auth', 'session'] }); window.location.assign('/login'); } });
  if (session.isLoading) return <main className="grid min-h-screen place-items-center text-muted-foreground">Cargando sesión…</main>;
  if (session.isError) { if (typeof window !== 'undefined') window.location.assign('/login'); return <main />; }
  const current = session.data;
  if (!current) return <main />;
  if (current.mustChangePassword) { if (typeof window !== 'undefined') window.location.assign('/change-password'); return <main />; }
  const canViewOwnProfile = !current.roles?.includes('BROCO_SUPPORT');
  const roleLabels: Record<string, string> = {
    PROFESSOR: 'Profesor',
    KINESIOLOGIST: 'Kinesiólogo',
    OSTEOPATH: 'Osteópata',
    ADMINISTRATIVE: 'Administrativo',
    GENERAL_ADMIN: 'Administrador general',
    BROCO_SUPPORT: 'Soporte Broco',
  };
  const fullName = `${current.user.firstName} ${current.user.lastName}`.trim();
  const rolesLabel = (current.roles ?? []).map((role) => roleLabels[role] ?? role).join(' · ');
  const sessionIdentity = [fullName, rolesLabel].filter(Boolean).join(' · ');
  return <><div className="fixed inset-x-0 top-0 z-40 flex min-h-14 min-w-0 items-center justify-between gap-2 border-b border-border bg-surface px-3 py-1 md:left-60 md:justify-end md:gap-4 md:px-6">
    <div className="min-w-0 md:hidden">{mobileNavigationTrigger}</div>
    <div className="min-w-0 flex-1 text-right md:flex-none" title={sessionIdentity}>
      <div className="truncate text-sm font-medium leading-5 text-foreground">{fullName}</div>
      <div className="truncate text-xs leading-4 text-muted-foreground">{rolesLabel}</div>
    </div>
    <div className="flex shrink-0 items-center gap-1">
      {canViewOwnProfile ? <Link href="/profile" aria-label="Mi perfil" title="Mi perfil" className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-md px-3 text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9"><UserRound aria-hidden="true" size={16} /><span className="hidden sm:inline">Mi perfil</span></Link> : null}
      <Button aria-label="Cerrar sesión" title="Cerrar sesión" variant="ghost" className="h-11 min-w-11 gap-2 px-3 md:h-10 md:px-4" disabled={signOut.isPending} onClick={() => signOut.mutate(current.csrfToken)}><LogOut aria-hidden="true" size={16} /><span className="hidden sm:inline">Cerrar sesión</span></Button>
    </div>
  </div>{children}</>;
}
