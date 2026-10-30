'use client';

import { RoutinePrintButton } from './routine-print';
import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
import type { ReplaceRoutineDto } from '@athleta/api-client';
import { RoutineDaysEditor, RoutineContentSummary, copyRoutineDays, routineDaysToDraft, draftToRoutineDays, newDay, errorMessage, type EditingDay, type RoutineDay, type ExerciseDefinition, type MovementPattern, type RoutineTemplate } from './routine-editor';
import { TrainingRecordHistory } from './training-record-history';
import type { TrainingHistoryApi } from './training-record-api';
export type { ExerciseDefinition, RoutineDay, RoutineExercise, RoutineTemplate } from './routine-editor';

export type Routine = { id: string; personId: string; salaParticipationId: string; status: 'ACTIVE' | 'HISTORICAL'; version: number; createdAt?: string; days: RoutineDay[] };
export type RoutineInput = ReplaceRoutineDto;

/** Operations use the generated client through the workspace adapter. */
export type RoutineApi = {
  training: TrainingHistoryApi;
  list: (personId: string, options: RequestInit) => Promise<Routine[]>;
  templates: (options: RequestInit) => Promise<RoutineTemplate[]>;
  exercises: (options: RequestInit) => Promise<ExerciseDefinition[]>;
  patterns: (options: RequestInit) => Promise<MovementPattern[]>;
  create: (input: RoutineInput, options: RequestInit) => Promise<unknown>;
  replace: (routineId: string, input: RoutineInput, options: RequestInit) => Promise<unknown>;
  duplicate: (routineId: string, options: RequestInit) => Promise<unknown>;

};

