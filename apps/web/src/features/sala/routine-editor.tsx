'use client';

import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@athleta/ui';
import type { ExerciseDefinitionDto, RoutineDayDto } from '@athleta/api-client';

export type RoutineExercise = {
  id?: string;
  position?: number;
  exerciseDefinitionId: string;
  exerciseDefinition?: { name: string; isActive?: boolean } | null;
  exerciseName?: string;
  series?: string | null | undefined;
  repetitions?: string | null | undefined;
  duration?: string | null | undefined;
  load?: string | null | undefined;
  rest?: string | null | undefined;
  notes?: string | null | undefined;
};
export type RoutineDay = { id?: string; position: number; name?: string | null | undefined; exercises: RoutineExercise[] };
export type ExerciseDefinition = { id: string; name: string; primaryMuscle: string; description?: string | null | undefined; isActive: boolean };
export type RoutineTemplate = { id: string; name: string; days: RoutineDay[] };

const exclusiveMessage = 'Elegí Repeticiones o Tiempo, no ambos.';
export const exerciseSchema = z.object({
  exerciseDefinitionId: z.string().min(1, 'Seleccioná un ejercicio'),
  series: z.string().trim().max(80).optional(),
  repetitions: z.string().trim().max(80).optional(),
  duration: z.string().trim().max(80).optional(),
  load: z.string().trim().max(80).optional(),
  rest: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
}).refine((entry) => !(entry.repetitions && entry.duration), { message: exclusiveMessage });
type ExerciseForm = z.infer<typeof exerciseSchema>;
export type EditingDay = { key: string; name: string; exercises: ExerciseForm[] };
export const fieldClass = 'h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring';

function emptyExercise(): ExerciseForm {
  return { exerciseDefinitionId: '', series: '', repetitions: '', duration: '', load: '', rest: '', notes: '' };
}
export function newDay(name = 'Día 1'): EditingDay { return { key: crypto.randomUUID(), name, exercises: [] }; }
function displayExercise(exercise: RoutineExercise, definitions: ExerciseDefinition[]): string {
  return exercise.exerciseDefinition?.name ?? exercise.exerciseName ?? definitions.find((item) => item.id === exercise.exerciseDefinitionId)?.name ?? 'Ejercicio';
}
function describeExercise(exercise: RoutineExercise, definitions: ExerciseDefinition[]): string {
  return [displayExercise(exercise, definitions), exercise.exerciseDefinition?.isActive === false && 'No disponible', exercise.series && `${exercise.series} series`, exercise.repetitions && `${exercise.repetitions} rep.`, exercise.duration && `Tiempo ${exercise.duration}`, exercise.load && `Carga ${exercise.load}`, exercise.rest && `Descanso ${exercise.rest}`, exercise.notes && `Observación ${exercise.notes}`].filter(Boolean).join(' · ');
}
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'No se pudo completar la operación.'; }

type ExerciseCatalogProps = {
  definitions: ExerciseDefinition[];
  catalogLoading: boolean;
  catalogError: boolean;
  onCreateExercise: (input: ExerciseDefinitionDto) => Promise<ExerciseDefinition>;
};
const definitionSchema = z.object({
  name: z.string().trim().min(1, 'El Nombre es obligatorio.').max(120),
  primaryMuscle: z.string().trim().min(1, 'El Músculo principal es obligatorio.').max(120),
  description: z.string().trim().max(500),
});

