'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Button } from '@athleta/ui';
import { formatOperationalDate, todayOperational } from '../../lib/operational-date';
import { formatRoutineDuration, formatRoutineRepetitions, groupRoutineBlocks, isGroupedDay } from './routine-blocks';
import type { RoutineDay, RoutineExercise, ExerciseDefinition } from './routine-editor';

type Props = {
  days: RoutineDay[];
  definitions?: ExerciseDefinition[];
  templateName?: string;
  studentName?: string;
  studentDetails?: { birthDate?: string | null; sport?: string | null } | undefined;
  objective?: string | null | undefined;
  effectiveFrom?: string | undefined;
  effectiveUntil?: string | null | undefined;
  status?: 'ACTIVE' | 'HISTORICAL' | 'SCHEDULED';
  version?: number;
  disabled?: boolean;
};

// Keep entries without a position in their original slots, sorting only positioned entries.
function orderedExercises(exercises: RoutineExercise[]): RoutineExercise[] {
  const positioned = exercises.filter(entry => entry.position !== undefined).sort((a, b) => a.position! - b.position!);
  let index = 0;
  return exercises.map(entry => entry.position === undefined ? entry : positioned[index++]!);
}

export function RoutinePrintButton({ days, definitions = [], templateName, studentName, studentDetails, objective, effectiveFrom, effectiveUntil, status, version, disabled }: Props): React.JSX.Element {
  const weeks = ['S1', 'S2', 'S3', 'S4'];
  const sortedDays = [...days].sort((a, b) => a.position - b.position);
  const columns = days.length === 4 ? 2 : Math.min(3, Math.max(1, days.length));
  const dayRows = Array.from({ length: Math.ceil(days.length / columns) }, (_, index) => sortedDays.slice(index * columns, (index + 1) * columns));
  const blank = <span className="routine-print-blank" aria-label="Completar a mano"/>;
  const birthDate = studentDetails?.birthDate;
  const today = todayOperational();
  const age = birthDate ? Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4)) - (today.slice(5) < birthDate.slice(5, 10) ? 1 : 0) : null;
  const [printing, setPrinting] = useState(false);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => { cleanup.current?.(); }, []);
  const print = () => {
    if (disabled || cleanup.current) return;
    const finish = () => {
      window.removeEventListener('afterprint', finish);
      cleanup.current = null;
      setPrinting(false);
    };
    cleanup.current = () => window.removeEventListener('afterprint', finish);
    window.addEventListener('afterprint', finish);
    try {
      flushSync(() => setPrinting(true));
      window.print();
    } catch {
      finish();
    }
  };
  return <>
    <Button type="button" variant="secondary" disabled={disabled || printing} onClick={print}>Imprimir / PDF</Button>
    {printing ? createPortal(<main id="athleta-routine-print-root">
      <header><h1>ATHLETA CENTRO</h1><p>FICHA DE ENTRENAMIENTO</p></header>
      <div className="routine-print-identification">
        {templateName !== undefined ? <>
          <p className="routine-print-wide">Rutina: {templateName}</p>
          <p className="routine-print-wide">Alumno: {blank}</p>
          <p>Objetivo: {blank}</p><p>Inicio: {blank}</p><p>Cambio: {blank}</p>
        </> : <>
          <p className="routine-print-wide">Alumno: {studentName || blank}</p>
          <p>Edad: {age !== null && age >= 0 ? `${age} años` : blank}</p>
          <p>Deporte: {studentDetails?.sport || blank}</p>
          <p className="routine-print-wide">Objetivo: {objective || blank}</p>
          <p>Inicio: {effectiveFrom ? formatOperationalDate(effectiveFrom) : blank}</p>
          <p>Cambio: {effectiveUntil ? formatOperationalDate(effectiveUntil) : blank}</p>
          <p>Pago: {blank}</p>
          {status && version !== undefined ? <p>Estado: {status === 'ACTIVE' ? 'Activa' : status === 'SCHEDULED' ? 'Programada' : 'Histórica'} · Versión: {version}</p> : null}
        </>}
      </div>
      <p className="routine-print-legend">S1–S4: peso utilizado en kg</p>
      <div className="routine-print-days" data-columns={columns}>
      {dayRows.map((row, rowIndex) => <div className="routine-print-day-row" key={rowIndex}>
      {row.map((day, dayIndex) => <section key={dayIndex} className="routine-print-day">
        <h2>{day.name || `Día ${day.position}`}</h2>
        {(isGroupedDay(day.exercises) ? groupRoutineBlocks(orderedExercises(day.exercises)) : [{ position: 0, label: '', series: null, exercises: orderedExercises(day.exercises) }]).map(block => <div key={block.position} className="routine-print-block">
        <table>
          <colgroup><col/><col className="routine-print-prescription"/>{weeks.map(week => <col key={week} className="routine-print-week"/>)}</colgroup>
          <thead>
            {block.position > 0 ? <tr><th colSpan={6} className="routine-print-block-title"><h3>Bloque {block.label}{block.series ? ` — ${block.series} series` : ''}</h3></th></tr> : null}
            <tr>{['Ejercicio', 'Rep./Tiempo', ...weeks].map(label => <th scope="col" key={label}>{label}</th>)}</tr>
          </thead>
          <tbody>{block.exercises.map((exercise, index) => <tr key={index}>
            <td>{block.position ? `${block.label}${index + 1} — ` : ''}{exercise.exerciseDefinition?.name || exercise.exerciseName || definitions.find(entry => entry.id === exercise.exerciseDefinitionId)?.name || 'Ejercicio'}</td>
            <td>{!block.position ? `${exercise.series || '—'} series · ` : ''}{[formatRoutineRepetitions(exercise.repetitions), formatRoutineDuration(exercise.duration)].filter(Boolean).join(' / ') || '—'}</td>
            {weeks.map(week => <td key={week} className="routine-print-weight" aria-label={`${week}: peso utilizado`}/>)}
          </tr>)}</tbody>
        </table></div>)}
      </section>)}
      </div>)}
      </div>
    </main>, document.body) : null}
  </>;
}
