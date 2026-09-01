import { describe, expect, it } from 'vitest';
import { formatOperationalTime } from './operational-time';

describe('formatOperationalTime', () => {
  it.each([
    ['1970-01-01T08:00:00.000Z', '08:00'],
    ['1970-01-01T15:00:00.000Z', '15:00'],
    ['08:00:00', '08:00'],
    ['08:00', '08:00'],
  ])('formats %s without timezone conversion', (input, expected) => {
    expect(formatOperationalTime(input)).toBe(expected);
  });

  it('does not alter the calendar date when combined by the caller', () => {
    expect(`${'02/09/2026'} · ${formatOperationalTime('1970-01-01T08:00:00.000Z')}`).toBe('02/09/2026 · 08:00');
  });
});
