import type { ListingDetail } from './getListingById';
import type { ListingDynamicAttributeDisplay } from './getListingDynamicAttributesForDisplay';

export type ListingDetailSessionEntry = {
  listing: ListingDetail;
  dynamicAttributes: ListingDynamicAttributeDisplay[];
  cachedAt: number;
};

const cache = new Map<string, ListingDetailSessionEntry>();
const TTL_MS = 90_000;

function cloneListingDetail(listing: ListingDetail): ListingDetail {
  return {
    ...listing,
    images: [...listing.images],
    galleryLazySourcePaths: listing.galleryLazySourcePaths?.slice(),
  };
}

function cloneEntryForRead(e: ListingDetailSessionEntry): ListingDetailSessionEntry {
  return {
    listing: cloneListingDetail(e.listing),
    dynamicAttributes: e.dynamicAttributes.slice(),
    cachedAt: e.cachedAt,
  };
}

export function peekListingDetailSession(id: string): ListingDetailSessionEntry | null {
  const e = cache.get(id);
  if (!e) return null;
  if (Date.now() - e.cachedAt > TTL_MS) {
    cache.delete(id);
    return null;
  }
  return cloneEntryForRead(e);
}

export function putListingDetailSession(
  id: string,
  listing: ListingDetail,
  dynamicAttributes: ListingDynamicAttributeDisplay[]
): void {
  cache.set(id, {
    listing: cloneListingDetail(listing),
    dynamicAttributes: dynamicAttributes.slice(),
    cachedAt: Date.now(),
  });
}
