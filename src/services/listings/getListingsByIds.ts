/**
 * Fetch listings by ids (e.g. for favorites).
 * Same shape as PublicListing; image paths resolved via signed URLs (bucket listing-images).
 */

import { supabase } from '@/lib/supabase';
import { getSignedUrlsMap, toDisplayImageUrl } from '@/lib/listingImageUrl';
import type { PublicListing } from './getPublicListings';

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

function mapRow(row: ListingRow, signedMap: Map<string, string>): PublicListing {
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

export type GetListingsByIdsResult =
  | { data: PublicListing[]; error: null }
  | { data: null; error: { message: string } };

/**
 * Fetches listings by id array. Returns in same order as ids where found.
 */
export async function getListingsByIds(ids: string[]): Promise<GetListingsByIdsResult> {
  if (!ids.length) return { data: [], error: null };

  const { data, error } = await supabase
    .from('listings')
    .select(
      'id, title, price, city, created_at, views_count, user_id, listing_images(url, sort_order)'
    )
    .in('id', ids)
    .eq('status', 'active');

  if (error) return { data: null, error: { message: error.message } };

  const rows = (data ?? []) as ListingRow[];
  const allPaths = rows.flatMap((row) =>
    (row.listing_images ?? []).map((img) => String(img.url ?? '').trim()).filter(Boolean)
  );
  const signedMap = await getSignedUrlsMap(allPaths);
  const byId = new Map(rows.map((r) => [r.id, mapRow(r, signedMap)]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as PublicListing[];
  return { data: ordered, error: null };
}
