/**
 * Search active listings by text (title, city, description).
 * Uses the same Supabase listings + listing_images model as getPublicListings.
 * Image URLs resolved via signed URLs (bucket listing-images).
 */

import { supabase } from '@/lib/supabase';
import { getSignedUrlsMap, toDisplayImageUrl } from '@/lib/listingImageUrl';
import { normalizeListingSchemaFeatures } from '@/lib/listingSchemaFeatures';
import { ROOT_CATEGORY_TREE } from '@/lib/listingCategories';
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

export type SearchOptions = {
  query?: string;
  categoryId?: number | string | null;
  city?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  sortBy?: 'recent' | 'price_asc' | 'price_desc';
  page?: number;
  pageSize?: number;
};

export type SearchListingsResult =
  | { data: PublicListing[]; total: number; error: null }
  | { data: null; total: 0; error: { message: string } };

function normalizeSearchText(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Calculates a relevance score for a listing based on the search query.
 * Priorities: Exact Title > Word start in Title > Contains in Title > Word start in Description.
 */
function computeRelevanceScore(listing: PublicListing, query: string): number {
  const q = normalizeSearchText(query);
  if (!q) return 0;

  const title = normalizeSearchText(listing.title);
  const description = normalizeSearchText(listing.description ?? '');
  
  let score = 0;

  // Title match scoring
  if (title === q) {
    score += 100; // Perfect match
  } else if (title.startsWith(q + ' ') || title.includes(' ' + q + ' ') || title.endsWith(' ' + q)) {
    score += 50; // Whole word in title
  } else if (title.startsWith(q)) {
    score += 30; // Starts with query
  } else if (title.includes(q)) {
    score += 10; // Contains query
  }

  // Description match scoring (lower priority)
  if (description.includes(' ' + q + ' ') || description.startsWith(q + ' ')) {
    score += 5;
  } else if (description.includes(q)) {
    score += 1;
  }

  return score;
}

/**
 * Search active listings by query (title, city, description) and structured filters.
 * All filters are applied directly in the Supabase query for accuracy.
 */
export async function searchListings(options: SearchOptions = {}): Promise<SearchListingsResult> {
  const {
    query = '',
    categoryId,
    city,
    minPrice,
    maxPrice,
    sortBy = 'recent',
    page = 1,
    pageSize = PAGE_SIZE,
  } = options;

  let request = supabase
    .from('listings')
    .select(
      'id, title, price, city, description, boosted, urgent, district, created_at, updated_at, views_count, user_id, listing_images(url, sort_order)',
      { count: 'exact' }
    )
    .eq('status', 'active');

  // Text search: stricter for short queries to avoid noisy substring matches (e.g. "lit" matching "qualité")
  const trimmed = query.trim();
  if (trimmed) {
    const safe = trimmed.replace(/[%_\\]/g, '');
    const pattern = `%${safe}%`;
    
    if (trimmed.length <= 3) {
      // Short query: prioritize titles and skip descriptions to avoid common substring noise
      request = request.or(`title.ilike.${pattern},city.ilike.${pattern}`);
    } else {
      // Longer query: full search across title, city, and description
      request = request.or(`title.ilike.${pattern},city.ilike.${pattern},description.ilike.${pattern}`);
    }
  }

  // Category filter: support for root category branches (sub-categories)
  if (categoryId != null && categoryId !== '') {
    const catId = typeof categoryId === 'string' ? parseInt(categoryId, 10) : categoryId;
    if (!isNaN(catId)) {
      const tree = ROOT_CATEGORY_TREE[catId];
      if (tree && tree.length > 0) {
        // We use .in() to match the root category or any of its children
        request = request.in('category_id', tree);
      } else {
        request = request.eq('category_id', catId);
      }
    }
  }

  // City filter
  if (city?.trim()) {
    const cityPattern = `%${city.trim().replace(/[%_\\]/g, '')}%`;
    request = request.ilike('city', cityPattern);
  }

  // Price range filters
  if (minPrice != null && !isNaN(minPrice)) {
    request = request.gte('price', minPrice);
  }
  if (maxPrice != null && !isNaN(maxPrice)) {
    request = request.lte('price', maxPrice);
  }

  // Sorting
  if (sortBy === 'price_asc') {
    request = request.order('price', { ascending: true });
  } else if (sortBy === 'price_desc') {
    request = request.order('price', { ascending: false });
  } else {
    // Default: Urgent first, then most recent
    request = request.order('urgent', { ascending: false }).order('created_at', { ascending: false });
  }

  // Pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  request = request.range(from, to);

  const { data, error, count } = await request;

  if (error) {
    return { data: null, total: 0, error: { message: error.message } };
  }

  const list = (data ?? []) as ListingRow[];
  const allPaths = list.flatMap((row) =>
    (row.listing_images ?? []).map((img) => String(img.url ?? '').trim()).filter(Boolean)
  );
  const signedMap = await getSignedUrlsMap(allPaths);
  const results = list.map((row) => mapRow(row, signedMap));

  // Client-side reranking by relevance score if a query exists
  if (trimmed && results.length > 0) {
    results.sort((a, b) => {
      const scoreA = computeRelevanceScore(a, trimmed);
      const scoreB = computeRelevanceScore(b, trimmed);
      if (scoreB !== scoreA) return scoreB - scoreA;
      // Stable sort by date if scores are equal
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  return { data: results, total: count ?? 0, error: null };
}
