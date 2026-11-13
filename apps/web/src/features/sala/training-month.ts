import type { TrainingRoutineVersionDto, TrainingRecordDetailDto } from '@athleta/api-client';

export function shiftTrainingMonth(month: string, offset: number): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}
export const trainingMonthLabel = (month: string): string => new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

/** Monthly slots have no calendar date. Legacy records never populate this matrix. */
export function monthlyTrainingSlots(records: TrainingRecordDetailDto[], routineId: string, dayId: string, month: string): (TrainingRecordDetailDto | null)[] {
  return Array.from({ length: 4 }, (_, i) => records.find(r => r.date === null && r.routineId === routineId && r.routineDayId === dayId && r.month === month && r.weekNumber === i + 1) ?? null);
}
export function trainingRoutinePeriods(routines: TrainingRoutineVersionDto[]) {
  const sorted = [...routines].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.version - b.version);
  return sorted.map((routine, index) => ({ routine, from: routine.effectiveFrom, until: sorted[index + 1]?.effectiveFrom ?? null }));
}
export function trainingMonthRoutines(routines: TrainingRoutineVersionDto[], month: string) {
  const periods = trainingRoutinePeriods(routines);
  const effective = periods.filter(p => p.from !== p.until);
  if (periods[0] && month < periods[0].from.slice(0, 7)) {
    // A zero-duration version cannot receive new monthly records.
    return effective[0] && effective[0].routine.id === periods[0].routine.id ? [{ ...effective[0], retrospective: true }] : [];
  }
  return effective.filter(p => p.from < `${shiftTrainingMonth(month, 1)}-01` && (!p.until || p.until > `${month}-01`)).map(p => ({ ...p, retrospective: false }));
}
export function initialTrainingRoutine(routines: TrainingRoutineVersionDto[], month: string, today: string): string {
  const periods = trainingMonthRoutines(routines, month);
  if (month === today.slice(0, 7)) return periods.findLast(p => p.from <= today && (!p.until || p.until > today))?.routine.id ?? (periods[0]?.retrospective ? periods[0].routine.id : '');
  return periods.at(-1)?.routine.id ?? '';
}
export function trainingPeriodLabel(from: string, until: string | null, month: string): string {
  const fmt = (date: string) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  const start = from < `${month}-01` ? `${month}-01` : from;
  if (!until || until >= `${shiftTrainingMonth(month, 1)}-01`) return `Desde el ${fmt(start)}`;
  const end = new Date(`${until}T00:00:00Z`); end.setUTCDate(end.getUTCDate() - 1);
  return `${fmt(start)} al ${fmt(end.toISOString().slice(0, 10))}`;
}
