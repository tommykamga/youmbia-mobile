/**
 * Search active listings by text (title, city, description).
 * Uses the same Supabase listings + listing_images model as getPublicListings.
 * Image URLs resolved via signed URLs (bucket listing-images).
 */

import { supabase } from '@/lib/supabase';
import {
  getSignedUrlsMap,
  listingStoragePathsForCardCover,
  mapListingCardImages,
  toDisplayImageUrl,
} from '@/lib/listingImageUrl';
import { normalizeListingSchemaFeatures } from '@/lib/listingSchemaFeatures';
import { getMarketplaceCategoriesCached } from '@/services/categories';
import type { PublicListing } from './getPublicListings';
import { parseListingShopEmbed } from '@/lib/listingShopEmbed';
import type { ShopSummary } from '@/types/shops';
import { SHOP_SUMMARY_SELECT } from '@/services/shops/shopSelect';
import { listingPublicListSelect, LISTING_DISCOVERY_ORDER_COLUMN } from './listingListSelect';
import { pickListingRecency } from '@/lib/listingPublishedAt';
import {
  buildSearchTextOrClauses,
  resolveSearchCategoryFilter,
  tokenizeSearchQuery,
} from './searchQuery';

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
  description?: string | null;
  created_at: string;
  views_count: number | null;
  user_id: string | null;
  shop_id?: string | null;
  shops?: ShopSummary | ShopSummary[] | null;
  boosted?: boolean | null;
  urgent?: boolean | null;
  district?: string | null;
  updated_at: string;
  last_published_at?: string | null;
  listing_images: ListingImageRow[] | null;
};

const PAGE_SIZE = 20;

function mapRow(row: ListingRow, signedMap: Map<string, string>): PublicListing {
  const images = mapListingCardImages(row.listing_images, signedMap);
  const schema = normalizeListingSchemaFeatures(row);
  return {
    id: row.id,
    title: row.title,
    price: row.price,
    city: row.city,
    category_id: row.category_id ?? null,
    ...(row.description != null && String(row.description).trim() !== ''
      ? { description: row.description }
      : {}),
    created_at: row.created_at,
    images,
    views_count: row.views_count ?? 0,
    seller_id: row.user_id ?? '',
    updated_at: row.updated_at,
    ...pickListingRecency(row),
    shop_id: row.shop_id ?? null,
    shop: parseListingShopEmbed(row.shops),
    ...schema,
  };
}

export type SearchOptions = {
  query?: string;
  categoryId?: number | string | null;
  city?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  sortBy?: 'recent' | 'relevance' | 'price_asc' | 'price_desc';
  page?: number;
  pageSize?: number;
};

