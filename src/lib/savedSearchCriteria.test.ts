import { describe, expect, it } from 'vitest';
import {
  buildSavedSearchHref,
  buildSavedSearchLabel,
  buildSavedSearchListingHref,
  hasSavedSearchCriteria,
  isSameSavedSearchCriteria,
  normalizeSavedSearchCriteria,
} from './savedSearchCriteria';

describe('savedSearchCriteria', () => {
  it('normalise query, ville, prix et ignore les valeurs vides', () => {
    expect(
      normalizeSavedSearchCriteria({
        query: '  iPhone  ',
        categoryId: 20,
        city: ' Douala ',
        minPrice: 1000.4,
        maxPrice: 2000.6,
      })
    ).toEqual({
      query: 'iPhone',
      categoryId: 20,
      city: 'Douala',
      minPrice: 1000,
      maxPrice: 2001,
    });
  });

  it('refuse une recherche sans critère réel', () => {
    expect(hasSavedSearchCriteria(normalizeSavedSearchCriteria({ query: '  ' }))).toBe(false);
    expect(
      hasSavedSearchCriteria(
        normalizeSavedSearchCriteria({ query: '', city: 'Yaoundé' })
      )
    ).toBe(true);
  });

  it('déduplique deux recherches identiques même avec casse différente', () => {
    const a = normalizeSavedSearchCriteria({ query: 'iPhone', city: 'Douala', minPrice: 1000 });
    const b = normalizeSavedSearchCriteria({ query: 'IPHONE', city: 'douala', minPrice: 1000 });
    expect(isSameSavedSearchCriteria(a, b)).toBe(true);
  });

  it('reconstruit un deep link Search stable', () => {
    expect(
      buildSavedSearchHref({
        query: 'iphone',
        minPrice: 1000,
        maxPrice: 200000,
        category: 'Électronique',
        categoryId: 20,
        city: 'Douala',
      })
    ).toBe(
      '/(tabs)/search?q=iphone&priceMin=1000&priceMax=200000&category=%C3%89lectronique&categoryId=20&city=Douala'
    );
    expect(buildSavedSearchListingHref('listing-abc')).toBe('/listing/listing-abc');
  });

  it('construit un libellé lisible sans dupliquer le texte', () => {
    expect(
      buildSavedSearchLabel({
        query: 'iphone',
        category: 'Électronique',
        city: 'Douala',
        minPrice: 1000,
      })
    ).toBe('iphone · Électronique · Douala · Min 1000 FCFA');
  });
});
