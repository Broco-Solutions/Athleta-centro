/** DATE values are UTC containers, never local timestamps. End dates are exclusive. */
export function routinePeriods<T extends { id: string; version: number; effectiveFrom: Date }>(routines: readonly T[]) {
  const sorted = [...routines].sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime() || a.version - b.version);
  return sorted.map((routine, index) => ({ routine, from: routine.effectiveFrom.toISOString().slice(0, 10), until: sorted[index + 1]?.effectiveFrom.toISOString().slice(0, 10) ?? null }));
}
export function routineForDate<T extends { id: string; version: number; effectiveFrom: Date }>(routines: readonly T[], date: string): T | null {
  return routinePeriods(routines).findLast(period => period.from <= date)?.routine ?? null;
}
export function routinePresentation<T extends { id: string; version: number; effectiveFrom: Date }>(routines: readonly T[], today: string) {
  const active = routineForDate(routines, today);
  return routinePeriods(routines).map(({ routine, from, until }) => {
    const { effectiveFrom: _effectiveFrom, ...rest } = routine;
    void _effectiveFrom;
    return { ...rest, effectiveFrom: from, effectiveUntil: until, status: (until === from ? 'HISTORICAL' : routine.id === active?.id ? 'ACTIVE' : from > today ? 'SCHEDULED' : 'HISTORICAL') as 'ACTIVE' | 'SCHEDULED' | 'HISTORICAL' };
  });
}
export function routineAllowsMonth<T extends { id: string; version: number; effectiveFrom: Date }>(routines: readonly T[], id: string, month: string): boolean {
  const periods = routinePeriods(routines);
  const period = periods.find(p => p.routine.id === id);
  if (!period || period.until === period.from) return false;
  return (period.from.slice(0, 7) <= month && (!period.until || period.until > `${month}-01`)) || (period === periods[0] && month < period.from.slice(0, 7));
}