function RoutineExerciseForm({ definitions, catalogLoading, catalogError, onCreateExercise, initial, onSave, onCancel, disabled }: ExerciseCatalogProps & { initial?: ExerciseForm; onSave: (exercise: ExerciseForm) => void; onCancel: () => void; disabled: boolean }): React.JSX.Element {
  const { register, watch, handleSubmit, reset, setValue } = useForm<ExerciseForm>({ defaultValues: initial ?? emptyExercise() });
  const [error, setError] = useState<string | null>(null);
  const [creatingExercise, setCreatingExercise] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const definitionForm = useForm<z.infer<typeof definitionSchema>>({ defaultValues: { name: '', primaryMuscle: '', description: '' } });
  const createDefinition = useMutation({
    mutationFn: onCreateExercise,
    onSuccess: (created) => {
      setValue('exerciseDefinitionId', created.id, { shouldDirty: true });
      setError(null);
      setCreationError(null);
      // Explicit values avoid a native reset of the enclosing routine entry form.
      definitionForm.reset({ name: '', primaryMuscle: '', description: '' });
      setCreatingExercise(false);
    },
  });
  const submitDefinition = definitionForm.handleSubmit((form) => {
    if (disabled || createDefinition.isPending) return;
    const parsed = definitionSchema.safeParse(form);
    if (!parsed.success) { setCreationError(parsed.error.issues[0]?.message ?? 'Revisá los datos del ejercicio.'); return; }
    setCreationError(null);
    createDefinition.mutate(parsed.data);
  });
  const activeDefinitions = definitions.filter((item) => item.isActive);
  const catalogUnavailable = catalogLoading || catalogError;
  const repetitions = watch('repetitions')?.trim();
  const duration = watch('duration')?.trim();
  const invalidAlternatives = Boolean(repetitions && duration);
  const submit = handleSubmit((form) => {
    if (disabled || catalogUnavailable || createDefinition.isPending) return;
    const parsed = exerciseSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Revisá los datos del ejercicio.'); return; }
    onSave(parsed.data);
    reset(emptyExercise());
    setError(null);
  });
  return <form className="mt-3 grid gap-2 rounded-md border bg-white p-3" onSubmit={submit}>
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <div className="flex items-end gap-2"><label className="grow text-sm">Ejercicio<select aria-label="Ejercicio" className={fieldClass} {...register('exerciseDefinitionId')} value={watch('exerciseDefinitionId')} disabled={disabled || catalogUnavailable || createDefinition.isPending}><option value="">Seleccionar ejercicio</option>{activeDefinitions.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.primaryMuscle}</option>)}</select></label><Button type="button" variant="secondary" disabled={disabled || createDefinition.isPending} onClick={() => setCreatingExercise(true)}>Nuevo ejercicio</Button></div>
        {catalogLoading ? <p role="status" className="mt-2 text-sm text-muted-foreground">Cargando catálogo de ejercicios…</p> : catalogError ? <p role="alert" className="mt-2 text-sm text-red-700">No se pudo cargar el catálogo de ejercicios.</p> : activeDefinitions.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Todavía no hay ejercicios en el catálogo. Creá uno nuevo para continuar.</p> : null}
        {creatingExercise ? <fieldset aria-label="Nuevo ejercicio del catálogo" className="mt-3 grid gap-2 rounded-md border p-3" disabled={disabled || createDefinition.isPending} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void submitDefinition(); } }}>
          <label className="text-sm">Nombre<input aria-label="Nombre del ejercicio" className={fieldClass} {...definitionForm.register('name')} maxLength={120}/></label>
          <label className="text-sm">Músculo principal<input aria-label="Músculo principal" className={fieldClass} {...definitionForm.register('primaryMuscle')} maxLength={120}/></label>
          <label className="text-sm">Descripción opcional<input aria-label="Descripción del ejercicio" className={fieldClass} {...definitionForm.register('description')} maxLength={500}/></label>
          {creationError || createDefinition.error ? <p role="alert" className="text-sm text-red-700">{creationError ?? errorMessage(createDefinition.error)}</p> : null}
          <Button type="button" onClick={() => void submitDefinition()} disabled={disabled || createDefinition.isPending}>{createDefinition.isPending ? 'Creando…' : 'Crear y seleccionar'}</Button>
        </fieldset> : null}
      </div>
      <label className="text-sm">Series<input aria-label="Series" className={fieldClass} {...register('series')} disabled={disabled} maxLength={80}/></label>
      <label className="text-sm">Repeticiones<input aria-label="Repeticiones" className={fieldClass} {...register('repetitions')} disabled={disabled || Boolean(duration && !repetitions)} maxLength={80}/></label>
      <label className="text-sm">Tiempo<input aria-label="Tiempo" className={fieldClass} {...register('duration')} disabled={disabled || Boolean(repetitions && !duration)} maxLength={80}/></label>
      <label className="text-sm">Carga<input aria-label="Carga" className={fieldClass} {...register('load')} disabled={disabled} maxLength={80}/></label>
      <label className="text-sm">Descanso<input aria-label="Descanso" className={fieldClass} {...register('rest')} disabled={disabled} maxLength={80}/></label>
    </div>
    <label className="text-sm">Observación<textarea aria-label="Observación" className="min-h-16 w-full rounded-md border bg-white px-3 py-2 text-sm" {...register('notes')} disabled={disabled} maxLength={500}/></label>
    {invalidAlternatives || error ? <p role="alert" className="text-sm text-red-700">{invalidAlternatives ? exclusiveMessage : error}</p> : null}
    <div className="flex flex-wrap gap-2"><Button type="submit" variant="secondary" disabled={disabled || catalogUnavailable || createDefinition.isPending}>{initial ? 'Guardar ejercicio' : 'Agregar a la rutina'}</Button>{initial ? <Button type="button" variant="ghost" onClick={onCancel}>Cancelar edición</Button> : null}</div>
  </form>;
}

