/**
 * Id racine « Véhicules » dans l’UI mobile (chips).
 * Le gate dynamique pilote utilise en priorité `categories.form_profile === 'vehicle'` (`shouldUseVehicleDynamicPilot`) ;
 * cet id sert de repli si `form_profile` est absent.
 */
export const VEHICLE_LISTING_CATEGORY_ID = 5 as const;
export const ELECTRONICS_ROOT_LISTING_CATEGORY_ID = 19 as const;

export const LISTING_CATEGORIES = [
  { id: 5, slug: 'vehicules', label: 'Véhicules' },
  { id: 19, slug: 'electronique', label: 'Électronique' },
  { id: 43, slug: 'maison-decoration', label: 'Maison' },
  { id: 36, slug: 'mode-beaute', label: 'Mode' },
  { id: 4, slug: 'immobilier', label: 'Immobilier' },
  { id: 6, slug: 'services', label: 'Services' },
  { id: 2, slug: 'informatique', label: 'Informatique' },
] as const;

/**
 * Mapping of root categories to all their sub-category IDs.
 * This allows searchListings to filter by the entire branch.
 */
export const ROOT_CATEGORY_TREE: Record<number, number[]> = {
  5: [5], // Véhicules
  19: [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35], // Électronique
  43: [43, 44, 45, 46, 47], // Maison & Décoration
  36: [36, 37, 38, 39, 40, 41, 42], // Mode & Beauté
  4: [4], // Immobilier
  6: [6], // Services
  2: [2], // Informatique
};

export type ListingCategoryId = (typeof LISTING_CATEGORIES)[number]['id'];
export type ListingCategorySlug = (typeof LISTING_CATEGORIES)[number]['slug'];
