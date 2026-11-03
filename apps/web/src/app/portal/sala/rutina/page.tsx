'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getPortalTrainingContext } from '@athleta/api-client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@athleta/ui';
import { WeeklyTraining, type TrainingPeriod } from '../../../../features/sala/portal-training-form';
import { portalTrainingMonth, trainingDate, trainingResponse, trainingWeight } from '../../../../features/sala/training-record-api';
import { shiftTrainingMonth, trainingMonthDays, trainingMonthLabel, trainingMonthWeeks, trainingViewMonths, weeklyTrainingRecords, type TrainingMonthDay } from '../../../../features/sala/training-month';
import { PortalFrame, today } from '../../portal-ui';

function ExerciseEvolution({ day, exerciseId, month, period }: { day: TrainingMonthDay; exerciseId: string; month: string; period?: TrainingPeriod }): React.JSX.Element {
  const source = day.exercises.find(exercise => exercise.id === exerciseId)!;
  const sourceId = 'routineExerciseId' in source ? source.routineExerciseId : source.id;
  return <section aria-label={`Evolución semanal de ${source.exerciseName}`} className="space-y-3">
    <h4 className="text-sm font-medium text-muted-foreground">Pesos por semana</h4>
    <ul className="space-y-2">{trainingMonthWeeks(month).map(week => {
      const entries = weeklyTrainingRecords(day.records, week);
      const weight = (record: typeof entries[number]) => record.exercises.find(exercise => exercise.routineExerciseId === sourceId)?.weightKg ?? null;
      const reference = entries[0];
      const current = period?.weekStart === week.start;
      const summary = <><span className="min-w-0"><span className="block text-sm font-medium">Semana {week.number}{current ? <span className="ml-2 text-xs text-muted-foreground">Seleccionada</span> : null}</span><span className="mt-1 block text-xs text-muted-foreground tabular-nums">{trainingDate(week.start).slice(0, 5)} – {trainingDate(week.end).slice(0, 5)}</span></span><span className={`shrink-0 text-right tabular-nums ${reference ? 'font-semibold' : 'text-sm text-muted-foreground'}`}>{trainingWeight(reference ? weight(reference) : null)}</span></>;
      return <li key={week.start} aria-current={current ? 'date' : undefined} className={`rounded-md border bg-white p-3 ${current ? 'border-primary!' : ''}`}>
        {period ? <button type="button" aria-label={`Semana ${week.number}`} aria-pressed={current} onClick={() => period.selectWeek(week)} className="flex min-h-11 w-full items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">{summary}</button> : <div className="flex items-center justify-between gap-3">{summary}</div>}
        {period && current ? <div className="mt-3">{period.controls}</div> : null}

        {entries.length > 1 ? <details className="mt-1 text-sm"><summary className="min-h-11 cursor-pointer content-center text-muted-foreground">Ver {entries.length} registros</summary><ul>{entries.map(record => <li key={record.id} className="flex items-center justify-between gap-3"><Link className="inline-flex min-h-11 items-center underline" aria-label={`Corregir entrenamiento del ${trainingDate(record.date)}`} href={`/portal/sala/entrenamientos/registrar?recordId=${record.id}`}>{trainingDate(record.date)}</Link><span className="tabular-nums">{trainingWeight(weight(record))}</span></li>)}</ul></details> : null}
      </li>;
    })}</ul>
      {!period?.weekStart ? <div hidden>{period?.controls}</div> : null}
  </section>;
}

