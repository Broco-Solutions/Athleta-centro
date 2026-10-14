'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { WorkspaceShell } from '../../features/auth/workspace-shell';
import { currentSession } from '../../features/auth/auth';
import { RoutineTemplateManager } from '../../features/sala/routine-template-manager';

export default function RoutinesPage(): React.JSX.Element {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  return <WorkspaceShell active="routines"><div className="mx-auto max-w-7xl space-y-5">
    <header><h1 className="text-3xl font-semibold">Rutinas preestablecidas</h1><p className="mt-1 text-sm text-muted-foreground">Creá modelos reutilizables para asignar rápidamente a los alumnos.</p></header>
    {session.isLoading ? <p role="status">Cargando…</p> : session.data?.permissions.includes('SALA_ROUTINE_MANAGE') ? <RoutineTemplateManager csrfToken={session.data.csrfToken}/> : <p role="alert">No tenés permiso para administrar rutinas preestablecidas.</p>}
  </div></WorkspaceShell>;
}
