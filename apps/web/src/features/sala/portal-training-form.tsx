'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { flushSync } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { correctPortalTrainingRecord, createPortalTrainingRecord, getPortalTrainingContext, type TrainingContextDto, type TrainingRecordDetailDto, type TrainingWeightDto } from '@athleta/api-client';
import { portalFetch } from '../../app/portal/portal-ui';
import { TrainingWeightsForm, type WeightFieldActions } from './training-weights-form';
import { TrainingRequestError, trainingDate, trainingResponse } from './training-record-api';
import { trainingWeekReference, weeklyTrainingRecords, type TrainingMonthDay } from './training-month';

export type TrainingPeriod = {
  controls?: React.ReactNode;
  today: string;
  weekStart: string;
  canSelectWeek: (week: { start: string; end: string }) => boolean;
  selectWeek: (week: { start: string; end: string }) => void;
};

const linkClass = 'inline-flex min-h-11 items-center rounded-md border bg-white px-3 text-sm font-medium';
export function Saved(): React.JSX.Element {
  return <div className="space-y-4"><p role="status">Entrenamiento guardado correctamente.</p><div className="flex flex-wrap gap-3"><Link className={linkClass} href="/portal/sala/entrenamientos">Ver mi historial</Link><Link className={linkClass} href="/portal">Volver al inicio</Link></div></div>;
}
export function SaveError({ error }: { error: Error | null }): React.JSX.Element | null {
  if (!error) return null;
  return <div role="alert" className="space-y-2 text-sm"><p>{error.message}</p>{error instanceof TrainingRequestError && error.code === 'TRAINING_DUPLICATE' && error.recordId ? <Link className={linkClass} href={`/portal/sala/entrenamientos/registrar?recordId=${error.recordId}`}>Abrir registro existente</Link> : null}{error instanceof TrainingRequestError && error.code === 'TRAINING_ROUTINE_CHANGED' ? <Link className={linkClass} href="/portal/sala/rutina">Revisar rutina activa</Link> : null}</div>;
}
export function useTrainingSave() {
  const client = useQueryClient();
  const session = useQuery({ queryKey: ['portal', 'session'], queryFn: () => portalFetch<{ csrfToken: string }>('auth/session') });
  const options = () => { if (!session.data?.csrfToken) throw new Error('No pudimos validar tu sesión. Intentá nuevamente.'); return { credentials: 'include' as const, headers: { 'x-csrf-token': session.data.csrfToken } }; };
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ['portal', 'training-records'] }), client.invalidateQueries({ queryKey: ['portal', 'training-context'], predicate: query => query.queryKey[2] !== 'initial' })]); };
  return { options, refresh, session };
}
export function WeeklyTraining({ day, month, today, createdOn, renderHistory, onDirtyChange, onPendingChange }: {
  day: TrainingMonthDay; month: string; today: string; createdOn: string;
  renderHistory: (id: string, period: TrainingPeriod) => React.ReactNode;
  onDirtyChange: (dirty: boolean) => void; onPendingChange: (pending: boolean) => void;
}): React.JSX.Element {
  const [weekStart, setWeekStart] = useState('');
  const [date, setDate] = useState('');
  // Freeze the chosen snapshot until an explicit selection or successful save.
  const [record, setRecord] = useState<TrainingRecordDetailDto | null>(null);
  const [dirty, setDirty] = useState(false);
  const fields = useRef<WeightFieldActions | null>(null);
  const reportDirty = useCallback((value: boolean) => { setDirty(value); onDirtyChange(value); }, [onDirtyChange]);
  const { options, refresh, session } = useTrainingSave();
  const entryId = (exercise: typeof day.exercises[number]) => 'routineExerciseId' in exercise ? exercise.routineExerciseId : exercise.id;
  const weightsFor = (saved: TrainingRecordDetailDto | null) => day.exercises.map(exercise => saved?.exercises.find(entry => entry.routineExerciseId === entryId(exercise))?.weightKg ?? null);
  const mutation = useMutation({ mutationFn: async (weights: TrainingWeightDto[]) => {
    if (record) {
      const values = new Map(weights.map(weight => [entryId(day.exercises.find(exercise => exercise.id === weight.id)!), weight.weightKg]));
      // Correct using saved entry IDs and preserve every saved prescription field.
      const exercises = record.exercises.map(entry => ({ id: entry.id, weightKg: values.has(entry.routineExerciseId) ? values.get(entry.routineExerciseId)! : entry.weightKg }));
      return trainingResponse(await correctPortalTrainingRecord(record.id, { exercises }, options())).data;
    }
    if (!day.canCreate || !date) throw new Error('Elegí una semana válida.');
    return trainingResponse(await createPortalTrainingRecord({ routineId: day.routineId, routineDayId: day.routineDayId, date, allowFuture: true, exercises: weights }, options())).data;
  }, onSuccess: async saved => {
    setRecord(saved);
    fields.current?.resetWeights(weightsFor(saved));
    reportDirty(false);
    await refresh();
  } });
  useEffect(() => { onPendingChange(mutation.isPending); }, [mutation.isPending, onPendingChange]);
  const savedIn = (week: { start: string; end: string }) => weeklyTrainingRecords(day.records, week)[0] ?? null;
  const reference = (week: { start: string; end: string }) => day.canCreate ? trainingWeekReference(week, month, day.validFrom ?? createdOn, today, day.validUntil) : null;
  return <div className="space-y-5">
    {mutation.isSuccess ? <p role="status">Entrenamiento guardado correctamente.</p> : null}
    <TrainingWeightsForm exercises={day.exercises} collapsible correction={Boolean(record)} correctionLabel="Guardar cambios" pending={mutation.isPending || !session.data?.csrfToken} weightsEnabled={Boolean(date || record)} saveEnabled={Boolean(date || record)} onDirtyChange={reportDirty} onSave={async weights => { try { await mutation.mutateAsync(weights); } catch { /* Keep the draft; display the error below. */ } }} renderHistory={(id, actions) => {
      return renderHistory(id, { controls: actions.controls, today, weekStart, canSelectWeek: week => Boolean(savedIn(week) || reference(week)), selectWeek: week => {
        if (mutation.isPending || (!savedIn(week) && !reference(week))) return;
        const saved = savedIn(week), nextDate = saved?.date ?? reference(week);
        if (weekStart !== week.start) {
          if (dirty && !window.confirm('Tenés pesos sin guardar. Cambiar de semana descartará los valores del entrenamiento actual. ¿Querés continuar?')) return;
          flushSync(() => {
            actions.resetWeights(weightsFor(saved)); reportDirty(false);
            setWeekStart(week.start); setDate(nextDate ?? ''); setRecord(saved); mutation.reset();
          });
        }
        fields.current = actions;
        actions.focus();
      } });
    }}><SaveError error={mutation.error}/></TrainingWeightsForm>
  </div>;
}

