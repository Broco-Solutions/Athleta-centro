'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getPortalTrainingContext } from '@athleta/api-client';
import { Button } from '@athleta/ui';
import { NewTraining } from '../../../../features/sala/portal-training-form';
import { TrainingWeightsForm } from '../../../../features/sala/training-weights-form';
import { portalTrainingMonth, trainingDate, trainingResponse, trainingWeight } from '../../../../features/sala/training-record-api';
import { shiftTrainingMonth, trainingMonthDays, trainingMonthLabel, trainingMonthWeeks, type TrainingMonthDay } from '../../../../features/sala/training-month';
import { PortalFrame, today } from '../../portal-ui';

function ExerciseEvolution({ day, exerciseId, month }: { day: TrainingMonthDay; exerciseId: string; month: string }): React.JSX.Element {
  const source = day.exercises.find(exercise => exercise.id === exerciseId)!;
  const sourceId = 'routineExerciseId' in source ? source.routineExerciseId : source.id;
  return <table className="w-full table-fixed text-left text-sm" aria-label={`Evolución semanal de ${source.exerciseName}`}>
    <thead><tr><th className="w-[42%] py-2 font-medium" scope="col">Semana</th><th className="w-[23%] py-2 font-medium" scope="col">Fecha</th><th className="py-2 font-medium" scope="col">Peso</th></tr></thead>
    <tbody>{trainingMonthWeeks(month).map(week => {
      const entries = day.records.filter(record => record.date.slice(0, 7) === month && record.date >= week.start && record.date <= week.end);
      return <tr key={week.start} className="border-t align-top">
        <th scope="row" className="py-2 pr-2 font-normal">Semana {week.number}<span className="block text-xs text-muted-foreground">{trainingDate(week.start).slice(0, 5)} – {trainingDate(week.end).slice(0, 5)}</span></th>
        <td className="py-2 pr-2 tabular-nums">{entries.length ? entries.map(record => <div key={record.id} className="min-h-11"><Link className="inline-flex min-h-11 items-center underline" aria-label={`Corregir entrenamiento del ${trainingDate(record.date)}`} href={`/portal/sala/entrenamientos/registrar?recordId=${record.id}`}>{trainingDate(record.date).slice(0, 5)}</Link></div>) : '—'}</td>
        <td className="break-words py-2 tabular-nums">{entries.length ? entries.map(record => <div key={record.id} className="flex min-h-11 items-center">{trainingWeight(record.exercises.find(exercise => exercise.routineExerciseId === sourceId)?.weightKg ?? null)}</div>) : 'Sin registro'}</td>
      </tr>;
    })}</tbody>
  </table>;
}

