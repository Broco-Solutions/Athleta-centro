'use client';
import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { RoutineContentSummary, type RoutineDay } from '../../../../features/sala/routine-editor';
import { PortalFrame, portalFetch } from '../../portal-ui';

type RoutineData = {
  routine?: {
    days: RoutineDay[];
  } | null;
};

export default function PortalRoutine(): React.JSX.Element {
  const data = useQuery({ queryKey: ['portal', 'sala'], queryFn: () => portalFetch<RoutineData>('sala') });

  if (data.isLoading) return <PortalFrame title="Mi rutina"><p role="status">Cargando rutina…</p></PortalFrame>;
  if (data.isError || !data.data) return <PortalFrame title="Mi rutina"><Link href="/portal" className="inline-flex min-h-11 items-center gap-2 rounded-md border bg-white px-3 text-sm font-medium hover:bg-surface-muted"><ArrowLeft size={16} aria-hidden="true" />Volver a Inicio</Link><p role="alert" className="mt-4">No pudimos cargar tu rutina. Intentá nuevamente.</p></PortalFrame>;

  const days = data.data.routine?.days ?? [];
  const exerciseCount = days.reduce((total, day) => total + day.exercises.length, 0);
  return <PortalFrame title="Mi rutina">
    <div className="space-y-4"><Link href="/portal/sala/entrenamientos" className="inline-flex min-h-11 items-center rounded-md border bg-white px-3 text-sm font-medium">Mis entrenamientos</Link>
      <Link href="/portal" className="inline-flex min-h-11 items-center gap-2 rounded-md border bg-white px-3 text-sm font-medium hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft size={16} aria-hidden="true" />Volver a Inicio</Link>
      {data.data.routine ? <div>
        <p className="text-sm text-muted-foreground">{days.length} {days.length === 1 ? 'día' : 'días'} · {exerciseCount} {exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}</p>
        <RoutineContentSummary days={days} dayAction={day => day.id ? <Link href={`/portal/sala/entrenamientos/registrar?dayId=${day.id}`} className="mt-2 inline-flex min-h-11 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground" aria-label={`Registrar este día: ${day.name || `Día ${day.position}`}`}>Registrar este día</Link> : null}/>
      </div> : <p className="text-sm text-muted-foreground">No hay una rutina activa.</p>}
    </div>
  </PortalFrame>;
}
