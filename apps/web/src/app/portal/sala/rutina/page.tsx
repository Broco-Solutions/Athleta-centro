'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getPortalTrainingContext } from '@athleta/api-client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@athleta/ui';
import { MonthlyTraining } from '../../../../features/sala/portal-training-form';
import { portalTrainingMonth, trainingResponse } from '../../../../features/sala/training-record-api';
import { initialTrainingRoutine, shiftTrainingMonth, trainingMonthLabel, trainingMonthRoutines, trainingPeriodLabel } from '../../../../features/sala/training-month';
import { PortalFrame } from '../../portal-ui';

export default function PortalRoutine(): React.JSX.Element {
  const [month, setMonth] = useState('');
  const [selectedRoutineId, setSelectedRoutineId] = useState('');
  const [selectedDayId, setSelectedDayId] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const context = useQuery({ queryKey: ['portal', 'training-context', 'routine'], queryFn: async () => trainingResponse(await getPortalTrainingContext(undefined, { credentials: 'include' })).data, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const operationalToday = context.data?.today ?? '';
  const currentMonth = operationalToday.slice(0, 7);
  const viewedMonth = month || currentMonth;
  const routines = context.data?.routines ?? [];
  const periods = viewedMonth ? trainingMonthRoutines(routines, viewedMonth) : [];
  const routineId = selectedRoutineId || (viewedMonth ? initialTrainingRoutine(routines, viewedMonth, operationalToday) : '');
  const period = periods.find(p => p.routine.id === routineId);
  const routine = period?.routine;
  const day = routine?.days.find(d => d.id === selectedDayId) ?? routine?.days[0];
  // Pin the initial choice once loaded. Refetches must never change the editing context.
  useEffect(() => {
    if (!month && context.data) {
      setMonth(context.data.today.slice(0, 7));
      setSelectedRoutineId(initialTrainingRoutine(context.data.routines, context.data.today.slice(0, 7), context.data.today));
    }
  }, [month, context.data]);
  const monthly = useQuery({ queryKey: ['portal', 'training-records', 'month', viewedMonth], enabled: Boolean(viewedMonth), queryFn: () => portalTrainingMonth(viewedMonth) });
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const canNavigate = () => !saving && (!dirty || window.confirm('Tenés pesos sin guardar. ¿Querés descartarlos y continuar?'));
  const changeMonth = (value: string) => {
    if (!canNavigate()) return;
    setDirty(false); setMonth(value); setSelectedRoutineId(initialTrainingRoutine(routines, value, operationalToday)); setSelectedDayId('');
  };
  return <div className="pb-[calc(5rem+env(safe-area-inset-bottom))]"><PortalFrame title="Mi rutina" backToHome>
    <div className="mx-auto min-w-0 max-w-3xl space-y-5 pb-[calc(7rem+env(safe-area-inset-bottom))]" onClickCapture={event => {
      if (event.target instanceof Element && event.target.closest('a') && !canNavigate()) { event.preventDefault(); event.stopPropagation(); }
    }}>
      {viewedMonth ? <section aria-label="Mes de entrenamientos" className="rounded-md border bg-white p-3"><div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2"><Button variant="secondary" className="min-h-11 px-0" aria-label="Mes anterior" disabled={saving || viewedMonth === '0001-01'} onClick={() => changeMonth(shiftTrainingMonth(viewedMonth, -1))}><ChevronLeft size={20} aria-hidden="true"/></Button><div className="min-w-0 text-center"><h2 className="font-semibold capitalize" aria-live="polite">{trainingMonthLabel(viewedMonth)}</h2><p className="mt-1 text-xs text-muted-foreground">{viewedMonth === currentMonth ? 'Mes actual' : 'Historial · Registro disponible'}</p></div><Button variant="secondary" className="min-h-11 px-0" aria-label="Mes siguiente" disabled={saving || viewedMonth === '9999-12'} onClick={() => changeMonth(shiftTrainingMonth(viewedMonth, 1))}><ChevronRight size={20} aria-hidden="true"/></Button></div>{viewedMonth !== currentMonth ? <button type="button" className="mx-auto mt-2 block min-h-11 text-sm text-muted-foreground underline" disabled={saving} onClick={() => changeMonth(currentMonth)}>Volver al mes actual</button> : null}</section> : null}
      {context.isPending ? <p role="status">Cargando rutina…</p> : context.isError ? <p role="alert">No pudimos cargar tu rutina. Intentá nuevamente.</p> : null}
      {periods.length > 1 ? <section aria-label="Períodos de rutina" className="min-w-0 space-y-3"><h2 className="text-sm font-medium">Rutinas correspondientes a {trainingMonthLabel(viewedMonth).split(' ')[0]}</h2><div className={periods.length === 2 ? 'grid grid-cols-2 gap-3' : 'flex max-w-full gap-3 overflow-x-auto pb-1'}>{periods.map(p => <button key={p.routine.id} type="button" aria-pressed={routineId === p.routine.id} disabled={saving} onClick={() => {
        if (p.routine.id !== routineId && canNavigate()) { setDirty(false); setSelectedRoutineId(p.routine.id); setSelectedDayId(''); }
      }} className={`min-h-16 min-w-0 rounded-md border-2 bg-white p-3 text-left text-sm text-[#171717] focus-visible:ring-2 focus-visible:ring-ring ${periods.length > 2 ? 'w-44 shrink-0' : ''} ${routineId === p.routine.id ? 'border-[#FCCC05] font-semibold' : 'border-gray-200'}`}><span className="block">{trainingPeriodLabel(p.from, p.until, viewedMonth)}</span><span className="mt-1 block">Rutina {p.routine.version}</span></button>)}</div></section> : null}
      {routine && day ? <section aria-label="Día seleccionado" className="min-w-0 space-y-4"><h2 className="text-lg font-semibold">Rutina {routine.version}{period && viewedMonth === currentMonth && period.from <= operationalToday && (!period.until || period.until > operationalToday) ? ' · Período vigente' : ''}</h2>{period?.retrospective ? <p className="text-sm text-muted-foreground">Carga de historial anterior</p> : null}<h3 className="font-medium">{day.name || `Día ${day.position}`}</h3>
        {!day.exercises.length ? <p>No hay ejercicios asignados a este día</p> : monthly.isPending ? <p role="status">Cargando pesos del mes…</p> : monthly.isError ? <div role="alert"><p>No pudimos cargar los entrenamientos del mes.</p><Button variant="secondary" onClick={() => void monthly.refetch()}>Reintentar</Button></div> : <MonthlyTraining key={`${viewedMonth}-${routine.id}-${day.id}`} routineId={routine.id} day={day} month={viewedMonth} records={monthly.data} onDirtyChange={setDirty} onPendingChange={setSaving}/>}
      </section> : !context.isPending && !context.isError ? <p>No hay una rutina vigente para este período.</p> : null}
      <Link className="inline-flex min-h-11 items-center rounded-md border bg-white px-3 text-sm font-medium" href="/portal/sala/entrenamientos">Mis entrenamientos</Link>
      {routine?.days.length ? <nav aria-label="Días de la rutina" className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-3xl gap-2 overflow-x-auto border-t bg-white px-4 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>{routine.days.map(entry => <button key={entry.id} type="button" aria-pressed={day?.id === entry.id} disabled={saving} className={`min-h-11 min-w-24 flex-1 shrink-0 rounded-md px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring ${day?.id === entry.id ? 'bg-primary text-primary-foreground' : 'bg-surface-muted'}`} onClick={() => { if (entry.id !== day?.id && canNavigate()) { setDirty(false); setSelectedDayId(entry.id); } }}>{entry.name || `Día ${entry.position}`}</button>)}</nav> : null}
    </div>
  </PortalFrame></div>;
}