export function NewTraining({ initial, selectedDay }: { initial: TrainingContextDto; selectedDay: string | null }): React.JSX.Element {
  const [routine] = useState(initial.routine);
  const [date, setDate] = useState(initial.today);
  const [dayId, setDayId] = useState(selectedDay ?? routine?.days[0]?.id ?? '');
  const { options, refresh, session } = useTrainingSave();
  const previous = useQuery({ queryKey: ['portal', 'training-context', date], queryFn: async () => trainingResponse(await getPortalTrainingContext({ date }, { credentials: 'include' })).data, enabled: Boolean(routine) && /^\d{4}-\d{2}-\d{2}$/.test(date) });
  const mutation = useMutation({ mutationFn: async (exercises: TrainingWeightDto[]) => {
    if (!routine || date > initial.today || date < routine.createdOn) throw new Error('Elegí una fecha entre la asignación de esta rutina y hoy.');
    return trainingResponse(await createPortalTrainingRecord({ routineId: routine.id, routineDayId: dayId, date, exercises }, options()));
  }, onSuccess: refresh });
  if (mutation.isSuccess) return <Saved/>;
  if (!routine) return <p>No hay una rutina activa.</p>;
  const day = routine.days.find(entry => entry.id === dayId);
  const latest = previous.data?.routine?.id === routine.id ? previous.data.routine.days.find(entry => entry.id === dayId) : null;
  const exercises = day?.exercises.map(exercise => ({ ...exercise, lastWeightKg: latest?.exercises.find(entry => entry.id === exercise.id)?.lastWeightKg ?? null })) ?? [];
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Fecha del entrenamiento<input className="mt-2 block min-h-11 w-full rounded-md border bg-white px-3 text-base" type="date" min={routine.createdOn} max={initial.today} value={date} disabled={mutation.isPending} onChange={event => setDate(event.target.value)}/></label>
      <label className="text-sm font-medium">Día de la rutina<select className="mt-2 block min-h-11 w-full rounded-md border bg-white px-3 text-base" value={dayId} disabled={mutation.isPending} onChange={event => setDayId(event.target.value)}><option value="">Seleccioná un día</option>{routine.days.map(entry => <option key={entry.id} value={entry.id}>{entry.name || `Día ${entry.position}`}</option>)}</select></label></div>
    <p className="text-sm text-muted-foreground">Podés registrar desde el {trainingDate(routine.createdOn)} hasta hoy.</p>
    {previous.isError ? <p className="text-sm">No pudimos consultar los últimos pesos. Podés ingresar los utilizados.</p> : null}
    {day ? <TrainingWeightsForm key={day.id} exercises={exercises} pending={mutation.isPending || !session.data?.csrfToken} onSave={async weights => { try { await mutation.mutateAsync(weights); } catch { /* Preserve entered values. */ } }}><SaveError error={mutation.error}/></TrainingWeightsForm> : <p>Seleccioná un día de tu rutina.</p>}
  </div>;
}
