/**
 * Fetch listings by ids (e.g. for favorites).
 * Same shape as PublicListing; image paths resolved via signed URLs (bucket listing-images).
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
  updated_at: string;
  views_count: number | null;
  user_id: string | null;
  boosted?: boolean | null;
  urgent?: boolean | null;
  district?: string | null;
  listing_images: ListingImageRow[] | null;
};

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
    updated_at: row.updated_at,
    images,
    views_count: row.views_count ?? 0,
    seller_id: row.user_id ?? '',
    ...schema,
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
    .select(listingPublicListSelect(false))
    .in('id', ids)
    .eq('status', 'active');

  if (error) return { data: null, error: { message: error.message } };

  const rows = (data ?? []) as unknown as ListingRow[];
  const allPaths = rows.flatMap((row) => listingStoragePathsForCardCover(row.listing_images));
  const signedMap = await getSignedUrlsMap(allPaths);
  const byId = new Map(rows.map((r) => [r.id, mapRow(r, signedMap)]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as PublicListing[];
  return { data: ordered, error: null };
}