export default function PortalRoutine(): React.JSX.Element {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [selected, setSelected] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const context = useQuery({ queryKey: ['portal', 'training-context', 'routine'], queryFn: async () => trainingResponse(await getPortalTrainingContext(undefined, { credentials: 'include' })).data, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const monthly = useQuery({ queryKey: ['portal', 'training-records', 'month', month], queryFn: () => portalTrainingMonth(month) });
  const currentMonth = (context.data?.today ?? today()).slice(0, 7);
  // Previous months are reconstructed only from saved snapshots, including when no routine is active.
  const days = trainingMonthDays(monthly.data ?? [], month === currentMonth ? context.data?.routine ?? null : null);
  const day = days.find(entry => entry.key === selected) ?? days[0];
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const canNavigate = () => !saving && (!dirty || window.confirm('Tenés pesos sin guardar. ¿Querés descartarlos y continuar?'));
  const changeMonth = (value: string) => { if (canNavigate()) { setDirty(false); setSelected(''); setMonth(value); } };
  const name = (entry: TrainingMonthDay) => entry.name || `Día ${entry.position}`;
  const label = (entry: TrainingMonthDay) => {
    if (entry.active) return name(entry);
    const first = entry.records[0]!, last = entry.records[entry.records.length - 1]!;
    return `${name(entry)} · Histórica ${trainingDate(first.date).slice(0, 5)}${last.date === first.date ? '' : ` – ${trainingDate(last.date).slice(0, 5)}`} · Versión ${days.filter(item => !item.active).indexOf(entry) + 1}`;
  };
  return <PortalFrame title="Mi rutina" backToHome>
    <div className="min-w-0 space-y-5" onClickCapture={event => {
      if (event.target instanceof Element && event.target.closest('a') && !canNavigate()) { event.preventDefault(); event.stopPropagation(); }
    }}>
      <div className="flex flex-wrap gap-3"><Link className="inline-flex min-h-11 items-center rounded-md border bg-white px-3 text-sm font-medium" href="/portal/sala/entrenamientos">Mis entrenamientos</Link><Link className="inline-flex min-h-11 items-center rounded-md border bg-white px-3 text-sm font-medium" href="/portal/sala/entrenamientos/registrar">Registrar otra fecha</Link></div>
      <section aria-label="Mes de entrenamientos" className="space-y-2">
        <div className="flex min-w-0 items-center justify-between gap-2"><Button variant="secondary" aria-label="Mes anterior" disabled={saving || month === '0001-01'} onClick={() => changeMonth(shiftTrainingMonth(month, -1))}>‹</Button><h2 className="text-center font-semibold capitalize" aria-live="polite">{trainingMonthLabel(month)}</h2><Button variant="secondary" aria-label="Mes siguiente" disabled={saving || month >= currentMonth} onClick={() => changeMonth(shiftTrainingMonth(month, 1))}>›</Button></div>
        {month !== currentMonth ? <Button variant="secondary" disabled={saving} onClick={() => changeMonth(currentMonth)}>Volver al mes actual</Button> : null}
      </section>
      {context.isPending ? <p role="status">Cargando rutina…</p> : context.isError ? <p role="alert">No pudimos cargar tu rutina. Intentá nuevamente.</p> : null}
      {monthly.isPending ? <p role="status">Cargando evolución mensual…</p> : monthly.isError ? <div role="alert"><p>No pudimos cargar los entrenamientos del mes.</p><Button variant="secondary" onClick={() => void monthly.refetch()}>Reintentar</Button></div> : null}
      {day ? <section aria-label="Día seleccionado" className="min-w-0 space-y-4">
        <h2 className="break-words text-lg font-semibold">{label(day)}</h2>
        {day.active && context.data ? <NewTraining key={day.key} embedded initial={context.data} selectedDay={day.routineDayId} onDirtyChange={setDirty} onPendingChange={setSaving} renderHistory={id => monthly.isSuccess ? <ExerciseEvolution day={day} exerciseId={id} month={month}/> : null}/> : <TrainingWeightsForm key={day.key} readOnly exercises={day.exercises} pending={false} onSave={async () => {}} renderHistory={id => <ExerciseEvolution day={day} exerciseId={id} month={month}/>}/>}
      </section> : !monthly.isPending && !monthly.isError ? <p>{month === currentMonth ? 'No hay una rutina activa ni entrenamientos registrados en este mes.' : 'No hay entrenamientos registrados en este mes.'}</p> : null}
      {days.length ? <nav aria-label="Días de la rutina" className="sticky bottom-0 z-10 flex max-w-full gap-2 overflow-x-auto border-t bg-white py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>{days.map(entry => <button key={entry.key} type="button" aria-pressed={day?.key === entry.key} disabled={saving} className={`min-h-11 shrink-0 rounded-md px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring ${day?.key === entry.key ? 'bg-primary text-primary-foreground' : 'bg-surface-muted'}`} onClick={() => { if (entry.key !== day?.key && canNavigate()) { setDirty(false); setSelected(entry.key); } }}>{label(entry)}</button>)}</nav> : null}
    </div>
  </PortalFrame>;
}
