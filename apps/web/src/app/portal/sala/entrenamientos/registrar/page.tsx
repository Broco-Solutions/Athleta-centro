'use client';
import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPortalTrainingRecord, correctPortalTrainingRecord, getPortalTrainingContext, getPortalTrainingRecord, type TrainingContextDto, type TrainingWeightDto } from '@athleta/api-client';
import { PortalFrame, portalFetch } from '../../../portal-ui';
import { TrainingWeightsForm } from '../../../../../features/sala/training-weights-form';
import { TrainingRequestError, trainingDate, trainingResponse } from '../../../../../features/sala/training-record-api';

const linkClass = 'inline-flex min-h-11 items-center rounded-md border bg-white px-3 text-sm font-medium';
function Saved(): React.JSX.Element {
  return <div className="space-y-4"><p role="status">Entrenamiento guardado correctamente.</p><div className="flex flex-wrap gap-3"><Link className={linkClass} href="/portal/sala/entrenamientos">Ver mi historial</Link><Link className={linkClass} href="/portal">Volver al inicio</Link></div></div>;
}
function SaveError({ error }: { error: Error | null }): React.JSX.Element | null {
  if (!error) return null;
  return <div role="alert" className="space-y-2 text-sm"><p>{error.message}</p>{error instanceof TrainingRequestError && error.code === 'TRAINING_DUPLICATE' && error.recordId ? <Link className={linkClass} href={`/portal/sala/entrenamientos/registrar?recordId=${error.recordId}`}>Abrir registro existente</Link> : null}{error instanceof TrainingRequestError && error.code === 'TRAINING_ROUTINE_CHANGED' ? <Link className={linkClass} href="/portal/sala/rutina">Revisar rutina activa</Link> : null}</div>;
}
function useTrainingSave() {
  const client = useQueryClient();
  const session = useQuery({ queryKey: ['portal', 'session'], queryFn: () => portalFetch<{ csrfToken: string }>('auth/session') });
  const options = () => { if (!session.data?.csrfToken) throw new Error('No pudimos validar tu sesión. Intentá nuevamente.'); return { credentials: 'include' as const, headers: { 'x-csrf-token': session.data.csrfToken } }; };
  const refresh = async () => { await client.invalidateQueries({ queryKey: ['portal', 'training-records'] }); };
  return { options, refresh, session };
}
function NewTraining({ initial, selectedDay }: { initial: TrainingContextDto; selectedDay: string | null }): React.JSX.Element {
  // Keep the routine that opened this form, including its ID, for the entire edit.
  // A later routine assignment must be an explicit server conflict at save time.
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
    {day ? <TrainingWeightsForm key={day.id} exercises={exercises} pending={mutation.isPending || !session.data?.csrfToken} onSave={async weights => { try { await mutation.mutateAsync(weights); } catch { /* Keep the form and its entered values; mutation.error is shown below. */ } }}><SaveError error={mutation.error}/></TrainingWeightsForm> : <p>Seleccioná un día de tu rutina.</p>}
  </div>;
}
function CorrectTraining({ id }: { id: string }): React.JSX.Element {
  const detail = useQuery({ queryKey: ['portal', 'training-records', 'detail', id], queryFn: async () => trainingResponse(await getPortalTrainingRecord(id, { credentials: 'include' })).data });
  const { options, refresh, session } = useTrainingSave();
  const mutation = useMutation({ mutationFn: async (exercises: TrainingWeightDto[]) => trainingResponse(await correctPortalTrainingRecord(id, { exercises }, options())), onSuccess: refresh });
  if (mutation.isSuccess) return <Saved/>;
  if (detail.isPending) return <p role="status">Cargando entrenamiento…</p>;
  if (detail.isError) return <p role="alert">No pudimos cargar ese entrenamiento.</p>;
  return <div className="space-y-4"><p className="font-medium">{trainingDate(detail.data.date)} — {detail.data.dayName || `Día ${detail.data.dayPosition}`}</p><p className="text-sm text-muted-foreground">Corregí los pesos utilizados. Se conserva la planificación original de este entrenamiento.</p><TrainingWeightsForm key={id} correction exercises={detail.data.exercises} pending={mutation.isPending || !session.data?.csrfToken} onSave={async weights => { try { await mutation.mutateAsync(weights); } catch { /* Preserve entered values on error. */ } }}><SaveError error={mutation.error}/></TrainingWeightsForm></div>;
}
function Registration(): React.JSX.Element {
  const params = useSearchParams();
  const recordId = params.get('recordId');
  const context = useQuery({ queryKey: ['portal', 'training-context', 'initial'], queryFn: async () => trainingResponse(await getPortalTrainingContext(undefined, { credentials: 'include' })).data, enabled: !recordId, gcTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: false, refetchOnReconnect: false });
  return <PortalFrame title={recordId ? 'Editar registro' : 'Registrar entrenamiento'} backToHome><div className="max-w-4xl space-y-5"><Link className={linkClass} href="/portal/sala/entrenamientos">Mis entrenamientos</Link>{recordId ? <CorrectTraining key={recordId} id={recordId}/> : context.isPending || context.isFetching ? <p role="status">Cargando rutina…</p> : context.isError ? <p role="alert">No pudimos cargar tu rutina. Intentá nuevamente.</p> : <NewTraining initial={context.data} selectedDay={params.get('dayId')}/>}</div></PortalFrame>;
}
export default function RegisterTrainingPage(): React.JSX.Element { return <Suspense fallback={<p role="status">Cargando…</p>}><Registration/></Suspense>; }
