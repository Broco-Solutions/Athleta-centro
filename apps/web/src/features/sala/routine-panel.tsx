'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@athleta/ui';
import type { ExerciseDefinitionDto, ReplaceRoutineDto } from '@athleta/api-client';

export type RoutineExercise = {
  id?: string;
  position?: number;
  exerciseDefinitionId: string;
  exerciseDefinition?: { name: string } | null;
  exerciseName?: string;
  series?: string | null | undefined;
  repetitions?: string | null | undefined;
  duration?: string | null | undefined;
  load?: string | null | undefined;
  rest?: string | null | undefined;
  notes?: string | null | undefined;
};
export type RoutineDay = { id?: string; position: number; name?: string | null | undefined; exercises: RoutineExercise[] };
export type Routine = { id: string; personId: string; salaParticipationId: string; status: 'ACTIVE' | 'HISTORICAL'; version: number; createdAt?: string; days: RoutineDay[] };
export type ExerciseDefinition = { id: string; name: string; primaryMuscle: string; description?: string | null | undefined; isActive: boolean };
export type RoutineInput = ReplaceRoutineDto;

/** Operations use the generated client through the workspace adapter. */
export type RoutineApi = {
  list: (personId: string, options: RequestInit) => Promise<Routine[]>;
  exercises: (options: RequestInit) => Promise<ExerciseDefinition[]>;
  create: (input: RoutineInput, options: RequestInit) => Promise<unknown>;
  replace: (routineId: string, input: RoutineInput, options: RequestInit) => Promise<unknown>;
  duplicate: (routineId: string, options: RequestInit) => Promise<unknown>;
  createExercise: (input: ExerciseDefinitionDto, options: RequestInit) => Promise<unknown>;
  updateExercise: (id: string, input: ExerciseDefinitionDto, options: RequestInit) => Promise<unknown>;
  retireExercise: (id: string, input: { confirmActiveRoutineImpact: boolean }, options: RequestInit) => Promise<unknown>;
};

const exclusiveMessage = 'Elegí Repeticiones o Tiempo, no ambos.';
const exerciseSchema = z.object({
  exerciseDefinitionId: z.string().min(1, 'Seleccioná un ejercicio'),
  series: z.string().trim().max(80).optional(),
  repetitions: z.string().trim().max(80).optional(),
  duration: z.string().trim().max(80).optional(),
  load: z.string().trim().max(80).optional(),
  rest: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
}).refine((entry) => !(entry.repetitions && entry.duration), { message: exclusiveMessage });
type ExerciseForm = z.infer<typeof exerciseSchema>;
type EditingDay = { key: string; name: string; exercises: ExerciseForm[] };
const fieldClass = 'h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring';

function emptyExercise(): ExerciseForm {
  return { exerciseDefinitionId: '', series: '', repetitions: '', duration: '', load: '', rest: '', notes: '' };
}
function newDay(name = 'Día 1'): EditingDay { return { key: crypto.randomUUID(), name, exercises: [] }; }
function displayExercise(exercise: RoutineExercise, definitions: ExerciseDefinition[]): string {
  return exercise.exerciseDefinition?.name ?? exercise.exerciseName ?? definitions.find((item) => item.id === exercise.exerciseDefinitionId)?.name ?? 'Ejercicio';
}
function describeExercise(exercise: RoutineExercise, definitions: ExerciseDefinition[]): string {
  return [displayExercise(exercise, definitions), exercise.series && `${exercise.series} series`, exercise.repetitions && `${exercise.repetitions} rep.`, exercise.duration && `Tiempo ${exercise.duration}`, exercise.load && `Carga ${exercise.load}`, exercise.rest && `Descanso ${exercise.rest}`, exercise.notes && `Observación ${exercise.notes}`].filter(Boolean).join(' · ');
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'No se pudo completar la operación.'; }

