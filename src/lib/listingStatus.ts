/**
 * Statuts annonce alignés sur l’enum Postgres `listing_status`.
 * `sold` est additif (TOM-99) : distinct de `hidden` (pause) et `suspended` (modération).
 * `draft` est additif (TOM-98) : brouillon propriétaire uniquement, jamais discovery.
 */

export const LISTING_STATUS = {
  active: 'active',
  hidden: 'hidden',
  suspended: 'suspended',
  sold: 'sold',
  draft: 'draft',
} as const;

export const DRAFT_LISTING_SAVED_MESSAGE = 'Brouillon enregistré';
export const DRAFT_LISTING_DELETE_CONFIRM_TITLE = 'Supprimer ce brouillon ?';
export const DRAFT_LISTING_DELETE_CONFIRM_MESSAGE =
  'Cette action est définitive. Vous ne pourrez plus reprendre ce brouillon.';
export const DRAFT_LISTING_DELETE_CONFIRM_ACTION = 'Supprimer';
export const DRAFT_LISTING_RESUME_ACTION = 'Reprendre';
export const DRAFT_LISTING_SAVE_ACTION = 'Enregistrer comme brouillon';
export const DRAFT_LISTING_SECTION_TITLE = 'Brouillons';
export const DRAFT_LISTING_EMPTY_HINT = 'Aucun brouillon pour le moment.';

export type ListingStatus = (typeof LISTING_STATUS)[keyof typeof LISTING_STATUS];

export const DISCOVERY_LISTING_STATUS = LISTING_STATUS.active;

export const LISTING_UNAVAILABLE_MESSAGE = "Cette annonce n'est plus disponible.";

export const MARK_LISTING_SOLD_CONFIRM_TITLE = 'Marquer comme vendue ?';
export const MARK_LISTING_SOLD_CONFIRM_MESSAGE =
  "L'annonce ne sera plus visible dans l'accueil, la recherche et les similaires. Elle ne sera pas supprimée. Les conversations existantes restent accessibles. Vous pourrez la remettre en ligne plus tard.";
export const MARK_LISTING_SOLD_CONFIRM_ACTION = 'Marquer comme vendue';
export const MARK_LISTING_SOLD_SUCCESS_TITLE = 'Annonce vendue';
export const MARK_LISTING_SOLD_SUCCESS_MESSAGE =
  "Votre annonce n'apparaît plus dans le fil. Elle n'a pas été supprimée.";
export const MARK_LISTING_SOLD_ERROR_MESSAGE = "Impossible de marquer l'annonce comme vendue.";

export const REACTIVATE_HIDDEN_CONFIRM_TITLE = "Réactiver l'annonce ?";
export const REACTIVATE_HIDDEN_CONFIRM_MESSAGE =
  "L'annonce sera de nouveau visible dans l'accueil et la recherche. Sa date de publication ne change pas.";
export const REACTIVATE_HIDDEN_CONFIRM_ACTION = 'Réactiver';
export const REACTIVATE_HIDDEN_SUCCESS_MESSAGE = "L'annonce est de nouveau en ligne.";

export const REACTIVATE_SOLD_CONFIRM_TITLE = "Remettre l'annonce en ligne ?";
export const REACTIVATE_SOLD_CONFIRM_MESSAGE =
  "L'annonce redeviendra visible. Un nouveau cycle de vente commencera. Elle n'est pas dupliquée : favoris, messages et lien restent les mêmes.";
export const REACTIVATE_SOLD_CONFIRM_ACTION = 'Remettre en ligne';
export const REACTIVATE_SOLD_SUCCESS_MESSAGE = "L'annonce est de nouveau en ligne.";
export const REACTIVATE_LISTING_ERROR_MESSAGE = "Impossible de remettre l'annonce en ligne.";

export const RENEW_LISTING_CONFIRM_TITLE = "Renouveler l'annonce ?";
export const RENEW_LISTING_CONFIRM_MESSAGE =
  "L'annonce sera remise en tête des résultats récents. Elle ne sera pas dupliquée. Les favoris, messages et le lien restent les mêmes.";
