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

/** Prochains sort_order après les images déjà persistées (ordre stable, pas de collision). */
export function nextListingImageSortOrders(
  existingSortOrders: (number | null | undefined)[],
  newCount: number
): number[] {
  if (newCount <= 0) return [];
  const start =
    existingSortOrders.reduce<number>((max, order) => Math.max(max, order ?? -1), -1) + 1;
  return Array.from({ length: newCount }, (_, i) => start + i);
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