function RoutineExerciseForm({ definitions, initial, onSave, onCancel, disabled }: { definitions: ExerciseDefinition[]; initial?: ExerciseForm; onSave: (exercise: ExerciseForm) => void; onCancel: () => void; disabled: boolean }): React.JSX.Element {
  const { register, watch, handleSubmit, reset } = useForm<ExerciseForm>({ defaultValues: initial ?? emptyExercise() });
  const repetitions = watch('repetitions')?.trim();
  const duration = watch('duration')?.trim();
  const invalidAlternatives = Boolean(repetitions && duration);
  const [error, setError] = useState<string | null>(null);
  const submit = handleSubmit((form) => {
    const parsed = exerciseSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Revisá los datos del ejercicio.'); return; }
    onSave(parsed.data);
    reset(emptyExercise());
    setError(null);
  });
  return <form className="mt-3 grid gap-2 rounded-md border bg-white p-3" onSubmit={submit}>
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-sm">Ejercicio<select aria-label="Ejercicio" className={fieldClass} {...register('exerciseDefinitionId')} disabled={disabled}><option value="">Seleccionar ejercicio</option>{definitions.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.primaryMuscle}</option>)}</select></label>
      <label className="text-sm">Series<input aria-label="Series" className={fieldClass} {...register('series')} disabled={disabled} maxLength={80}/></label>
      <label className="text-sm">Repeticiones<input aria-label="Repeticiones" className={fieldClass} {...register('repetitions')} disabled={disabled || Boolean(duration && !repetitions)} maxLength={80}/></label>
      <label className="text-sm">Tiempo<input aria-label="Tiempo" className={fieldClass} {...register('duration')} disabled={disabled || Boolean(repetitions && !duration)} maxLength={80}/></label>
      <label className="text-sm">Carga<input aria-label="Carga" className={fieldClass} {...register('load')} disabled={disabled} maxLength={80}/></label>
      <label className="text-sm">Descanso<input aria-label="Descanso" className={fieldClass} {...register('rest')} disabled={disabled} maxLength={80}/></label>
    </div>
    <label className="text-sm">Observación<textarea aria-label="Observación" className="min-h-16 w-full rounded-md border bg-white px-3 py-2 text-sm" {...register('notes')} disabled={disabled} maxLength={500}/></label>
    {invalidAlternatives || error ? <p role="alert" className="text-sm text-red-700">{invalidAlternatives ? exclusiveMessage : error}</p> : null}
    <div className="flex flex-wrap gap-2"><Button type="submit" variant="secondary" disabled={disabled}>{initial ? 'Guardar ejercicio' : 'Agregar ejercicio'}</Button>{initial ? <Button type="button" variant="ghost" onClick={onCancel}>Cancelar edición</Button> : null}</div>
  </form>;
}

function DayEditor({ day, index, definitions, onChange, onRemove, canRemove, disabled }: { day: EditingDay; index: number; definitions: ExerciseDefinition[]; onChange: (day: EditingDay) => void; onRemove: () => void; canRemove: boolean; disabled: boolean }): React.JSX.Element {
  const [editingEntry, setEditingEntry] = useState<number | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const finishEditing = () => { setEditingEntry(null); setFormVersion((value) => value + 1); };
  return <fieldset aria-label={`Día ${index + 1}`} className="mt-3 rounded-md border p-3" disabled={disabled}>
    <div className="flex items-end gap-2"><label className="grow text-sm">Nombre del día<input aria-label={`Nombre del día ${index + 1}`} className={fieldClass} maxLength={120} value={day.name} onChange={(event) => onChange({ ...day, name: event.target.value })}/></label><Button type="button" variant="ghost" disabled={!canRemove || disabled} onClick={onRemove}>Quitar día</Button></div>
    <ul className="mt-3 divide-y rounded-md border">{day.exercises.map((exercise, entryIndex) => <li key={entryIndex} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span>{describeExercise(exercise, definitions)}</span><span className="flex gap-1"><Button type="button" variant="ghost" onClick={() => { setEditingEntry(entryIndex); setFormVersion((value) => value + 1); }}>Editar</Button><Button type="button" variant="ghost" onClick={() => { onChange({ ...day, exercises: day.exercises.filter((_, itemIndex) => itemIndex !== entryIndex) }); finishEditing(); }}>Quitar</Button></span></li>)}</ul>
    <RoutineExerciseForm key={formVersion} definitions={definitions} {...(editingEntry !== null && day.exercises[editingEntry] ? { initial: day.exercises[editingEntry] } : {})} onCancel={finishEditing} disabled={disabled} onSave={(exercise) => { onChange({ ...day, exercises: editingEntry === null ? [...day.exercises, exercise] : day.exercises.map((item, itemIndex) => itemIndex === editingEntry ? exercise : item) }); finishEditing(); }}/>
  </fieldset>;
}