export const RENEW_LISTING_CONFIRM_ACTION = 'Renouveler';
export const RENEW_LISTING_SUCCESS_MESSAGE = "L'annonce a été renouvelée.";
export const RENEW_LISTING_ERROR_MESSAGE = "Impossible de renouveler l'annonce.";

export function normalizeListingStatus(status: string | null | undefined): string {
  return String(status ?? LISTING_STATUS.active).toLowerCase();
}

export function isDiscoveryListingStatus(status: string | null | undefined): boolean {
  return normalizeListingStatus(status) === DISCOVERY_LISTING_STATUS;
}

export function isSoldListingStatus(status: string | null | undefined): boolean {
  return normalizeListingStatus(status) === LISTING_STATUS.sold;
}

export function canSellerMarkListingSold(status: string | null | undefined): boolean {
  const normalized = normalizeListingStatus(status);
  return normalized === LISTING_STATUS.active || normalized === LISTING_STATUS.hidden;
}

/** Pause et vendue : le vendeur peut remettre en ligne. Suspendue : non. */
export function canSellerReactivateListing(status: string | null | undefined): boolean {
  const normalized = normalizeListingStatus(status);
  return normalized === LISTING_STATUS.hidden || normalized === LISTING_STATUS.sold;
}

/** Renouvellement manuel : annonce déjà en ligne uniquement. Suspendue / pause / vendue : non. */
export function canSellerRenewListing(status: string | null | undefined): boolean {
  return normalizeListingStatus(status) === LISTING_STATUS.active;
}

export const DUPLICATE_LISTING_ACTION = 'Dupliquer';
export const LISTING_DUPLICATE_NOT_ELIGIBLE_MESSAGE = 'Cette annonce ne peut pas être dupliquée.';

/**
 * Duplication : annonces du vendeur actives, vendues ou en pause.
 * Brouillon = reprendre, pas dupliquer. Suspendue = hors duplication (modération).
 */
export function canSellerDuplicateListing(status: string | null | undefined): boolean {
  const normalized = normalizeListingStatus(status);
  return (
    normalized === LISTING_STATUS.active ||
    normalized === LISTING_STATUS.sold ||
    normalized === LISTING_STATUS.hidden
  );
}

export function getSellerReactivateActionLabel(status: string | null | undefined): string {
  return isSoldListingStatus(status) ? REACTIVATE_SOLD_CONFIRM_ACTION : REACTIVATE_HIDDEN_CONFIRM_ACTION;
}

export function isDraftListingStatus(status: string | null | undefined): boolean {
  return normalizeListingStatus(status) === LISTING_STATUS.draft;
}

/**
 * Accès fiche détail côté app (sans élargir le SELECT public).
 * - active : tout viewer qui a lu la ligne
 * - sold / draft : propriétaire uniquement
 * - hidden / suspended : pas de fiche publique
 */
export function canViewerAccessListingDetail(options: {
  status: string | null | undefined;
  ownerId: string | null | undefined;
  viewerId: string | null | undefined;
}): boolean {
  if (isDiscoveryListingStatus(options.status)) return true;
  if (!isSoldListingStatus(options.status) && !isDraftListingStatus(options.status)) {
    return false;
  }
  const ownerId = String(options.ownerId ?? '').trim();
  const viewerId = String(options.viewerId ?? '').trim();
  return ownerId.length > 0 && viewerId.length > 0 && ownerId === viewerId;
}

export function getSellerListingStatusLabel(status: string | null | undefined): string {
  const normalized = normalizeListingStatus(status);
  if (normalized === LISTING_STATUS.active) return 'En ligne';
  if (normalized === LISTING_STATUS.sold) return 'Vendue';
  if (normalized === LISTING_STATUS.suspended) return 'Suspendue';
  if (normalized === LISTING_STATUS.hidden) return 'En pause';
  if (normalized === LISTING_STATUS.draft) return 'Brouillon';
  return 'Hors ligne';
}

export function isAllowedListingStatus(status: string): status is ListingStatus {
  return (
    status === LISTING_STATUS.active ||
    status === LISTING_STATUS.hidden ||
    status === LISTING_STATUS.suspended ||
    status === LISTING_STATUS.sold ||
    status === LISTING_STATUS.draft
  );
}
