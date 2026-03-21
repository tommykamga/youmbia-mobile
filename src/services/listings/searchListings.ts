/**
 * Search active listings by text (title, city, description).
 * Uses the same Supabase listings + listing_images model as getPublicListings.
 * Image URLs resolved via signed URLs (bucket listing-images).
 */

import { supabase } from '@/lib/supabase';
import { getSignedUrlsMap, toDisplayImageUrl } from '@/lib/listingImageUrl';
import { normalizeListingSchemaFeatures } from '@/lib/listingSchemaFeatures';
import type { PublicListing } from './getPublicListings';

type ListingImageRow = { url: string; sort_order: number | null };

type ListingRow = {
  id: string;
  title: string;
  price: number;
  city: string;
  description: string | null;
  created_at: string;
  views_count: number | null;
  user_id: string | null;
  boosted?: boolean | null;
  urgent?: boolean | null;
  district?: string | null;
  updated_at: string;
  listing_images: ListingImageRow[] | null;
};

const PAGE_SIZE = 30;

function mapRow(row: ListingRow, signedMap: Map<string, string>): PublicListing {
  const images = (row.listing_images ?? [])
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((img) => toDisplayImageUrl(img.url ?? '', signedMap))
    .filter((url) => url !== '');
  const schema = normalizeListingSchemaFeatures(row);
  return {
    id: row.id,
    title: row.title,
    price: row.price,
    city: row.city,
    description: row.description ?? null,
    created_at: row.created_at,
    images,
    views_count: row.views_count ?? 0,
    seller_id: row.user_id ?? '',
    updated_at: row.updated_at,
    ...schema,
  };
}

export type SearchListingsResult =
  | { data: PublicListing[]; error: null }
  | { data: null; error: { message: string } };

/**
 * Search active listings by query (title, city, description).
 * Returns empty array when query is empty or only whitespace.
 */
export async function searchListings(query: string): Promise<SearchListingsResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { data: [], error: null };
  }

  const safe = trimmed.replace(/[%_\\]/g, '');
  const pattern = `%${safe}%`;

  const { data, error } = await supabase
    .from('listings')
    .select(
      'id, title, price, city, description, boosted, urgent, district, created_at, updated_at, views_count, user_id, listing_images(url, sort_order)'
    )
    .eq('status', 'active')
    .or(`title.ilike.${pattern},city.ilike.${pattern},description.ilike.${pattern}`)
    .order('urgent', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

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
