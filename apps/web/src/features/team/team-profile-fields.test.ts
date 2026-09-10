import { describe, expect, it } from 'vitest';
import { seniorityLabel } from './team-profile-fields';

describe('seniorityLabel', () => {
  it('uses calendar months and does not produce a negative seniority', () => {
    expect(seniorityLabel('2020-06-15', '2026-03-15')).toBe('5 años y 9 meses');
    expect(seniorityLabel('2026-03-16', '2026-03-15')).toBeNull();
    expect(seniorityLabel('2026-03-01', '2026-03-15')).toBe('Menos de un mes');
  });
});
