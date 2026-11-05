import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

export type ListingAttributeIconName = ComponentProps<typeof Ionicons>['name'];

/** Icône discrète déduite de la clé ou du libellé métier — aucune donnée inventée. */
export function getListingAttributeIcon(key: string, labelFr: string): ListingAttributeIconName {
  const haystack = `${key} ${labelFr}`.toLowerCase();

  if (/(^|_|-)(km|mileage|kilomet|odometer)/.test(haystack) || haystack.includes('kilom')) {
    return 'speedometer-outline';
  }
  if (haystack.includes('carburant') || haystack.includes('fuel') || haystack.includes('essence') || haystack.includes('diesel')) {
    return 'flash-outline';
  }
  if (haystack.includes('transmission') || haystack.includes('boite') || haystack.includes('boîte')) {
    return 'git-branch-outline';
  }
  if (haystack.includes('annee') || haystack.includes('année') || haystack.includes('year') || haystack.includes('mise en circulation')) {
    return 'calendar-outline';
  }
  if (haystack.includes('superficie') || haystack.includes('surface') || haystack.includes('m2') || haystack.includes('m²')) {
    return 'resize-outline';
  }
  if (haystack.includes('piece') || haystack.includes('pièce') || haystack.includes('chambre') || haystack.includes('room')) {
    return 'bed-outline';
  }
  if (haystack.includes('marque') || haystack.includes('brand')) {
    return 'pricetag-outline';
  }
  if (haystack.includes('modele') || haystack.includes('modèle') || haystack.includes('model')) {
    return 'cube-outline';
  }
  if (haystack.includes('etat') || haystack.includes('état') || haystack.includes('condition')) {
    return 'shield-checkmark-outline';
  }
  if (haystack.includes('taille') || haystack.includes('size')) {
    return 'resize-outline';
  }
  if (haystack.includes('capacite') || haystack.includes('capacité') || haystack.includes('storage') || haystack.includes('go') || haystack.includes('gb')) {
    return 'hardware-chip-outline';
  }
  if (haystack.includes('couleur') || haystack.includes('color')) {
    return 'color-palette-outline';
  }

  return 'information-circle-outline';
}
