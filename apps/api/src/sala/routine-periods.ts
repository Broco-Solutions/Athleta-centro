const operationalDate = (value: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
const ROUTINE_REVIEW_DAYS = 28;
const ROUTINE_WARNING_DAYS = 7;
type RoutineVersion = { id: string; version: number; effectiveFrom: Date; cancelledAt?: Date | null };

/** DATE values are UTC containers, never local timestamps. End dates are exclusive. */
export function routinePeriods<T extends RoutineVersion>(routines: readonly T[]) {
  const sorted = routines.filter(r => r.cancelledAt == null || operationalDate(r.cancelledAt) >= r.effectiveFrom.toISOString().slice(0, 10)).sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime() || a.version - b.version);
  return sorted.map((routine, index) => {
    const next = sorted[index + 1]?.effectiveFrom.toISOString().slice(0, 10) ?? null;
    const removed = routine.cancelledAt ? operationalDate(routine.cancelledAt) : null;
    const until = removed && (!next || removed < next) ? removed : next;
    return { routine, from: routine.effectiveFrom.toISOString().slice(0, 10), until };
  });
}

function periodForDate<T extends RoutineVersion>(periods: ReturnType<typeof routinePeriods<T>>, date: string) {
  return periods.findLast(period => period.from <= date && (!period.until || date < period.until));
}

export function routineForDate<T extends RoutineVersion>(routines: readonly T[], date: string): T | null {
  return periodForDate(routinePeriods(routines), date)?.routine ?? null;
}

export function routineFollowUp(routines: readonly RoutineVersion[], today: string) {
  const periods = routinePeriods(routines);
  const active = periodForDate(periods, today);
  if (!active) return { routineStatus: 'MISSING', routineChangeInDays: null, routineIdForNotice: null } as const;

  const reviewDate = new Date(active.routine.effectiveFrom);
  reviewDate.setUTCDate(reviewDate.getUTCDate() + ROUTINE_REVIEW_DAYS);
  const days = (reviewDate.getTime() - Date.parse(today)) / (24 * 60 * 60 * 1000);
  const replacementInTime = periods.some(period =>
    period.from === active.until && period.from !== period.until
    && Date.parse(period.from) <= reviewDate.getTime());
  return {
    routineStatus: 'ACTIVE',
    routineChangeInDays: !replacementInTime && days <= ROUTINE_WARNING_DAYS ? Math.max(0, days) : null,
    routineIdForNotice: replacementInTime ? null : active.routine.id,
  } as const;
}

export function routinePresentation<T extends RoutineVersion>(routines: readonly T[], today: string) {
  const periods = routinePeriods(routines);
  const active = periodForDate(periods, today)?.routine;
  return periods.map(({ routine, from, until }) => {
    const { effectiveFrom: _effectiveFrom, ...rest } = routine;
    void _effectiveFrom;
    return { ...rest, effectiveFrom: from, effectiveUntil: until, status: (until === from ? 'HISTORICAL' : routine.id === active?.id ? 'ACTIVE' : from > today ? 'SCHEDULED' : 'HISTORICAL') as 'ACTIVE' | 'SCHEDULED' | 'HISTORICAL' };
  });
}
export function routineAllowsMonth<T extends RoutineVersion>(routines: readonly T[], id: string, month: string): boolean {
  const periods = routinePeriods(routines);
  const period = periods.find(p => p.routine.id === id);
  if (!period || period.until === period.from) return false;
  return (period.from.slice(0, 7) <= month && (!period.until || period.until > `${month}-01`)) || (period === periods[0] && month < period.from.slice(0, 7));
}
