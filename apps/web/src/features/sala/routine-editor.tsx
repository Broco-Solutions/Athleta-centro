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
export type ExerciseDefinition = { id: string; name: string; primaryMuscle?: string | null; description?: string | null | undefined; isActive: boolean };
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
function exerciseUnavailable(exercise: RoutineExercise, definitions: ExerciseDefinition[]): boolean {
  return exercise.exerciseDefinition?.isActive === false || definitions.find((item) => item.id === exercise.exerciseDefinitionId)?.isActive === false;
}
function describeExercise(exercise: RoutineExercise, definitions: ExerciseDefinition[]): string {
  return [displayExercise(exercise, definitions), exerciseUnavailable(exercise, definitions) && 'No disponible', exercise.series && `${exercise.series} series`, exercise.repetitions && `${exercise.repetitions} rep.`, exercise.duration && `Tiempo ${exercise.duration}`, exercise.load && `Carga ${exercise.load}`, exercise.rest && `Descanso ${exercise.rest}`, exercise.notes && `Observación ${exercise.notes}`].filter(Boolean).join(' · ');
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
  primaryMuscle: z.string().trim().max(120),
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
  const [exerciseSearch, setExerciseSearch] = useState('');
  const searchTerm = exerciseSearch.trim().toLocaleLowerCase('es');
  const selectedDefinitionId = watch('exerciseDefinitionId');
  const filteredDefinitions = activeDefinitions.filter((item) => item.id === selectedDefinitionId || `${item.name} ${item.primaryMuscle ?? ''}`.toLocaleLowerCase('es').includes(searchTerm));
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
        <div className="flex flex-wrap items-end gap-2"><label className="min-w-48 grow text-sm">Buscar ejercicio<input aria-label="Buscar ejercicio" className={fieldClass} type="search" value={exerciseSearch} onChange={(event) => setExerciseSearch(event.target.value)} placeholder="Nombre o músculo" disabled={disabled || catalogUnavailable || createDefinition.isPending}/></label><label className="min-w-48 grow text-sm">Ejercicio<select aria-label="Ejercicio" className={fieldClass} {...register('exerciseDefinitionId')} value={watch('exerciseDefinitionId')} disabled={disabled || catalogUnavailable || createDefinition.isPending}><option value="">Seleccionar ejercicio</option>{initial && definitions.find((item) => item.id === initial.exerciseDefinitionId)?.isActive === false ? <option value={initial.exerciseDefinitionId} disabled>{displayExercise(initial, definitions)} · No disponible</option> : null}{filteredDefinitions.map((item) => <option key={item.id} value={item.id}>{[item.name, item.primaryMuscle].filter(Boolean).join(' · ')}</option>)}</select></label><Button type="button" variant="secondary" disabled={disabled || createDefinition.isPending} onClick={() => setCreatingExercise(true)}>Nuevo ejercicio</Button></div>
        {searchTerm && !filteredDefinitions.length ? <p className="mt-2 text-sm text-muted-foreground">No hay ejercicios que coincidan.</p> : null}
        {catalogLoading ? <p role="status" className="mt-2 text-sm text-muted-foreground">Cargando catálogo de ejercicios…</p> : catalogError ? <p role="alert" className="mt-2 text-sm text-red-700">No se pudo cargar el catálogo de ejercicios.</p> : activeDefinitions.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Todavía no hay ejercicios en el catálogo. Creá uno nuevo para continuar.</p> : null}
        {creatingExercise ? <fieldset aria-label="Nuevo ejercicio del catálogo" className="mt-3 grid gap-2 rounded-md border p-3" disabled={disabled || createDefinition.isPending} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void submitDefinition(); } }}>
          <label className="text-sm">Nombre<input aria-label="Nombre del ejercicio" className={fieldClass} {...definitionForm.register('name')} maxLength={120}/></label>
          <label className="text-sm">Músculo principal (opcional)<input aria-label="Músculo principal (opcional)" className={fieldClass} {...definitionForm.register('primaryMuscle')} maxLength={120}/></label>
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
  return <fieldset id={`routine-day-${day.key}`} aria-label={`Día ${index + 1}`} className="scroll-mt-4 rounded-lg border bg-white p-4" disabled={disabled}>
    <div className="flex flex-wrap items-end justify-between gap-3"><label className="min-w-52 grow text-sm font-medium">Nombre del día<input aria-label={`Nombre del día ${index + 1}`} className={`${fieldClass} mt-1`} maxLength={120} value={day.name} onChange={(event) => onChange({ ...day, name: event.target.value })}/></label><div className="flex items-center gap-3"><span className="text-sm text-muted-foreground">{day.exercises.length} {day.exercises.length === 1 ? 'ejercicio' : 'ejercicios'}</span><Button type="button" variant="ghost" disabled={!canRemove || disabled} onClick={onRemove}>Eliminar día</Button></div></div>
    <div className="mt-4 overflow-hidden rounded-md border">
      <div className="hidden grid-cols-[minmax(12rem,2fr)_repeat(5,minmax(4rem,1fr))_auto] gap-2 bg-surface-muted px-3 py-2 text-xs font-medium text-muted-foreground md:grid"><span>Ejercicio</span><span>Series</span><span>Repeticiones / tiempo</span><span>Carga</span><span>Descanso</span><span>Observación</span><span>Acciones</span></div>
      <ul className="divide-y">{day.exercises.map((exercise, entryIndex) => <li key={entryIndex} className="grid gap-3 p-3 text-sm md:grid-cols-[minmax(12rem,2fr)_repeat(5,minmax(4rem,1fr))_auto] md:items-center md:gap-2"><span className="min-w-0 font-medium" title={describeExercise(exercise, definitions)}>{displayExercise(exercise, definitions)}{exerciseUnavailable(exercise, definitions) ? <span className="ml-1 text-xs font-normal text-muted-foreground">· No disponible</span> : null}</span><span className="hidden md:block">{exercise.series || '—'}</span><span className="hidden md:block">{exercise.repetitions || exercise.duration || '—'}</span><span className="hidden md:block">{exercise.load || '—'}</span><span className="hidden md:block">{exercise.rest || '—'}</span><span className="hidden truncate md:block" title={exercise.notes ?? ''}>{exercise.notes || '—'}</span><div className="flex shrink-0 gap-1"><Button type="button" variant="secondary" onClick={() => { setEditingEntry(entryIndex); setFormVersion((value) => value + 1); }}>Editar</Button><Button type="button" variant="ghost" aria-label={`Quitar ${displayExercise(exercise, definitions)}`} onClick={() => { onChange({ ...day, exercises: day.exercises.filter((_, itemIndex) => itemIndex !== entryIndex) }); finishEditing(); }}>Quitar</Button></div><p className="text-xs text-muted-foreground md:hidden">{[exercise.series && `${exercise.series} series`, exercise.repetitions && `${exercise.repetitions} rep.`, exercise.duration && `Tiempo ${exercise.duration}`, exercise.load && `Carga ${exercise.load}`, exercise.rest && `Descanso ${exercise.rest}`].filter(Boolean).join(' · ') || 'Sin parámetros adicionales'}{exercise.notes ? ` · Observación: ${exercise.notes}` : ''}</p></li>)}</ul>
    </div>
    <div className="mt-4 border-t pt-4"><h4 className="font-semibold">{editingEntry === null ? 'Agregar ejercicio al día' : 'Editar ejercicio'}</h4><p className="mt-1 text-sm text-muted-foreground">Elegí un ejercicio y completá los datos de entrenamiento.</p>
    <RoutineExerciseForm key={formVersion} definitions={definitions} catalogLoading={catalogLoading} catalogError={catalogError} onCreateExercise={onCreateExercise} {...(editingEntry !== null && day.exercises[editingEntry] ? { initial: day.exercises[editingEntry] } : {})} onCancel={finishEditing} disabled={disabled} onSave={(exercise) => { onChange({ ...day, exercises: editingEntry === null ? [...day.exercises, exercise] : day.exercises.map((item, itemIndex) => itemIndex === editingEntry ? exercise : item) }); finishEditing(); }}/></div>
  </fieldset>;
}

