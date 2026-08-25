'use client';
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
  return <>{children}<Button aria-label="Cerrar sesión" variant="ghost" className="fixed right-5 top-5" disabled={signOut.isPending} onClick={() => signOut.mutate(current.csrfToken)}><LogOut size={16} /> Cerrar sesión</Button></>;
}
