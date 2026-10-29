'use client';

import React, { useRef, useState } from 'react';
import { z } from 'zod';
import { filterExerciseDefinitions } from './exercise-catalog';
import { Button } from '@athleta/ui';
import type { RoutineDayDto } from '@athleta/api-client';

export type RoutineExercise = {
  id?: string;
  position?: number;
  exerciseDefinitionId: string;
  exerciseDefinition?: { name: string; description?: string | null; isActive?: boolean } | null;
  exerciseName?: string;
  series?: string | null | undefined;
  repetitions?: string | null | undefined;
  duration?: string | null | undefined;
  load?: string | null | undefined;
  rest?: string | null | undefined;
  notes?: string | null | undefined;
};
export type RoutineDay = { id?: string; position: number; name?: string | null | undefined; exercises: RoutineExercise[] };
export type ExerciseDefinition = { id: string; name: string; movementPatternId?: string | null; primaryMuscle?: string | null; description?: string | null | undefined; isActive: boolean };
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
// UI-only choice for an empty value; exerciseSchema strips it before serialization.
type ExerciseForm = z.infer<typeof exerciseSchema> & { valueMode?: 'repetitions' | 'duration' };
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
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'No se pudo completar la operación.'; }

type ExerciseCatalogProps = {
  definitions: ExerciseDefinition[];
  catalogLoading: boolean;
  catalogError: boolean;
};

function ExerciseRow({ exercise, definitions, onChange, onRemove, disabled }: {
  exercise: ExerciseForm; definitions: ExerciseDefinition[]; onChange: (exercise: ExerciseForm) => void; onRemove: () => void; disabled: boolean;
}): React.JSX.Element {
  const invalid = Boolean(exercise.repetitions?.trim() && exercise.duration?.trim());
  const mode = invalid ? '' : exercise.duration ? 'duration' : exercise.repetitions ? 'repetitions' : exercise.valueMode ?? 'repetitions';
  const selected = definitions.find((item) => item.id === exercise.exerciseDefinitionId);
  return <li className="space-y-2 p-3">
    <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,.7fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
      <div className="min-w-0 text-sm">Ejercicio<p className="font-medium">{selected?.name ?? 'Ejercicio retirado'}{!selected?.isActive ? ' · No disponible' : ''}</p></div>
      <label className="min-w-0 text-sm">Series<input className={fieldClass} value={exercise.series ?? ''} maxLength={80} disabled={disabled} onChange={(event) => onChange({ ...exercise, series: event.target.value })}/></label>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2"><p className="hidden text-sm md:col-span-2 md:block">Repeticiones o tiempo</p><label className="min-w-0 text-sm"><span className="md:sr-only">Tipo</span><select className={fieldClass} value={mode} disabled={disabled} onChange={(event) => {
        const next = event.target.value === 'duration' ? 'duration' : 'repetitions';
        onChange({ ...exercise, valueMode: next, repetitions: next === 'repetitions' ? exercise.repetitions ?? '' : '', duration: next === 'duration' ? exercise.duration ?? '' : '' });
      }}>{invalid ? <option value="" disabled>Elegí una opción</option> : null}<option value="repetitions">Repeticiones</option><option value="duration">Tiempo</option></select></label>
      <label className="min-w-0 text-sm"><span className="md:sr-only">Valor</span><input className={fieldClass} value={mode === 'duration' ? exercise.duration ?? '' : exercise.repetitions ?? ''} maxLength={80} disabled={disabled || invalid} onChange={(event) => onChange({ ...exercise, repetitions: mode === 'repetitions' ? event.target.value : '', duration: mode === 'duration' ? event.target.value : '' })}/></label></div>
      <label className="min-w-0 text-sm">Carga<input className={fieldClass} value={exercise.load ?? ''} maxLength={80} disabled={disabled} onChange={(event) => onChange({ ...exercise, load: event.target.value })}/></label>
      <label className="min-w-0 text-sm">Descanso<input className={fieldClass} value={exercise.rest ?? ''} maxLength={80} disabled={disabled} onChange={(event) => onChange({ ...exercise, rest: event.target.value })}/></label>
      <Button type="button" variant="ghost" className="text-red-700" aria-label={`Quitar ${selected?.name ?? 'Ejercicio retirado'}`} disabled={disabled} onClick={onRemove}>Quitar</Button>
    </div>
    {invalid ? <p role="alert" className="text-sm text-red-700">{exclusiveMessage} Repeticiones: {exercise.repetitions}. Tiempo: {exercise.duration}.</p> : null}
    <details open={exercise.notes ? true : undefined}><summary className="cursor-pointer text-sm text-muted-foreground">{exercise.notes ? 'Observación' : '+ Agregar observación'}</summary><label className="mt-2 block text-sm">Observación<textarea className="mt-1 min-h-16 w-full rounded-md border bg-white px-3 py-2 text-sm" value={exercise.notes ?? ''} maxLength={500} disabled={disabled} onChange={(event) => onChange({ ...exercise, notes: event.target.value })}/></label></details>
  </li>;
}

