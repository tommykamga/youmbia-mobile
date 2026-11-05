import { describe, expect, it } from 'vitest';
import { getListingAttributeIcon } from './listingAttributeIcon';

describe('getListingAttributeIcon', () => {
  it('choisit une icône cohérente pour les clés véhicule courantes', () => {
    expect(getListingAttributeIcon('mileage_km', 'Kilométrage')).toBe('speedometer-outline');
    expect(getListingAttributeIcon('fuel_type', 'Carburant')).toBe('flash-outline');
    expect(getListingAttributeIcon('year', 'Année')).toBe('calendar-outline');
  });

  it('retombe sur une icône neutre pour un attribut inconnu', () => {
    expect(getListingAttributeIcon('custom_xyz', 'Autre détail')).toBe('information-circle-outline');
  });
});
