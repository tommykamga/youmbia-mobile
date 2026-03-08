/**
 * Features dépendantes du schéma Supabase (boosted, urgent, district).
 * Ces colonnes ne sont pas encore présentes en base ; les requêtes ne les sélectionnent pas.
 * Ce module centralise les fallbacks pour que l'app reste stable et que l'UI soit
 * explicitement tolérante quand une feature n'est pas activée.
 *
 * Réactivation : ajouter les colonnes en base puis réintégrer les champs dans les .select()
 * des services listés dans docs/REACTIVATION_SCHEMA_FEATURES.md.
 */

/** Type minimal pour une ligne listing pouvant contenir les champs optionnels (après migration). */
export type ListingRowSchemaFeatures = {
  boosted?: boolean | null;
  urgent?: boolean | null;
  district?: string | null;
};

/** Valeurs sûres pour l'affichage quand les colonnes sont absentes ou non sélectionnées. */
export const LISTING_SCHEMA_DEFAULTS = {
  boosted: false,
  urgent: false,
  district: null as string | null,
} as const;

/**
 * Normalise les champs optionnels d'une ligne listing (row) pour le mapping côté services.
 * À appeler dans chaque mapRow avant de construire PublicListing / ListingDetail.
 * Ne pas utiliser pour afficher des données non renvoyées par l'API (pas de faux flags).
 */
export function normalizeListingSchemaFeatures(
  row: ListingRowSchemaFeatures | undefined | null
): typeof LISTING_SCHEMA_DEFAULTS {
  if (row == null) return LISTING_SCHEMA_DEFAULTS;
  return {
    boosted: row.boosted === true,
    urgent: row.urgent === true,
    district:
      row.district != null && String(row.district).trim() !== ''
        ? String(row.district).trim()
        : null,
  };
}

/** Objet minimal pour l'affichage urgent (listing ou meta props). */
type WithUrgent = { urgent?: boolean | null };

/** Objet minimal pour l'affichage district. */
type WithDistrict = { district?: string | null };

/** Objet minimal pour l'affichage boosted (tri). */
type WithBoosted = { boosted?: boolean | null };

/**
 * Retourne true uniquement si la feature "urgent" est explicitement activée.
 * Aucun badge "Urgent" si absent ou non déployé.
 */
export function getDisplayUrgent(listing: WithUrgent | undefined | null): boolean {
  return listing?.urgent === true;
}

/**
 * Retourne le district affichable (chaîne non vide) ou null.
 * Aucun affichage quartier si absent ou vide.
 */
export function getDisplayDistrict(listing: WithDistrict | undefined | null): string | null {
  if (listing?.district == null) return null;
  const s = String(listing.district).trim();
  return s === '' ? null : s;
}

/**
 * Construit la ligne de localisation "Ville · Quartier" ou "Ville" seule.
 * Tolérant aux champs absents.
 */
export function getDisplayLocationLine(
  city: string,
  district?: string | null
): string {
  const d = getDisplayDistrict({ district });
  return [city, d].filter(Boolean).join(' · ') || city || '';
}

/**
 * Retourne true uniquement si la feature "boosted" est explicitement activée.
 * Utilisé pour le tri (annonces boostées en premier) ; pas de tri boost si absent.
 */
export function getDisplayBoosted(listing: WithBoosted | undefined | null): boolean {
  return listing?.boosted === true;
}
