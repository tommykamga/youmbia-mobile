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
