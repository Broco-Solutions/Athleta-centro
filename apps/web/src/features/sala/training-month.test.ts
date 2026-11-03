import { shiftTrainingMonth, trainingMonthDays, trainingMonthWeeks } from './training-month';
import type { TrainingRecordDetailDto } from '@athleta/api-client';

it.each([['2021-02', 4], ['2026-10', 5], ['2026-03', 6]])('calculates real Monday-Sunday weeks for %s', (month, count) => {
  const weeks = trainingMonthWeeks(month);
  expect(weeks).toHaveLength(count);
  for (const week of weeks) {
    expect(new Date(week.start).getUTCDay()).toBe(1);
    expect(new Date(week.end).getUTCDay()).toBe(0);
    expect((new Date(week.end).getTime() - new Date(week.start).getTime()) / 86400000).toBe(6);
  }
});
it('includes partial weeks and handles year changes and leap years without the host timezone', () => {
  expect(trainingMonthWeeks('2026-10')[0]).toEqual({ number: 1, start: '2026-09-28', end: '2026-10-04' });
  expect(trainingMonthWeeks('2026-10').at(-1)).toEqual({ number: 5, start: '2026-10-26', end: '2026-11-01' });
  expect(trainingMonthWeeks('2024-02').at(-1)?.end).toBe('2024-03-03');
  expect(shiftTrainingMonth('2026-01', -1)).toBe('2025-12');
  expect(shiftTrainingMonth('2026-12', 1)).toBe('2027-01');
});
it('groups only identical prescriptions and keeps routine versions, day names and repeated entry identities separate', () => {
  const exercise = { id: 'saved', routineExerciseId: 'entry', exerciseDefinitionId: 'definition', exerciseName: 'Press', position: 1, blockPosition: 1, series: '4', repetitions: '10', duration: null, load: null, rest: null, notes: null, weightKg: '30' };
  const record: TrainingRecordDetailDto = { id: 'one', routineId: 'routine', routineDayId: 'day', dayName: 'Fuerza', dayPosition: 1, date: '2026-10-01', createdAt: '', updatedAt: '', exercises: [exercise, { ...exercise, id: 'saved2', routineExerciseId: 'entry2', position: 2, blockPosition: 2 }] };
  const records = [record, { ...record, id: 'two', date: '2026-10-03', exercises: record.exercises.map(e => ({ ...e, id: `${e.id}-2`, weightKg: '35' })) }, { ...record, id: 'version2', routineId: 'new' }, { ...record, id: 'edit', exercises: [{ ...exercise, notes: 'Nueva indicación' }] }, { ...record, id: 'rename', dayName: 'Nuevo nombre' }];
  const groups = trainingMonthDays(records, null);
  expect(groups).toHaveLength(4);
  expect(groups[0]?.records.map(r => r.id)).toEqual(['one', 'two']);
  expect(groups[0]?.exercises.map(e => 'routineExerciseId' in e ? e.routineExerciseId : e.id)).toEqual(['entry', 'entry2']);
  expect(groups.every(g => !g.active)).toBe(true);
});
