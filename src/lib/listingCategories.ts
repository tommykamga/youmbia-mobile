/**
 * Id racine « Véhicules » dans l’UI mobile (chips).
 * Le gate dynamique pilote utilise en priorité `categories.form_profile === 'vehicle'` (`shouldUseVehicleDynamicPilot`) ;
 * cet id sert de repli si `form_profile` est absent.
 */
export const VEHICLE_LISTING_CATEGORY_ID = 5 as const;
export const ELECTRONICS_ROOT_LISTING_CATEGORY_ID = 19 as const;

export type ListingCategoryId = number;
