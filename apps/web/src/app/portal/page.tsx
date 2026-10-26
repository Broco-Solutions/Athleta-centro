'use client';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { RoutineDay } from '../../features/sala/routine-editor';
import { PortalApiError, PortalFrame, portalFetch, formatDate, formatTime, type ReplacementWeek } from './portal-ui';

type FixedBooking = { id: string; endDate?: string | null; startTime?: string; scheduleSlot?: { id: string; weekday: string } | null };
type SalaData = { replacementWeeks: ReplacementWeek[]; fixed: FixedBooking[]; routine?: { days: RoutineDay[] } | null; evaluations: Array<{ id: string; evaluationDate: string; results: Array<{ resultText: string; testDefinition: { id: string; name: string } }> }>; validity: { hasValidAccess: boolean; validUntil: string | null } };
const weekdays = [{ value: 'MONDAY', label: 'Lunes', short: 'Lun' }, { value: 'TUESDAY', label: 'Martes', short: 'Mar' }, { value: 'WEDNESDAY', label: 'Miércoles', short: 'Mié' }, { value: 'THURSDAY', label: 'Jueves', short: 'Jue' }, { value: 'FRIDAY', label: 'Viernes', short: 'Vie' }, { value: 'SATURDAY', label: 'Sábado', short: 'Sáb' }, { value: 'SUNDAY', label: 'Domingo', short: 'Dom' }];
const weekdayLabel = (value?: string): string => weekdays.find(item => item.value === value)?.label ?? '';
export default function PortalHome(): React.JSX.Element {
  const data = useQuery({ queryKey: ['portal', 'sala'], queryFn: () => portalFetch<SalaData>('sala'), retry: false });
  const sala = data.data ? { ...data.data, fixed: data.data.fixed.filter(item => !item.endDate) } : null;
  const routineDays = sala?.routine?.days ?? [];
  const routineExerciseCount = routineDays.reduce((total, day) => total + day.exercises.length, 0);
  return <PortalFrame title="Inicio">
    {data.isLoading ? <p role="status">Cargando Sala…</p> : null}
    {data.isError && !(data.error instanceof PortalApiError && data.error.code === 'PORTAL_SALA_UNAVAILABLE') ? <p role="alert">No pudimos cargar Sala.</p> : null}
    {sala ? <>
    {sala.replacementWeeks?.some(week => week.available > 0) ? <section className="rounded-lg border border-primary/40 bg-primary/10 p-4">
      <h2 className="text-lg font-semibold">Turno disponible para reprogramar</h2>
      <p className="mt-2 text-sm">Cancelaste una fecha de uno de tus turnos fijos. Podés elegir otro horario dentro de la semana habilitada.</p>
      <Link href="/portal/sala/reservar" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Elegir otro horario<ArrowRight size={16} aria-hidden="true" /></Link>
    </section> : null}
    <section id="turnos-fijos" className="rounded-lg border bg-white p-4">
      <h2 className="text-lg font-semibold">Mis turnos fijos</h2>
      {sala.fixed.length ? <ul className="mt-3 divide-y">{sala.fixed.map(item => <li key={item.id} className="py-3 text-sm">{weekdayLabel(item.scheduleSlot?.weekday)} · {item.startTime ? formatTime(item.startTime) : ''}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No tenés turnos fijos.</p>}
      <Link href="/portal/sala/reservas" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Ver próximos turnos<ArrowRight size={16} aria-hidden="true" /></Link>
    </section>
    <section id="rutina" className="rounded-lg border border-border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Mi rutina</h2>{sala.routine ? <p className="mt-1 text-sm text-muted-foreground">{routineDays.length} {routineDays.length === 1 ? 'día' : 'días'} · {routineExerciseCount} {routineExerciseCount === 1 ? 'ejercicio' : 'ejercicios'}</p> : null}</div>{sala.routine ? <div className="flex flex-wrap gap-2"><Link href="/portal/sala/entrenamientos/registrar" className="inline-flex min-h-11 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">Registrar entrenamiento</Link><Link href="/portal/sala/rutina" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Ver rutina<ArrowRight size={16} aria-hidden="true" /></Link></div> : null}</div>
      {!sala.routine ? <p className="mt-2 text-sm text-muted-foreground">No hay una rutina activa.</p> : null}
    </section><section id="evaluaciones" className="rounded-lg border bg-white p-4"><h2 className="text-lg font-semibold">Mis evaluaciones físicas</h2><PhysicalResults evaluations={sala.evaluations} /></section><section className="rounded-lg border bg-white p-4"><h2 className="text-lg font-semibold">Vigencia de Sala</h2><p className="mt-2 text-sm">{sala.validity.hasValidAccess ? `Vigente hasta ${formatDate(sala.validity.validUntil!)}` : 'Sin vigencia'}</p></section>
    </> : null}
  </PortalFrame>;
}

function PhysicalResults({ evaluations }: { evaluations: SalaData['evaluations'] }): React.JSX.Element {
  const groups = new Map<string, { name: string; results: Array<{ date: string; text: string }> }>();
  for (const evaluation of [...evaluations].sort((a, b) => a.evaluationDate.localeCompare(b.evaluationDate))) {
    for (const result of evaluation.results) {
      const group = groups.get(result.testDefinition.id) ?? { name: result.testDefinition.name, results: [] };
      group.results.push({ date: evaluation.evaluationDate, text: result.resultText });
      groups.set(result.testDefinition.id, group);
    }
  }
  return groups.size ? <>{[...groups].map(([id, group]) => <article key={id} className="border-b py-3 text-sm"><h3 className="font-semibold">{group.name}</h3><ul className="mt-2 space-y-1">{group.results.map((result, index) => <li key={index}>{formatDate(result.date)} · {result.text}</li>)}</ul></article>)}</> : <p className="mt-2 text-sm text-muted-foreground">No hay evaluaciones físicas.</p>;
}
