import type { TrainingExerciseSnapshotDto, TrainingRoutineVersionDto, TrainingRecordDetailDto, TrainingRecordExerciseDto } from '@athleta/api-client';

export function shiftTrainingMonth(month: string, offset: number): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}
export function trainingMonthWeeks(month: string): { number: number; start: string; end: string }[] {
  const first = new Date(`${month}-01T00:00:00Z`);
  const next = shiftTrainingMonth(month, 1);
  const monday = new Date(first);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const weeks = [];
  while (monday.toISOString().slice(0, 10) < `${next}-01`) {
    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    weeks.push({ number: weeks.length + 1, start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) });
    monday.setUTCDate(monday.getUTCDate() + 7);
  }
  return weeks;
}
// Intersect the visual week with the viewed month and the active routine's real dates.
export function trainingWeekDates(week: { start: string; end: string }, month: string, createdOn: string, today: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${week.start}T00:00:00Z`);
  while (cursor.toISOString().slice(0, 10) <= week.end) {
    const date = cursor.toISOString().slice(0, 10);
    if (date.startsWith(month) && date >= createdOn && date <= today) dates.push(date);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
export const trainingMonthLabel = (month: string): string => new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

type Exercise = TrainingExerciseSnapshotDto | TrainingRecordExerciseDto;
// Include every saved prescription field, in a fixed order; weights and saved entry IDs
// do not define a version. Routine entry identity distinguishes repeated exercises.
function prescription(exercises: Exercise[]): unknown[] {
  return exercises.map(e => ['routineExerciseId' in e ? e.routineExerciseId : e.id, e.exerciseDefinitionId, e.exerciseName, e.position, e.blockPosition, e.series, e.repetitions, e.duration, e.load, e.rest, e.notes]);
}
export type TrainingMonthDay = {
  key: string;
  name: string | null;
  position: number;
  routineId: string;
  routineDayId: string;
  canCreate: boolean;
  version?: number;
  status?: 'ACTIVE' | 'HISTORICAL';
  validFrom?: string;
  validUntil?: string;
  exercises: Exercise[];
  records: TrainingRecordDetailDto[];
};
export function trainingMonthDays(records: TrainingRecordDetailDto[], routines: TrainingRoutineVersionDto[] | null, month?: string): TrainingMonthDay[] {
  const groups = new Map<string, TrainingMonthDay>();
  const key = (routineId: string, dayId: string, name: string | null, position: number, exercises: Exercise[]) => JSON.stringify([routineId, dayId, name, position, prescription(exercises)]);
  for (const [index, version] of (routines ?? []).entries()) {
    const validFrom = index === 0 ? '0001-01-01' : version.createdOn;
    const validUntil = routines?.[index + 1]?.createdOn;
    if (month && (validFrom >= `${shiftTrainingMonth(month, 1)}-01` || (validUntil && validUntil <= `${month}-01`))) continue;
    for (const day of version.days) {
      const id = key(version.id, day.id, day.name, day.position, day.exercises);
      groups.set(id, { key: id, name: day.name, position: day.position, routineId: version.id, routineDayId: day.id, canCreate: version.status === 'ACTIVE' || Boolean(validUntil), version: version.version, status: version.status, validFrom, ...(validUntil ? { validUntil } : {}), exercises: day.exercises, records: [] });
    }
  }
  for (const record of records) {
    const id = key(record.routineId, record.routineDayId, record.dayName, record.dayPosition, record.exercises);
    let group = groups.get(id);
    if (!group) {
      const version = routines?.find(routine => routine.id === record.routineId);
      group = { key: id, name: record.dayName, position: record.dayPosition, routineId: record.routineId, routineDayId: record.routineDayId, canCreate: false, ...(version ? { version: version.version, status: version.status } : {}), exercises: record.exercises, records: [] };
      groups.set(id, group);
    }
    group.records.push(record);
  }
  return [...groups.values()];
}

/** A reference date is technical: current week uses the backend's operational today. */
export function trainingWeekReference(week: { start: string; end: string }, month: string, validFrom: string, today: string, validUntil?: string): string | null {
  // Identity is the whole Monday-Sunday week, independent of the viewed month.
  void month;
  const start = validFrom > week.start ? validFrom : week.start;
  if (start > week.end || (validUntil && start >= validUntil)) return null;
  return today >= start && today <= week.end && (!validUntil || today < validUntil) ? today : start;
}

// One principal record for the entire day; never pick different records per exercise.
export function weeklyTrainingRecords(records: TrainingRecordDetailDto[], week: { start: string; end: string }): TrainingRecordDetailDto[] {
  return records.filter(record => record.date >= week.start && record.date <= week.end)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export function trainingViewMonths(month: string, today: string): string[] {
  void today; // Kept for existing callers; future months are intentionally included.
  const weeks = trainingMonthWeeks(month);
  return [...new Set([weeks[0]!.start.slice(0, 7), month, weeks.at(-1)!.end.slice(0, 7)])].filter(value => value >= '0001-01');
}
