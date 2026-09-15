import { describe, expect, it } from 'vitest';
import {
  clinicAgendaRange,
  clinicLocalDateTimeToIso,
  operationalDate,
  startOfOperationalWeek,
  toClinicDateTimeLocal,
} from './clinic-dates';

describe('Clinic Buenos Aires dates', () => {
  it('uses Buenos Aires midnight for daily ranges independently from the process timezone', () => {
    expect(clinicAgendaRange('2026-09-15', 'DAY')).toEqual({
      from: '2026-09-15T03:00:00.000Z',
      to: '2026-09-16T03:00:00.000Z',
    });
  });

  it('builds Monday-to-Monday weekly ranges', () => {
    expect(startOfOperationalWeek('2026-09-17')).toBe('2026-09-14');
    expect(clinicAgendaRange('2026-09-17', 'WEEK')).toEqual({
      from: '2026-09-14T03:00:00.000Z',
      to: '2026-09-21T03:00:00.000Z',
    });
  });

  it('converts operational local date-times without using the browser timezone', () => {
    expect(clinicLocalDateTimeToIso('2026-09-15T10:25')).toBe('2026-09-15T13:25:00.000Z');
    expect(toClinicDateTimeLocal('2026-09-15T13:25:00.000Z')).toBe('2026-09-15T10:25');
    expect(operationalDate(new Date('2026-09-15T02:30:00.000Z'))).toBe('2026-09-14');
  });
});