export function DayEditor({ day, index, definitions, catalogLoading, catalogError, onCreateExercise, onChange, onRemove, canRemove, disabled }: ExerciseCatalogProps & { day: EditingDay; index: number; onChange: (day: EditingDay) => void; onRemove: () => void; canRemove: boolean; disabled: boolean }): React.JSX.Element {
  const [editingEntry, setEditingEntry] = useState<number | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const finishEditing = () => { setEditingEntry(null); setFormVersion((value) => value + 1); };
  return <fieldset aria-label={`Día ${index + 1}`} className="mt-3 rounded-md border p-3" disabled={disabled}>
    <div className="flex items-end gap-2"><label className="grow text-sm">Nombre del día<input aria-label={`Nombre del día ${index + 1}`} className={fieldClass} maxLength={120} value={day.name} onChange={(event) => onChange({ ...day, name: event.target.value })}/></label><Button type="button" variant="ghost" disabled={!canRemove || disabled} onClick={onRemove}>Quitar día</Button></div>
    <ul className="mt-3 divide-y rounded-md border">{day.exercises.map((exercise, entryIndex) => <li key={entryIndex} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span>{describeExercise(exercise, definitions)}</span><span className="flex gap-1"><Button type="button" variant="ghost" onClick={() => { setEditingEntry(entryIndex); setFormVersion((value) => value + 1); }}>Editar</Button><Button type="button" variant="ghost" onClick={() => { onChange({ ...day, exercises: day.exercises.filter((_, itemIndex) => itemIndex !== entryIndex) }); finishEditing(); }}>Quitar</Button></span></li>)}</ul>
    <RoutineExerciseForm key={formVersion} definitions={definitions} catalogLoading={catalogLoading} catalogError={catalogError} onCreateExercise={onCreateExercise} {...(editingEntry !== null && day.exercises[editingEntry] ? { initial: day.exercises[editingEntry] } : {})} onCancel={finishEditing} disabled={disabled} onSave={(exercise) => { onChange({ ...day, exercises: editingEntry === null ? [...day.exercises, exercise] : day.exercises.map((item, itemIndex) => itemIndex === editingEntry ? exercise : item) }); finishEditing(); }}/>
  </fieldset>;
}

export function routineDaysToDraft(days: RoutineDay[]): EditingDay[] {
  return days.map((day, index) => ({ key: crypto.randomUUID(), name: day.name ?? `Día ${index + 1}`, exercises: day.exercises.map((exercise) => ({ exerciseDefinitionId: exercise.exerciseDefinitionId, series: exercise.series ?? '', repetitions: exercise.repetitions ?? '', duration: exercise.duration ?? '', load: exercise.load ?? '', rest: exercise.rest ?? '', notes: exercise.notes ?? '' })) }));
}
export function draftToRoutineDays(days: EditingDay[]): RoutineDayDto[] {
  return days.map((day, index) => ({ name: day.name.trim() || `Día ${index + 1}`, exercises: day.exercises.map((exercise) => {
    const parsed = exerciseSchema.parse(exercise);
    return { exerciseDefinitionId: parsed.exerciseDefinitionId, series: parsed.series || null, repetitions: parsed.repetitions || null, duration: parsed.duration || null, load: parsed.load || null, rest: parsed.rest || null, notes: parsed.notes || null };
  }) }));
}
/** Copy only content; omit all source aggregate and child IDs. Preserve optional day names. */
export function copyRoutineDays(days: RoutineDay[]): RoutineDayDto[] {
  return days.map((day) => ({ name: day.name ?? null, exercises: day.exercises.map((exercise) => ({ exerciseDefinitionId: exercise.exerciseDefinitionId, series: exercise.series ?? null, repetitions: exercise.repetitions ?? null, duration: exercise.duration ?? null, load: exercise.load ?? null, rest: exercise.rest ?? null, notes: exercise.notes ?? null })) }));
}
export function RoutineContentSummary({ days, definitions = [] }: { days: RoutineDay[]; definitions?: ExerciseDefinition[] }): React.JSX.Element {
  return <div className="mt-2 grid gap-3">{days.map((day) => <div key={day.id ?? day.position}><p className="text-sm font-medium">{day.name ?? `Día ${day.position}`}</p>{day.exercises.length === 0 ? <p className="text-xs text-muted-foreground">Sin ejercicios.</p> : <ul className="mt-1 grid gap-1 text-sm">{day.exercises.map((exercise, index) => <li key={exercise.id ?? index}>{describeExercise(exercise, definitions)}</li>)}</ul>}</div>)}</div>;
}
