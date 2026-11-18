import { routineAllowsMonth, routineFollowUp, routineForDate, routinePeriods, routinePresentation } from './routine-periods';
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
  it('allows overlapping months and retrospective months for the first version', () => {
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
  const rows = [routine(1, '2026-11-01'), routine(2, '2026-11-13'), { ...routine(3, '2026-11-13'), cancelledAt: new Date('2026-11-13T15:00:00Z') }];
  expect(routineForDate(rows, '2026-11-12')?.id).toBe('1');
  expect(routineForDate(rows, '2026-11-13')).toBeNull();
  expect(routinePresentation(rows, '2026-11-13').map(r => r.status)).toEqual(['HISTORICAL', 'HISTORICAL', 'HISTORICAL']);
});

it.each([
  ['2026-11-13', '2026-11-12', '2026-12-10', '2026-12-11'],
  ['2026-12-20', '2026-12-19', '2027-01-16', '2027-01-17'],
  ['2028-02-03', '2028-02-02', '2028-03-01', '2028-03-02'],
])('marks a review after 28 days without ending the period starting %s', (start, prior, lastDay, end) => {
  const assigned = routine(1, start);
  expect(routineForDate([assigned], prior)).toBeNull();
  expect(routineForDate([assigned], start)).toBe(assigned);
  expect(routineForDate([assigned], lastDay)).toBe(assigned);
  expect(routineForDate([assigned], end)).toBe(assigned);
  expect(routineFollowUp([assigned], end).routineChangeInDays).toBe(0);
  expect(routinePresentation([assigned], end)).toEqual([expect.objectContaining({ id: assigned.id, status: 'ACTIVE', effectiveFrom: start, effectiveUntil: null })]);
});

it.each([
  ['2026-12-03', 'ACTIVE', null],
  ['2026-12-04', 'ACTIVE', 7],
  ['2026-12-05', 'ACTIVE', 6],
  ['2026-12-09', 'ACTIVE', 2],
  ['2026-12-10', 'ACTIVE', 1],
  ['2026-12-11', 'ACTIVE', 0],
  ['2026-12-17', 'ACTIVE', 0],
])('reports the countdown on %s', (date, routineStatus, routineChangeInDays) => {
  expect(routineFollowUp([routine(1, '2026-11-13')], date)).toEqual({ routineStatus, routineChangeInDays, routineIdForNotice: '1' });
});

it.each([
  ['2026-11-25', '2026-11-24', null],
  ['2026-11-29', '2026-11-28', null],
  ['2026-12-05', '2026-12-04', 7],
])('respects the replacement scheduled for %s', (start, lastDay, warning) => {
  const original = routine(1, '2026-11-01');
  const successor = routine(2, start);
  const rows = [original, successor];
  expect(routineFollowUp(rows, '2026-11-22')).toEqual({
    routineStatus: 'ACTIVE', routineChangeInDays: warning, routineIdForNotice: warning ? original.id : null,
  });
  expect(routineForDate(rows, lastDay)).toBe(original);
  if (start === '2026-12-05') expect(routineFollowUp(rows, lastDay).routineChangeInDays).toBe(0);
  expect(routineForDate(rows, start)).toBe(successor);
  expect(routineFollowUp(rows, start)).toEqual({ routineStatus: 'ACTIVE', routineChangeInDays: null, routineIdForNotice: successor.id });
});

it('keeps the current routine and its review when a future assignment is cancelled', () => {
  const current = routine(1, '2026-11-01');
  const versions = [current, { ...routine(2, '2026-11-29'), cancelledAt: new Date('2026-11-29T02:00:00Z') }];
  expect(routineFollowUp(versions, '2026-11-22').routineChangeInDays).toBe(7);
  expect(routineForDate(versions, '2026-11-29')).toBe(current);
  expect(routineFollowUp(versions, '2026-12-05').routineChangeInDays).toBe(0);
  expect(routineAllowsMonth(versions, '1', '2026-12')).toBe(true);
});
