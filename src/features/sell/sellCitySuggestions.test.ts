import { describe, expect, it } from 'vitest';
import { getSellCitySuggestions } from './sellCitySuggestions';

describe('getSellCitySuggestions', () => {
  it('priorise Douala et Yaoundé quand le champ est vide', () => {
    const s = getSellCitySuggestions('', 4);
    expect(s[0]).toBe('Douala');
    expect(s[1]).toBe('Yaoundé');
    expect(s.length).toBeLessThanOrEqual(4);
  });

  it('filtre par saisie partielle', () => {
    expect(getSellCitySuggestions('Baf')).toContain('Bafoussam');
    expect(getSellCitySuggestions('Douala')).not.toContain('Douala');
  });
});
