import { initialTrainingRoutine, monthlyTrainingSlots, shiftTrainingMonth, trainingMonthRoutines } from './training-month';
import type { TrainingRecordDetailDto, TrainingRoutineVersionDto } from '@athleta/api-client';
const version = (n: number, effectiveFrom: string): TrainingRoutineVersionDto => ({ id: `r${n}`, version: n, status: 'HISTORICAL', createdOn: '2026-01-01', effectiveFrom, effectiveUntil: null, days: [{ id: `d${n}`, position: 1, name: null, exercises: [] }] });
it('shows one continuing version across months and extends the first one retrospectively', () => {
  const routines = [version(1, '2026-10-01')];
  for (const month of ['2026-10', '2026-11', '2026-12']) expect(trainingMonthRoutines(routines, month).map(p => p.routine.id)).toEqual(['r1']);
  expect(trainingMonthRoutines(routines, '2026-09')[0]?.retrospective).toBe(true);
  expect(routines[0]?.effectiveFrom).toBe('2026-10-01');
});
it('selects today rather than the last assigned routine, and the last overlapping period for another month', () => {
  const routines = [version(1, '2026-11-01'), version(2, '2026-11-15'), version(3, '2026-12-01')];
  expect(trainingMonthRoutines(routines, '2026-11').map(p => p.routine.id)).toEqual(['r1', 'r2']);
  expect(initialTrainingRoutine(routines, '2026-11', '2026-11-03')).toBe('r1');
  expect(initialTrainingRoutine(routines, '2026-11', '2026-11-16')).toBe('r2');
  expect(initialTrainingRoutine(routines, '2026-11', '2026-12-05')).toBe('r2');
  expect(initialTrainingRoutine(routines, '2026-12', '2026-12-01')).toBe('r3');
});
it('hides zero-duration versions and never invents a current routine before a future start', () => {
  const routines = [version(5, '2026-11-01'), version(6, '2026-11-01')];
  expect(trainingMonthRoutines(routines, '2026-11').map(p => p.routine.id)).toEqual(['r6']);
  expect(initialTrainingRoutine([version(1, '2026-11-15')], '2026-11', '2026-11-03')).toBe('');
});
it('creates exactly four independent slots and keeps legacy records outside them', () => {
  const record = { id: 'monthly', routineId: 'r1', routineDayId: 'd1', date: null, month: '2026-11', weekNumber: 4 } as TrainingRecordDetailDto;
  const records = [record, ...[5, 6].map(weekNumber => ({ ...record, id: `historical-${weekNumber}`, weekNumber })), { ...record, id: 'legacy', month: null, weekNumber: null, date: '2026-11-01' }, { ...record, id: 'other-month', month: '2026-12' }, { ...record, id: 'other-routine', routineId: 'r2' }, { ...record, id: 'other-day', routineDayId: 'd2' }];
  expect(monthlyTrainingSlots(records, 'r1', 'd1', '2026-11')).toEqual([null, null, null, record]);
  expect(monthlyTrainingSlots([], 'r1', 'd1', '2026-11')).toHaveLength(4);
});
it('navigates months across years without host timezone conversions', () => {
  expect(shiftTrainingMonth('2026-12', 1)).toBe('2027-01');
  expect(shiftTrainingMonth('2026-01', -1)).toBe('2025-12');
});
