import { describe, it, expect } from 'vitest';
import { resolveCanonicalCity, canonicalCityLabel, canonicalCityInputValue, buildCanonicalCityOrClause } from './canonicalCity';

const cityCases = [
  ['Douala', 'douala'], ['DOUALA', 'douala'], ['douala', 'douala'],
  ['Douala 🇨🇲', 'douala'], ['Yaoundé', 'yaounde'], ['YAOUNDE', 'yaounde'],
  ['Yaounde', 'yaounde'], ['bafoussam', 'bafoussam'], ['Bafoussam', 'bafoussam'],
  ['Limbe et Douala', null], ['Yaounde, Douala et bafoussam', null],
  ['Douala Bonapriso', null], ['Yaoundé 678912599', null],
  ['Anywhere', null], ['', null], ['Douala Cameroun', 'douala'],
  ['Cameroun', null], ['Douala et yaoundé', null],
] as const;

describe('V5-01 — villes canoniques (sans écriture en base)', () => {
  for (const [input, expected] of cityCases) {
    it(`résout ${JSON.stringify(input)}`, () => {
      const actual = resolveCanonicalCity(input);
      expect(actual.kind === 'canonical' ? actual.code : null).toBe(expected);
      expect(actual.original).toBe(input);
    });
  }
  it('normalise les villes sûres sans toucher aux entrées ambiguës', () => {
    expect(canonicalCityInputValue('YAOUNDE')).toBe('Yaoundé');
    expect(canonicalCityInputValue('DOUALA')).toBe('Douala');
    expect(canonicalCityInputValue('Douala Bonapriso')).toBe('Douala Bonapriso');
    expect(canonicalCityInputValue('Limbe et Douala')).toBe('Limbe et Douala');
  });
  it('produit uniquement des filtres sûrs', () => {
    expect(buildCanonicalCityOrClause('Yaoundé')).toContain('city.ilike.%Yaounde%');
    expect(buildCanonicalCityOrClause('YAOUNDE')).toContain('city.ilike.%Yaoundé%');
    expect(buildCanonicalCityOrClause('Douala et Yaoundé')).toBeNull();
    expect(buildCanonicalCityOrClause('Douala).or(id.eq.1')).toBeNull();
  });
  it('maintient un libellé canonique lisible', () => {
    expect(canonicalCityLabel('yaounde')).toBe('Yaoundé');
  });
  it('refuse les entrées nulles', () => {
    expect(resolveCanonicalCity(null).kind).toBe('review');
    expect(resolveCanonicalCity(undefined).kind).toBe('review');
  });
  it('signale les villes multiples', () => {
    const result = resolveCanonicalCity('Yaoundé, Douala');
    expect(result.kind).toBe('review');
    if (result.kind === 'review') expect(result.reason).toBe('multiple');
  });
});