export function RoutineDaysEditor({ days, definitions, catalogLoading, catalogError, onCreateExercise, onChange, disabled }: ExerciseCatalogProps & { days: EditingDay[]; onChange: (days: EditingDay[]) => void; disabled: boolean }): React.JSX.Element {
  const [activeKey, setActiveKey] = useState(days[0]?.key ?? '');
  const activeIndex = Math.max(0, days.findIndex((day) => day.key === activeKey));
  const activeDay = days[activeIndex];
  const exerciseCount = days.reduce((count, day) => count + day.exercises.length, 0);
  const changeDay = (updated: EditingDay) => onChange(days.map((day) => day.key === updated.key ? updated : day));
  const removeDay = (key: string) => { const next = days.filter((day) => day.key !== key); onChange(next); if (activeKey === key) setActiveKey(next[0]?.key ?? ''); };
  const addDay = () => { const next = newDay(`Día ${days.length + 1}`); onChange([...days, next]); setActiveKey(next.key); };
  return <section className="mt-4 space-y-4" aria-label="Contenido de la rutina">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-muted px-4 py-3"><div><p className="text-sm font-semibold">Contenido de la rutina</p><p className="text-sm text-muted-foreground">{days.length} {days.length === 1 ? 'día' : 'días'} · {exerciseCount} {exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}</p></div><Button type="button" variant="secondary" disabled={disabled} onClick={addDay}>Agregar día</Button></div>
    <nav aria-label="Días de la rutina" className="flex gap-2 overflow-x-auto pb-1">{days.map((day, index) => <button key={day.key} type="button" aria-label={`Día ${index + 1}: ${day.name || `Día ${index + 1}`}`} aria-pressed={activeDay?.key === day.key} onClick={() => { setActiveKey(day.key); document.getElementById(`routine-day-${day.key}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }} className={`min-h-11 shrink-0 rounded-md border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeDay?.key === day.key ? 'border-primary bg-primary/10 text-foreground' : 'bg-white text-muted-foreground hover:bg-surface-muted'}`}>{day.name || `Día ${index + 1}`} <span className="ml-1 text-xs">({day.exercises.length})</span></button>)}</nav>
    <div className="space-y-3">{days.map((day, index) => <DayEditor key={day.key} day={day} index={index} definitions={definitions} catalogLoading={catalogLoading} catalogError={catalogError} onCreateExercise={onCreateExercise} disabled={disabled} canRemove={days.length > 1} onRemove={() => removeDay(day.key)} onChange={changeDay}/>)}</div>
  </section>;
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
  return <div className="mt-4 grid gap-3 sm:grid-cols-2">{days.map((day) => <section key={day.id ?? day.position} className="min-w-0 rounded-md border bg-white"><header className="flex items-center justify-between gap-2 border-b bg-surface-muted px-3 py-2"><h5 className="truncate text-sm font-semibold">{day.name ?? `Día ${day.position}`}</h5><span className="shrink-0 text-xs text-muted-foreground">{day.exercises.length} {day.exercises.length === 1 ? 'ejercicio' : 'ejercicios'}</span></header>{day.exercises.length === 0 ? <p className="px-3 py-3 text-sm text-muted-foreground">Sin ejercicios.</p> : <ul className="divide-y">{day.exercises.map((exercise, index) => <li key={exercise.id ?? index} className="px-3 py-2 text-sm"><p className="font-medium">{displayExercise(exercise, definitions)}{exerciseUnavailable(exercise, definitions) ? <span className="ml-1 text-xs font-normal text-muted-foreground">· No disponible</span> : null}</p><p className="mt-1 text-xs text-muted-foreground">{[exercise.series && `${exercise.series} series`, exercise.repetitions && `${exercise.repetitions} rep.`, exercise.duration && `Tiempo ${exercise.duration}`, exercise.load && `Carga ${exercise.load}`, exercise.rest && `Descanso ${exercise.rest}`].filter(Boolean).join(' · ') || 'Sin parámetros adicionales'}</p>{exercise.notes ? <p className="mt-1 text-xs text-muted-foreground">Observación: {exercise.notes}</p> : null}</li>)}</ul>}</section>)}</div>;
}
