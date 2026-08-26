'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
import { updateSalaConfiguration } from '@athleta/api-client';
import { WorkspaceShell } from '../../features/auth/workspace-shell';
import { currentSession } from '../../features/auth/auth';
const options = (csrf: string): RequestInit => ({ credentials: 'include', headers: { 'x-csrf-token': csrf } });
export default function SalaPage(): React.JSX.Element {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false }); const client = useQueryClient(); const [capacity, setCapacity] = useState('1');
  const mutation = useMutation({ mutationFn: async () => { const csrf = session.data?.csrfToken; if (!csrf) throw new Error('Sesión inválida'); return updateSalaConfiguration({ capacity: Number(capacity) }, options(csrf)); }, onSuccess: () => client.invalidateQueries({ queryKey: ['sala'] }) });
  return <WorkspaceShell active="Sala"><h1 className="mb-6 text-3xl font-semibold">Configuración de Sala</h1><div className="rounded-md border bg-white p-5"><form onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><h2 className="mb-4 text-lg font-semibold">Capacidad general</h2><input aria-label="Capacidad general" type="number" min="1" value={capacity} onChange={(event) => setCapacity(event.target.value)} className="h-10 w-full rounded-md border px-3"/><Button className="mt-4" type="submit" disabled={mutation.isPending}>Guardar capacidad</Button></form><p className="mt-6 text-sm text-muted-foreground">La grilla, planes y excepciones se administran mediante los endpoints de configuración de Sala.</p></div></WorkspaceShell>;
}
