import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { RoutinePrintButton } from './routine-print';
import type { RoutineDay } from './routine-editor';

const days: RoutineDay[] = [
  { position: 2, exercises: [{ exerciseDefinitionId: 'catalog' }] },
  { position: 1, name: 'Fuerza', exercises: [
    { position: 2, exerciseDefinitionId: 'old', exerciseName: 'Guardado', series: '4', repetitions: '10', duration: '45 s', load: '40', rest: '90 s', notes: 'Controlar' },
    { position: 1, exerciseDefinitionId: 'retired', exerciseDefinition: { name: 'Retirado', description: 'Descripción', isActive: false } },
  ] },
];
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function start(props: Partial<React.ComponentProps<typeof RoutinePrintButton>> = {}) {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {
    expect(document.getElementById('athleta-routine-print-root')?.parentElement).toBe(document.body);
  });
  const result = render(<RoutinePrintButton days={days} {...props}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Imprimir / PDF' }));
  return { ...result, print, root: within(document.getElementById('athleta-routine-print-root')!) };
}
it('prints a semantic template document synchronously without HTTP or input mutation', () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  const original = JSON.stringify(days);
  const { print, root } = start({ templateName: 'Modelo', studentName: 'No incluir', definitions: [{ id: 'catalog', name: 'Catálogo', isActive: false }] });
  expect(print).toHaveBeenCalledTimes(1);
  expect(root.getByText('ATHLETA CENTRO')).toBeInTheDocument();
  expect(root.getByText('FICHA DE ENTRENAMIENTO')).toBeInTheDocument();
  expect(root.getByText('Rutina: Modelo')).toBeInTheDocument();
  expect(root.getByText('Alumno:')).toBeInTheDocument();
  expect(root.queryByText(/No incluir/)).not.toBeInTheDocument();
  expect(root.getAllByRole('heading', { level: 2 }).map(node => node.textContent)).toEqual(['Fuerza', 'Día 2']);
  expect(root.getAllByRole('row')[1]).toHaveTextContent('Retirado');
  for (const text of ['Guardado', '4 series · 10 rep. / 45 s', 'Catálogo']) expect(root.getByText(text)).toBeInTheDocument();
  for (const text of ['Descripción', 'Carga indicada: 40 kg', 'Descanso: 90 s', 'Controlar']) expect(root.queryByText(text)).not.toBeInTheDocument();
  expect(root.getByRole('cell', { name: 'Guardado' })).toHaveTextContent(/^Guardado$/);
  expect(fetch).not.toHaveBeenCalled();
  expect(JSON.stringify(days)).toBe(original);
  expect(screen.getByRole('button', { name: 'Imprimir / PDF' })).toBeDisabled();
  act(() => window.dispatchEvent(new Event('afterprint')));
  expect(document.getElementById('athleta-routine-print-root')).toBeNull();
  expect(screen.getByRole('button', { name: 'Imprimir / PDF' })).toBeEnabled();
});
it.each(['ACTIVE', 'HISTORICAL', 'SCHEDULED'] as const)('prints student identity and actual %s version', status => {
  const { root } = start({ studentName: 'Alumno Prueba', status, version: 7 });
  expect(root.getByText('Alumno: Alumno Prueba')).toBeInTheDocument();
  expect(root.getByText(`Estado: ${status === 'ACTIVE' ? 'Activa' : status === 'SCHEDULED' ? 'Programada' : 'Histórica'} · Versión: 7`)).toBeInTheDocument();
});
it('removes its listener and portal on unmount', () => {
  const remove = vi.spyOn(window, 'removeEventListener');
  const { unmount } = start();
  unmount();
  expect(remove).toHaveBeenCalledWith('afterprint', expect.any(Function));
  expect(document.getElementById('athleta-routine-print-root')).toBeNull();
});
it('cleans up when the browser throws and allows retry', () => {
  const remove = vi.spyOn(window, 'removeEventListener');
  const print = vi.spyOn(window, 'print').mockImplementation(() => { throw new Error('Unavailable'); });
  render(<RoutinePrintButton days={days}/>);
  fireEvent.click(screen.getByRole('button'));
  expect(document.getElementById('athleta-routine-print-root')).toBeNull();
  expect(remove).toHaveBeenCalledWith('afterprint', expect.any(Function));
  fireEvent.click(screen.getByRole('button'));
  expect(print).toHaveBeenCalledTimes(2);
});
it('respects disabled and falls back to Ejercicio for missing names', () => {
  const { rerender } = render(<RoutinePrintButton days={days} disabled/>);
  expect(screen.getByRole('button')).toBeDisabled();
  rerender(<RoutinePrintButton days={[{ position: 1, exercises: [{ exerciseDefinitionId: 'missing' }] }]}/>);
  vi.spyOn(window, 'print').mockImplementation(() => {});
  fireEvent.click(screen.getByRole('button'));
  expect(within(document.getElementById('athleta-routine-print-root')!).getByRole('cell', { name: 'Ejercicio' })).toBeInTheDocument();
});