export default function PortalRoutine(): React.JSX.Element {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [selected, setSelected] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const context = useQuery({ queryKey: ['portal', 'training-context', 'routine'], queryFn: async () => trainingResponse(await getPortalTrainingContext(undefined, { credentials: 'include' })).data, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const monthly = useQuery({ queryKey: ['portal', 'training-records', 'weeks', month, context.data?.today], enabled: !context.isPending, queryFn: async () => {
    const weeks = trainingMonthWeeks(month);
    const results = await Promise.all(trainingViewMonths(month, context.data?.today ?? today()).map(portalTrainingMonth));
    return [...new Map(results.flat().filter(record => record.date >= weeks[0]!.start && record.date <= weeks.at(-1)!.end).map(record => [record.id, record])).values()];
  } });
  const currentMonth = (context.data?.today ?? today()).slice(0, 7);
  // Saved snapshots stay separate. Offer the active prescription only if this month has valid dates.
  const active = context.data?.routine;
  const availableRoutine = active && active.createdOn < `${shiftTrainingMonth(month, 1)}-01` ? active : null;
  const days = trainingMonthDays(monthly.data ?? [], availableRoutine);
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
  return <div className="pb-[calc(5rem+env(safe-area-inset-bottom))]"><PortalFrame title="Mi rutina" backToHome>
    <div className="mx-auto min-w-0 max-w-3xl space-y-5 pb-[calc(6rem+env(safe-area-inset-bottom))]" onClickCapture={event => {
      if (event.target instanceof Element && event.target.closest('a') && !canNavigate()) { event.preventDefault(); event.stopPropagation(); }
    }}>
      <section aria-label="Mes de entrenamientos" className="rounded-md border bg-white p-3">
        <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2"><Button variant="secondary" className="min-h-11 px-0" aria-label="Mes anterior" disabled={saving || month === '0001-01'} onClick={() => changeMonth(shiftTrainingMonth(month, -1))}><ChevronLeft size={20} aria-hidden="true"/></Button><div className="min-w-0 text-center"><h2 className="font-semibold capitalize" aria-live="polite">{trainingMonthLabel(month)}</h2><p className="mt-1 text-xs text-muted-foreground">{month === currentMonth ? 'Mes actual' : availableRoutine ? 'Historial · Registro disponible' : 'Historial'}</p></div><Button variant="secondary" className="min-h-11 px-0" aria-label="Mes siguiente" disabled={saving} onClick={() => changeMonth(shiftTrainingMonth(month, 1))}><ChevronRight size={20} aria-hidden="true"/></Button></div>
        {month !== currentMonth ? <button type="button" className="mx-auto mt-2 block min-h-11 text-sm text-muted-foreground underline disabled:opacity-50" disabled={saving} onClick={() => changeMonth(currentMonth)}>Volver al mes actual</button> : null}
      </section>
      {context.isPending ? <p role="status">Cargando rutina…</p> : context.isError ? <p role="alert">No pudimos cargar tu rutina. Intentá nuevamente.</p> : null}
      {monthly.isPending ? <p role="status">Cargando evolución mensual…</p> : monthly.isError ? <div role="alert"><p>No pudimos cargar los entrenamientos del mes.</p><Button variant="secondary" onClick={() => void monthly.refetch()}>Reintentar</Button></div> : null}
      {day ? <section aria-label="Día seleccionado" className="min-w-0 space-y-4">
        <h2 className="break-words text-lg font-semibold">{label(day)}</h2>
        <WeeklyTraining key={`${month}-${day.key}`} day={day} month={month} today={context.data?.today ?? today()} createdOn={availableRoutine?.createdOn ?? ''} onDirtyChange={setDirty} onPendingChange={setSaving} renderHistory={(id, period) => monthly.isSuccess ? <ExerciseEvolution day={day} exerciseId={id} month={month} period={period}/> : null}/>

      </section> : !monthly.isPending && !monthly.isError ? <p>{month === currentMonth ? 'No hay una rutina activa ni entrenamientos registrados en este mes.' : 'No hay entrenamientos registrados en este mes.'}</p> : null}
      <div className="flex flex-wrap gap-3"><Link className="inline-flex min-h-11 items-center rounded-md border bg-white px-3 text-sm font-medium" href="/portal/sala/entrenamientos">Mis entrenamientos</Link></div>
      {days.length ? <nav aria-label="Días de la rutina" className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-3xl gap-2 overflow-x-auto border-t bg-white px-4 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>{days.map(entry => <button key={entry.key} type="button" aria-label={label(entry)} title={label(entry)} aria-pressed={day?.key === entry.key} disabled={saving} className={`min-h-11 min-w-24 max-w-48 flex-1 shrink-0 rounded-md px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring ${day?.key === entry.key ? 'bg-primary text-primary-foreground' : 'bg-surface-muted'}`} onClick={() => { if (entry.key !== day?.key && canNavigate()) { setDirty(false); setSelected(entry.key); } }}><span className="block truncate">{name(entry)}</span>{!entry.active ? <span className="block text-xs">Histórica · V{days.filter(item => !item.active).indexOf(entry) + 1}</span> : null}</button>)}</nav> : null}
    </div>
  </PortalFrame></div>;
}