export function RoutinePanel({ personId, participationId, csrfToken, api, canManage }: { personId: string; participationId: string; csrfToken: string; api: RoutineApi; canManage: boolean }): React.JSX.Element {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState<EditingDay[]>(() => [newDay()]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [newExercise, setNewExercise] = useState({ name: '', primaryMuscle: '', description: '' });
  const [retirement, setRetirement] = useState<{ id: string; activeRoutines: number } | null>(null);
  const options = useMemo<RequestInit>(() => ({ credentials: 'include', headers: { 'x-csrf-token': csrfToken } }), [csrfToken]);
  const routines = useQuery({ queryKey: ['sala-routines', personId], queryFn: () => api.list(personId, options), enabled: Boolean(personId) });
  const definitions = useQuery({ queryKey: ['sala-exercise-definitions'], queryFn: () => api.exercises(options), enabled: canManage });
  const active = routines.data?.find((routine) => routine.status === 'ACTIVE');
  const historical = routines.data?.filter((routine) => routine.status === 'HISTORICAL') ?? [];
  const refreshRoutines = () => queryClient.invalidateQueries({ queryKey: ['sala-routines', personId] });
  const refreshCatalog = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['sala-exercise-definitions'] }), refreshRoutines()]); };
  const mutation = useMutation({
    mutationFn: async () => {
      const input: RoutineInput = { personId, salaParticipationId: participationId, days: days.map((day, dayIndex) => ({ position: dayIndex + 1, name: day.name.trim() || `Día ${dayIndex + 1}`, exercises: day.exercises.map((exercise) => {
        const parsed = exerciseSchema.parse(exercise);
        return { exerciseDefinitionId: parsed.exerciseDefinitionId, series: parsed.series || null, repetitions: parsed.repetitions || null, duration: parsed.duration || null, load: parsed.load || null, rest: parsed.rest || null, notes: parsed.notes || null };
      }) })) };
      return active ? api.replace(active.id, input, options) : api.create(input, options);
    },
    onSuccess: async () => { setEditing(false); setDays([newDay()]); setFeedback('Rutina guardada correctamente.'); await refreshRoutines(); },
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
    setDays(active?.days.length ? active.days.map((day, index) => ({ key: crypto.randomUUID(), name: day.name ?? `Día ${index + 1}`, exercises: day.exercises.map((exercise) => ({ exerciseDefinitionId: exercise.exerciseDefinitionId, series: exercise.series ?? '', repetitions: exercise.repetitions ?? '', duration: exercise.duration ?? '', load: exercise.load ?? '', rest: exercise.rest ?? '', notes: exercise.notes ?? '' })) })) : [newDay()]);
    setEditing(true);
  };
  const retireNeedsConfirmation = (retire.error as (Error & { code?: string }) | null)?.code === 'SALA_EXERCISE_RETIRE_CONFIRMATION_REQUIRED';
  const actionErrors = [mutation.error, duplicate.error, exerciseMutation.error, retireNeedsConfirmation ? null : retire.error].filter(Boolean);
  const catalogBusy = exerciseMutation.isPending || retire.isPending;
  return <section aria-labelledby="routine-heading" className="mt-4 rounded-md border bg-surface-muted p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="routine-heading" className="font-semibold">Rutina</h3><p className="text-sm text-muted-foreground">Planificación de entrenamiento vigente e histórica.</p></div>{canManage && participationId ? <Button type="button" variant="secondary" onClick={startEditing} disabled={routines.isLoading || routines.isError || editing || duplicate.isPending}>{active ? 'Editar rutina' : 'Crear rutina'}</Button> : null}</div>
    {canManage ? <details className="mt-3 rounded-md border bg-white p-3"><summary className="cursor-pointer text-sm font-medium">Administrar ejercicios</summary><p className="mt-2 text-xs text-muted-foreground">Catálogo utilizado para armar rutinas.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3"><input className={fieldClass} aria-label="Nombre del ejercicio" placeholder="Nombre" maxLength={120} value={newExercise.name} onChange={(event) => setNewExercise((current) => ({ ...current, name: event.target.value }))}/><input className={fieldClass} aria-label="Músculo principal" placeholder="Músculo principal" maxLength={120} value={newExercise.primaryMuscle} onChange={(event) => setNewExercise((current) => ({ ...current, primaryMuscle: event.target.value }))}/><input className={fieldClass} aria-label="Descripción del ejercicio" placeholder="Descripción opcional" maxLength={500} value={newExercise.description} onChange={(event) => setNewExercise((current) => ({ ...current, description: event.target.value }))}/></div>
      <Button className="mt-2" type="button" disabled={!newExercise.name.trim() || !newExercise.primaryMuscle.trim() || catalogBusy} onClick={() => { setFeedback(null); exerciseMutation.mutate(); }}>{catalogId ? 'Guardar cambios del ejercicio' : 'Nuevo ejercicio'}</Button>{catalogId ? <Button type="button" variant="ghost" onClick={() => { setCatalogId(null); setNewExercise({ name: '', primaryMuscle: '', description: '' }); exerciseMutation.reset(); }}>Cancelar edición del catálogo</Button> : null}
      {definitions.isError ? <p role="alert">{errorMessage(definitions.error)}</p> : null}
      <ul className="mt-3 divide-y">{definitions.data?.filter((item) => item.isActive).map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span>{item.name} · {item.primaryMuscle}</span><span><Button type="button" variant="ghost" disabled={catalogBusy} onClick={() => { exerciseMutation.reset(); setFeedback(null); setCatalogId(item.id); setNewExercise({ name: item.name, primaryMuscle: item.primaryMuscle, description: item.description ?? '' }); }}>Editar</Button><Button type="button" variant="ghost" disabled={catalogBusy || Boolean(retirement)} onClick={() => { setFeedback(null); retire.mutate({ id: item.id, confirmActiveRoutineImpact: false }); }}>Retirar</Button></span></li>)}</ul>
      {retirement ? <div role="alertdialog" aria-label="Confirmar retiro" className="mt-3 rounded-md border p-3"><p className="text-sm">Este ejercicio se utiliza en {retirement.activeRoutines} Rutinas activas. Si lo retirás, se quitará de esas Rutinas. Las Rutinas históricas no se modificarán.</p><div className="mt-2 flex gap-2"><Button type="button" disabled={retire.isPending} onClick={() => retire.mutate({ id: retirement.id, confirmActiveRoutineImpact: true })}>Confirmar retiro</Button><Button type="button" variant="secondary" disabled={retire.isPending} onClick={() => { setRetirement(null); retire.reset(); }}>Cancelar retiro</Button></div></div> : null}
    </details> : null}
    {feedback ? <p role="status" className="mt-3 text-sm">{feedback}</p> : null}
    {actionErrors.map((error, index) => <p role="alert" key={index} className="mt-3 text-sm text-red-700">{errorMessage(error)}</p>)}
    {routines.isLoading ? <p role="status" className="mt-3 text-sm text-muted-foreground">Cargando rutina…</p> : null}
    {routines.isError ? <p role="alert" className="mt-3 text-sm text-red-700">{errorMessage(routines.error)}</p> : null}
    {!routines.isLoading && !routines.isError && !active ? <p className="mt-3 text-sm text-muted-foreground">No hay una rutina activa.</p> : null}
    {active ? <RoutineSummary routine={active} definitions={definitions.data ?? []} onDuplicate={canManage && participationId && !editing ? () => { setFeedback(null); duplicate.mutate(active.id); } : undefined} duplicating={duplicate.isPending}/> : null}
    {historical.length > 0 ? <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Rutinas históricas ({historical.length})</summary><div className="mt-2 grid gap-2">{historical.map((routine) => <RoutineSummary key={routine.id} routine={routine} definitions={definitions.data ?? []} onDuplicate={canManage && participationId && !editing ? () => { setFeedback(null); duplicate.mutate(routine.id); } : undefined} duplicating={duplicate.isPending}/>)}</div></details> : null}
    {canManage && editing ? <div className="mt-4 rounded-md border bg-white p-4"><h4 className="font-semibold">{active ? 'Editar rutina' : 'Nueva rutina'}</h4>{days.map((day, index) => <DayEditor key={day.key} day={day} index={index} definitions={definitions.data ?? []} disabled={mutation.isPending} canRemove={days.length > 1} onRemove={() => setDays((items) => items.filter((item) => item.key !== day.key))} onChange={(next) => setDays((items) => items.map((item) => item.key === day.key ? next : item))}/>)}<Button className="mt-3" type="button" variant="secondary" disabled={mutation.isPending} onClick={() => setDays((items) => [...items, newDay(`Día ${items.length + 1}`)])}>Agregar día</Button><div className="mt-4 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(false)} disabled={mutation.isPending}>Cancelar</Button><Button type="button" onClick={() => { setFeedback(null); mutation.mutate(); }} disabled={mutation.isPending}>{mutation.isPending ? 'Guardando…' : 'Guardar rutina'}</Button></div></div> : null}
  </section>;
}

function RoutineSummary({ routine, definitions, onDuplicate, duplicating }: { routine: Routine; definitions: ExerciseDefinition[]; onDuplicate?: (() => void) | undefined; duplicating: boolean }): React.JSX.Element {
  return <article className="mt-3 rounded-md border bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-medium">Rutina v{routine.version}</h4><span className={routine.status === 'ACTIVE' ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-800' : 'rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700'}>{routine.status === 'ACTIVE' ? 'Activa' : 'Histórica'}</span>{onDuplicate ? <Button type="button" variant="secondary" disabled={duplicating} onClick={onDuplicate}>Duplicar rutina</Button> : null}</div><div className="mt-2 grid gap-3">{routine.days.map((day) => <div key={day.id ?? day.position}><p className="text-sm font-medium">{day.name ?? `Día ${day.position}`}</p>{day.exercises.length === 0 ? <p className="text-xs text-muted-foreground">Sin ejercicios.</p> : <ul className="mt-1 grid gap-1 text-sm">{day.exercises.map((exercise, index) => <li key={exercise.id ?? index}>{describeExercise(exercise, definitions)}</li>)}</ul>}</div>)}</div></article>;
}
