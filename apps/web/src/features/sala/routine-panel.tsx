'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
import type { ExerciseDefinitionDto, ReplaceRoutineDto } from '@athleta/api-client';
import { DayEditor, RoutineContentSummary, copyRoutineDays, routineDaysToDraft, draftToRoutineDays, newDay, fieldClass, errorMessage, type EditingDay, type RoutineDay, type ExerciseDefinition, type RoutineTemplate } from './routine-editor';
export type { ExerciseDefinition, RoutineDay, RoutineExercise, RoutineTemplate } from './routine-editor';

export type Routine = { id: string; personId: string; salaParticipationId: string; status: 'ACTIVE' | 'HISTORICAL'; version: number; createdAt?: string; days: RoutineDay[] };
export type RoutineInput = ReplaceRoutineDto;

/** Operations use the generated client through the workspace adapter. */
export type RoutineApi = {
  list: (personId: string, options: RequestInit) => Promise<Routine[]>;
  templates: (options: RequestInit) => Promise<RoutineTemplate[]>;
  exercises: (options: RequestInit) => Promise<ExerciseDefinition[]>;
  create: (input: RoutineInput, options: RequestInit) => Promise<unknown>;
  replace: (routineId: string, input: RoutineInput, options: RequestInit) => Promise<unknown>;
  duplicate: (routineId: string, options: RequestInit) => Promise<unknown>;
  createExercise: (input: ExerciseDefinitionDto, options: RequestInit) => Promise<ExerciseDefinition>;
  updateExercise: (id: string, input: ExerciseDefinitionDto, options: RequestInit) => Promise<unknown>;
  retireExercise: (id: string, input: { confirmActiveRoutineImpact: boolean }, options: RequestInit) => Promise<unknown>;
};

