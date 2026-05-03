/**
 * Chaînes `select()` PostgREST partagées pour les flux **liste** (Home, recherche, favoris, etc.).
 * Objectif : limiter l’egress — pas de `select('*')` ; détail annonce reste sur `getListingById`.
 */

/** Première image : jointure `listing_images` ; le client ne garde qu’une vignette via `mapListingCardImages`. */
export const LISTING_LIST_IMAGES_SELECT =
  'listing_images(url, sort_order, thumb_path, medium_path)';

/**
 * Colonnes carte liste (annonces actives filtrées côté requête).
 * `status` omis ici quand le filtre est `.eq('status','active')` (valeur constante).
 */
export const LISTING_PUBLIC_LIST_CORE_SELECT =
  'id, title, price, city, category_id, boosted, urgent, district, created_at, updated_at, views_count, user_id';

/** Liste publique + images ; `description` uniquement si besoin (ex. scoring recherche client). */
export function listingPublicListSelect(includeDescription: boolean): string {
  if (includeDescription) {
    return `${LISTING_PUBLIC_LIST_CORE_SELECT}, description, ${LISTING_LIST_IMAGES_SELECT}`;
  }
  return `${LISTING_PUBLIC_LIST_CORE_SELECT}, ${LISTING_LIST_IMAGES_SELECT}`;
}

/** Mes annonces : `description` (badge qualité) + `status`. */
export const LISTING_MY_LISTINGS_SELECT = `${LISTING_PUBLIC_LIST_CORE_SELECT}, description, status, ${LISTING_LIST_IMAGES_SELECT}`;
