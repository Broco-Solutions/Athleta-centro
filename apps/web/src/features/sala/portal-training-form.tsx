'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { flushSync } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPortalTrainingRecord, getPortalTrainingContext, type TrainingContextDto, type TrainingRecordDetailDto, type TrainingWeightDto } from '@athleta/api-client';
import { portalFetch } from '../../app/portal/portal-ui';
import { TrainingWeightsForm, type WeightFieldActions } from './training-weights-form';
import { TrainingRequestError, trainingDate, trainingResponse } from './training-record-api';
import { trainingMonthWeeks, trainingWeekDates } from './training-month';

export type TrainingPeriod = {
  today: string;
  weekStart: string;
  date: string;
  dates: (week: { start: string; end: string }) => string[];
  selectWeek: (week: { start: string; end: string }) => void;
  selectDate: (date: string) => void;
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
export function NewTraining({ initial, selectedDay, embedded = false, renderHistory, onDirtyChange, onPendingChange, collapsible = false, month, records = [] }: { month?: string; records?: TrainingRecordDetailDto[]; initial: TrainingContextDto; selectedDay: string | null; embedded?: boolean; collapsible?: boolean; renderHistory?: (exerciseId: string, period: TrainingPeriod) => React.ReactNode; onDirtyChange?: (dirty: boolean) => void; onPendingChange?: (pending: boolean) => void }): React.JSX.Element {
  // Keep the routine that opened this form, including its ID, for the entire edit.
  // A later routine assignment must be an explicit server conflict at save time.
  const [routine] = useState(initial.routine);
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const reportDirty = useCallback((value: boolean) => { setDirty(value); onDirtyChange?.(value); }, [onDirtyChange]);
  const [date, setDate] = useState(initial.today);
  const [weekStart, setWeekStart] = useState('');
  const [dayId, setDayId] = useState(selectedDay ?? routine?.days[0]?.id ?? '');
  const { options, refresh, session } = useTrainingSave();
  const previous = useQuery({ queryKey: ['portal', 'training-context', date], queryFn: async () => trainingResponse(await getPortalTrainingContext({ date }, { credentials: 'include' })).data, enabled: Boolean(routine) && /^\d{4}-\d{2}-\d{2}$/.test(date) });
  const mutation = useMutation({ mutationFn: async (exercises: TrainingWeightDto[]) => {
    if (!routine || date > initial.today || date < routine.createdOn) throw new Error('Elegí una fecha entre la asignación de esta rutina y hoy.');
    return trainingResponse(await createPortalTrainingRecord({ routineId: routine.id, routineDayId: dayId, date, exercises }, options()));
  }, onSuccess: async () => { setRevision(value => value + 1); reportDirty(false); await refresh(); } });
  useEffect(() => { onPendingChange?.(mutation.isPending); }, [mutation.isPending, onPendingChange]);
  if (mutation.isSuccess && !embedded) return <Saved/>;
  if (!routine) return <p>No hay una rutina activa.</p>;
  const duplicate = records.find(record => record.routineId === routine.id && record.routineDayId === dayId && record.date === date);
  const dates = (week: { start: string; end: string }) => trainingWeekDates(week, month ?? initial.today.slice(0, 7), routine.createdOn, initial.today);
  const history = renderHistory ? (id: string, actions: WeightFieldActions) => {
    const change = (nextDate: string, nextWeek: string) => {
      if (mutation.isPending) return false;
      if (nextWeek === weekStart && nextDate === date) return true;
      // Defining the missing real date completes the same draft; retain its weights.
      if (nextWeek === weekStart && !date) { setDate(nextDate); return true; }
      if (dirty && !window.confirm('Tenés pesos sin guardar. Cambiar de semana o fecha descartará los valores del entrenamiento actual. ¿Querés continuar?')) return false;
      // Commit the enabled input during this user gesture so mobile focus can open the keyboard.
      flushSync(() => { actions.resetWeights(); reportDirty(false); setDate(nextDate); setWeekStart(nextWeek); mutation.reset(); });
      return true;
    };
    return renderHistory(id, { today: initial.today, weekStart, date, dates,
      selectWeek: week => {
        const available = dates(week);
        if (!available.length) return;
        // Keep the real date when selecting the same period from another exercise.
        const nextDate = week.start === weekStart ? date : available.includes(initial.today) ? initial.today : '';
        if (change(nextDate, week.start)) actions.focus();
      },
      selectDate: value => {
        const week = trainingMonthWeeks(month ?? initial.today.slice(0, 7)).find(entry => entry.start === weekStart);
        if (week && dates(week).includes(value)) change(value, weekStart);
      },
    });
  } : undefined;
  const day = routine.days.find(entry => entry.id === dayId);
  const latest = previous.data?.routine?.id === routine.id ? previous.data.routine.days.find(entry => entry.id === dayId) : null;
  const exercises = day?.exercises.map(exercise => ({ ...exercise, lastWeightKg: latest?.exercises.find(entry => entry.id === exercise.id)?.lastWeightKg ?? null })) ?? [];
  return <div className="space-y-5">{mutation.isSuccess ? <p role="status">Entrenamiento guardado correctamente.</p> : null}
    {embedded ? <p role="status" className="text-sm text-muted-foreground">{mutation.isPending ? 'Guardando…' : dirty ? 'Sin guardar' : 'Elegí una semana para registrar los pesos de todo el entrenamiento.'}</p> : <>
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Fecha del entrenamiento<input className="mt-2 block min-h-11 w-full rounded-md border bg-white px-3 text-base" type="date" min={routine.createdOn} max={initial.today} value={date} disabled={mutation.isPending} onChange={event => setDate(event.target.value)}/></label>
      <label className="text-sm font-medium">Día de la rutina<select className="mt-2 block min-h-11 w-full rounded-md border bg-white px-3 text-base" value={dayId} disabled={mutation.isPending} onChange={event => setDayId(event.target.value)}><option value="">Seleccioná un día</option>{routine.days.map(entry => <option key={entry.id} value={entry.id}>{entry.name || `Día ${entry.position}`}</option>)}</select></label></div>
    <p className="text-sm text-muted-foreground">Podés registrar desde el {trainingDate(routine.createdOn)} hasta hoy.</p></>}
    {previous.isError ? <p className="text-sm">No pudimos consultar los últimos pesos. Podés ingresar los utilizados.</p> : null}
    {day ? <TrainingWeightsForm key={`${day.id}-${revision}`} renderHistory={history} weightsEnabled={!embedded || Boolean(weekStart)} saveEnabled={!embedded || Boolean(weekStart && date && !duplicate)} onDirtyChange={reportDirty} collapsible={collapsible} exercises={exercises} pending={mutation.isPending || !session.data?.csrfToken} onSave={async weights => { try { await mutation.mutateAsync(weights); } catch { /* Keep the form and its entered values; mutation.error is shown below. */ } }}>{embedded && weekStart && !date ? <p className="text-sm">Indicá qué día entrenaste en la semana seleccionada para guardar.</p> : null}{embedded && weekStart && duplicate ? <p className="text-sm">Ya registraste este día. <Link className="inline-flex min-h-11 items-center underline" href={`/portal/sala/entrenamientos/registrar?recordId=${duplicate.id}`}>Editar registro existente</Link> o elegí otra fecha de la semana.</p> : null}<SaveError error={mutation.error}/></TrainingWeightsForm> : <p>Seleccioná un día de tu rutina.</p>}
  </div>;
}
