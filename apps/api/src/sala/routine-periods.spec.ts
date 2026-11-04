import { routineAllowsMonth, routineForDate, routinePeriods, routinePresentation } from './routine-periods';
const routine = (version: number, date: string) => ({ id: `${version}`, version, effectiveFrom: new Date(`${date}T00:00:00Z`) });
describe('routine effective periods', () => {
  const versions = [routine(1, '2026-11-01'), routine(2, '2026-11-15'), routine(3, '2026-12-01')];
  it('resolves boundaries without activating scheduled versions early', () => {
    expect(routineForDate(versions, '2026-10-31')).toBeNull();
    expect(routineForDate(versions, '2026-11-14')?.id).toBe('1');
    expect(routineForDate(versions, '2026-11-15')?.id).toBe('2');
    expect(routineForDate(versions, '2026-12-01')?.id).toBe('3');
    expect(routinePresentation(versions, '2026-11-04').map(r => r.status)).toEqual(['ACTIVE', 'SCHEDULED', 'SCHEDULED']);
  });
  it('excludes zero length periods from monthly writes, preserving them in history', () => {
    const same = [...versions, routine(4, '2026-12-01')];
    expect(routineForDate(same, '2026-12-01')?.id).toBe('4');
    expect(routinePeriods(same)).toHaveLength(4);
    expect(routineAllowsMonth(same, '3', '2026-12')).toBe(false);
  });
  it('allows six independent spaces in every overlapping month and retrospective first version', () => {
    expect(routineAllowsMonth(versions, '1', '2026-09')).toBe(true);
    expect(routineAllowsMonth(versions, '2', '2026-10')).toBe(false);
    expect(routineAllowsMonth(versions, '1', '2026-11')).toBe(true);
    expect(routineAllowsMonth(versions, '2', '2026-11')).toBe(true);
    expect(routineAllowsMonth(versions, '1', '2026-12')).toBe(false);
  });
});
