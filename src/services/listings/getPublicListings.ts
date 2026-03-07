/**
 * Public listings for the marketplace feed.
 * Queries the same Supabase listings table as the web app (status = 'active').
 * Image URLs: paths from listing_images are resolved via signed URLs (bucket listing-images, same as web).
 */

import { supabase } from '@/lib/supabase';
import { getSignedUrlsMap, toDisplayImageUrl } from '@/lib/listingImageUrl';

export type PublicListing = {
  id: string;
  title: string;
  price: number;
  city: string;
  created_at: string;
  images: string[];
  views_count: number;
  seller_id: string;
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

const PAGE_SIZE = 20;

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

export type GetPublicListingsResult =
  | { data: PublicListing[]; error: null }
  | { data: null; error: { message: string } };

/**
 * Fetches active listings for the feed, ordered by created_at desc.
 * Uses the same RLS as the web app (public select where status = 'active').
 */
export async function getPublicListings(): Promise<GetPublicListingsResult> {
  const { data, error } = await supabase
    .from('listings')
    .select(
      'id, title, price, city, created_at, views_count, user_id, listing_images(url, sort_order)'
    )
    .eq('status', 'active')
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
