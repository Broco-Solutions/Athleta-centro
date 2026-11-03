'use client';
import React, { useEffect, useId, useRef, useState } from 'react';
import { groupRoutineBlocks, isGroupedDay, formatRoutineRepetitions, formatRoutineDuration, formatRoutineLoad } from './routine-blocks';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@athleta/ui';
import type { TrainingContextExerciseDto, TrainingRecordExerciseDto, TrainingWeightDto } from '@athleta/api-client';
import { trainingWeight } from './training-record-api';

const weightSchema = (correction: boolean) => z.object({ weights: z.array(z.string().trim().refine(value => value === '' || /^\d{1,35}(?:[.,]\d{1,30})?$/.test(value), 'Ingresá un peso válido, sin valores negativos.')) }).refine(value => correction || value.weights.some(weight => weight !== ''), { message: 'Informá al menos un peso para guardar el entrenamiento.', path: ['weights'] });
type Weights = z.infer<ReturnType<typeof weightSchema>>;
export type WeightFieldActions = { focus: () => void; resetWeights: (weights?: (string | null)[]) => void; controls: React.ReactNode };
export function TrainingWeightsForm({ exercises, onSave, pending, correction = false, children, readOnly = false, renderHistory, onDirtyChange, collapsible = false, weightsEnabled = true, saveEnabled = true, correctionLabel = 'Guardar corrección' }: { exercises: (TrainingContextExerciseDto | TrainingRecordExerciseDto)[]; onSave: (weights: TrainingWeightDto[]) => Promise<void>; pending: boolean; correction?: boolean; correctionLabel?: string; children?: React.ReactNode; readOnly?: boolean; collapsible?: boolean; weightsEnabled?: boolean; saveEnabled?: boolean; renderHistory?: ((exerciseId: string, actions: WeightFieldActions) => React.ReactNode) | undefined; onDirtyChange?: ((dirty: boolean) => void) | undefined }): React.JSX.Element {
  const panelPrefix = useId();
  const [activeExercise, setActiveExercise] = useState('');
  const [open, setOpen] = useState<string[]>([]);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  useEffect(() => {
    if (!collapsible) return;
    const keepWeightVisible = () => {
      const input = [...inputs.current.values()].find(element => element === document.activeElement);
      input?.scrollIntoView?.({ block: 'center', behavior: 'instant' });
    };
    // Mobile keyboards resize the visual viewport without necessarily resizing the page.
    window.visualViewport?.addEventListener('resize', keepWeightVisible);
    window.addEventListener('resize', keepWeightVisible);
    return () => {
      window.visualViewport?.removeEventListener('resize', keepWeightVisible);
      window.removeEventListener('resize', keepWeightVisible);
    };
  }, [collapsible]);
  const { register, reset, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<Weights>({ resolver: zodResolver(weightSchema(correction)), shouldFocusError: !collapsible, defaultValues: { weights: exercises.map(exercise => 'weightKg' in exercise && exercise.weightKg !== null ? exercise.weightKg.replace('.', ',') : '') } });
  useEffect(() => { onDirtyChange?.(isDirty || isSubmitting); }, [isDirty, isSubmitting, onDirtyChange]);
  const blocks = isGroupedDay(exercises) ? groupRoutineBlocks(exercises) : [];
  const busy = pending || isSubmitting;
  return <form onSubmit={handleSubmit(async values => onSave(values.weights.map((weight, index) => ({ id: exercises[index]!.id, weightKg: weight === '' ? null : weight.replace(',', '.') }))), invalid => { if (collapsible) setOpen(current => [...new Set([...current, ...exercises.filter((_, index) => invalid.weights?.[index]).map(exercise => exercise.id)])]); })} className="space-y-4" noValidate>
    {!readOnly && !collapsible ? <p className="text-sm text-muted-foreground">Registrá un peso por ejercicio. Podés dejar campos sin completar.</p> : null}
    <fieldset disabled={busy} className="space-y-3"><legend className="sr-only">Pesos utilizados</legend>{exercises.map((exercise, index) => {
      const block = blocks.find(item => item.exercises.includes(exercise));
      const expanded = !collapsible || open.includes(exercise.id);
      const actions: WeightFieldActions = {
        focus: () => { setActiveExercise(exercise.id); const input = inputs.current.get(exercise.id); input?.focus(); input?.scrollIntoView?.({ block: 'center', behavior: 'instant' }); },
        resetWeights: weights => reset({ weights: exercises.map((_, index) => weights?.[index]?.replace('.', ',') ?? '') }),
        controls: null,
      };
      const field = register(`weights.${index}`);
      const panelId = `${panelPrefix}-${index}`;
      actions.controls = <> {!readOnly ? <div className="min-w-0"><label className="block text-sm font-medium" htmlFor={`weight-${exercise.id}`}>Peso utilizado (kg)<span className="sr-only"> — {exercise.exerciseName}, ejercicio {index + 1}</span></label><input {...field} ref={element => { field.ref(element); if (element) inputs.current.set(exercise.id, element); else inputs.current.delete(exercise.id); }} disabled={!weightsEnabled} onFocus={event => { if (collapsible) { setActiveExercise(exercise.id); event.currentTarget.scrollIntoView?.({ block: 'center', behavior: 'instant' }); } }} id={`weight-${exercise.id}`} type="text" inputMode="decimal" autoComplete="off" placeholder="Ej. 42,5" aria-invalid={Boolean(errors.weights?.[index])} aria-describedby={errors.weights?.[index] ? `error-${exercise.id}` : undefined} className="mt-2 min-h-11 w-full scroll-mb-32 rounded-md border bg-white px-3 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"/>{errors.weights?.[index] ? <p role="alert" id={`error-${exercise.id}`} className="mt-1 text-sm text-red-700">{errors.weights[index]?.message}</p> : null}</div> : null}{!readOnly && collapsible && activeExercise === exercise.id && expanded && saveEnabled ? <Button type="submit" className="mt-3 min-h-11 w-full" disabled={busy}>{busy ? 'Guardando…' : correction ? correctionLabel : 'Guardar entrenamiento'}</Button> : null}</>;
      const title = <><span className="block font-semibold">{block ? `${block.label}${block.exercises.indexOf(exercise) + 1} — ` : ''}{exercise.exerciseName}</span><span className="mt-1 block text-sm text-muted-foreground">{[exercise.series && `${exercise.series} series`, exercise.repetitions && `${exercise.repetitions} rep.`, exercise.duration && `Tiempo ${formatRoutineDuration(exercise.duration)}`, exercise.load && `Carga indicada: ${formatRoutineLoad(exercise.load)}`].filter(Boolean).join(' · ')}</span></>;
      return <React.Fragment key={exercise.id}>{block?.exercises[0] === exercise ? <h2 className="pt-3 font-semibold">Bloque {block.label}{block.series ? ` — ${block.series} series` : ''}</h2> : null}<div className="min-w-0 overflow-hidden rounded-md border bg-white">
      {collapsible ? <h3><button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => { setActiveExercise(open.includes(exercise.id) ? open.filter(id => id !== exercise.id).at(-1) ?? '' : exercise.id); setOpen(current => current.includes(exercise.id) ? current.filter(id => id !== exercise.id) : [...current, exercise.id]); }} className="flex min-h-16 w-full items-start justify-between gap-4 p-4 text-left hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><span className="min-w-0 break-words">{title}{errors.weights?.[index] ? <span className="mt-1 block text-sm text-red-700">Revisá el peso ingresado</span> : null}</span>{expanded ? <ChevronUp className="mt-1 shrink-0" size={20} aria-hidden="true"/> : <ChevronDown className="mt-1 shrink-0" size={20} aria-hidden="true"/>}</button></h3> : null}
      {/* Keep fields mounted: collapsing is presentation only, never a form reset. */}
      <div id={panelId} hidden={!expanded}><div className={`grid min-w-0 gap-4 p-4 ${collapsible ? 'pt-0' : readOnly ? '' : 'sm:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)]'}`}>
      {collapsible && renderHistory ? <div className="min-w-0">{renderHistory(exercise.id, actions)}</div> : null}
      <div className="min-w-0 break-words">{!collapsible ? <><h2 className="font-semibold">{block ? `${block.label}${block.exercises.indexOf(exercise) + 1} — ` : ''}{exercise.exerciseName}</h2><p className="mt-1 text-sm text-muted-foreground">{(block ? [formatRoutineRepetitions(exercise.repetitions), exercise.duration && `Tiempo ${formatRoutineDuration(exercise.duration)}`] : [!block && exercise.series && `${exercise.series} series`, exercise.repetitions && `${exercise.repetitions} rep.`, exercise.duration && `Tiempo ${exercise.duration}`, exercise.rest && `Descanso ${exercise.rest}`]).filter(Boolean).join(' · ')}</p>{exercise.load ? <p className="mt-2 text-sm">Carga indicada: <span className="font-medium">{block ? formatRoutineLoad(exercise.load) : exercise.load}</span></p> : null}</> : null}{exercise.notes ? <p className="mt-1 text-sm">{exercise.notes}</p> : null}{'lastWeightKg' in exercise && exercise.lastWeightKg !== null ? <p className="mt-2 text-sm text-muted-foreground">Último peso registrado: {trainingWeight(exercise.lastWeightKg)}</p> : null}</div>
      {!collapsible ? actions.controls : null}
      {!collapsible && renderHistory ? <div className="min-w-0 sm:col-span-full">{renderHistory(exercise.id, actions)}</div> : null}
    </div></div></div></React.Fragment>; })}</fieldset>
    {errors.weights?.message || errors.weights?.root?.message ? <p role="alert" className="text-sm text-red-700">{errors.weights.message || errors.weights.root?.message}</p> : null}
    {children}
    {!readOnly && !collapsible ? <Button type="submit" className="min-h-11 w-full scroll-mb-32 sm:w-auto" disabled={busy || !saveEnabled || exercises.length === 0}>{busy ? 'Guardando…' : correction ? correctionLabel : 'Guardar entrenamiento'}</Button> : null}
  </form>;
}