export function RoutinePanel({ personName, personId, participationId, csrfToken, api, canManage }: { personName: string; personId: string; participationId: string; csrfToken: string; api: RoutineApi; canManage: boolean }): React.JSX.Element {
  const queryClient = useQueryClient();
  const [selectingTemplate, setSelectingTemplate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<RoutineTemplate | null>(null);
  const [personalizing, setPersonalizing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState<EditingDay[]>(() => [newDay()]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [routineToReuse, setRoutineToReuse] = useState<Routine | null>(null);
  const options = useMemo<RequestInit>(() => ({ credentials: 'include', headers: { 'x-csrf-token': csrfToken } }), [csrfToken]);
  const routines = useQuery({ queryKey: ['sala-routines', personId], queryFn: () => api.list(personId, options), enabled: Boolean(personId) });
  const definitions = useQuery({ queryKey: ['sala-exercise-definitions'], queryFn: () => api.exercises(options), enabled: canManage });
  const patterns = useQuery({ queryKey: ['sala-movement-patterns'], queryFn: () => api.patterns(options), enabled: canManage });
  const templates = useQuery({ queryKey: ['sala-routine-templates'], queryFn: () => api.templates(options), enabled: canManage && selectingTemplate });
  const active = routines.data?.find((routine) => routine.status === 'ACTIVE');
  const historical = routines.data?.filter((routine) => routine.status === 'HISTORICAL') ?? [];
  const refreshRoutines = () => queryClient.invalidateQueries({ queryKey: ['sala-routines', personId] });
  const mutation = useMutation({
    mutationFn: async () => {
      const input: RoutineInput = { personId, salaParticipationId: participationId, days: draftToRoutineDays(days) };
      return active ? api.replace(active.id, input, options) : api.create(input, options);
    },
    onSuccess: async () => { setEditing(false);  setDays([newDay()]); setFeedback('Rutina guardada correctamente.'); await refreshRoutines(); },
  });
  const assign = useMutation({
    mutationFn: async (template: RoutineTemplate) => {
      const input: RoutineInput = { personId, salaParticipationId: participationId, days: copyRoutineDays(template.days) };
      return active ? api.replace(active.id, input, options) : api.create(input, options);
    },
    onSuccess: async () => { setSelectingTemplate(false); setSelectedTemplate(null); setFeedback('Rutina asignada correctamente.'); await refreshRoutines(); },
  });
  const reuseRoutine = useMutation({
    mutationFn: (id: string) => api.duplicate(id, options),
    onSuccess: async () => { setRoutineToReuse(null); setFeedback('Rutina activada correctamente.'); await refreshRoutines(); },
  });
  const startEditing = () => {
    mutation.reset(); setFeedback(null);

    setPersonalizing(false); setSelectingTemplate(false);
    setDays(active?.days.length ? routineDaysToDraft(active.days) : [newDay()]);
    setEditing(true);
  };
  const actionErrors = [mutation.error, assign.error, reuseRoutine.error].filter(Boolean);
  return <section aria-labelledby="routine-heading" className="mt-4 rounded-md border bg-surface-muted p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="routine-heading" className="font-semibold">Rutina</h3><p className="text-sm text-muted-foreground">Planificación de entrenamiento vigente e histórica.</p></div>{canManage && participationId ? <div className="flex flex-wrap gap-2"><Button type="button" variant={active ? 'secondary' : 'primary'} onClick={startEditing} disabled={routines.isLoading || routines.isError || editing || Boolean(routineToReuse) || reuseRoutine.isPending || assign.isPending}>{active ? 'Editar rutina' : 'Crear desde cero'}</Button><Button type="button" variant={active ? 'ghost' : 'secondary'} disabled={routines.isLoading || routines.isError || editing || Boolean(routineToReuse) || reuseRoutine.isPending || assign.isPending} onClick={() => { setSelectingTemplate(true); setSelectedTemplate(null); setFeedback(null); assign.reset(); }}>Usar preestablecida</Button></div> : null}</div>
    {feedback ? <p role="status" className="mt-3 text-sm">{feedback}</p> : null}
    {actionErrors.map((error, index) => <p role="alert" key={index} className="mt-3 text-sm text-red-700">{errorMessage(error)}</p>)}
    {routines.isLoading ? <p role="status" className="mt-3 text-sm text-muted-foreground">Cargando rutina…</p> : null}
    {routines.isError ? <p role="alert" className="mt-3 text-sm text-red-700">{errorMessage(routines.error)}</p> : null}
    {!routines.isLoading && !routines.isError && !active ? <div className="mt-4 rounded-md border bg-white p-4"><p className="font-medium">No hay una rutina activa.</p><p className="mt-1 text-sm text-muted-foreground">Creá una rutina nueva o elegí una preestablecida para este alumno.</p></div> : null}
    {active ? <RoutineSummary personName={personName} routine={active} definitions={definitions.data ?? []} reusing={reuseRoutine.isPending}/> : null}
    <TrainingRecordHistory key={personId} api={api.training} queryKey={['sala-training-records', personId]}/>
    {historical.length > 0 ? <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Rutinas históricas ({historical.length})</summary><div className="mt-2 grid gap-2">{historical.map((routine) => <RoutineSummary personName={personName} key={routine.id} routine={routine} definitions={definitions.data ?? []} onReuse={canManage && participationId && !editing && !selectingTemplate && !routineToReuse ? () => { setFeedback(null); reuseRoutine.reset(); setRoutineToReuse(routine); } : undefined} reusing={reuseRoutine.isPending}/>)}</div></details> : null}
    {routineToReuse ? <div role="alertdialog" aria-modal="true" aria-labelledby="reuse-routine-title" className="mt-4 rounded-md border bg-white p-4"><h4 id="reuse-routine-title" className="font-semibold">Usar nuevamente esta rutina</h4><p className="mt-2 text-sm">Esta rutina pasará a ser la rutina activa del alumno.</p>{active ? <p className="text-sm">La rutina actual quedará en el historial.</p> : null}<div className="mt-4 flex justify-end gap-2"><Button type="button" variant="secondary" disabled={reuseRoutine.isPending} onClick={() => { setRoutineToReuse(null); reuseRoutine.reset(); }}>Cancelar</Button><Button type="button" disabled={reuseRoutine.isPending} onClick={() => reuseRoutine.mutate(routineToReuse.id)}>{reuseRoutine.isPending ? 'Activando…' : 'Usar nuevamente'}</Button></div></div> : null}
    {canManage && selectingTemplate ? <div className="mt-4 rounded-md border bg-white p-4">
      {selectedTemplate ? <div role="region" aria-label="Vista previa de preestablecida"><h4 className="font-semibold">{selectedTemplate.name} — {selectedTemplate.days.length} días</h4><RoutineContentSummary days={selectedTemplate.days}/>
        {selectedTemplate.days.some((day) => day.exercises.some((exercise) => exercise.exerciseDefinition?.isActive === false)) ? <p className="mt-3 text-sm">Esta rutina contiene ejercicios que ya no están disponibles. Editala para reemplazarlos o quitarlos.</p> : null}
        <div className="mt-4 flex gap-2"><Button type="button" disabled={assign.isPending || selectedTemplate.days.some((day) => day.exercises.some((exercise) => exercise.exerciseDefinition?.isActive === false))} onClick={() => assign.mutate(selectedTemplate)}>Asignar rutina</Button><RoutinePrintButton days={selectedTemplate.days} templateName={selectedTemplate.name} disabled={assign.isPending}/><Button type="button" variant="secondary" disabled={assign.isPending} onClick={() => { setDays(routineDaysToDraft(selectedTemplate.days)); setPersonalizing(true); setSelectingTemplate(false); setEditing(true); mutation.reset(); }}>Editar</Button><Button type="button" variant="ghost" disabled={assign.isPending} onClick={() => { setSelectedTemplate(null); assign.reset(); }}>Volver</Button></div></div> : <>
        <h4 className="font-semibold">Usar preestablecida</h4>{templates.isLoading ? <p role="status">Cargando rutinas preestablecidas…</p> : templates.isError ? <p role="alert">{errorMessage(templates.error)}</p> : templates.data?.length === 0 ? <p>No hay rutinas preestablecidas disponibles. Podés crear la rutina desde cero.</p> : <ul className="mt-3 grid gap-2 sm:grid-cols-2">{templates.data?.map((template) => <li key={template.id}><Button type="button" variant="secondary" className="w-full justify-start" onClick={() => setSelectedTemplate(template)}>{template.name}</Button></li>)}</ul>}
        <Button type="button" variant="ghost" onClick={() => setSelectingTemplate(false)}>Volver</Button>
      </>}
    </div> : null}
    {canManage && editing ? <div className="mt-4 rounded-lg border bg-white p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-xl font-semibold">{personalizing ? 'Personalizar rutina' : active ? 'Editar rutina' : 'Crear rutina desde cero'}</h4><p className="mt-1 text-sm text-muted-foreground">Organizá los días y completá los ejercicios del alumno.</p></div></div>
      <RoutineDaysEditor days={days} definitions={[...(definitions.data ?? []), ...((selectedTemplate ?? active)?.days.flatMap((day) => day.exercises.filter((entry) => entry.exerciseDefinition?.isActive === false).map((entry) => ({ id: entry.exerciseDefinitionId, name: entry.exerciseDefinition!.name, primaryMuscle: '', isActive: false }))) ?? [])]} catalogLoading={definitions.isLoading} catalogError={definitions.isError} patterns={patterns.data ?? []} patternsLoading={patterns.isLoading} patternsError={patterns.isError} disabled={mutation.isPending} onChange={setDays}/>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Los cambios se aplican al guardar.</p><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => { setEditing(false);  }} disabled={mutation.isPending}>Cancelar</Button><Button type="button" onClick={() => { setFeedback(null); mutation.mutate(); }} disabled={mutation.isPending}>{mutation.isPending ? 'Guardando…' : 'Guardar cambios'}</Button></div></div>
</div> : null}
  </section>;
}

function RoutineSummary({ personName, routine, definitions, onReuse, reusing }: { personName: string; routine: Routine; definitions: ExerciseDefinition[]; onReuse?: (() => void) | undefined; reusing: boolean }): React.JSX.Element {
  return <article className="mt-3 rounded-md border bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-medium">Rutina v{routine.version}</h4><span className={routine.status === 'ACTIVE' ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-800' : 'rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700'}>{routine.status === 'ACTIVE' ? 'Activa' : 'Histórica'}</span><RoutinePrintButton days={routine.days} definitions={definitions} studentName={personName} status={routine.status} version={routine.version} disabled={reusing}/>{onReuse ? <Button type="button" variant="secondary" disabled={reusing} onClick={onReuse}>Usar nuevamente</Button> : null}</div><RoutineContentSummary days={routine.days} definitions={definitions}/></article>;
}
