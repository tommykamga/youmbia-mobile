/**
 * Listings by city for "Près de vous" / local discovery.
 * Same data model and signed image resolution as getPublicListings.
 */

import { supabase } from '@/lib/supabase';
import { getSignedUrlsMap, listingStoragePathsForCardCover, mapListingCardImages } from '@/lib/listingImageUrl';
import { normalizeListingSchemaFeatures } from '@/lib/listingSchemaFeatures';
import type { PublicListing } from './getPublicListings';
import { listingPublicListSelect } from './listingListSelect';

type ListingImageRow = {
  url: string;
  sort_order: number | null;
  thumb_path?: string | null;
  medium_path?: string | null;
};

type ListingRow = {
  id: string;
  title: string;
  price: number;
  city: string;
  category_id?: number | null;
  created_at: string;
  views_count: number | null;
  user_id: string | null;
  boosted?: boolean | null;
  urgent?: boolean | null;
  district?: string | null;
  updated_at: string;
  listing_images: ListingImageRow[] | null;
};

const DEFAULT_LIMIT = 6;

function mapRow(row: ListingRow, signedMap: Map<string, string>): PublicListing {
  const images = mapListingCardImages(row.listing_images, signedMap);
  const schema = normalizeListingSchemaFeatures(row);
  return {
    id: row.id,
    title: row.title,
    price: row.price,
    city: row.city,
    category_id: row.category_id ?? null,
    created_at: row.created_at,
    images,
    views_count: row.views_count ?? 0,
    seller_id: row.user_id ?? '',
    updated_at: row.updated_at,
    ...schema,
  };
}

export type GetListingsByCityResult =
  | { data: PublicListing[]; error: null }
  | { data: null; error: { message: string } };

/**
 * Fetches active listings in the given city, ordered by updated_at desc then created_at desc.
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
    .select(listingPublicListSelect(false))
    .eq('status', 'active')
    .ilike('city', trimmed)
    .order('urgent', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  const list = (data ?? []) as unknown as ListingRow[];
  const allPaths = list.flatMap((row) => listingStoragePathsForCardCover(row.listing_images));
  const signedMap = await getSignedUrlsMap(allPaths);
  return { data: list.map((row) => mapRow(row, signedMap)), error: null };
}
