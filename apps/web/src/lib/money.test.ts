import { describe, expect, it } from 'vitest';
import { formatArs } from './money';

describe('formatArs', () => {
  it.each([
    [0, '$ 0,00'], [1, '$ 1,00'], [1000, '$ 1.000,00'],
    [20000, '$ 20.000,00'], [1250450, '$ 1.250.450,00'],
    [1250.5, '$ 1.250,50'], ['1250.50', '$ 1.250,50'],
    ['20000', '$ 20.000,00'], [20000n, '$ 20.000,00'],
    ['9007199254740993', '$ 9.007.199.254.740.993,00'],
    [-1000, '-$ 1.000,00'],
  ])('formats %s as %s', (value, expected) => expect(formatArs(value)).toBe(expected));
});
