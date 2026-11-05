import { describe, expect, it } from 'vitest';
import { formatActiveListingsCountLabel } from './activeListingsCountLabel';

describe('formatActiveListingsCountLabel', () => {
  it('formats zero', () => {
    expect(formatActiveListingsCountLabel(0)).toBe('Aucune annonce active');
  });

  it('formats one', () => {
    expect(formatActiveListingsCountLabel(1)).toBe('1 annonce active');
  });

  it('formats plural with locale grouping', () => {
    expect(formatActiveListingsCountLabel(12)).toBe('12 annonces actives');
    expect(formatActiveListingsCountLabel(2500)).toContain('annonces actives');
  });
});
