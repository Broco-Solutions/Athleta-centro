import { shiftTrainingMonth, trainingMonthDays, trainingMonthWeeks, trainingWeekDates, trainingWeekReference, trainingViewMonths, weeklyTrainingRecords } from './training-month';
import type { TrainingRecordDetailDto, TrainingRoutineVersionDto } from '@athleta/api-client';

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
  expect(groups.every(g => !g.canCreate)).toBe(true);
});

it('intersects weeks with the viewed month, routine assignment and today', () => {
  const weeks = trainingMonthWeeks('2026-10');
  expect(trainingWeekDates(weeks[0]!, '2026-10', '2026-10-03', '2026-10-28')).toEqual(['2026-10-03', '2026-10-04']);
  expect(trainingWeekDates(weeks[4]!, '2026-10', '2026-09-01', '2026-11-03')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
  expect(trainingWeekDates(weeks[4]!, '2026-10', '2026-10-01', '2026-10-28')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
  expect(trainingWeekDates(weeks[4]!, '2026-10', '2026-10-01', '2026-10-14')).toEqual([]);
});

it('chooses deterministic references within assignment/month bounds and today for the current week', () => {
  const weeks = trainingMonthWeeks('2026-10');
  expect(trainingWeekReference(weeks[0]!, '2026-10', '2026-10-03', '2026-10-28')).toBe('2026-10-03');
  expect(trainingWeekReference(weeks[1]!, '2026-10', '2026-10-01', '2026-10-28')).toBe('2026-10-05');
  expect(trainingWeekReference(weeks[4]!, '2026-10', '2026-10-01', '2026-10-28')).toBe('2026-10-28');
  expect(trainingWeekReference(weeks[4]!, '2026-10', '2026-10-01', '2026-10-14')).toBe('2026-10-26');
  expect(trainingWeekReference(weeks[4]!, '2026-10', '2026-10-01', '2026-11-01')).toBe('2026-11-01');
});
it('retrieves only adjacent months intersecting visual weeks, including future months and year boundaries', () => {
  expect(trainingViewMonths('2026-12', '2027-02-01')).toEqual(['2026-11', '2026-12', '2027-01']);
  expect(trainingViewMonths('2027-01', '2027-01-03')).toEqual(['2026-12', '2027-01']);
  expect(trainingViewMonths('2021-02', '2027-01-03')).toEqual(['2021-02']);
});
it('identifies the same principal record from either side of a cross-year week, even with missing weights', () => {
  const records = [{ id: 'first', date: '2026-12-31', createdAt: 'a' }, { id: 'second', date: '2027-01-02', createdAt: 'b' }] as TrainingRecordDetailDto[];
  expect(weeklyTrainingRecords(records, trainingMonthWeeks('2026-12').at(-1)!)).toEqual([records[1], records[0]]);
  expect(weeklyTrainingRecords(records, trainingMonthWeeks('2027-01')[0]!)).toEqual([records[1], records[0]]);
});

it('allows November future weeks and queries both sides of shared weeks', () => {
  const week = trainingMonthWeeks('2026-11').find(w => w.start === '2026-11-23')!;
  expect(trainingWeekReference(week, '2026-11', '2026-10-01', '2026-11-03')).toBe('2026-11-23');
  expect(trainingViewMonths('2026-11', '2026-11-03')).toEqual(['2026-10', '2026-11', '2026-12']);
});

const versions: TrainingRoutineVersionDto[] = ['2026-09-01', '2026-10-01', '2026-11-01'].map((createdOn, i) => ({
  id: `routine-${i + 1}`, version: i + 1, status: i === 2 ? 'ACTIVE' : 'HISTORICAL', createdOn,
  days: [{ id: `day-${i + 1}`, name: 'Fuerza', position: 1, exercises: [] }],
}));
it.each([['2026-08', 1], ['2026-09', 1], ['2026-10', 2], ['2026-11', 3], ['2027-02', 3]])('shows the assigned prescription in %s without requiring any saved record', (month, version) => {
  const days = trainingMonthDays([], versions, month);
  expect(days).toHaveLength(1);
  expect(days[0]).toMatchObject({ routineId: `routine-${version}`, version, canCreate: true, records: [] });
});
it('separates two versions in a transition month and references their own portion of a shared week', () => {
  const routines = [versions[0]!, { ...versions[1]!, createdOn: '2026-09-15' }, versions[2]!];
  const days = trainingMonthDays([], routines, '2026-09');
  expect(days.map(day => day.version)).toEqual([1, 2]);
  const week = { start: '2026-09-14', end: '2026-09-20' };
  expect(trainingWeekReference(week, '2026-09', days[0]!.validFrom!, '2026-09-17', days[0]!.validUntil)).toBe('2026-09-14');
  expect(trainingWeekReference(week, '2026-09', days[1]!.validFrom!, '2026-09-17', days[1]!.validUntil)).toBe('2026-09-17');
  expect(trainingWeekReference({ start: '2026-09-21', end: '2026-09-27' }, '2026-09', days[0]!.validFrom!, '2026-11-03', days[0]!.validUntil)).toBeNull();
});
it('uses the first prescription retrospectively and preserves the same reference from either month', () => {
  const routine = [{ ...versions[0]!, status: 'ACTIVE' as const, createdOn: '2026-11-03' }];
  const day = trainingMonthDays([], routine, '2026-10')[0]!;
  const week = { start: '2026-10-26', end: '2026-11-01' };
  expect(trainingWeekReference(week, '2026-10', day.validFrom!, '2026-11-03')).toBe('2026-10-26');
  expect(trainingWeekReference(week, '2026-11', day.validFrom!, '2026-11-03')).toBe('2026-10-26');
});

it('retains out-of-period legacy records and changed snapshots as separate editable groups', () => {
  const original = { id: 'legacy', routineId: 'routine-3', routineDayId: 'day-3', dayName: 'Fuerza', dayPosition: 1, date: '2026-09-10', createdAt: '2026-11-03T12:00:00Z', updatedAt: '2026-11-03T12:00:00Z', exercises: [{ id: 'saved', routineExerciseId: 'entry', exerciseDefinitionId: 'exercise', exerciseName: 'Original', position: 1, blockPosition: null, series: '3', repetitions: '8', duration: null, load: '20', rest: null, notes: null, weightKg: '30' }] };
  const changed = { ...original, id: 'changed', exercises: original.exercises.map(e => ({ ...e, id: 'changed-entry', series: '5' })) };
  const days = trainingMonthDays([original, changed], versions, '2026-09');
  expect(days).toHaveLength(3);
  expect(days[0]!.routineId).toBe('routine-1');
  expect(days.slice(1).map(day => day.records)).toEqual([[original], [changed]]);
  expect(days.slice(1).every(day => !day.canCreate)).toBe(true);
});
