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
  expect(root.getByText('RUTINA DE ENTRENAMIENTO')).toBeInTheDocument();
  expect(root.getByText('Rutina: Modelo')).toBeInTheDocument();
  expect(root.queryByText(/Alumno:/)).not.toBeInTheDocument();
  expect(root.getAllByRole('heading', { level: 2 }).map(node => node.textContent)).toEqual(['Fuerza', 'Día 2']);
  expect(root.getAllByRole('row')[1]).toHaveTextContent('Retirado');
  for (const text of ['Descripción', 'Guardado', '4', '10 rep. / 45 s', '40', '90 s', 'Controlar', 'Catálogo']) expect(root.getByText(text)).toBeInTheDocument();
  expect(root.getAllByText('-').length).toBeGreaterThan(0);
  expect(fetch).not.toHaveBeenCalled();
  expect(JSON.stringify(days)).toBe(original);
  expect(screen.getByRole('button', { name: 'Imprimir / PDF' })).toBeDisabled();
  act(() => window.dispatchEvent(new Event('afterprint')));
  expect(document.getElementById('athleta-routine-print-root')).toBeNull();
  expect(screen.getByRole('button', { name: 'Imprimir / PDF' })).toBeEnabled();
});
it.each(['ACTIVE', 'HISTORICAL'] as const)('prints student identity and actual %s version', status => {
  const { root } = start({ studentName: 'Alumno Prueba', status, version: 7 });
  expect(root.getByText('Alumno: Alumno Prueba')).toBeInTheDocument();
  expect(root.getByText(`Estado: ${status === 'ACTIVE' ? 'Activa' : 'Histórica'} · Versión: 7`)).toBeInTheDocument();
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
