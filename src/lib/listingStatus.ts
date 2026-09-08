/**
 * Statuts annonce alignés sur l’enum Postgres `listing_status`.
 * `sold` est additif (TOM-99) : distinct de `hidden` (pause) et `suspended` (modération).
 */

export const LISTING_STATUS = {
  active: 'active',
  hidden: 'hidden',
  suspended: 'suspended',
  sold: 'sold',
} as const;

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

/**
 * Accès fiche détail côté app (sans élargir le SELECT public).
 * - active : tout viewer qui a lu la ligne
 * - sold : propriétaire uniquement
 * - hidden / suspended : pas de fiche publique
 */
export function canViewerAccessListingDetail(options: {
  status: string | null | undefined;
  ownerId: string | null | undefined;
  viewerId: string | null | undefined;
}): boolean {
  if (isDiscoveryListingStatus(options.status)) return true;
  if (!isSoldListingStatus(options.status)) return false;
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
  return 'Hors ligne';
}

export function isAllowedListingStatus(status: string): status is ListingStatus {
  return (
    status === LISTING_STATUS.active ||
    status === LISTING_STATUS.hidden ||
    status === LISTING_STATUS.suspended ||
    status === LISTING_STATUS.sold
  );
}
