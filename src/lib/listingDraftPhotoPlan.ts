/**
 * Planification upload photos brouillon / publish.
 * iOS physique : ImagePicker peut renvoyer `base64: null` → on accepte aussi `uri`.
 */

export type ListingPhotoCandidate = {
  uri?: string | null;
  base64?: string | null;
  mimeType?: string | null;
};

export function isUploadableListingPhoto(img: ListingPhotoCandidate): boolean {
  const hasBase64 = typeof img.base64 === 'string' && img.base64.trim().length > 0;
  const hasUri = typeof img.uri === 'string' && img.uri.trim().length > 0;
  return hasBase64 || hasUri;
}

export function filterUploadableListingPhotos<T extends ListingPhotoCandidate>(images: T[]): T[] {
  return images.filter(isUploadableListingPhoto);
}

/** Nombre de slots `sort_order` valides (aligné sur `uploadListingImages`). */
export const LISTING_IMAGE_SORT_ORDER_SLOTS = 4;

/**
 * Prochains sort_order pour de nouvelles photos : réutilise les emplacements libres
 * dans [0, slotCount) afin d’éviter un index ≥ slotCount après suppression intermédiaire.
 */
export function nextListingImageSortOrders(
  existingSortOrders: (number | null | undefined)[],
  newCount: number,
  slotCount: number = LISTING_IMAGE_SORT_ORDER_SLOTS
): number[] {
  if (newCount <= 0) return [];
  const occupied = new Set<number>();
  for (const order of existingSortOrders) {
    if (typeof order === 'number' && Number.isInteger(order) && order >= 0 && order < slotCount) {
      occupied.add(order);
    }
  }
  const next: number[] = [];
  for (let slot = 0; slot < slotCount && next.length < newCount; slot++) {
    if (!occupied.has(slot)) {
      next.push(slot);
    }
  }
  return next;
}

/** Ligne `listing_images` déjà persistée (UUID). Les copies en attente n’ont pas d’id. */
export function isPersistedListingImageId(id: string | null | undefined): boolean {
  return String(id ?? '').trim().length > 0;
}

/** Images préremplies d’une duplication, pas encore copiées vers le nouvel ID. */
export function pendingCopiedListingImageSources<
  T extends { id?: string | null; path: string; sort_order: number | null },
>(images: T[]): { path: string; sort_order: number | null }[] {
  return images
    .filter((img) => !isPersistedListingImageId(img.id) && String(img.path ?? '').trim() !== '')
    .map((img) => ({ path: String(img.path).trim(), sort_order: img.sort_order }));
}