export function RoutinePanel({ personId, participationId, csrfToken, api, canManage }: { personId: string; participationId: string; csrfToken: string; api: RoutineApi; canManage: boolean }): React.JSX.Element {
  const queryClient = useQueryClient();
  const [selectingTemplate, setSelectingTemplate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<RoutineTemplate | null>(null);
  const [personalizing, setPersonalizing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState<EditingDay[]>(() => [newDay()]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [newExercise, setNewExercise] = useState({ name: '', primaryMuscle: '', description: '' });
  const [retirement, setRetirement] = useState<{ id: string; activeRoutines: number } | null>(null);
  const clearCatalogDraft = () => { setCatalogId(null); setNewExercise({ name: '', primaryMuscle: '', description: '' }); setRetirement(null); };
  const options = useMemo<RequestInit>(() => ({ credentials: 'include', headers: { 'x-csrf-token': csrfToken } }), [csrfToken]);
  const routines = useQuery({ queryKey: ['sala-routines', personId], queryFn: () => api.list(personId, options), enabled: Boolean(personId) });
  const definitions = useQuery({ queryKey: ['sala-exercise-definitions'], queryFn: () => api.exercises(options), enabled: canManage });
  const templates = useQuery({ queryKey: ['sala-routine-templates'], queryFn: () => api.templates(options), enabled: canManage && selectingTemplate });
  const active = routines.data?.find((routine) => routine.status === 'ACTIVE');
  const historical = routines.data?.filter((routine) => routine.status === 'HISTORICAL') ?? [];
  const createInlineExercise = async (input: ExerciseDefinitionDto): Promise<ExerciseDefinition> => {
    const created = await api.createExercise(input, options);
    await queryClient.cancelQueries({ queryKey: ['sala-exercise-definitions'] });
    queryClient.setQueryData<ExerciseDefinition[]>(['sala-exercise-definitions'], (current = []) => [...current.filter((item) => item.id !== created.id), created]);
    void queryClient.invalidateQueries({ queryKey: ['sala-exercise-definitions'] });
    return created;
  };
  const refreshRoutines = () => queryClient.invalidateQueries({ queryKey: ['sala-routines', personId] });
  const refreshCatalog = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['sala-exercise-definitions'] }), refreshRoutines()]); };
  const mutation = useMutation({
    mutationFn: async () => {
      const input: RoutineInput = { personId, salaParticipationId: participationId, days: draftToRoutineDays(days) };
      return active ? api.replace(active.id, input, options) : api.create(input, options);
    },
    onSuccess: async () => { setEditing(false); clearCatalogDraft(); setDays([newDay()]); setFeedback('Rutina guardada correctamente.'); await refreshRoutines(); },
  });
  const assign = useMutation({
    mutationFn: async (template: RoutineTemplate) => {
      const input: RoutineInput = { personId, salaParticipationId: participationId, days: copyRoutineDays(template.days) };
      return active ? api.replace(active.id, input, options) : api.create(input, options);
    },
    onSuccess: async () => { setSelectingTemplate(false); setSelectedTemplate(null); setFeedback('Rutina asignada correctamente.'); await refreshRoutines(); },
  });
  const duplicate = useMutation({ mutationFn: (id: string) => api.duplicate(id, options), onSuccess: async () => { setFeedback('Rutina duplicada correctamente.'); await refreshRoutines(); } });
  const exerciseMutation = useMutation({
    mutationFn: () => catalogId ? api.updateExercise(catalogId, newExercise, options) : api.createExercise(newExercise, options),
    onSuccess: async () => { setFeedback(catalogId ? 'Ejercicio actualizado correctamente.' : 'Ejercicio creado correctamente.'); setCatalogId(null); setNewExercise({ name: '', primaryMuscle: '', description: '' }); await refreshCatalog(); },
  });
  const retire = useMutation({
    mutationFn: ({ id, confirmActiveRoutineImpact }: { id: string; confirmActiveRoutineImpact: boolean }) => api.retireExercise(id, { confirmActiveRoutineImpact }, options),
    onSuccess: async () => { setRetirement(null); setFeedback('Ejercicio retirado correctamente.'); await refreshCatalog(); },
    onError: (error, variables) => {
      const structured = error as Error & { code?: string; details?: { activeRoutines?: number } };
      if (structured.code === 'SALA_EXERCISE_RETIRE_CONFIRMATION_REQUIRED' && typeof structured.details?.activeRoutines === 'number') setRetirement({ id: variables.id, activeRoutines: structured.details.activeRoutines });
    },
  });
  const startEditing = () => {
    mutation.reset(); setFeedback(null);
    clearCatalogDraft();
    setPersonalizing(false); setSelectingTemplate(false);
    setDays(active?.days.length ? routineDaysToDraft(active.days) : [newDay()]);
    setEditing(true);
  };
  const retireNeedsConfirmation = (retire.error as (Error & { code?: string }) | null)?.code === 'SALA_EXERCISE_RETIRE_CONFIRMATION_REQUIRED';
  const actionErrors = [mutation.error, assign.error, duplicate.error, exerciseMutation.error, retireNeedsConfirmation ? null : retire.error].filter(Boolean);
  const catalogBusy = exerciseMutation.isPending || retire.isPending;
  return <section aria-labelledby="routine-heading" className="mt-4 rounded-md border bg-surface-muted p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="routine-heading" className="font-semibold">Rutina</h3><p className="text-sm text-muted-foreground">Planificación de entrenamiento vigente e histórica.</p></div>{canManage && participationId ? <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={startEditing} disabled={routines.isLoading || routines.isError || editing || duplicate.isPending || assign.isPending}>{active ? 'Editar rutina' : 'Crear desde cero'}</Button><Button type="button" variant="secondary" disabled={routines.isLoading || routines.isError || editing || duplicate.isPending || assign.isPending} onClick={() => { setSelectingTemplate(true); setSelectedTemplate(null); setFeedback(null); assign.reset(); }}>Usar preestablecida</Button></div> : null}</div>
    {feedback ? <p role="status" className="mt-3 text-sm">{feedback}</p> : null}
    {actionErrors.map((error, index) => <p role="alert" key={index} className="mt-3 text-sm text-red-700">{errorMessage(error)}</p>)}
    {routines.isLoading ? <p role="status" className="mt-3 text-sm text-muted-foreground">Cargando rutina…</p> : null}
    {routines.isError ? <p role="alert" className="mt-3 text-sm text-red-700">{errorMessage(routines.error)}</p> : null}
    {!routines.isLoading && !routines.isError && !active ? <p className="mt-3 text-sm text-muted-foreground">No hay una rutina activa.</p> : null}
    {active ? <RoutineSummary routine={active} definitions={definitions.data ?? []} onDuplicate={canManage && participationId && !editing ? () => { setFeedback(null); duplicate.mutate(active.id); } : undefined} duplicating={duplicate.isPending}/> : null}
    {historical.length > 0 ? <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Rutinas históricas ({historical.length})</summary><div className="mt-2 grid gap-2">{historical.map((routine) => <RoutineSummary key={routine.id} routine={routine} definitions={definitions.data ?? []} onDuplicate={canManage && participationId && !editing ? () => { setFeedback(null); duplicate.mutate(routine.id); } : undefined} duplicating={duplicate.isPending}/>)}</div></details> : null}
    {canManage && selectingTemplate ? <div className="mt-4 rounded-md border bg-white p-4">
      {selectedTemplate ? <div role="region" aria-label="Vista previa de preestablecida"><h4 className="font-semibold">{selectedTemplate.name} — {selectedTemplate.days.length} días</h4><RoutineContentSummary days={selectedTemplate.days}/>
        {selectedTemplate.days.some((day) => day.exercises.some((exercise) => exercise.exerciseDefinition?.isActive === false)) ? <p className="mt-3 text-sm">Esta rutina contiene ejercicios que ya no están disponibles. Editala para reemplazarlos o quitarlos.</p> : null}
        <div className="mt-4 flex gap-2"><Button type="button" disabled={assign.isPending || selectedTemplate.days.some((day) => day.exercises.some((exercise) => exercise.exerciseDefinition?.isActive === false))} onClick={() => assign.mutate(selectedTemplate)}>Asignar rutina</Button><Button type="button" variant="secondary" disabled={assign.isPending} onClick={() => { setDays(routineDaysToDraft(selectedTemplate.days)); setPersonalizing(true); setSelectingTemplate(false); setEditing(true); mutation.reset(); }}>Editar</Button><Button type="button" variant="ghost" disabled={assign.isPending} onClick={() => { setSelectedTemplate(null); assign.reset(); }}>Volver</Button></div></div> : <>
        <h4 className="font-semibold">Usar preestablecida</h4>{templates.isLoading ? <p role="status">Cargando rutinas preestablecidas…</p> : templates.isError ? <p role="alert">{errorMessage(templates.error)}</p> : templates.data?.length === 0 ? <p>No hay rutinas preestablecidas disponibles. Podés crear la rutina desde cero.</p> : <ul className="mt-3 grid gap-2">{templates.data?.map((template) => <li key={template.id}><Button type="button" variant="secondary" onClick={() => setSelectedTemplate(template)}>{template.name}</Button></li>)}</ul>}
        <Button type="button" variant="ghost" onClick={() => setSelectingTemplate(false)}>Volver</Button>
      </>}
    </div> : null}
    {canManage && editing ? <div className="mt-4 rounded-md border bg-white p-4"><h4 className="font-semibold">{personalizing ? 'Personalizar rutina' : active ? 'Editar rutina' : 'Nueva rutina'}</h4>{days.map((day, index) => <DayEditor key={day.key} day={day} index={index} definitions={[...(definitions.data ?? []), ...(selectedTemplate?.days.flatMap((day) => day.exercises.filter((entry) => entry.exerciseDefinition?.isActive === false).map((entry) => ({ id: entry.exerciseDefinitionId, name: entry.exerciseDefinition!.name, primaryMuscle: '', isActive: false }))) ?? [])]} catalogLoading={definitions.isLoading} catalogError={definitions.isError} onCreateExercise={createInlineExercise} disabled={mutation.isPending} canRemove={days.length > 1} onRemove={() => setDays((items) => items.filter((item) => item.key !== day.key))} onChange={(next) => setDays((items) => items.map((item) => item.key === day.key ? next : item))}/>)}<Button className="mt-3" type="button" variant="secondary" disabled={mutation.isPending} onClick={() => setDays((items) => [...items, newDay(`Día ${items.length + 1}`)])}>Agregar día</Button>
      <details className="mt-3 rounded-md border bg-white p-3"><summary className="cursor-pointer text-sm font-medium">Administrar ejercicios</summary><p className="mt-2 text-xs text-muted-foreground">Catálogo utilizado para armar rutinas.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3"><input className={fieldClass} aria-label="Nombre del ejercicio" placeholder="Nombre" maxLength={120} value={newExercise.name} onChange={(event) => setNewExercise((current) => ({ ...current, name: event.target.value }))}/><input className={fieldClass} aria-label="Músculo principal" placeholder="Músculo principal" maxLength={120} value={newExercise.primaryMuscle} onChange={(event) => setNewExercise((current) => ({ ...current, primaryMuscle: event.target.value }))}/><input className={fieldClass} aria-label="Descripción del ejercicio" placeholder="Descripción opcional" maxLength={500} value={newExercise.description} onChange={(event) => setNewExercise((current) => ({ ...current, description: event.target.value }))}/></div>
      <Button className="mt-2" type="button" disabled={!newExercise.name.trim() || !newExercise.primaryMuscle.trim() || catalogBusy} onClick={() => { setFeedback(null); exerciseMutation.mutate(); }}>{catalogId ? 'Guardar cambios del ejercicio' : 'Nuevo ejercicio'}</Button>{catalogId ? <Button type="button" variant="ghost" onClick={() => { setCatalogId(null); setNewExercise({ name: '', primaryMuscle: '', description: '' }); exerciseMutation.reset(); }}>Cancelar edición del catálogo</Button> : null}
      {definitions.isError ? <p role="alert">{errorMessage(definitions.error)}</p> : null}
      <ul className="mt-3 divide-y">{definitions.data?.filter((item) => item.isActive).map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span>{item.name} · {item.primaryMuscle}</span><span><Button type="button" variant="ghost" disabled={catalogBusy} onClick={() => { exerciseMutation.reset(); setFeedback(null); setCatalogId(item.id); setNewExercise({ name: item.name, primaryMuscle: item.primaryMuscle, description: item.description ?? '' }); }}>Editar</Button><Button type="button" variant="ghost" disabled={catalogBusy || Boolean(retirement)} onClick={() => { setFeedback(null); retire.mutate({ id: item.id, confirmActiveRoutineImpact: false }); }}>Retirar</Button></span></li>)}</ul>
      {retirement ? <div role="alertdialog" aria-label="Confirmar retiro" className="mt-3 rounded-md border p-3"><p className="text-sm">Este ejercicio se utiliza en {retirement.activeRoutines} Rutinas activas. Si lo retirás, se quitará de esas Rutinas. Las Rutinas históricas no se modificarán.</p><div className="mt-2 flex gap-2"><Button type="button" disabled={retire.isPending} onClick={() => retire.mutate({ id: retirement.id, confirmActiveRoutineImpact: true })}>Confirmar retiro</Button><Button type="button" variant="secondary" disabled={retire.isPending} onClick={() => { setRetirement(null); retire.reset(); }}>Cancelar retiro</Button></div></div> : null}
      </details><div className="mt-4 flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={() => { setEditing(false); clearCatalogDraft(); }} disabled={mutation.isPending}>Cancelar</Button><Button type="button" onClick={() => { setFeedback(null); mutation.mutate(); }} disabled={mutation.isPending}>{mutation.isPending ? 'Guardando…' : 'Guardar rutina'}</Button></div></div> : null}
  </section>;
}

function RoutineSummary({ routine, definitions, onDuplicate, duplicating }: { routine: Routine; definitions: ExerciseDefinition[]; onDuplicate?: (() => void) | undefined; duplicating: boolean }): React.JSX.Element {
  return <article className="mt-3 rounded-md border bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-medium">Rutina v{routine.version}</h4><span className={routine.status === 'ACTIVE' ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-800' : 'rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700'}>{routine.status === 'ACTIVE' ? 'Activa' : 'Histórica'}</span>{onDuplicate ? <Button type="button" variant="secondary" disabled={duplicating} onClick={onDuplicate}>Duplicar rutina</Button> : null}</div><RoutineContentSummary days={routine.days} definitions={definitions}/></article>;
}
