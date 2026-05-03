import { supabase } from '@/lib/supabase';
import { getSignedUrlsMap, toDisplayImageUrl } from '@/lib/listingImageUrl';
import { getDisplayBoosted, normalizeListingSchemaFeatures } from '@/lib/listingSchemaFeatures';
import type { Tables } from '@/types/database';
import type { PublicListing } from './getPublicListings';

const DEFAULT_LIMIT = 8;
const FETCH_LIMIT = 50;
const MIN_RESULTS_TO_SHOW = 2;
const STOPWORDS = new Set([
  'avec', 'dans', 'pour', 'sans', 'chez', 'des', 'les', 'une', 'sur', 'par', 'vous', 'nous',
  'elle', 'ils', 'elles', 'mais', 'donc', 'plus', 'tres', 'trop', 'petit', 'petite', 'grand',
  'grande', 'prix', 'annonce', 'vendeur', 'neuf', 'neuve',
]);

type ListingImageRow = Pick<Tables<'listing_images'>, 'url' | 'sort_order'>;

type ListingRow = Pick<
  Tables<'listings'>,
  | 'id'
  | 'title'
  | 'price'
  | 'city'
  | 'description'
  | 'created_at'
  | 'views_count'
  | 'user_id'
  | 'boosted'
  | 'urgent'
  | 'district'
  | 'updated_at'
  | 'category_id'
> & {
  listing_images: ListingImageRow[] | null;
};

export type SimilarListingInput = {
  id: string;
  title?: string | null;
  city?: string | null;
  description?: string | null;
  categoryId?: number | null;
  price?: number | null;
};

export type GetSimilarListingsResult =
  | { data: PublicListing[]; error: null }
  | { data: PublicListing[]; error: { message: string } };

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}



function extractKeywords(value: Pick<SimilarListingInput, 'title' | 'description'>): string[] {
  return Array.from(
    new Set(
      normalizeText(`${value.title ?? ''} ${value.description ?? ''}`)
        .split(/[^a-z0-9]+/i)
        .filter((token) => token.length >= 4 && !STOPWORDS.has(token))
    )
  );
}

function countSharedKeywords(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  return a.reduce((count, token) => count + (setB.has(token) ? 1 : 0), 0);
}

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
    city: row.city ?? '',
    description: row.description ?? null,
    created_at: row.created_at,
    images,
    views_count: row.views_count ?? 0,
    seller_id: row.user_id ?? '',
    updated_at: row.updated_at,
    category_id: row.category_id,
    ...schema,
  };
}

export async function getSimilarListings(
  input: SimilarListingInput,
  limit: number = DEFAULT_LIMIT
): Promise<GetSimilarListingsResult> {
  const currentId = input.id?.trim();
  if (!currentId) {
    return { data: [], error: { message: 'Identifiant annonce manquant' } };
  }

  const safeLimit = Math.max(1, Math.min(limit, DEFAULT_LIMIT));
  const currentCity = normalizeText(input.city);
  const currentCategoryId = input.categoryId;
  const currentPrice = input.price;
  const currentKeywords = extractKeywords(input);

  try {
    // 1. Fetch candidates (Active only, exclude current)
    const { data, error } = await supabase
      .from('listings')
      .select(
        'id, title, price, city, description, boosted, urgent, district, created_at, updated_at, views_count, user_id, category_id, listing_images(url, sort_order)'
      )
      .eq('status', 'active')
      .neq('id', currentId)
      .order('created_at', { ascending: false })
      .limit(FETCH_LIMIT);

    if (error) {
      return { data: [], error: { message: 'Impossible de charger les annonces similaires' } };
    }

    const rows = (data ?? []) as ListingRow[];
    const allPaths = rows.flatMap((row) =>
      (row.listing_images ?? []).map((img) => String(img.url ?? '').trim()).filter(Boolean)
    );
    const signedMap = await getSignedUrlsMap(allPaths);
    const candidates = rows.map((row) => mapRow(row, signedMap));
    const seen = new Set<string>();

    // Layer 1: Best Matches (Exact category + other signals)
    const scored = candidates
      .filter((item) => {
        if (!item.id || item.id === currentId) return false;
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .map((item) => {
        const sameCity = currentCity !== '' && normalizeText(item.city) === currentCity;
        const sameCategory = currentCategoryId != null && item.category_id === currentCategoryId;
        const sharedKeywords = countSharedKeywords(
          currentKeywords,
          extractKeywords({ title: item.title, description: item.description ?? null })
        );

        let score = 0;
        if (sameCategory) score += 500; // Primary criteria
        if (sameCity) score += 150;
        
        // Price proximity bonus (+/- 25%)
        if (currentPrice != null && item.price != null) {
          const diff = Math.abs(currentPrice - item.price);
          const ratio = diff / currentPrice;
          if (ratio <= 0.25) {
            score += 50;
          }
        }

        score += Math.min(sharedKeywords, 3) * 10;

        // An item is "Relevant" if it shares at least the category or the city
        const isRelevant = sameCategory || sameCity;

        return { item, sameCategory, sameCity, sharedKeywords, score, isRelevant };
      })
      .filter((entry) => entry.isRelevant)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aUrgent = a.item.urgent ? 1 : 0;
        const bUrgent = b.item.urgent ? 1 : 0;
        if (bUrgent !== aUrgent) return bUrgent - aUrgent;
        const aBoost = getDisplayBoosted(a.item) ? 1 : 0;
        const bBoost = getDisplayBoosted(b.item) ? 1 : 0;
        if (bBoost !== aBoost) return bBoost - aBoost;
        return Date.parse(b.item.created_at) - Date.parse(a.item.created_at);
      });

    if (scored.length >= MIN_RESULTS_TO_SHOW) {
      return { data: scored.slice(0, safeLimit).map(s => s.item), error: null };
    }

    // Layer 2 & 3: Fallback (Same city or just Recent)
    // We already have candidates ordered by created_at desc.
    const fallbackResults = candidates
      .filter((item) => item.id !== currentId)
      .sort((a, b) => {
        // Boosted/Urgent first in fallback too
        const aUrgent = a.urgent ? 1 : 0;
        const bUrgent = b.urgent ? 1 : 0;
        if (bUrgent !== aUrgent) return bUrgent - aUrgent;
        const aBoost = getDisplayBoosted(a) ? 1 : 0;
        const bBoost = getDisplayBoosted(b) ? 1 : 0;
        if (bBoost !== aBoost) return bBoost - aBoost;
        return Date.parse(b.created_at) - Date.parse(a.created_at);
      });

    if (fallbackResults.length > 0) {
      return { data: fallbackResults.slice(0, safeLimit), error: null };
    }

    return { data: [], error: null };
  } catch {
    return { data: [], error: { message: 'Impossible de charger les annonces similaires' } };
  }
}
