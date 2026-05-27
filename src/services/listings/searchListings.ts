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
import { buildRootCategoryTree } from '@/lib/marketplaceCategories';
import { getMarketplaceCategoriesCached } from '@/services/categories';
import type { PublicListing } from './getPublicListings';
import { parseListingShopEmbed } from '@/lib/listingShopEmbed';
import type { ShopSummary } from '@/types/shops';
import { SHOP_SUMMARY_SELECT } from '@/services/shops/shopSelect';
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
 * Tri client après récupération (le filtre `description.ilike` reste côté serveur quand la requête est longue).
 * Le payload liste n’inclut plus `description` — le score description reste à 0 côté client (économie d’egress).
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

  const trimmed = query.trim();
  const listSelect = listingPublicListSelect(trimmed.length > 3);

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

  // Recherche texte + boutique (single .or pour éviter (OR) AND (OR)).
  if (trimmed || shopOwnerIds.length > 0) {
    const orParts: string[] = [];
    if (trimmed) {
      const safe = trimmed.replace(/[%_\\]/g, '');
      const pattern = `%${safe}%`;
      if (trimmed.length <= 3) {
        // Short query: prioritize titles and skip descriptions to avoid common substring noise
        orParts.push(`title.ilike.${pattern}`, `city.ilike.${pattern}`);
      } else {
        // Longer query: full search across title, city, and description
        orParts.push(`title.ilike.${pattern}`, `city.ilike.${pattern}`, `description.ilike.${pattern}`);
      }
    }
    if (shopOwnerIds.length > 0) {
      const inList = shopOwnerIds.join(',');
      orParts.push(`user_id.in.(${inList})`);
    }
    request = request.or(orParts.join(','));
  }

  // Category filter: support for root category branches (sub-categories)
  if (categoryId != null && categoryId !== '') {
    const catId = typeof categoryId === 'string' ? parseInt(categoryId, 10) : categoryId;
    if (!isNaN(catId)) {
      let tree: Record<number, number[]> | null = null;
      try {
        const categories = await getMarketplaceCategoriesCached();
        tree = buildRootCategoryTree(categories);
      } catch {
        tree = null;
      }
      const branch = tree?.[catId];
      if (branch && branch.length > 0) {
        request = request.in('category_id', branch);
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
    // Recent: most recent first (avoid old urgent listings monopolizing the top)
    request = request.order('created_at', { ascending: false });
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

  // Client-side reranking by relevance score if a query exists
  if (trimmed && resultsWithShopFallback.length > 0) {
    resultsWithShopFallback.sort((a, b) => {
      const scoreA = computeRelevanceScore(a, trimmed);
      const scoreB = computeRelevanceScore(b, trimmed);
      if (scoreB !== scoreA) return scoreB - scoreA;
      // Stable sort by date if scores are equal
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  return { data: resultsWithShopFallback, total: count ?? 0, error: null };
}
