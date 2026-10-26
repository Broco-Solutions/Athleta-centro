import { ageOnDate, currentHealthDocument, declarationValidUntil, operationalToday } from './health-document';
describe('Health declaration policy', () => {
  it('publishes the supplied document with a reproducible source fingerprint and independent procedure consents', () => { const doc = currentHealthDocument()!; expect(doc.sourceFilename).toBe('Declaracion_Jurada_Salud_y_Consentimiento_Athleta_Centro.docx'); expect(doc.version).toBe(`sha256-${doc.sourceSha256!.slice(0, 16)}`); expect(doc.questions.length).toBeGreaterThan(40); expect(doc.consents.find(item => item.key === 'dryNeedling')?.text).toContain('Punción seca'); });
  it('expires after twelve calendar months, preserving the timestamp and clamping leap day', () => {
    expect(declarationValidUntil(new Date('2026-10-22T14:35:21Z')).toISOString()).toBe('2027-10-22T14:35:21.000Z');
    expect(declarationValidUntil(new Date('2024-02-29T14:35:21Z')).toISOString()).toBe('2025-02-28T14:35:21.000Z');
  });
  it('uses the Argentina calendar independently of the server timezone', () => {
    expect(operationalToday(new Date('2026-10-24T02:59:59Z'))).toBe('2026-10-23');
    expect(operationalToday(new Date('2026-10-24T03:00:00Z'))).toBe('2026-10-24');
    expect(declarationValidUntil(new Date('2026-01-31T00:00:00Z')).toISOString()).toBe('2027-01-31T00:00:00.000Z');
  });
  it('requires the guardian until the eighteenth birthday', () => { expect(ageOnDate('2008-10-23', '2026-10-22')).toBe(17); expect(ageOnDate('2008-10-22', '2026-10-22')).toBe(18); });
});
