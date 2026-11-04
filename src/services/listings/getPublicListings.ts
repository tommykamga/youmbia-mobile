/**
 * Public listings for the marketplace feed.
 * Queries the same Supabase listings table as the web app (status = 'active').
 * Image URLs: paths from listing_images are resolved via signed URLs (bucket listing-images, same as web).
 */

import { supabase } from '@/lib/supabase';
import {
  getSignedUrlsMap,
  listingStoragePathsForCardCover,
  mapListingCardImages,
  toDisplayImageUrl,
} from '@/lib/listingImageUrl';
import { normalizeListingSchemaFeatures } from '@/lib/listingSchemaFeatures';
import { parseListingShopEmbed } from '@/lib/listingShopEmbed';
import type { ShopSummary } from '@/types/shops';
import { SHOP_SUMMARY_SELECT } from '@/services/shops/shopSelect';
import { listingPublicListSelect, LISTING_DISCOVERY_ORDER_COLUMN } from './listingListSelect';
import { pickListingRecency } from '@/lib/listingPublishedAt';

export type PublicListing = {
  id: string;
  title: string;
  price: number;
  city: string;
  description?: string | null;
  /** Présent sur les flux liste quand la colonne est sélectionnée (recherche par catégorie, etc.). */
  category_id?: number | null;
  created_at: string;
  images: string[];
  views_count: number;
  seller_id: string;
  /** When true, listing is boosted and should appear first in feed (sort: boosted then last_published_at). */
  boosted?: boolean;
  /** Badge "Urgent" – vendeur marque l’annonce comme urgente. */
  urgent?: boolean;
  /** Quartier ou zone (affichage localisation améliorée). */
  district?: string | null;
  /** En contexte favoris : true si le prix a baissé (backend / historique). */
  price_dropped?: boolean;
  updated_at: string;
  /** COALESCE(renewed_at, created_at) — ranking discovery, jamais updated_at. */
  last_published_at?: string | null;
  renewed_at?: string | null;
  /** Boutique pro liée (optionnel). */
  shop_id?: string | null;
  /** Résumé boutique (jointure liste, badges cartes). */
  shop?: ShopSummary | null;
};

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
  last_published_at?: string | null;
  renewed_at?: string | null;
  shop_id?: string | null;
  shops?: ShopSummary | ShopSummary[] | null;
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

export type GetPublicListingsResult =
  | { data: PublicListing[]; error: null; pagination: { nextOffset: number; hasMore: boolean } }
  | { data: null; error: { message: string } };

/**
 * Fetches active listings in global discovery RPC order (seller diversity).
 * Before backend rollout only, missing RPC falls back to last_published_at.
 */
export async function getPublicListings(
  offset: number = 0,
  limit: number = PAGE_SIZE
): Promise<GetPublicListingsResult> {
  const from = Math.max(0, offset);
  // Match the RPC per-call bound; this is not a total catalogue limit.
  const pageSize = Math.min(50, Math.max(1, limit));
  const to = from + pageSize - 1;

  // V5-03B : classement global et pagination côté PostgreSQL.
  // Fallback legacy uniquement si la RPC n'est pas encore déployée.
  const { data: ranked, error: rankingError } = await supabase.rpc(
    'get_v5_discovery_listing_ids',
    { p_offset: from, p_limit: pageSize }
  );

  if (!rankingError && !Array.isArray(ranked)) {
    return { data: null, error: { message: 'Réponse RPC Découverte invalide' } };
  }

  const rankingRows = ranked ?? [];

  const rpcUnavailable =
    rankingError?.code === 'PGRST202' ||
    rankingError?.code === '42883';

  if (rankingError && !rpcUnavailable) {
    return { data: null, error: { message: rankingError.message } };
  }

  const rankedIds = rpcUnavailable
    ? null
    : rankingRows.map((item) => item.listing_id);

  const query = supabase
    .from('listings')
    .select(listingPublicListSelect(false))
    .eq('status', 'active');

  const { data, error } = rankedIds === null
    ? await query
        .order(LISTING_DISCOVERY_ORDER_COLUMN, { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)
    : rankedIds.length === 0
      ? { data: [], error: null }
      : await query.in('id', rankedIds);

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  const fetched = (data ?? []) as unknown as ListingRow[];
  const list = rankedIds === null
    ? fetched
    : [...fetched].sort(
        (a, b) => rankedIds.indexOf(a.id) - rankedIds.indexOf(b.id)
      );
  const allImagePaths = list.flatMap((row) => listingStoragePathsForCardCover(row.listing_images));
  const imageSignedMap = await getSignedUrlsMap(allImagePaths);
  const results = list.map((row) => mapRow(row, imageSignedMap));

  // Fallback anciennes annonces (sans shop_id) : si le owner possède une boutique active, injecter un ShopSummary.
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

  const dataWithFallback = results.map((listing) => {
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

  // Hydration can lose a row (e.g. listing withdrawn between the two reads).
  // Advance by RPC rows consumed, even when fewer cards remain visible.
  const consumed = rankedIds === null ? fetched.length : rankedIds.length;
  return {
    data: dataWithFallback, error: null,
    pagination: { nextOffset: from + consumed, hasMore: consumed === pageSize },
  };
}
