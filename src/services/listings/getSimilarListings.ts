import { supabase } from '@/lib/supabase';
import { getSignedUrlsMap, listingStoragePathsForCardCover, mapListingCardImages } from '@/lib/listingImageUrl';
import { normalizeListingSchemaFeatures } from '@/lib/listingSchemaFeatures';
import { getMarketplaceCategoriesCached } from '@/services/categories';
import type { Tables } from '@/types/database';
import type { PublicListing } from './getPublicListings';
import { listingPublicListSelect, LISTING_DISCOVERY_ORDER_COLUMN } from './listingListSelect';
import { pickListingRecency } from '@/lib/listingPublishedAt';
import {
  ACTIVE_LISTING_STATUS,
  rankSimilarListings,
  resolveSimilarFetchCategoryIds,
  shouldFetchSimilarListings,
  SIMILAR_LISTINGS_FETCH_LIMIT,
  SIMILAR_LISTINGS_LIMIT,
} from './similarListingsRank';

type ListingImageRow = Pick<
  Tables<'listing_images'>,
  'url' | 'sort_order' | 'thumb_path' | 'medium_path'
>;

type ListingRow = Pick<
  Tables<'listings'>,
  | 'id'
  | 'title'
  | 'price'
  | 'city'
  | 'category_id'
  | 'created_at'
  | 'views_count'
  | 'user_id'
  | 'boosted'
  | 'urgent'
  | 'district'
  | 'updated_at'
  | 'last_published_at'
  | 'renewed_at'
> & {
  listing_images: ListingImageRow[] | null;
};

export type SimilarListingInput = {
  id: string;
  title?: string | null;
  city?: string | null;
  description?: string | null;
  category?: string | null;
  categoryId?: number | null;
  price?: number | null;
};

export type GetSimilarListingsResult =
  | { data: PublicListing[]; error: null }
  | { data: PublicListing[]; error: { message: string } };

function mapRow(row: ListingRow, signedMap: Map<string, string>): PublicListing {
  const images = mapListingCardImages(row.listing_images, signedMap);
  const schema = normalizeListingSchemaFeatures(row);
  return {
    id: row.id,
    title: row.title,
    price: row.price,
    city: row.city ?? '',
    category_id: row.category_id ?? null,
    created_at: row.created_at,
    images,
    views_count: row.views_count ?? 0,
    seller_id: row.user_id ?? '',
    updated_at: row.updated_at,
    ...pickListingRecency(row),
    ...schema,
  };
}

export async function getSimilarListings(
  input: SimilarListingInput,
  limit: number = SIMILAR_LISTINGS_LIMIT
): Promise<GetSimilarListingsResult> {
  const currentId = input.id?.trim();
  if (!currentId) {
    return { data: [], error: { message: 'Identifiant annonce manquant' } };
  }

  const categoryId = shouldFetchSimilarListings(input.categoryId) ? input.categoryId : null;
  if (categoryId == null) {
    return { data: [], error: null };
  }

  const safeLimit = Math.max(1, Math.min(limit, SIMILAR_LISTINGS_LIMIT));

  try {
    let branchIds = [categoryId];
    let categories: Awaited<ReturnType<typeof getMarketplaceCategoriesCached>> = [];
    try {
      categories = await getMarketplaceCategoriesCached();
      branchIds = resolveSimilarFetchCategoryIds(categories, categoryId);
    } catch {
      branchIds = [categoryId];
    }

    const { data, error } = await supabase
      .from('listings')
      .select(listingPublicListSelect(false))
      .eq('status', ACTIVE_LISTING_STATUS)
      .neq('id', currentId)
      .in('category_id', branchIds)
      .order(LISTING_DISCOVERY_ORDER_COLUMN, { ascending: false })
      .limit(SIMILAR_LISTINGS_FETCH_LIMIT);

    if (error) {
      return { data: [], error: { message: 'Impossible de charger les annonces similaires' } };
    }

    const rows = (data ?? []) as unknown as ListingRow[];
    const rankedRows = rankSimilarListings(
      {
        id: currentId,
        categoryId,
        city: input.city,
        price: input.price,
      },
      rows.map((row) => ({
        id: row.id,
        category_id: row.category_id ?? null,
        city: row.city,
        price: row.price,
        created_at: row.created_at,
        last_published_at: row.last_published_at,
        renewed_at: row.renewed_at,
        status: ACTIVE_LISTING_STATUS,
      })),
      categories,
      safeLimit
    );
    const rankedIds = new Set(rankedRows.map((row) => row.id));
    const orderedRows = rankedRows
      .map((ranked) => rows.find((row) => row.id === ranked.id))
      .filter((row): row is ListingRow => row != null && rankedIds.has(row.id));

    const allPaths = orderedRows.flatMap((row) => listingStoragePathsForCardCover(row.listing_images));
    const signedMap = await getSignedUrlsMap(allPaths);
    return { data: orderedRows.map((row) => mapRow(row, signedMap)), error: null };
  } catch {
    return { data: [], error: { message: 'Impossible de charger les annonces similaires' } };
  }
}