export function DayEditor({ day, index, definitions, onChange, onRemove, canRemove, disabled }: {
  day: EditingDay; index: number; definitions: ExerciseDefinition[]; onChange: (day: EditingDay) => void; onRemove: () => void; canRemove: boolean; disabled: boolean;
}): React.JSX.Element {
  return <fieldset aria-label={`Día ${index + 1}`} className="min-w-0 rounded-lg border bg-white p-4" disabled={disabled}>
    <div className="flex flex-wrap items-end justify-between gap-3"><label className="min-w-0 grow text-sm font-medium">Nombre del día<input aria-label={`Nombre del día ${index + 1}`} className={`${fieldClass} mt-1`} placeholder={`Día ${index + 1} (opcional)`} maxLength={120} value={day.name} onChange={(event) => onChange({ ...day, name: event.target.value })}/></label><span className="text-sm text-muted-foreground">{day.exercises.length} {day.exercises.length === 1 ? 'ejercicio' : 'ejercicios'}</span><Button type="button" variant="ghost" disabled={!canRemove || disabled} onClick={onRemove}>Eliminar día</Button></div>
    {day.exercises.length ? <ul className="mt-4 divide-y rounded-md border">{day.exercises.map((exercise, entryIndex) => <ExerciseRow key={entryIndex} exercise={exercise} definitions={definitions} disabled={disabled} onChange={(updated) => onChange({ ...day, exercises: day.exercises.map((item, i) => i === entryIndex ? updated : item) })} onRemove={() => onChange({ ...day, exercises: day.exercises.filter((_, i) => i !== entryIndex) })}/>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">Sin ejercicios. Agregalos desde el catálogo.</p>}
  </fieldset>;
}

function ExerciseCatalog({ definitions, catalogLoading, catalogError, disabled, onAdd }: ExerciseCatalogProps & { disabled: boolean; dayName: string; onAdd: (definition: ExerciseDefinition) => void }): React.JSX.Element {
  const [search, setSearch] = useState('');
  const results = search.trim() ? filterExerciseDefinitions(definitions, search) : [];
  return <section aria-label="Agregar ejercicios" className="rounded-lg border bg-white p-4">
    <label className="block text-sm">Buscar ejercicio<input type="search" className={fieldClass} value={search} disabled={disabled} placeholder="Buscar por nombre, músculo o descripción" onChange={event => setSearch(event.target.value)}/></label>
    {catalogLoading ? <p role="status">Cargando catálogo de ejercicios…</p> : catalogError ? <p role="alert">No se pudo cargar el catálogo de ejercicios.</p> : !search.trim() ? <p>Escribí para buscar un ejercicio</p> : !results.length ? <p>No hay ejercicios que coincidan.</p> : <ul>{results.slice(0, 10).map(item => <li key={item.id} className="flex items-center justify-between gap-2 border-b py-2 text-sm"><span>{item.name}{item.primaryMuscle ? ' · ' + item.primaryMuscle : ''}</span><Button type="button" variant="ghost" disabled={disabled} aria-label={'Agregar ' + item.name} onClick={() => onAdd(item)}>+ Agregar</Button></li>)}</ul>}
    {results.length > 10 ? <p className="text-sm">Hay más coincidencias. Afiná la búsqueda.</p> : null}
  </section>;
}

export function RoutineDaysEditor({ days, definitions, catalogLoading, catalogError, onChange, disabled }: ExerciseCatalogProps & { days: EditingDay[]; onChange: (days: EditingDay[]) => void; disabled: boolean }): React.JSX.Element {
  const [activeKey, setActiveKey] = useState(days[0]?.key ?? '');
  // Attach asynchronous creation to its originating day, preserving the latest draft.
  const latest = useRef({ days, onChange });
  latest.current = { days, onChange };
  const editorDefinitions = definitions;
  const activeIndex = Math.max(0, days.findIndex((day) => day.key === activeKey));
  const activeDay = days[activeIndex];
  const changeDay = (updated: EditingDay) => onChange(days.map((day) => day.key === updated.key ? updated : day));
  const addExercise = (key: string, definition: ExerciseDefinition) => {
    const current = latest.current;
    current.onChange(current.days.map((day) => day.key === key ? { ...day, exercises: [...day.exercises, { ...emptyExercise(), exerciseDefinitionId: definition.id }] } : day));
  };
  const removeDay = () => {
    if (!activeDay || days.length <= 1) return;
    const next = days.filter((day) => day.key !== activeDay.key);
    onChange(next); setActiveKey(next[Math.max(0, activeIndex - 1)]?.key ?? '');
  };
  const addDay = () => { const next = newDay(`Día ${days.length + 1}`); onChange([...days, next]); setActiveKey(next.key); };
  return <section className="mt-4 min-w-0 space-y-4" aria-label="Contenido de la rutina">
    <nav aria-label="Días de la rutina" className="flex items-center gap-2 overflow-x-auto pb-1">{days.map((day, index) => <button key={day.key} type="button" disabled={disabled} aria-label={`Día ${index + 1}: ${day.name || `Día ${index + 1}`}`} aria-pressed={activeDay?.key === day.key} onClick={() => setActiveKey(day.key)} className={`min-h-11 shrink-0 border-b-2 px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeDay?.key === day.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:bg-surface-muted'}`}>{day.name || `Día ${index + 1}`} <span className="ml-1 text-xs">{day.exercises.length}</span></button>)}<Button type="button" variant="ghost" className="shrink-0" disabled={disabled} onClick={addDay}>+ Agregar día</Button></nav>
    {activeDay ? <>
      <DayEditor key={activeDay.key} day={activeDay} index={activeIndex} definitions={editorDefinitions} disabled={disabled} canRemove={days.length > 1} onRemove={removeDay} onChange={changeDay}/>
      <ExerciseCatalog definitions={editorDefinitions} catalogLoading={catalogLoading} catalogError={catalogError} disabled={disabled} dayName={activeDay.name.trim() || `Día ${activeIndex + 1}`} onAdd={(definition) => addExercise(activeDay.key, definition)}/>
    </> : null}
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
export function RoutineContentSummary({ days, definitions = [], dayAction }: { days: RoutineDay[]; definitions?: ExerciseDefinition[]; dayAction?: (day: RoutineDay) => React.ReactNode }): React.JSX.Element {
  return <div className="mt-4 grid gap-3 sm:grid-cols-2">{days.map((day) => <section key={day.id ?? day.position} className="min-w-0 rounded-md border border-border bg-white">
    <header className="flex items-center justify-between gap-2 border-b border-border bg-surface-muted px-3 py-2"><h5 className="truncate rounded-sm bg-primary px-2.5 py-1 text-sm font-semibold text-primary-foreground">{day.name ?? `Día ${day.position}`}</h5><span className="shrink-0 text-xs text-muted-foreground">{day.exercises.length} {day.exercises.length === 1 ? 'ejercicio' : 'ejercicios'}</span></header>
    {day.exercises.length === 0 ? <p className="px-3 py-3 text-sm text-muted-foreground">Sin ejercicios.</p> : <ul className="divide-y divide-border">{day.exercises.map((exercise, index) => {
      const parameters = [exercise.series && `${exercise.series} series`, exercise.repetitions && `${exercise.repetitions} rep.`, exercise.duration && `Tiempo ${exercise.duration}`, exercise.load && `Carga ${exercise.load}`, exercise.rest && `Descanso ${exercise.rest}`].filter(Boolean).join(' · ');
      return <li key={exercise.id ?? index} className="px-3 py-2 text-sm">
        <p className="font-medium">{displayExercise(exercise, definitions)}{exerciseUnavailable(exercise, definitions) ? <span className="ml-1 text-xs font-normal text-muted-foreground">· No disponible</span> : null}</p>
        {parameters ? <p className="mt-1 text-xs text-muted-foreground">{parameters}</p> : null}
        {exercise.exerciseDefinition?.description ? <p className="mt-1 text-xs text-muted-foreground">{exercise.exerciseDefinition.description}</p> : null}
        {exercise.notes ? <p className="mt-1 text-xs text-muted-foreground">Observación: {exercise.notes}</p> : null}
      </li>;
    })}</ul>}
    {dayAction ? <div className="px-3 py-3">{dayAction(day)}</div> : null}
  </section>)}</div>;
}
