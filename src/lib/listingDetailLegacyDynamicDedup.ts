import type { ListingDynamicAttributeDisplay } from '@/services/listings/getListingDynamicAttributesForDisplay';

/**
 * Colonnes legacy `listings` recouvertes par des attributs dynamiques de même `key`
 * (profils vehicle / electronics). Dédoublonnage strictement visuel fiche annonce.
 */
export const LEGACY_LISTING_DETAIL_FIELDS_OVERLAPPED_BY_DYNAMIC_KEY = [
  'condition',
  'brand',
  'model',
] as const;

export type LegacyListingDetailFieldOverlapped =
  (typeof LEGACY_LISTING_DETAIL_FIELDS_OVERLAPPED_BY_DYNAMIC_KEY)[number];

export function buildDynamicKeySetForLegacyDedup(
  items: ListingDynamicAttributeDisplay[]
): Set<string> {
  return new Set(items.map((i) => i.key));
}

/**
 * Afficher une ligne legacy uniquement si la valeur legacy est non vide
 * et qu’aucun attribut dynamique de même `key` n’est affiché (priorité dynamique).
 */
export function shouldShowLegacyListingDetailField(
  field: LegacyListingDetailFieldOverlapped,
  legacyValue: string | undefined | null,
  dynamicKeys: Set<string>
): boolean {
  const trimmed = legacyValue != null ? String(legacyValue).trim() : '';
  if (!trimmed) return false;
  if (dynamicKeys.has(field)) return false;
  return true;
}
