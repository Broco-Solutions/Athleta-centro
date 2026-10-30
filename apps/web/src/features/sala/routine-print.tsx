'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Button } from '@athleta/ui';
import type { RoutineDay, RoutineExercise, ExerciseDefinition } from './routine-editor';

type Props = {
  days: RoutineDay[];
  definitions?: ExerciseDefinition[];
  templateName?: string;
  studentName?: string;
  status?: 'ACTIVE' | 'HISTORICAL';
  version?: number;
  disabled?: boolean;
};

// Keep entries without a position in their original slots, sorting only positioned entries.
function orderedExercises(exercises: RoutineExercise[]): RoutineExercise[] {
  const positioned = exercises.filter(entry => entry.position !== undefined).sort((a, b) => a.position! - b.position!);
  let index = 0;
  return exercises.map(entry => entry.position === undefined ? entry : positioned[index++]!);
}

export function RoutinePrintButton({ days, definitions = [], templateName, studentName, status, version, disabled }: Props): React.JSX.Element {
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
      <header><h1>ATHLETA CENTRO</h1><p>RUTINA DE ENTRENAMIENTO</p></header>
      <div className="routine-print-identification">
        {templateName ? <p>Rutina: {templateName}</p> : studentName ? <><p>Alumno: {studentName}</p>{status && version !== undefined ? <p>Estado: {status === 'ACTIVE' ? 'Activa' : 'Histórica'} · Versión: {version}</p> : null}</> : null}
      </div>
      {[...days].sort((a, b) => a.position - b.position).map((day, dayIndex) => <section key={dayIndex}>
        <h2>{day.name || `Día ${day.position}`}</h2>
        <table>
          <colgroup>{[34, 8, 16, 12, 11, 19].map((width, index) => <col key={index} style={{ width: `${width}%` }}/>)}</colgroup>
          <thead><tr>{['Ejercicio', 'Series', 'Rep./Tiempo', 'Carga', 'Descanso', 'Observaciones'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{orderedExercises(day.exercises).map((exercise, index) => <tr key={index}>
            <td>{exercise.exerciseDefinition?.name || exercise.exerciseName || definitions.find(entry => entry.id === exercise.exerciseDefinitionId)?.name || 'Ejercicio'}{exercise.exerciseDefinition?.description?.trim() ? <p className="routine-print-description">{exercise.exerciseDefinition.description}</p> : null}</td>
            <td>{exercise.series || '-'}</td>
            <td>{[exercise.repetitions ? `${exercise.repetitions} rep.` : '', exercise.duration].filter(Boolean).join(' / ') || '-'}</td>
            <td>{exercise.load || '-'}</td><td>{exercise.rest || '-'}</td><td>{exercise.notes || '-'}</td>
          </tr>)}</tbody>
        </table>
      </section>)}
    </main>, document.body) : null}
  </>;
}