export type SearchListingsResult =
  | { data: PublicListing[]; total: number; error: null }
  | { data: null; total: 0; error: { message: string } };

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

  const trimmed = query.trim();
  const includeDescription = trimmed.length > 3;
  const listSelect = listingPublicListSelect(includeDescription);

  // Recherche boutique (name/slug) → owner_ids (requête bornée, boutiques actives uniquement).
  let shopOwnerIds: string[] = [];
  if (trimmed) {
    const safe = trimmed.replace(/[%_\\]/g, '');
    const pattern = `%${safe}%`;
    const { data: shopRows } = await supabase
      .from('shops')
      .select('owner_id')
      .eq('status', 'active')
      .or(`name.ilike.${pattern},slug.ilike.${pattern}`)
      .limit(30);

    shopOwnerIds = [
      ...new Set(
        (shopRows ?? [])
          .map((r) => String((r as { owner_id?: string | null }).owner_id ?? '').trim())
          .filter(Boolean)
      ),
    ];
  }

  let request = supabase
    .from('listings')
    .select(
      listSelect,
      /** `estimated` évite un COUNT(*) complet — moins de charge DB / egress sur grosses tables. */
      { count: 'estimated' }
    )
    .eq('status', 'active');

  const tokens = tokenizeSearchQuery(trimmed);
  if (tokens.length > 0) {
    for (const clause of buildSearchTextOrClauses(tokens, includeDescription, shopOwnerIds)) {
      request = request.or(clause);
    }
  } else if (trimmed) {
    const safe = trimmed.replace(/[%_\\]/g, '');
    const pattern = `%${safe}%`;
    const fallbackParts = [`title.ilike.${pattern}`, `city.ilike.${pattern}`];
    if (includeDescription) {
      fallbackParts.push(`description.ilike.${pattern}`);
    }
    if (shopOwnerIds.length > 0) {
      fallbackParts.push(`user_id.in.(${shopOwnerIds.join(',')})`);
    }
    request = request.or(fallbackParts.join(','));
  } else if (shopOwnerIds.length > 0) {
    request = request.or(`user_id.in.(${shopOwnerIds.join(',')})`);
  }

  if (categoryId != null && categoryId !== '') {
    const catId = typeof categoryId === 'string' ? parseInt(categoryId, 10) : categoryId;
    if (!isNaN(catId)) {
      try {
        const categories = await getMarketplaceCategoriesCached();
        const filter = resolveSearchCategoryFilter(categories, catId);
        if (filter.mode === 'in') {
          request = request.in('category_id', filter.ids);
        } else {
          request = request.eq('category_id', filter.id);
        }
      } catch {
        request = request.eq('category_id', catId);
      }
    }
  }

  // City filter (explicite, inchangé)
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

  // Sorting — la pertinence texte est appliquée côté UI (cache hors tri).
  if (sortBy === 'price_asc') {
    request = request.order('price', { ascending: true });
  } else if (sortBy === 'price_desc') {
    request = request.order('price', { ascending: false });
  } else {
    request = request.order(LISTING_DISCOVERY_ORDER_COLUMN, { ascending: false });
  }

  // Pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  request = request.range(from, to);

  const { data, error, count } = await request;

  if (error) {
    return { data: null, total: 0, error: { message: error.message } };
  }

  const list = (data ?? []) as unknown as ListingRow[];
  const allPaths = list.flatMap((row) => listingStoragePathsForCardCover(row.listing_images));
  const signedMap = await getSignedUrlsMap(allPaths);
  const results = list.map((row) => mapRow(row, signedMap));

  // Fallback anciennes annonces (sans shop_id) : si owner possède une boutique active, injecter un ShopSummary.
  const missingShopOwnerIds = [
    ...new Set(
      list
        .filter((row) => !row.shop_id && String(row.user_id ?? '').trim() !== '')
        .map((row) => String(row.user_id ?? '').trim())
    ),
  ];

  let ownerShopByOwnerId = new Map<string, ShopSummary>();
  if (missingShopOwnerIds.length > 0) {
    const { data: shopRows } = await supabase
      .from('shops')
      .select(`owner_id, ${SHOP_SUMMARY_SELECT}`)
      .eq('status', 'active')
      .in('owner_id', missingShopOwnerIds);

    for (const row of (shopRows ?? []) as unknown as (ShopSummary & { owner_id: string })[]) {
      const ownerId = String((row as { owner_id?: string | null }).owner_id ?? '').trim();
      if (!ownerId || !row.id?.trim()) continue;
      ownerShopByOwnerId.set(ownerId, row as unknown as ShopSummary);
    }
  }

  // Résolution URL logo shop (signed URL si chemin Storage).
  const shopLogoPaths = [
    ...new Set([
      ...results.map((r) => String(r.shop?.logo_url ?? '').trim()),
      ...[...ownerShopByOwnerId.values()].map((s) => String(s.logo_url ?? '').trim()),
    ]),
  ].filter((p) => p !== '' && !/^https?:\/\//i.test(p));
  const shopLogoSignedMap = await getSignedUrlsMap(shopLogoPaths);

  const resultsWithShopFallback = results.map((listing) => {
    const fallbackShop =
      !listing.shop_id && !listing.shop ? ownerShopByOwnerId.get(String(listing.seller_id ?? '').trim()) : undefined;
    const rawShop = listing.shop ?? fallbackShop ?? null;
    if (!rawShop) return listing;
    const resolvedLogo = rawShop.logo_url ? toDisplayImageUrl(rawShop.logo_url, shopLogoSignedMap) : '';
    const shop: ShopSummary = {
      ...rawShop,
      logo_url: resolvedLogo || rawShop.logo_url || null,
    };
    return { ...listing, shop };
  });

  return { data: resultsWithShopFallback, total: count ?? 0, error: null };
}