it.each(['template', 'ACTIVE', 'HISTORICAL', 'SCHEDULED'] as const)('prints grouped %s routines with shared series and five empty weekly cells without writes', kind => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  const grouped: RoutineDay[] = [{ position: 1, name: 'Fuerza', exercises: [{ exerciseDefinitionId: 'a', exerciseName: 'Sentadilla', blockPosition: 1, series: '4', repetitions: '8', load: '60 kg' }, { exerciseDefinitionId: 'b', exerciseName: 'Remo', blockPosition: 1, series: '4', notes: 'Control' }, { exerciseDefinitionId: 'c', exerciseName: 'Press', blockPosition: 2, series: '3' }] }];
  const original = structuredClone(grouped);
  const { root } = start({ days: grouped, ...(kind === 'template' ? { templateName: 'Modelo' } : { studentName: 'Alumno', status: kind, version: 2 }) });
  for (const text of ['Bloque A — 4 series', 'Bloque B — 3 series', 'A1 — Sentadilla', 'A2 — Remo', 'B1 — Press', '8 rep.']) expect(root.getByText(text)).toBeInTheDocument();
  for (const text of ['Carga indicada: 60 kg', 'Control']) expect(root.queryByText(text)).not.toBeInTheDocument();
  expect(root.getByRole('cell', { name: 'A1 — Sentadilla' })).toHaveTextContent(/^A1 — Sentadilla$/);
  expect(root.queryByRole('columnheader', { name: 'Series' })).not.toBeInTheDocument();
  for (const table of root.getAllByRole('table')) {
    expect(within(table).getAllByRole('columnheader').slice(-5).map(node => node.textContent)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5']);
    for (const row of table.querySelectorAll('tbody tr')) {
      const cells = row.querySelectorAll('.routine-print-weight');
      expect(cells).toHaveLength(5);
      for (const cell of cells) expect(cell).toBeEmptyDOMElement();
    }
  }
  expect(root.queryByRole('textbox')).not.toBeInTheDocument();
  expect(grouped).toEqual(original); expect(fetch).not.toHaveBeenCalled();
});

it('prints available personal details, real dates and a blank payment field', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-04T02:00:00Z'));
  try {
    const { root } = start({ studentName: 'Alumno Prueba', studentDetails: { birthDate: '2000-11-04', sport: 'Hockey' }, objective: 'Fuerza', effectiveFrom: '2026-10-01', effectiveUntil: '2026-11-01' });
    for (const text of ['Edad: 25 años', 'Deporte: Hockey', 'Objetivo: Fuerza', 'Inicio: 01/10/2026', 'Cambio: 01/11/2026']) expect(root.getByText(text)).toBeInTheDocument();
    expect(root.getByText('Pago:').querySelector('.routine-print-blank')).toBeInTheDocument();
    expect(root.getByText('S1–S5: peso utilizado en kg')).toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});
it('never leaks any personal details into a template', () => {
  const { root } = start({ templateName: 'Preestablecida', studentName: 'Privado', studentDetails: { birthDate: '2000-01-01', sport: 'Hockey' }, objective: 'Privado', effectiveFrom: '2026-10-01', effectiveUntil: '2026-11-01', status: 'ACTIVE', version: 9 });
  for (const text of [/Privado/, /Hockey/, /2000/, /2026/, /Versión/]) expect(root.queryByText(text)).not.toBeInTheDocument();
  expect(root.getByText('Alumno:').querySelector('.routine-print-blank')).toBeInTheDocument();
});
it.each([1, 2, 3, 4, 5, 7])('prints all %i days with the automatic panel distribution', count => {
  const { root } = start({ days: Array.from({ length: count }, (_, i) => ({ position: i + 1, name: `Entrenamiento ${i + 1}`, exercises: [{ exerciseDefinitionId: 'old', series: '3', repetitions: '10+10', duration: '45' }] })) });
  expect(root.getAllByRole('heading', { level: 2 })).toHaveLength(count);
  const container = document.querySelector('.routine-print-days')!;
  const columns = count === 4 ? 2 : Math.min(3, count);
  expect(container).toHaveAttribute('data-columns', String(columns));
  expect([...container.children].map(row => row.children.length)).toEqual(count === 4 ? [2, 2] : count === 5 ? [3, 2] : count === 7 ? [3, 3, 1] : [count]);
  expect(root.getAllByText('3 series · 10+10 rep. / 45 seg.')).toHaveLength(count);
  expect(document.querySelectorAll('.routine-print-weight')).toHaveLength(count * 5);
  expect(root.queryByText('Series: 3')).not.toBeInTheDocument();
});

it.each(['template', 'ACTIVE', 'HISTORICAL', 'SCHEDULED'] as const)('prints compact legacy %s exercises without instructions or writes', kind => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  const original = structuredClone(days);
  const { root } = start({ ...(kind === 'template' ? { templateName: 'Modelo' } : { studentName: 'Alumno', status: kind, version: 2 }) });
  expect(root.getByRole('cell', { name: '4 series · 10 rep. / 45 s' })).toBeInTheDocument();
  for (const text of [/Descripción/, /Carga indicada/, /Descanso/, /Controlar/]) expect(root.queryByText(text)).not.toBeInTheDocument();
  for (const row of document.querySelectorAll('#athleta-routine-print-root tbody tr')) {
    const cells = within(row as HTMLElement).getAllByRole('cell');
    expect(cells).toHaveLength(7);
    expect(cells[0]?.children).toHaveLength(0);
    for (const cell of cells.slice(2)) expect(cell).toBeEmptyDOMElement();
  }
  expect(days).toEqual(original);
  expect(fetch).not.toHaveBeenCalled();
});
