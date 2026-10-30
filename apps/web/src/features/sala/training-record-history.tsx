'use client';
import { groupRoutineBlocks, isGroupedDay } from './routine-blocks';
import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
import type { TrainingRecordDetailDto } from '@athleta/api-client';
import { trainingDate, trainingWeight, type TrainingHistoryApi } from './training-record-api';

export function TrainingRecordDetail({ record }: { record: TrainingRecordDetailDto }): React.JSX.Element {
  const blocks = isGroupedDay(record.exercises) ? groupRoutineBlocks(record.exercises) : [];
  return <ul className="mt-3 divide-y" aria-label="Ejercicios del entrenamiento">{record.exercises.map(exercise => {
    const block = blocks.find(item => item.exercises.includes(exercise));
    return <React.Fragment key={exercise.id}>{block?.exercises[0] === exercise ? <li className="pt-3 font-semibold">Bloque {block.label}{block.series ? ` — ${block.series} series` : ''}</li> : null}<li className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
    <div className="min-w-0 break-words"><p className="font-medium">{block ? `${block.label}${block.exercises.indexOf(exercise) + 1} — ` : ''}{exercise.exerciseName}</p><p className="mt-1 text-sm text-muted-foreground">{[!block && exercise.series && `${exercise.series} series`, exercise.repetitions && `${exercise.repetitions} rep.`, exercise.duration && `Tiempo ${exercise.duration}`, exercise.rest && `Descanso ${exercise.rest}`].filter(Boolean).join(' · ')}</p>{exercise.notes ? <p className="mt-1 text-sm">{exercise.notes}</p> : null}</div>
    <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Carga indicada</dt><dd className="mt-1 break-words">{exercise.load || 'Sin indicación'}</dd></div><div><dt className="text-muted-foreground">Peso realizado</dt><dd className="mt-1 font-medium tabular-nums">{trainingWeight(exercise.weightKg)}</dd></div></dl>
  </li></React.Fragment>; })}</ul>;
}
function RecordDetail({ id, api, queryKey, editable }: { id: string; api: TrainingHistoryApi; queryKey: string[]; editable: boolean }): React.JSX.Element {
  const detail = useQuery({ queryKey: [...queryKey, 'detail', id], queryFn: () => api.detail(id) });
  if (detail.isPending) return <p role="status" className="py-3 text-sm">Cargando entrenamiento…</p>;
  if (detail.isError) return <div role="alert"><p>No pudimos cargar el detalle.</p><Button variant="secondary" onClick={() => void detail.refetch()}>Reintentar</Button></div>;
  return <><TrainingRecordDetail record={detail.data}/>{editable ? <Link className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium" href={`/portal/sala/entrenamientos/registrar?recordId=${id}`}>Editar registro</Link> : null}</>;
}
export function TrainingRecordHistory({ api, queryKey, editable = false }: { api: TrainingHistoryApi; queryKey: string[]; editable?: boolean }): React.JSX.Element {
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<string | null>(null);
  const records = useQuery({ queryKey: [...queryKey, 'list', page], queryFn: () => api.list(page) });
  return <section aria-label="Historial de entrenamientos" className="mt-4 rounded-md border bg-white p-4">
    <h4 className="font-semibold">Historial de entrenamientos</h4>
    {records.isPending ? <p role="status" className="mt-3 text-sm">Cargando entrenamientos…</p> : records.isError ? <div role="alert" className="mt-3"><p>No pudimos cargar los entrenamientos.</p><Button variant="secondary" onClick={() => void records.refetch()}>Reintentar</Button></div> : <>
      {records.data.data.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{editable ? 'Todavía no registraste entrenamientos.' : 'No hay entrenamientos registrados.'}</p> : <ul className="mt-2 divide-y">{records.data.data.map(record => <li key={record.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm"><span className="font-medium tabular-nums">{trainingDate(record.date)}</span> — {record.dayName || `Día ${record.dayPosition}`}</p><Button type="button" variant="secondary" aria-expanded={opened === record.id} aria-controls={`training-${record.id}`} aria-label={`${opened === record.id ? 'Cerrar' : 'Ver'} detalle del ${trainingDate(record.date)} — ${record.dayName || `Día ${record.dayPosition}`}`} onClick={() => setOpened(opened === record.id ? null : record.id)}>{opened === record.id ? 'Cerrar detalle' : 'Ver detalle'}</Button></div>
        {opened === record.id ? <div id={`training-${record.id}`}><RecordDetail id={record.id} api={api} queryKey={queryKey} editable={editable}/></div> : null}
      </li>)}</ul>}
      {records.data.meta.totalPages > 1 ? <nav aria-label="Páginas de entrenamientos" className="mt-4 flex flex-wrap items-center justify-between gap-3"><Button variant="secondary" disabled={page <= 1} onClick={() => { setOpened(null); setPage(page - 1); }}>Anterior</Button><span className="text-sm">Página {page} de {records.data.meta.totalPages}</span><Button variant="secondary" disabled={page >= records.data.meta.totalPages} onClick={() => { setOpened(null); setPage(page + 1); }}>Siguiente</Button></nav> : null}
    </>}
  </section>;
}
