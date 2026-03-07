/**
 * Listings by city for "Près de vous" / local discovery.
 * Same data model and signed image resolution as getPublicListings.
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

const DEFAULT_LIMIT = 6;

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

export type GetListingsByCityResult =
  | { data: PublicListing[]; error: null }
  | { data: null; error: { message: string } };

/**
 * Fetches active listings in the given city, ordered by created_at desc.
 * City match is case-insensitive (ilike). Use for "Près de vous" when user city is known.
 */
export async function getListingsByCity(
  city: string,
  limit: number = DEFAULT_LIMIT
): Promise<GetListingsByCityResult> {
  const trimmed = city?.trim();
  if (!trimmed) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from('listings')
    .select(
      'id, title, price, city, created_at, views_count, user_id, listing_images(url, sort_order)'
    )
    .eq('status', 'active')
    .ilike('city', trimmed)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  const list = (data ?? []) as ListingRow[];
  const allPaths = list.flatMap((row) =>
    (row.listing_images ?? []).map((img) => String(img.url ?? '').trim()).filter(Boolean)
  );
  const signedMap = await getSignedUrlsMap(allPaths);
  return { data: list.map((row) => mapRow(row, signedMap)), error: null };
}
