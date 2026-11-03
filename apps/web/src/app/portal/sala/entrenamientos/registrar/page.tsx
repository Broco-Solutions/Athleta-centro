'use client';
import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { correctPortalTrainingRecord, getPortalTrainingContext, getPortalTrainingRecord, type TrainingWeightDto } from '@athleta/api-client';
import { PortalFrame } from '../../../portal-ui';
import { NewTraining, Saved, SaveError, useTrainingSave } from '../../../../../features/sala/portal-training-form';
import { TrainingWeightsForm } from '../../../../../features/sala/training-weights-form';
import { trainingDate, trainingResponse } from '../../../../../features/sala/training-record-api';

const linkClass = 'inline-flex min-h-11 items-center rounded-md border bg-white px-3 text-sm font-medium';
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
