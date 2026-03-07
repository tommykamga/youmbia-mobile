/**
 * Get public profile and active listings for a user (seller profile page).
 * Sprint 5.2 – Profil public vendeur.
 */

import { supabase } from '@/lib/supabase';
import { getSignedUrlsMap, toDisplayImageUrl } from '@/lib/listingImageUrl';
import type { PublicListing } from '@/services/listings';

export type UserProfile = {
  id: string;
  full_name: string | null;
  created_at: string | null;
  is_verified: boolean | null;
  trust_score: number | null;
  reports_count: number | null;
  is_banned: boolean | null;
  is_flagged: boolean | null;
};

type ListingImageRow = { url: string; sort_order: number | null };

type ListingRow = {
  id: string;
  title: string;
  price: number;
  city: string;
  created_at: string;
  views_count: number | null;
  user_id: string | null;
  listing_images: ListingImageRow[] | null;
};

function mapListingRow(row: ListingRow, signedMap: Map<string, string>): PublicListing {
  const images = (row.listing_images ?? [])
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((img) => toDisplayImageUrl(img.url ?? '', signedMap))
    .filter((url) => url !== '');
  return {
    id: row.id,
    title: row.title,
    price: row.price,
    city: row.city,
    created_at: row.created_at,
    images,
    views_count: row.views_count ?? 0,
    seller_id: row.user_id ?? '',
  };
}

export type GetUserProfileResult =
  | { data: { profile: UserProfile; listings: PublicListing[] }; error: null }
  | { data: null; error: { message: string } };

/**
 * Fetches profile (profiles) and active listings (listings) for the given user id.
 * Used for the public seller profile screen.
 */
export async function getUserProfile(userId: string): Promise<GetUserProfileResult> {
  const id = userId?.trim();
  if (!id) {
    return { data: null, error: { message: 'Identifiant manquant' } };
  }

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, created_at, is_verified, trust_score, reports_count, is_banned, is_flagged')
    .eq('id', id)
    .maybeSingle();

  if (profileError) {
    return { data: null, error: { message: profileError.message } };
  }

  if (!profileRow) {
    return { data: null, error: { message: 'Profil introuvable' } };
  }

  const profile: UserProfile = {
    id: (profileRow as { id: string }).id,
    full_name: (profileRow as { full_name: string | null }).full_name ?? null,
    created_at: (profileRow as { created_at: string | null }).created_at ?? null,
    is_verified: (profileRow as { is_verified?: boolean | null }).is_verified ?? null,
    trust_score: (profileRow as { trust_score?: number | null }).trust_score ?? null,
    reports_count: (profileRow as { reports_count?: number | null }).reports_count ?? null,
    is_banned: (profileRow as { is_banned?: boolean | null }).is_banned ?? null,
    is_flagged: (profileRow as { is_flagged?: boolean | null }).is_flagged ?? null,
  };

  const { data: listingRows, error: listingsError } = await supabase
    .from('listings')
    .select('id, title, price, city, created_at, views_count, user_id, listing_images(url, sort_order)')
    .eq('user_id', id)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (listingsError) {
    return { data: null, error: { message: listingsError.message } };
  }

  const rows = (listingRows ?? []) as ListingRow[];
  const allPaths = rows.flatMap((row) =>
    (row.listing_images ?? []).map((img) => String(img.url ?? '').trim()).filter(Boolean)
  );
  const signedMap = await getSignedUrlsMap(allPaths);
  const listings = rows.map((row) => mapListingRow(row, signedMap));

  return { data: { profile, listings }, error: null };
}
