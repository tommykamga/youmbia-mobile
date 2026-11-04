import { describe, expect, it, vi } from 'vitest';
import { formatPrice } from './formatPrice';
describe('runtime-independent French FCFA amounts', () => {
  it.each([
    [0, '0'], [85000, '85 000'], [1234567890, '1 234 567 890'],
    [-1234567.89, '-1 234 567,89'], [1234567.123456, '1 234 567,123456'],
    [1e21, '1 000 000 000 000 000 000 000'], [1e-7, '0,0000001'],
  ] as const)('preserves %s with French groups and decimal comma', (value, expected) => {
    expect(formatPrice(value)).toBe(expected + '\u00a0FCFA');
  });
  it('does not depend on device locale support', () => {
    const locale = vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(() => { throw Error('locale unavailable'); });
    try { expect(formatPrice(1234567890)).toBe('1 234 567 890\u00a0FCFA'); } finally { locale.mockRestore(); }
  });
  it('keeps absent or nonfinite amounts empty', () => {
    for (const value of [null, undefined, NaN, Infinity, -Infinity]) expect(formatPrice(value)).toBe('');
  });
});
