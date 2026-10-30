'use client';

import React, { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { blockLabel, groupRoutineBlocks, isGroupedDay, formatRoutineRepetitions, formatRoutineDuration, formatRoutineLoad } from './routine-blocks';
import { filterExerciseDefinitions } from './exercise-catalog';
import { Button } from '@athleta/ui';
import type { RoutineDayDto } from '@athleta/api-client';

export type RoutineExercise = {
  blockPosition?: number | null;
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
export type MovementPattern = { id: string; name: string };
export type RoutineTemplate = { id: string; name: string; days: RoutineDay[] };

const exclusiveMessage = 'Elegí Repeticiones o Tiempo, no ambos.';
const EXERCISE_CATALOG_PAGE_SIZE = 8;
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
type EditingBlock = { key: string; series: string; exercises: ExerciseForm[] };
export type EditingDay = { key: string; name: string; exercises: ExerciseForm[]; blocks: EditingBlock[] | null };
function newBlock(): EditingBlock { return { key: crypto.randomUUID(), series: '4', exercises: [] }; }
export const fieldClass = 'h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring';

function emptyExercise(): ExerciseForm {
  return { exerciseDefinitionId: '', series: '', repetitions: '', duration: '', load: '', rest: '', notes: '' };
}
export function newDay(name = 'Día 1'): EditingDay { return { key: crypto.randomUUID(), name, exercises: [], blocks: [newBlock()] }; }
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
  patterns: MovementPattern[];
  patternsLoading: boolean;
  patternsError: boolean;
};

function ExerciseRow({ exercise, definitions, onChange, onRemove, disabled, showSeries = true, showRest = true, code }: {
  showRest?: boolean; showSeries?: boolean; code?: string; exercise: ExerciseForm; definitions: ExerciseDefinition[]; onChange: (exercise: ExerciseForm) => void; onRemove: () => void; disabled: boolean;
}): React.JSX.Element {
  const invalid = Boolean(exercise.repetitions?.trim() && exercise.duration?.trim());
  const mode = invalid ? '' : exercise.duration ? 'duration' : exercise.repetitions ? 'repetitions' : exercise.valueMode ?? 'repetitions';
  const selected = definitions.find((item) => item.id === exercise.exerciseDefinitionId);
  return <li className="space-y-2 p-3">
    <div className={`grid min-w-0 gap-3 md:items-end ${showSeries ? 'md:grid-cols-[minmax(0,2fr)_minmax(0,.7fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]' : 'lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_auto]'}`}>
      <div className="min-w-0 text-sm">Ejercicio<p className="font-medium">{code ? `${code} — ` : ''}{selected?.name ?? 'Ejercicio retirado'}{!selected?.isActive ? ' · No disponible' : ''}</p></div>
      {showSeries ? <label className="min-w-0 text-sm">Series<input className={fieldClass} value={exercise.series ?? ''} maxLength={80} disabled={disabled} onChange={(event) => onChange({ ...exercise, series: event.target.value })}/></label> : null}
      <div className="grid min-w-0 gap-2 sm:grid-cols-2"><p className="hidden text-sm md:col-span-2 md:block">Repeticiones o tiempo</p><label className="min-w-0 text-sm"><span className="md:sr-only">Tipo</span><select className={fieldClass} value={mode} disabled={disabled} onChange={(event) => {
        const next = event.target.value === 'duration' ? 'duration' : 'repetitions';
        onChange({ ...exercise, valueMode: next, repetitions: next === 'repetitions' ? exercise.repetitions ?? '' : '', duration: next === 'duration' ? exercise.duration ?? '' : '' });
      }}>{invalid ? <option value="" disabled>Elegí una opción</option> : null}<option value="repetitions">Repeticiones</option><option value="duration">Tiempo</option></select></label>
      <label className="min-w-0 text-sm"><span className="md:sr-only">Valor</span><span className="flex items-center gap-2"><input aria-label="Valor" inputMode={!showSeries && mode === 'duration' ? 'numeric' : undefined} className={`${fieldClass} min-w-0`} value={mode === 'duration' ? exercise.duration ?? '' : exercise.repetitions ?? ''} maxLength={80} disabled={disabled || invalid} onChange={(event) => {
        if (!showSeries && mode === 'duration' && !/^\d*$/.test(event.target.value)) return;
        onChange({ ...exercise, repetitions: mode === 'repetitions' ? event.target.value : '', duration: mode === 'duration' ? event.target.value : '' });
      }}/>{!showSeries ? <span>{mode === 'duration' ? 'seg.' : 'rep.'}</span> : null}</span></label></div>
      <label className="min-w-0 text-sm">Carga<span className="flex items-center gap-2"><input aria-label="Carga" inputMode={!showSeries ? 'decimal' : undefined} className={`${fieldClass} min-w-0`} value={exercise.load ?? ''} maxLength={80} disabled={disabled} onChange={(event) => {
        if (!showSeries && !/^\d*(?:[.,]\d*)?$/.test(event.target.value)) return;
        onChange({ ...exercise, load: event.target.value });
      }}/>{!showSeries ? <span>kg</span> : null}</span></label>
      {showRest ? <label className="min-w-0 text-sm">Descanso<input className={fieldClass} value={exercise.rest ?? ''} maxLength={80} disabled={disabled} onChange={(event) => onChange({ ...exercise, rest: event.target.value })}/></label> : null}
      <Button type="button" variant="ghost" className="text-red-700" aria-label={`Quitar ${selected?.name ?? 'Ejercicio retirado'}`} disabled={disabled} onClick={onRemove}>Quitar</Button>
    </div>
    {invalid ? <p role="alert" className="text-sm text-red-700">{exclusiveMessage} Repeticiones: {exercise.repetitions}. Tiempo: {exercise.duration}.</p> : null}
    <details open={exercise.notes ? true : undefined}><summary className="cursor-pointer text-sm text-muted-foreground">{exercise.notes ? 'Observación' : '+ Agregar observación'}</summary><label className="mt-2 block text-sm">Observación<textarea className="mt-1 min-h-16 w-full rounded-md border bg-white px-3 py-2 text-sm" value={exercise.notes ?? ''} maxLength={500} disabled={disabled} onChange={(event) => onChange({ ...exercise, notes: event.target.value })}/></label></details>
  </li>;
}

export function DayEditor({ day, index, definitions, onChange, onRemove, canRemove, disabled, onToggleCatalog, openBlockKey, catalog }: {
  onToggleCatalog: (blockKey: string) => void; openBlockKey?: string | null; catalog?: React.ReactNode; day: EditingDay; index: number; definitions: ExerciseDefinition[]; onChange: (day: EditingDay) => void; onRemove: () => void; canRemove: boolean; disabled: boolean;
}): React.JSX.Element {
  return <fieldset aria-label={`Día ${index + 1}`} className="min-w-0 rounded-lg border bg-surface-muted p-4" disabled={disabled}>
    <div className="flex flex-wrap items-end justify-between gap-3"><label className="min-w-0 grow text-sm font-medium">Nombre del día<input aria-label={`Nombre del día ${index + 1}`} className={`${fieldClass} mt-1`} placeholder={`Día ${index + 1} (opcional)`} maxLength={120} value={day.name} onChange={(event) => onChange({ ...day, name: event.target.value })}/></label><Button type="button" variant="ghost" disabled={!canRemove || disabled} onClick={onRemove}>Eliminar día</Button></div>
    {day.blocks !== null ? <div className="mt-4 space-y-4">{day.blocks.map((block, blockIndex) => {
      const label = blockLabel(blockIndex + 1);
      const series = /^[0-9]+$/.test(block.series.trim()) ? BigInt(block.series.trim()) : 0n;
      const validSeries = series > 0n;
      const changeSeries = (step: bigint) => {
        const value = validSeries ? series + step : 1n;
        onChange({ ...day, blocks: day.blocks!.map(item => item.key === block.key ? { ...item, series: String(value < 1n ? 1n : value) } : item) });
      };
      return <section key={block.key} aria-label={`Bloque ${blockLabel(blockIndex + 1)}`} className="rounded-md border bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Bloque {blockLabel(blockIndex + 1)}</h3><Button type="button" variant="ghost" disabled={disabled || day.blocks!.length === 1} onClick={() => onChange({ ...day, blocks: day.blocks!.filter(item => item.key !== block.key) })}>Eliminar bloque</Button></div>
      <p className="text-xs text-muted-foreground">Al quitar el bloque también se quitan sus ejercicios del borrador.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <span>Series del bloque:</span>
        <Button type="button" variant="secondary" aria-label={`Disminuir series del bloque ${label}`} disabled={disabled || series === 1n} onClick={() => changeSeries(-1n)}>−</Button>
        <output aria-label={`Series del bloque ${label}`} className="min-w-8 text-center tabular-nums">{validSeries ? block.series : '—'}</output>
        <Button type="button" variant="secondary" aria-label={`Aumentar series del bloque ${label}`} disabled={disabled} onClick={() => changeSeries(1n)}>+</Button>
      </div>
      {!validSeries ? <p role="alert" className="mt-2 text-sm text-red-700">Las series deben corregirse: elegí un número entero mayor a cero.</p> : null}
      {block.exercises.length ? <ul className="mt-3 divide-y">{block.exercises.map((exercise, entryIndex) => <ExerciseRow key={entryIndex} exercise={exercise} definitions={definitions} disabled={disabled} showSeries={false} showRest={false} code={`${blockLabel(blockIndex + 1)}${entryIndex + 1}`} onChange={updated => onChange({ ...day, blocks: day.blocks!.map(item => item.key === block.key ? { ...item, exercises: item.exercises.map((entry, i) => i === entryIndex ? updated : entry) } : item) })} onRemove={() => onChange({ ...day, blocks: day.blocks!.map(item => item.key === block.key ? { ...item, exercises: item.exercises.filter((_, i) => i !== entryIndex) } : item) })}/>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Sin ejercicios. Agregalos desde el catálogo.</p>}
      <Button type="button" variant="secondary" className="mt-3" disabled={disabled} aria-expanded={openBlockKey === block.key} onClick={() => onToggleCatalog(block.key)}>{openBlockKey === block.key ? 'Cerrar buscador del bloque' : 'Buscar ejercicios para el bloque'} {blockLabel(blockIndex + 1)}</Button>
      {openBlockKey === block.key ? <div className="@container mt-3">{catalog}</div> : null}
    </section>; })}<Button type="button" variant="ghost" onClick={() => onChange({ ...day, blocks: [...day.blocks!, newBlock()] })}>+ Agregar bloque</Button></div> : day.exercises.length ? <ul className="mt-4 divide-y rounded-md border">{day.exercises.map((exercise, entryIndex) => <ExerciseRow key={entryIndex} exercise={exercise} definitions={definitions} disabled={disabled} onChange={(updated) => onChange({ ...day, exercises: day.exercises.map((item, i) => i === entryIndex ? updated : item) })} onRemove={() => onChange({ ...day, exercises: day.exercises.filter((_, i) => i !== entryIndex) })}/>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">Sin ejercicios. Agregalos desde el catálogo.</p>}
  </fieldset>;
}

function ExerciseCatalog({ definitions, catalogLoading, catalogError, patterns, patternsLoading, patternsError, disabled, onAdd, inline = false }: ExerciseCatalogProps & { inline?: boolean; disabled: boolean; dayName: string; onAdd: (definition: ExerciseDefinition) => void }): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const activeDefinitions = definitions.filter(item => item.isActive);
  const [selectedPattern, setSelectedPattern] = useState('all');
  const patternItems = [{ id: 'all', name: 'Todos los ejercicios' }, ...patterns.slice().sort((a, b) => a.name.localeCompare(b.name, 'es')), ...(activeDefinitions.some(item => !item.movementPatternId) ? [{ id: 'none', name: 'Sin patrón' }] : [])];
  const filteredBySearch = filterExerciseDefinitions(definitions, search);
  const results = filteredBySearch.filter(item => selectedPattern === 'all' || (selectedPattern === 'none' ? !item.movementPatternId : item.movementPatternId === selectedPattern));
  const pages = Math.max(1, Math.ceil(results.length / EXERCISE_CATALOG_PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  useEffect(() => { if (page !== currentPage) setPage(currentPage); }, [currentPage, page]);
  const count = (id: string) => activeDefinitions.filter(item => id === 'all' || (id === 'none' ? !item.movementPatternId : item.movementPatternId === id)).length;
  return <section aria-label="Agregar ejercicios" className="rounded-lg border bg-surface-muted p-4">
    <div className={`grid min-w-0 items-start gap-4 ${inline ? '@min-[600px]:grid-cols-[220px_minmax(0,1fr)] @min-[600px]:gap-5' : 'md:grid-cols-[220px_minmax(0,1fr)] md:gap-5'}`}>
      <aside className="space-y-2">
        <h3 className="font-semibold">Patrones de movimiento</h3>
        {patternsLoading ? <p role="status" className="text-sm text-muted-foreground">Cargando patrones…</p> : null}
        {patternsError ? <p role="alert" className="text-sm text-red-700">No se pudieron cargar los patrones de movimiento.</p> : null}
        <label className={`block text-sm ${inline ? '@min-[600px]:hidden' : 'md:hidden'}`}>Patrón<select className={`${fieldClass} mt-1`} value={selectedPattern} disabled={disabled} onChange={event => { setSelectedPattern(event.target.value); setPage(1); }}>{patternItems.map(item => <option key={item.id} value={item.id}>{item.name} ({count(item.id)})</option>)}</select></label>
        <ul className={`hidden space-y-1 ${inline ? '@min-[600px]:block' : 'md:block'}`}>{patternItems.map(item => <li key={item.id}><button type="button" aria-label={`${item.name} ${count(item.id)}`} aria-pressed={selectedPattern === item.id} disabled={disabled} onClick={() => { setSelectedPattern(item.id); setPage(1); }} className={`flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm ${selectedPattern === item.id ? 'bg-white font-medium' : 'hover:bg-white'}`}><span className="flex-1 break-words">{item.name}</span><span>{count(item.id)}</span></button></li>)}</ul>
      </aside>
      <div className="min-w-0">
        <label className="block text-sm">Buscar ejercicio<input type="search" className={`${fieldClass} mt-1`} value={search} disabled={disabled} placeholder="Buscar por nombre, músculo o descripción" onChange={event => { setSearch(event.target.value); setPage(1); }}/></label>
        <p className="mt-2 text-sm">{results.length} resultados</p>
        {catalogLoading ? <p role="status">Cargando catálogo de ejercicios…</p> : catalogError ? <p role="alert">No se pudo cargar el catálogo de ejercicios.</p> : !results.length ? <p className="mt-1 text-sm text-muted-foreground">{search.trim() || selectedPattern !== 'all' ? 'No hay ejercicios que coincidan.' : 'Todavía no hay ejercicios en el catálogo.'}</p> : <ul className="mt-1 divide-y rounded-md border bg-white">{results.slice((currentPage - 1) * EXERCISE_CATALOG_PAGE_SIZE, currentPage * EXERCISE_CATALOG_PAGE_SIZE).map(item => <li key={item.id} className="flex min-w-0 items-center justify-between gap-2 px-3 py-2 text-sm"><span className="min-w-0"><span className="block font-medium">{item.name}</span>{item.primaryMuscle ? <span className="block text-xs text-muted-foreground">{item.primaryMuscle}</span> : null}<span className="block text-xs text-muted-foreground">{patterns.find(pattern => pattern.id === item.movementPatternId)?.name ?? 'Sin patrón'}</span></span><Button type="button" variant="ghost" className="shrink-0" disabled={disabled} aria-label={'Agregar ' + item.name} onClick={() => onAdd(item)}>+ Agregar</Button></li>)}</ul>}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm"><span>Página {currentPage} de {pages}</span><div className="flex gap-2"><Button type="button" variant="secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</Button><Button type="button" variant="secondary" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Siguiente</Button></div></div>
      </div>
    </div>
  </section>;
}

type OpenCatalogTarget = { dayKey: string; blockKey: string } | null;

export function RoutineDaysEditor({ days, definitions, catalogLoading, catalogError, patterns, patternsLoading, patternsError, onChange, disabled }: ExerciseCatalogProps & { days: EditingDay[]; onChange: (days: EditingDay[]) => void; disabled: boolean }): React.JSX.Element {
  const [openCatalog, setOpenCatalog] = useState<OpenCatalogTarget>(null);
  const [activeKey, setActiveKey] = useState(days[0]?.key ?? '');
  // Attach asynchronous creation to its originating day, preserving the latest draft.
  const latest = useRef({ days, onChange });
  latest.current = { days, onChange };
  const editorDefinitions = definitions;
  const activeIndex = Math.max(0, days.findIndex((day) => day.key === activeKey));
  const activeDay = days[activeIndex];
  const changeDay = (updated: EditingDay) => {
    if (openCatalog?.dayKey === updated.key && !updated.blocks?.some(block => block.key === openCatalog.blockKey)) setOpenCatalog(null);
    onChange(days.map((day) => day.key === updated.key ? updated : day));
  };
  const addExercise = (dayKey: string, blockKey: string | null, definition: ExerciseDefinition) => {
    const current = latest.current;
    current.onChange(current.days.map((day) => day.key === dayKey ? day.blocks === null ? { ...day, exercises: [...day.exercises, { ...emptyExercise(), exerciseDefinitionId: definition.id }] } : { ...day, blocks: day.blocks.map(block => block.key === blockKey ? { ...block, exercises: [...block.exercises, { ...emptyExercise(), exerciseDefinitionId: definition.id }] } : block) } : day));
  };
  const catalog = activeDay && (activeDay.blocks === null || (openCatalog?.dayKey === activeDay.key && activeDay.blocks.some(block => block.key === openCatalog.blockKey))) ? <ExerciseCatalog inline={activeDay.blocks !== null} key={`catalog-${openCatalog?.blockKey ?? 'legacy'}`} definitions={editorDefinitions} catalogLoading={catalogLoading} catalogError={catalogError} patterns={patterns} patternsLoading={patternsLoading} patternsError={patternsError} disabled={disabled} dayName={activeDay.name.trim() || `Día ${activeIndex + 1}`} onAdd={definition => addExercise(activeDay.key, openCatalog?.blockKey ?? null, definition)}/> : null;
  const removeDay = () => {
    if (!activeDay || days.length <= 1) return;
    const next = days.filter((day) => day.key !== activeDay.key);
    setOpenCatalog(null); onChange(next); setActiveKey(next[Math.max(0, activeIndex - 1)]?.key ?? '');
  };
  const addDay = () => { setOpenCatalog(null); const next = newDay(`Día ${days.length + 1}`); onChange([...days, next]); setActiveKey(next.key); };
  return <section className="mt-4 min-w-0 space-y-4" aria-label="Contenido de la rutina">
    <nav aria-label="Días de la rutina" className="flex items-center gap-2 overflow-x-auto pb-1">{days.map((day, index) => <button key={day.key} type="button" disabled={disabled} aria-label={`Día ${index + 1}: ${day.name || `Día ${index + 1}`}`} aria-pressed={activeDay?.key === day.key} onClick={() => { if (activeDay?.key !== day.key) setOpenCatalog(null); setActiveKey(day.key); }} className={`min-h-11 shrink-0 border-b-2 px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeDay?.key === day.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:bg-surface-muted'}`}>{day.name || `Día ${index + 1}`}</button>)}<Button type="button" variant="ghost" className="shrink-0" disabled={disabled} onClick={addDay}>+ Agregar día</Button></nav>
    {activeDay ? <>
      <DayEditor key={activeDay.key} day={activeDay} index={activeIndex} definitions={editorDefinitions} disabled={disabled} canRemove={days.length > 1} onRemove={removeDay} onChange={changeDay} openBlockKey={openCatalog?.dayKey === activeDay.key ? openCatalog.blockKey : null} onToggleCatalog={blockKey => setOpenCatalog(current => current?.dayKey === activeDay.key && current.blockKey === blockKey ? null : { dayKey: activeDay.key, blockKey })} catalog={catalog}/>
      {activeDay.blocks === null ? catalog : null}
    </> : null}
  </section>;
}

function exerciseToForm(exercise: RoutineExercise): ExerciseForm {
  return { exerciseDefinitionId: exercise.exerciseDefinitionId, series: exercise.series ?? '', repetitions: exercise.repetitions ?? '', duration: exercise.duration ?? '', load: exercise.load ?? '', rest: exercise.rest ?? '', notes: exercise.notes ?? '' };
}
export function routineDaysToDraft(days: RoutineDay[]): EditingDay[] {
  return days.map((day, index) => ({ key: crypto.randomUUID(), name: day.name ?? `Día ${index + 1}`, exercises: isGroupedDay(day.exercises) ? [] : day.exercises.map(exerciseToForm), blocks: isGroupedDay(day.exercises) ? groupRoutineBlocks(day.exercises).map(block => ({ key: crypto.randomUUID(), series: block.series ?? '', exercises: block.exercises.map(exerciseToForm) })) : null }));
}
export function draftToRoutineDays(days: EditingDay[]): RoutineDayDto[] {
  return days.map((day, index) => ({ name: day.name.trim() || `Día ${index + 1}`, exercises: (day.blocks === null ? day.exercises : day.blocks.flatMap((block, blockIndex) => {
    if (!block.exercises.length) throw new Error(`El Bloque ${blockLabel(blockIndex + 1)} del Día ${index + 1} no tiene ejercicios. Agregá uno o eliminá el bloque.`);
    if (!/^[0-9]+$/.test(block.series.trim()) || BigInt(block.series.trim()) < 1n) throw new Error(`Las series del Bloque ${blockLabel(blockIndex + 1)} del Día ${index + 1} deben ser un número entero mayor a cero.`);
    return block.exercises.map(exercise => ({ ...exercise, series: block.series, blockPosition: blockIndex + 1 }));
  })).map((exercise) => {
    const parsed = exerciseSchema.parse(exercise);
    return { exerciseDefinitionId: parsed.exerciseDefinitionId, ...('blockPosition' in exercise ? { blockPosition: exercise.blockPosition as number } : {}), series: parsed.series || null, repetitions: parsed.repetitions || null, duration: parsed.duration || null, load: parsed.load || null, rest: parsed.rest || null, notes: parsed.notes || null };
  }) }));
}
/** Copy only content; omit all source aggregate and child IDs. Preserve optional day names. */
export function copyRoutineDays(days: RoutineDay[]): RoutineDayDto[] {
  return days.map((day) => ({ name: day.name ?? null, exercises: day.exercises.map((exercise) => ({ exerciseDefinitionId: exercise.exerciseDefinitionId, ...(exercise.blockPosition != null ? { blockPosition: exercise.blockPosition } : {}), series: exercise.series ?? null, repetitions: exercise.repetitions ?? null, duration: exercise.duration ?? null, load: exercise.load ?? null, rest: exercise.rest ?? null, notes: exercise.notes ?? null })) }));
}
export function RoutineContentSummary({ days, definitions = [], dayAction }: { days: RoutineDay[]; definitions?: ExerciseDefinition[]; dayAction?: (day: RoutineDay) => React.ReactNode }): React.JSX.Element {
  return <div className="mt-4 grid gap-3 sm:grid-cols-2">{days.map((day) => <section key={day.id ?? day.position} className="min-w-0 rounded-md border border-border bg-white">
    <header className="flex items-center justify-between gap-2 border-b border-border bg-surface-muted px-3 py-2"><h5 className="truncate rounded-sm bg-primary px-2.5 py-1 text-sm font-semibold text-primary-foreground">{day.name ?? `Día ${day.position}`}</h5><span className="shrink-0 text-xs text-muted-foreground">{day.exercises.length} {day.exercises.length === 1 ? 'ejercicio' : 'ejercicios'}</span></header>
    {day.exercises.length === 0 ? <p className="px-3 py-3 text-sm text-muted-foreground">Sin ejercicios.</p> : (isGroupedDay(day.exercises) ? groupRoutineBlocks(day.exercises) : [{ position: 0, label: '', series: null, exercises: day.exercises }]).map(block => <section key={block.position}>
    {block.position > 0 ? <h6 className="border-b bg-surface-muted px-3 py-2 text-sm font-semibold">Bloque {block.label}{block.series ? ` — ${block.series} series` : ''}</h6> : null}
    <ul className="divide-y divide-border">{block.exercises.map((exercise, index) => {
      const parameters = block.position ? [formatRoutineRepetitions(exercise.repetitions), exercise.duration && `Tiempo ${formatRoutineDuration(exercise.duration)}`, exercise.load && `Carga ${formatRoutineLoad(exercise.load)}`].filter(Boolean).join(' · ') : [!block.position && exercise.series && `${exercise.series} series`, exercise.repetitions && `${exercise.repetitions} rep.`, exercise.duration && `Tiempo ${exercise.duration}`, exercise.load && `Carga ${exercise.load}`, exercise.rest && `Descanso ${exercise.rest}`].filter(Boolean).join(' · ');
      return <li key={exercise.id ?? index} className="px-3 py-2 text-sm">
        <p className="font-medium">{block.position > 0 ? `${block.label}${index + 1} — ` : ''}{displayExercise(exercise, definitions)}{exerciseUnavailable(exercise, definitions) ? <span className="ml-1 text-xs font-normal text-muted-foreground">· No disponible</span> : null}</p>
        {parameters ? <p className="mt-1 text-xs text-muted-foreground">{parameters}</p> : null}
        {exercise.exerciseDefinition?.description ? <p className="mt-1 text-xs text-muted-foreground">{exercise.exerciseDefinition.description}</p> : null}
        {exercise.notes ? <p className="mt-1 text-xs text-muted-foreground">Observación: {exercise.notes}</p> : null}
      </li>;
    })}</ul></section>)}
    {dayAction ? <div className="px-3 py-3">{dayAction(day)}</div> : null}
  </section>)}</div>;
}
