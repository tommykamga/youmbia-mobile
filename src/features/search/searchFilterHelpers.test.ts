import { describe, expect, it } from 'vitest';
import {
  getCategoryIdByLabel,
  normalizeFilterText,
  normalizeMatchText,
  parsePriceValue,
  validatePriceFilters,
} from './searchFilterHelpers';

describe('searchFilterHelpers', () => {
  it('normalise texte et accents pour le matching', () => {
    expect(normalizeFilterText('  Douala  ')).toBe('Douala');
    expect(normalizeFilterText('   ')).toBeNull();
    expect(normalizeMatchText('Yaoundé')).toBe('yaounde');
  });

  it('résout l’id de catégorie par libellé', () => {
    const roots = [
      { id: 1, name: 'Téléphones' },
      { id: 2, name: 'Véhicules' },
    ];
    expect(getCategoryIdByLabel('véhicules', roots)).toBe(2);
    expect(getCategoryIdByLabel(null, roots)).toBeNull();
  });

  it('valide la fourchette de prix sans changer les règles', () => {
    expect(parsePriceValue('', 'err')).toEqual({ value: null, error: null });
    expect(parsePriceValue('12a', 'Prix minimum invalide').error).toBe('Prix minimum invalide');
    expect(validatePriceFilters('100', '50').error).toBe('La fourchette de prix est incohérente');
    expect(validatePriceFilters('100', '200')).toEqual({ min: 100, max: 200, error: null });
  });
});
