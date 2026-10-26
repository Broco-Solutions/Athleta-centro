'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WorkspaceShell } from '../../features/auth/workspace-shell';
import { currentSession } from '../../features/auth/auth';
import { RoutineTemplateManager } from '../../features/sala/routine-template-manager';
import { ExerciseCatalogManager } from '../../features/sala/exercise-catalog-manager';

type RoutineSection = 'templates' | 'exercises';

export default function RoutinesPage(): React.JSX.Element {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const canManage = session.data?.permissions.includes('SALA_ROUTINE_MANAGE') ?? false;
  const canRead = session.data?.permissions.includes('SALA_ROUTINE_READ') ?? false;
  const [selectedSection, setSelectedSection] = useState<RoutineSection | null>(null);
  const [catalogVisited, setCatalogVisited] = useState(false);
  const section = selectedSection ?? (canManage ? 'templates' : 'exercises');
  const selectSection = (next: RoutineSection) => { setSelectedSection(next); if (next === 'exercises') setCatalogVisited(true); };
  const tabs: Array<{ id: RoutineSection; label: string }> = [
    ...(canManage ? [{ id: 'templates' as const, label: 'Rutinas preestablecidas' }] : []),
    ...(canRead ? [{ id: 'exercises' as const, label: 'Ejercicios' }] : []),
  ];
  return <WorkspaceShell active="routines"><div className="mx-auto max-w-7xl space-y-5">
    <header><h1 className="text-3xl font-semibold">Rutinas</h1><p className="mt-1 text-sm text-muted-foreground">Rutinas preestablecidas y catálogo compartido de ejercicios.</p></header>
    {session.isLoading ? <p role="status">Cargando…</p> : !tabs.length ? <p role="alert">No tenés permiso para administrar rutinas preestablecidas.</p> : <>
      <div role="tablist" aria-label="Secciones de Rutinas" className="flex gap-2 overflow-x-auto border-b border-border" onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const current = tabs.findIndex(tab => tab.id === section);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        const next = tabs[index]!;
        selectSection(next.id); document.getElementById(`routines-${next.id}-tab`)?.focus();
      }}>{tabs.map(tab => <button key={tab.id} id={`routines-${tab.id}-tab`} type="button" role="tab" aria-selected={section === tab.id} aria-controls={`routines-${tab.id}-panel`} tabIndex={section === tab.id ? 0 : -1} onClick={() => selectSection(tab.id)} className={`min-h-11 shrink-0 border-b-2 px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${section === tab.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:bg-surface-muted'}`}>{tab.label}</button>)}</div>
      {/* Keep visited panels mounted so changing tabs preserves local and pending edits. */}
      {canManage ? <div id="routines-templates-panel" role="tabpanel" aria-labelledby="routines-templates-tab" hidden={section !== 'templates'}>
        <h2 className="mb-4 text-xl font-semibold">Rutinas preestablecidas</h2>
        <RoutineTemplateManager csrfToken={session.data?.csrfToken ?? ''}/>
      </div> : null}
      {canRead ? <div id="routines-exercises-panel" role="tabpanel" aria-labelledby="routines-exercises-tab" hidden={section !== 'exercises'}>
        {catalogVisited || section === 'exercises' ? <ExerciseCatalogManager csrfToken={session.data?.csrfToken ?? ''} canManage={canManage}/> : null}
      </div> : null}
    </>}
  </div></WorkspaceShell>;
}
