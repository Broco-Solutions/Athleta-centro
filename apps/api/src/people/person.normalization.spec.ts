import { normalizeDni, normalizeEmail, normalizePhone } from './person.normalization';

describe('person normalization', () => {
  it.each([['20.123.456', '20123456'], ['20 123 456', '20123456'], ['20-123-456', '20123456']])('normalizes equivalent DNI formats', (input, expected) => {
    expect(normalizeDni(input)).toBe(expected);
  });
  it.each([['(341) 555-1234', '3415551234'], ['341 555 1234', '3415551234'], ['11 1234-5678', '1112345678']])('normalizes phone %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
  it('normalizes optional email without manufacturing a value', () => {
    expect(normalizeEmail(' PERSON@Example.COM ')).toBe('person@example.com');
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(' ')).toBeNull();
  });
});
