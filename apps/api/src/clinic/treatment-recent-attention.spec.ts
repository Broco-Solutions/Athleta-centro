import { hasTreatmentWithoutRecentAttention, treatmentStartReference } from './treatment-recent-attention';

const startDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const attention = (value: string) => ({ occurredAt: new Date(value) });
const treatment = (date: string, attentions: { occurredAt: Date }[] = []) => ({ startDate: startDate(date), attentions });

describe('treatment recent attention calculation', () => {
  it.each([
    [30, '2026-08-14T12:00:00.000Z', false],
    [30, '2026-08-12T12:00:00.000Z', true],
    [60, '2026-07-15T12:00:00.000Z', false],
    [60, '2026-07-13T12:00:00.000Z', true],
    [90, '2026-06-15T12:00:00.000Z', false],
    [90, '2026-06-13T12:00:00.000Z', true],
  ])('matches exactly at %s complete days', (days, reference, expected) => {
    const now = new Date('2026-09-12T12:00:00.000Z');
    expect(hasTreatmentWithoutRecentAttention(treatment('2026-01-01', [attention(reference)]), days, now)).toBe(expected);
  });

  it('uses Argentina midnight for a Treatment start date without attentions', () => {
    const reference = treatmentStartReference(startDate('2026-08-13'));
    expect(reference.toISOString()).toBe('2026-08-13T03:00:00.000Z');
    expect(hasTreatmentWithoutRecentAttention(treatment('2026-08-13'), 30, new Date('2026-09-12T03:00:00.000Z'))).toBe(true);
    expect(hasTreatmentWithoutRecentAttention(treatment('2026-08-13'), 30, new Date('2026-09-12T02:59:59.999Z'))).toBe(false);
  });

  it('uses the most recent attention associated with the Treatment', () => {
    const now = new Date('2026-09-12T12:00:00.000Z');
    expect(hasTreatmentWithoutRecentAttention(treatment('2026-01-01', [attention('2026-08-01T12:00:00.000Z')]), 30, now)).toBe(true);
    expect(hasTreatmentWithoutRecentAttention(treatment('2026-01-01', [attention('2026-09-01T12:00:00.000Z'), attention('2026-08-01T12:00:00.000Z')]), 30, now)).toBe(false);
  });
});
