'use client';
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { Button } from '@athleta/ui';
import { currentSession, logout } from './auth';

export function AuthShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const signOut = useMutation({ mutationFn: logout, onSuccess: () => { queryClient.removeQueries({ queryKey: ['auth', 'session'] }); window.location.assign('/login'); } });
  if (session.isLoading) return <main className="grid min-h-screen place-items-center text-muted-foreground">Cargando sesión…</main>;
  if (session.isError) { if (typeof window !== 'undefined') window.location.assign('/login'); return <main />; }
  const current = session.data;
  if (!current) return <main />;
  if (current.mustChangePassword) { if (typeof window !== 'undefined') window.location.assign('/change-password'); return <main />; }
  return <><div className="fixed inset-x-0 top-0 z-40 flex h-14 justify-end border-b bg-background/95 px-4 backdrop-blur md:px-8"><Button aria-label="Cerrar sesión" variant="ghost" className="my-2" disabled={signOut.isPending} onClick={() => signOut.mutate(current.csrfToken)}><LogOut size={16} /> Cerrar sesión</Button></div>{children}</>;
}
