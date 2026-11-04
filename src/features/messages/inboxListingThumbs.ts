import type { PublicListing } from '@/services/listings/getPublicListings';
import { getListingsByIds } from '@/services/listings/getListingsByIds';

/** Identifiants d'annonces distincts (ordre stable pour clé de requête). */
export function uniqueListingIdsFromConversations(
  conversations: { listing_id: string }[]
): string[] {
  const set = new Set<string>();
  for (const c of conversations) {
    const id = String(c.listing_id ?? '').trim();
    if (id) set.add(id);
  }
  return [...set].sort();
}

/** Première URL carte (vignette signée via getListingsByIds). */
export function mapListingsToThumbById(listings: PublicListing[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const listing of listings) {
    const url = listing.images?.[0]?.trim();
    if (url) out[listing.id] = url;
  }
  return out;
}

export function listingIdsCacheKey(ids: string[]): string {
  return ids.join('\u001f');
}

export function thumbMapsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/** Charge les vignettes (1 appel batch — thumb_path via getListingsByIds). */
export async function loadInboxListingThumbsForIds(
  listingIds: string[]
): Promise<Record<string, string>> {
  if (!listingIds.length) return {};
  const result = await getListingsByIds(listingIds);
  if (result.error || !result.data) return {};
  const resolved = mapListingsToThumbById(result.data);
  const next: Record<string, string> = {};
  for (const id of listingIds) {
    if (resolved[id]) next[id] = resolved[id];
  }
  return next;
}
