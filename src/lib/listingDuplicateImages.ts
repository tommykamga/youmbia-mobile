/**
 * Helpers purs — duplication d’images listing.
 * Destination toujours `userId/newListingId/n.jpg` : jamais le path ni l’id source.
 */

const HTTP_URL_RE = /^https?:\/\//i;

export function isHttpListingImagePath(path: string): boolean {
  return HTTP_URL_RE.test(String(path ?? '').trim());
}

/** `userId/listingId/file.jpg` → listingId, sinon null. */
export function listingIdFromListingImageStoragePath(path: string): string | null {
  const p = String(path ?? '').trim();
  if (!p || isHttpListingImagePath(p) || p.includes('..') || p.startsWith('/')) return null;
  const parts = p.split('/').filter((part) => part.length > 0);
  if (parts.length < 3) return null;
  const listingId = parts[1]?.trim() ?? '';
  return listingId.length > 0 ? listingId : null;
}

export function isOwnedListingImageStoragePath(path: string, userId: string): boolean {
  const uid = String(userId ?? '').trim();
  const p = String(path ?? '').trim();
  if (!uid || !p || isHttpListingImagePath(p) || p.includes('..') || p.startsWith('/')) {
    return false;
  }
  return p.startsWith(`${uid}/`) && listingIdFromListingImageStoragePath(p) != null;
}

export function buildCopiedListingImageDestPath(
  userId: string,
  targetListingId: string,
  sortOrder: number
): string {
  return `${userId}/${targetListingId}/${sortOrder}.jpg`;
}

export function resolveCopiedListingImageDest(args: {
  sourcePath: string;
  targetListingId: string;
  userId: string;
  sortOrder: number;
}): { ok: true; destPath: string } | { ok: false; reason: string } {
  const sourcePath = String(args.sourcePath ?? '').trim();
  const targetListingId = String(args.targetListingId ?? '').trim();
  const userId = String(args.userId ?? '').trim();
  if (!targetListingId || !userId || !Number.isInteger(args.sortOrder) || args.sortOrder < 0) {
    return { ok: false, reason: 'invalid-args' };
  }
  if (!isOwnedListingImageStoragePath(sourcePath, userId)) {
    return { ok: false, reason: 'not-owned' };
  }
  const sourceListingId = listingIdFromListingImageStoragePath(sourcePath);
  if (!sourceListingId || sourceListingId === targetListingId) {
    return { ok: false, reason: 'same-listing' };
  }
  const destPath = buildCopiedListingImageDestPath(userId, targetListingId, args.sortOrder);
  if (destPath === sourcePath) {
    return { ok: false, reason: 'same-path' };
  }
  if (!destPath.includes(targetListingId)) {
    return { ok: false, reason: 'dest-missing-target-id' };
  }
  return { ok: true, destPath };
}

export function toPendingCopiedDraftImages(
  images: { path: string; sort_order: number | null; displayUrl: string }[]
): { id: ''; path: string; sort_order: number | null; displayUrl: string }[] {
  return images
    .filter(
      (img) =>
        String(img.path ?? '').trim() !== '' && String(img.displayUrl ?? '').trim() !== ''
    )
    .map((img) => ({
      id: '' as const,
      path: String(img.path).trim(),
      sort_order: img.sort_order,
      displayUrl: String(img.displayUrl).trim(),
    }));
}
