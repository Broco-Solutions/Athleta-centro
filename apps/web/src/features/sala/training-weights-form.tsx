'use client';
import React from 'react';
import { groupRoutineBlocks, isGroupedDay, formatRoutineRepetitions, formatRoutineDuration, formatRoutineLoad } from './routine-blocks';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@athleta/ui';
import type { TrainingContextExerciseDto, TrainingRecordExerciseDto, TrainingWeightDto } from '@athleta/api-client';
import { trainingWeight } from './training-record-api';

const weightSchema = (correction: boolean) => z.object({ weights: z.array(z.string().trim().refine(value => value === '' || /^\d{1,35}(?:[.,]\d{1,30})?$/.test(value), 'Ingresá un peso válido, sin valores negativos.')) }).refine(value => correction || value.weights.some(weight => weight !== ''), { message: 'Informá al menos un peso para guardar el entrenamiento.', path: ['weights'] });
type Weights = z.infer<ReturnType<typeof weightSchema>>;
export function TrainingWeightsForm({ exercises, onSave, pending, correction = false, children }: { exercises: (TrainingContextExerciseDto | TrainingRecordExerciseDto)[]; onSave: (weights: TrainingWeightDto[]) => Promise<void>; pending: boolean; correction?: boolean; children?: React.ReactNode }): React.JSX.Element {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Weights>({ resolver: zodResolver(weightSchema(correction)), defaultValues: { weights: exercises.map(exercise => 'weightKg' in exercise && exercise.weightKg !== null ? exercise.weightKg.replace('.', ',') : '') } });
  const blocks = isGroupedDay(exercises) ? groupRoutineBlocks(exercises) : [];
  const busy = pending || isSubmitting;
  return <form onSubmit={handleSubmit(async values => onSave(values.weights.map((weight, index) => ({ id: exercises[index]!.id, weightKg: weight === '' ? null : weight.replace(',', '.') }))))} className="space-y-4" noValidate>
    <p className="text-sm text-muted-foreground">Registrá un peso por ejercicio. Podés dejar campos sin completar.</p>
    <fieldset disabled={busy} className="space-y-3"><legend className="sr-only">Pesos utilizados</legend>{exercises.map((exercise, index) => {
      const block = blocks.find(item => item.exercises.includes(exercise));
      return <React.Fragment key={exercise.id}>{block?.exercises[0] === exercise ? <h2 className="pt-3 font-semibold">Bloque {block.label}{block.series ? ` — ${block.series} series` : ''}</h2> : null}<div className="grid gap-4 rounded-md border bg-white p-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)]">
      <div className="min-w-0 break-words"><h2 className="font-semibold">{block ? `${block.label}${block.exercises.indexOf(exercise) + 1} — ` : ''}{exercise.exerciseName}</h2><p className="mt-1 text-sm text-muted-foreground">{(block ? [formatRoutineRepetitions(exercise.repetitions), exercise.duration && `Tiempo ${formatRoutineDuration(exercise.duration)}`] : [!block && exercise.series && `${exercise.series} series`, exercise.repetitions && `${exercise.repetitions} rep.`, exercise.duration && `Tiempo ${exercise.duration}`, exercise.rest && `Descanso ${exercise.rest}`]).filter(Boolean).join(' · ')}</p>{exercise.load ? <p className="mt-2 text-sm">Carga indicada: <span className="font-medium">{block ? formatRoutineLoad(exercise.load) : exercise.load}</span></p> : null}{exercise.notes ? <p className="mt-1 text-sm">{exercise.notes}</p> : null}{'lastWeightKg' in exercise && exercise.lastWeightKg !== null ? <p className="mt-2 text-sm text-muted-foreground">Último peso registrado: {trainingWeight(exercise.lastWeightKg)}</p> : null}</div>
      <div><label className="block text-sm font-medium" htmlFor={`weight-${exercise.id}`}>Peso utilizado (kg)<span className="sr-only"> — {exercise.exerciseName}, ejercicio {index + 1}</span></label><input {...register(`weights.${index}`)} id={`weight-${exercise.id}`} type="text" inputMode="decimal" autoComplete="off" placeholder="Sin registro" aria-invalid={Boolean(errors.weights?.[index])} aria-describedby={errors.weights?.[index] ? `error-${exercise.id}` : undefined} className="mt-2 min-h-11 w-full rounded-md border bg-white px-3 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"/>{errors.weights?.[index] ? <p role="alert" id={`error-${exercise.id}`} className="mt-1 text-sm text-red-700">{errors.weights[index]?.message}</p> : null}</div>
    </div></React.Fragment>; })}</fieldset>
    {errors.weights?.message || errors.weights?.root?.message ? <p role="alert" className="text-sm text-red-700">{errors.weights.message || errors.weights.root?.message}</p> : null}
    {children}
    <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={busy || exercises.length === 0}>{busy ? 'Guardando…' : correction ? 'Guardar corrección' : 'Guardar entrenamiento'}</Button>
  </form>;
}
