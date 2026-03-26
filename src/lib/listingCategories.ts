/**
 * Id racine « Véhicules » dans l’UI mobile (chips).
 * Le gate dynamique pilote utilise en priorité `categories.form_profile === 'vehicle'` (`shouldUseVehicleDynamicPilot`) ;
 * cet id sert de repli si `form_profile` est absent.
 */
export const VEHICLE_LISTING_CATEGORY_ID = 5 as const;

/**
 * Id racine « Électronique » dans l’UI mobile (chip `electronique`).
 * Repli conservateur pour `shouldUseDynamicAttributesPilot` si `form_profile` est absent (aligné backfill DB).
 */
export const ELECTRONICS_ROOT_LISTING_CATEGORY_ID = 19 as const;

export const LISTING_CATEGORIES = [
  { id: 5, slug: 'vehicules', label: 'Véhicules' },
  { id: 3, slug: 'mode', label: 'Mode' },
  { id: 19, slug: 'electronique', label: 'Électronique' },
  { id: 4, slug: 'immobilier', label: 'Immobilier' },
  { id: 2, slug: 'informatique', label: 'Informatique' },
  { id: 6, slug: 'services', label: 'Services' },
] as const;

export type ListingCategoryId = (typeof LISTING_CATEGORIES)[number]['id'];
export type ListingCategorySlug = (typeof LISTING_CATEGORIES)[number]['slug'];
