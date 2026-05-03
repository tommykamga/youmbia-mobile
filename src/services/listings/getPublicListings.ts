/**
 * Public listings for the marketplace feed.
 * Queries the same Supabase listings table as the web app (status = 'active').
 * Image URLs: paths from listing_images are resolved via signed URLs (bucket listing-images, same as web).
 */

import { supabase } from '@/lib/supabase';
import { getSignedUrlsMap, toDisplayImageUrl } from '@/lib/listingImageUrl';
import { normalizeListingSchemaFeatures } from '@/lib/listingSchemaFeatures';

export type PublicListing = {
  id: string;
  title: string;
  price: number;
  city: string;
  description?: string | null;
  created_at: string;
  images: string[];
  views_count: number;
  seller_id: string;
  /** When true, listing is boosted and should appear first in feed (sort: boosted then created_at). */
  boosted?: boolean;
  /** Badge "Urgent" – vendeur marque l’annonce comme urgente. */
  urgent?: boolean;
  /** Quartier ou zone (affichage localisation améliorée). */
  district?: string | null;
  /** En contexte favoris : true si le prix a baissé (backend / historique). */
  price_dropped?: boolean;
  updated_at: string;
};

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

const PAGE_SIZE = 20;

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

export type GetPublicListingsResult =
  | { data: PublicListing[]; error: null }
  | { data: null; error: { message: string } };

/**
 * Fetches active listings for the feed, ordered by updated_at desc then created_at desc.
 * Uses the same RLS as the web app (public select where status = 'active').
 * Supports pagination via offset/limit (Supabase .range).
 */
export async function getPublicListings(
  offset: number = 0,
  limit: number = PAGE_SIZE
): Promise<GetPublicListingsResult> {
  const from = Math.max(0, offset);
  const to = from + Math.max(1, limit) - 1;

  const { data, error } = await supabase
    .from('listings')
    .select(
      'id, title, price, city, description, boosted, urgent, district, created_at, updated_at, views_count, user_id, listing_images(url, sort_order)'
    )
    .eq('status', 'active')
    .order('urgent', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to);

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
