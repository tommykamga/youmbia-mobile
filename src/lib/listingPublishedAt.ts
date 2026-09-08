/**
 * Récence de publication pour le ranking discovery.
 * last_published_at (DB généré) = COALESCE(renewed_at, created_at).
 * Jamais updated_at. Jamais created_at muté.
 */

import { LISTING_RENEWAL_COOLDOWN_DAYS } from './listingRenewal';

export type ListingPublicationTimestamps = {
  created_at?: string | null;
  renewed_at?: string | null;
  last_published_at?: string | null;
};

export const LISTING_RENEW_MIN_AGE_DAYS = LISTING_RENEWAL_COOLDOWN_DAYS;

function trimTimestamp(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

/** Instant de publication pour le tri : last_published_at, sinon renewed_at, sinon created_at. */
export function listingPublishedAt(listing: ListingPublicationTimestamps): string {
  const last = trimTimestamp(listing.last_published_at);
  if (last) return last;
  const renewed = trimTimestamp(listing.renewed_at);
  if (renewed) return renewed;
  return String(listing.created_at ?? '');
}

export function listingPublishedAtMs(listing: ListingPublicationTimestamps): number {
  const ms = Date.parse(listingPublishedAt(listing));
  return Number.isFinite(ms) ? ms : 0;
}

export function listingAgeInDays(
  listing: ListingPublicationTimestamps,
  nowMs: number = Date.now()
): number | null {
  const publishedMs = listingPublishedAtMs(listing);
  if (publishedMs <= 0) return null;
  const diff = nowMs - publishedMs;
  if (!Number.isFinite(diff) || diff < 0) return null;
  return diff / (1000 * 60 * 60 * 24);
}

/** Aligné sur le trigger : now() >= last_publication + 3 days. */
export function isListingRenewalDue(
  listing: ListingPublicationTimestamps,
  nowMs: number = Date.now()
): boolean {
  const age = listingAgeInDays(listing, nowMs);
  return age != null && age >= LISTING_RENEW_MIN_AGE_DAYS;
}

export function pickListingRecency(row: ListingPublicationTimestamps): {
  last_published_at: string | null;
  renewed_at: string | null;
} {
  return {
    last_published_at: row.last_published_at ?? null,
    renewed_at: row.renewed_at ?? null,
  };
}
