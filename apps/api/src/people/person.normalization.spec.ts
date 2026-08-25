import { normalizeDni, normalizeEmail } from './person.normalization';

describe('person normalization', () => {
  it.each([['12.345.678', '12345678'], ['12 345 678', '12345678'], ['12-345-678', '12345678']])('normalizes equivalent DNI formats', (input, expected) => {
    expect(normalizeDni(input)).toBe(expected);
  });
  it('normalizes optional email without manufacturing a value', () => {
    expect(normalizeEmail(' PERSON@Example.COM ')).toBe('person@example.com');
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(' ')).toBeNull();
  });
});
