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

it('excludes cancelled assignments from every operational period and monthly write', () => {
  const first = routine(1, '2026-11-01');
  const cancelled = { ...routine(2, '2026-11-15'), cancelledAt: new Date('2026-11-13T15:00:00Z') };
  const future = routine(3, '2026-12-01');
  const versions = [first, cancelled, future];
  expect(routinePeriods(versions).map(p => p.until)).toEqual(['2026-12-01', null]);
  expect(routineForDate(versions, '2026-11-20')?.id).toBe(first.id);
  expect(routinePresentation(versions, '2026-11-20').map(r => r.id)).toEqual([first.id, future.id]);
  expect(routineAllowsMonth(versions, cancelled.id, '2026-11')).toBe(false);
});

it('ends retired periods on the Argentine date without reviving predecessors', () => {
  const first = routine(1, '2026-10-01');
  const removed = { ...routine(2, '2026-11-01'), cancelledAt: new Date('2026-11-14T01:00:00Z') };
  const future = routine(3, '2026-12-01');
  for (const rows of [[first, removed], [first, removed, future], [first, removed, { ...future, cancelledAt: new Date('2026-11-14T01:00:00Z') }]]) {
    expect(routineForDate(rows, '2026-11-12')?.id).toBe('2');
    expect(routineForDate(rows, '2026-11-13')).toBeNull();
    expect(routineForDate(rows, '2026-11-30')).toBeNull();
    expect(routinePresentation(rows, '2026-11-13').find(r => r.id === '2')).toMatchObject({ status: 'HISTORICAL', effectiveUntil: '2026-11-13' });
    expect(routineAllowsMonth(rows, '2', '2026-11')).toBe(true);
    expect(routineAllowsMonth(rows, '2', '2026-12')).toBe(false);
  }
  expect(routineForDate([first, removed, future], '2026-12-01')?.id).toBe('3');
});
it('keeps a same-day retirement in history and closes its predecessor', () => {
  const rows = [routine(1, '2026-10-01'), { ...routine(2, '2026-11-13'), cancelledAt: new Date('2026-11-13T15:00:00Z') }];
  expect(routineForDate(rows, '2026-11-13')).toBeNull();
  expect(routinePresentation(rows, '2026-11-13')).toHaveLength(2);
});
