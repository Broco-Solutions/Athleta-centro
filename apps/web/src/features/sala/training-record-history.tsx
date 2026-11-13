'use client';
import { groupRoutineBlocks, isGroupedDay, formatRoutineRepetitions, formatRoutineDuration, formatRoutineLoad } from './routine-blocks';
import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { trainingMonthLabel, shiftTrainingMonth } from './training-month';
import { Button } from '@athleta/ui';
import type { TrainingRecordDetailDto } from '@athleta/api-client';
import { trainingDate, trainingWeight, type TrainingHistoryApi } from './training-record-api';

export function recordPeriod(record: { date: string | null; month: string | null; weekNumber: number | null }): string {
  if (record.month !== null && record.weekNumber !== null) return `${trainingMonthLabel(record.month)} · Semana ${record.weekNumber}`;
  return `Registro anterior · ${record.date ? trainingDate(record.date) : 'Sin fecha'}`;
}

export function TrainingRecordDetail({ record }: { record: TrainingRecordDetailDto }): React.JSX.Element {
  const blocks = isGroupedDay(record.exercises) ? groupRoutineBlocks(record.exercises) : [];
  return <ul className="mt-3 divide-y" aria-label="Ejercicios del entrenamiento">{record.exercises.map(exercise => {
    const block = blocks.find(item => item.exercises.includes(exercise));
    return <React.Fragment key={exercise.id}>{block?.exercises[0] === exercise ? <li className="pt-3 font-semibold">Bloque {block.label}{block.series ? ` — ${block.series} series` : ''}</li> : null}<li className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
    <div className="min-w-0 break-words"><p className="font-medium">{block ? `${block.label}${block.exercises.indexOf(exercise) + 1} — ` : ''}{exercise.exerciseName}</p><p className="mt-1 text-sm text-muted-foreground">{(block ? [formatRoutineRepetitions(exercise.repetitions), exercise.duration && `Tiempo ${formatRoutineDuration(exercise.duration)}`] : [!block && exercise.series && `${exercise.series} series`, exercise.repetitions && `${exercise.repetitions} rep.`, exercise.duration && `Tiempo ${exercise.duration}`, exercise.rest && `Descanso ${exercise.rest}`]).filter(Boolean).join(' · ')}</p>{exercise.notes ? <p className="mt-1 text-sm">{exercise.notes}</p> : null}</div>
    <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Carga indicada</dt><dd className="mt-1 break-words">{(block ? formatRoutineLoad(exercise.load) : exercise.load) || 'Sin indicación'}</dd></div><div><dt className="text-muted-foreground">Peso realizado</dt><dd className="mt-1 font-medium tabular-nums">{trainingWeight(exercise.weightKg)}</dd></div></dl>
  </li></React.Fragment>; })}</ul>;
}
function RecordDetail({ id, api, queryKey, editable }: { id: string; api: TrainingHistoryApi; queryKey: string[]; editable: boolean }): React.JSX.Element {
  const detail = useQuery({ queryKey: [...queryKey, 'detail', id], queryFn: () => api.detail(id) });
  if (detail.isPending) return <p role="status" className="py-3 text-sm">Cargando entrenamiento…</p>;
  if (detail.isError) return <div role="alert"><p>No pudimos cargar el detalle.</p><Button variant="secondary" onClick={() => void detail.refetch()}>Reintentar</Button></div>;
  return <><TrainingRecordDetail record={detail.data}/>{editable ? <Link className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium" href={`/portal/sala/entrenamientos/registrar?recordId=${id}`}>Editar registro</Link> : null}</>;
}
export function TrainingRecordHistory({ api, queryKey, editable = false, legacyOnly = false }: { legacyOnly?: boolean; api: TrainingHistoryApi; queryKey: string[]; editable?: boolean }): React.JSX.Element {
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<string | null>(null);
  const records = useQuery({ queryKey: [...queryKey, 'list', page], queryFn: () => api.list(page) });
  return <section aria-label="Historial de entrenamientos" className="mt-4 rounded-md border bg-white p-4">
    <h4 className="font-semibold">Historial de entrenamientos</h4>
    {records.isPending ? <p role="status" className="mt-3 text-sm">Cargando entrenamientos…</p> : records.isError ? <div role="alert" className="mt-3"><p>No pudimos cargar los entrenamientos.</p><Button variant="secondary" onClick={() => void records.refetch()}>Reintentar</Button></div> : <>
      {records.data.data.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{editable ? 'Todavía no registraste entrenamientos.' : 'No hay entrenamientos registrados.'}</p> : <ul className="mt-2 divide-y">{records.data.data.filter(record => !legacyOnly || record.date !== null).map(record => <li key={record.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm"><span className="font-medium tabular-nums">{recordPeriod(record)}</span> — {record.dayName || `Día ${record.dayPosition}`}</p><Button type="button" variant="secondary" aria-expanded={opened === record.id} aria-controls={`training-${record.id}`} aria-label={`${opened === record.id ? 'Cerrar' : 'Ver'} detalle del período ${recordPeriod(record)} — ${record.dayName || `Día ${record.dayPosition}`}`} onClick={() => setOpened(opened === record.id ? null : record.id)}>{opened === record.id ? 'Cerrar detalle' : 'Ver detalle'}</Button></div>
        {opened === record.id ? <div id={`training-${record.id}`}><RecordDetail id={record.id} api={api} queryKey={queryKey} editable={editable}/></div> : null}
      </li>)}</ul>}
      {records.data.meta.totalPages > 1 ? <nav aria-label="Páginas de entrenamientos" className="mt-4 flex flex-wrap items-center justify-between gap-3"><Button variant="secondary" disabled={page <= 1} onClick={() => { setOpened(null); setPage(page - 1); }}>Anterior</Button><span className="text-sm">Página {page} de {records.data.meta.totalPages}</span><Button variant="secondary" disabled={page >= records.data.meta.totalPages} onClick={() => { setOpened(null); setPage(page + 1); }}>Siguiente</Button></nav> : null}
    </>}
  </section>;
}

export function MonthlyRoutineHistory({ routine, api }: { routine: import('./routine-panel').Routine; api: TrainingHistoryApi }): React.JSX.Element {
  const [month, setMonth] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7));
  const records = useQuery({ queryKey: ['sala-training-records', routine.personId, 'month', month], queryFn: () => api.month!(month), enabled: Boolean(api.month) });
  const weekCount = Math.max(4, ...(records.data ?? []).filter(r => r.routineId === routine.id && r.month === month).map(r => r.weekNumber ?? 0));
  const exerciseRows = (day: typeof routine.days[number]) => {
    const rows = new Map(day.exercises.filter(e => e.id).map(e => [e.id!, { id: e.id!, name: e.exerciseDefinition?.name ?? 'Ejercicio' }]));
    // A retired catalog entry may no longer be in the prescription; its saved
    // snapshots and weights must remain readable in this routine's history.
    for (const record of records.data ?? []) {
      if (record.routineId !== routine.id || record.routineDayId !== day.id || record.month !== month) continue;
      for (const entry of record.exercises) rows.set(entry.routineExerciseId, { id: entry.routineExerciseId, name: entry.exerciseName });
    }
    return [...rows.values()].map(row => ({ ...row, retired: !day.exercises.some(e => e.id === row.id) }));
  };
  return <section aria-label={`Historial de pesos — Rutina ${routine.version}`} className="mt-4 min-w-0 space-y-3">
    <h5 className="font-semibold">Historial de pesos — Rutina {routine.version}</h5>
    <nav aria-label="Mes del historial" className="flex items-center justify-between gap-2"><Button variant="secondary" aria-label="Mes anterior de pesos" disabled={month === '0001-01'} onClick={() => setMonth(shiftTrainingMonth(month, -1))}>‹</Button><span className="text-sm capitalize">{trainingMonthLabel(month)}</span><Button variant="secondary" aria-label="Mes siguiente de pesos" onClick={() => setMonth(shiftTrainingMonth(month, 1))}>›</Button></nav>
    {records.isPending ? <p role="status">Cargando pesos…</p> : records.isError ? <p role="alert">No pudimos cargar los pesos.</p> : routine.days.map(day => <section key={day.id} className="min-w-0"><h6 className="my-2 font-medium">{day.name || `Día ${day.position}`}</h6><div className="max-w-full overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="p-2 text-left">Ejercicio</th>{Array.from({ length: weekCount }, (_, i) => <th key={i} className="p-2 text-right" scope="col">S{i + 1}</th>)}</tr></thead><tbody>{exerciseRows(day).map((exercise, index, rows) => <React.Fragment key={exercise.id}>{exercise.retired && !rows[index - 1]?.retired ? <tr><th colSpan={weekCount + 1} className="pt-4 text-left font-medium">Ejercicios retirados</th></tr> : null}<tr className="border-t"><th className="min-w-36 p-2 text-left font-normal" scope="row">{exercise.name}</th>{Array.from({ length: weekCount }, (_, i) => {
      const record = records.data.find(r => r.routineId === routine.id && r.routineDayId === day.id && r.month === month && r.weekNumber === i + 1);
      const weight = record?.exercises.find(e => e.routineExerciseId === exercise.id)?.weightKg;
      return <td key={i} className="whitespace-nowrap p-2 text-right tabular-nums">{weight == null ? '—' : `${weight.replace('.', ',')} kg`}</td>;
    })}</tr></React.Fragment>)}</tbody></table></div></section>)}
  </section>;
}
