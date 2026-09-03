/**
 * Single listing by id for the detail screen.
 * Same Supabase listings + listing_images as web; image paths resolved via signed URLs (bucket listing-images).
 * Seller trust fields (is_verified, is_flagged, trust_score, reports_count) from profiles for trust badges.
 */

import { supabase } from '@/lib/supabase';
import { getSignedUrlsMap, toDisplayImageUrl } from '@/lib/listingImageUrl';
import { resolveSingleAvatarUrl } from '@/lib/avatarImageUrl';
import { getAvatarVersion } from '@/services/profile';
import { normalizeListingSchemaFeatures } from '@/lib/listingSchemaFeatures';
import { getShopSummaryById } from '@/services/shops/getShopSummaryById';
import type { SellerType, ShopSummary } from '@/types/shops';

export type ListingDetail = {
  id: string;
  title: string;
  price: number;
  city: string;
  description: string;
  boosted?: boolean;
  created_at: string;
  views_count: number;
  seller_id: string;
  images: string[];
  /** Chemins `listing_images.url` restants : signés à la demande par la galerie (moins d’egress au chargement). */
  galleryLazySourcePaths?: string[];
  /** Quartier ou zone (localisation améliorée). */
  district?: string | null;
  /** Badge "Urgent". */
  urgent?: boolean;
  category_id?: number | null;
  shop_id?: string | null;
  seller_type?: SellerType | null;
  shop?: ShopSummary | null;
  /** Colonnes legacy (fallback si pas d’équivalent dynamique affiché). */
  condition?: string | null;
  brand?: string | null;
  model?: string | null;
  seller: {
    full_name: string | null;
    avatar_url?: string | null;
    avatar_version?: string;
    avatar_display_url?: string | null;
    created_at: string | null;
    /** Optional: used for WhatsApp deep link and phone CTA. If profiles.phone does not exist, remove from select. */
    phone?: string | null;
    phone_verified?: boolean | null;
    /** Trust signals (from profiles, same as web). */
    is_verified?: boolean | null;
    is_flagged?: boolean | null;
    trust_score?: number | null;
    reports_count?: number | null;
    /** When true, contact CTAs are hidden (backend may use this for banned/restricted sellers). */
    is_banned?: boolean | null;
    /** Optional: populated only if the backend exposes a reliable response-time signal. */
    response_hint?: string | null;
  } | null;
};

type ListingImageRow = { url: string; sort_order: number | null };

/**
 * Colonnes alignées sur `getPublicListings` + `status` (statut annonce).
 * On évite condition / brand / model / category_id ici : si absentes en base,
 * PostgREST fait échouer tout le `select` alors que le fil public fonctionne.
 */
type ListingRow = {
  id: string;
  title: string;
  price: number;
  city: string;
  description: string | null;
  created_at: string;
  views_count: number | null;
  user_id: string | null;
  status?: string | null;
  boosted?: boolean | null;
  district?: string | null;
  urgent?: boolean | null;
  listing_images: ListingImageRow[] | null;
  category_id: number | null;
  shop_id?: string | null;
};

export type GetListingByIdResult =
  | { data: ListingDetail; error: null }
  | { data: null; error: { message: string } };

/**
 * Fetches a single listing by id with images and optional seller profile.
 * Missing row → "Annonce introuvable"; exists but not active → "Cette annonce n'est plus disponible."
 */
const GENERIC_ERROR_MESSAGE = "Une erreur s'est produite. Réessayez plus tard.";

export async function getListingById(id: string): Promise<GetListingByIdResult> {
  const { data: listingRow, error: listingError } = await supabase
    .from('listings')
    .select(
      'id, title, price, city, description, boosted, urgent, district, created_at, views_count, user_id, status, category_id, shop_id, listing_images(url, sort_order)'
    )
    .eq('id', id)
    .maybeSingle();

  if (listingError) {
    const message =
      listingError.code === 'PGRST116' || listingError.message?.includes('JWT')
        ? GENERIC_ERROR_MESSAGE
        : listingError.message?.length > 0 && listingError.message.length < 120
          ? listingError.message
          : GENERIC_ERROR_MESSAGE;
    return { data: null, error: { message } };
  }

  if (!listingRow) {
    return { data: null, error: { message: 'Annonce introuvable' } };
  }

  const row = listingRow as unknown as ListingRow;
  const status = (row.status ?? 'active').toLowerCase();

  if (status !== 'active') {
    return { data: null, error: { message: "Cette annonce n'est plus disponible." } };
  }

  const sellerId = row.user_id ?? null;

  const sortedImages = [...(row.listing_images ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const paths = sortedImages.map((i) => String(i.url ?? '').trim()).filter(Boolean);
  const signedMap = await getSignedUrlsMap(paths.length > 0 ? [paths[0]] : []);

  let seller: ListingDetail['seller'] = null;
  let sellerType: SellerType | null = null;
  let profileShopId: string | null = null;
  if (sellerId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select(
        'full_name, avatar_url, created_at, phone, phone_verified, is_verified, is_flagged, trust_score, reports_count, is_banned, seller_type, shop_id'
      )
      .eq('id', sellerId)
      .maybeSingle();
    // If your profiles table has no phone / is_banned column, they can be removed from the select.
    if (profile) {
      const p = profile as {
        full_name: string | null;
        avatar_url?: string | null;
        created_at: string | null;
        phone?: string | null;
        phone_verified?: boolean | null;
        is_verified?: boolean | null;
        is_flagged?: boolean | null;
        trust_score?: number | null;
        reports_count?: number | null;
        is_banned?: boolean | null;
        seller_type?: string | null;
        shop_id?: string | null;
      };
      sellerType =
        p.seller_type === 'pro' || p.seller_type === 'individual' ? p.seller_type : null;
      profileShopId = p.shop_id ?? null;
      const avatarPath = String(p.avatar_url ?? '').trim() || null;
      const avatarVersion = getAvatarVersion(p);
      const avatarDisplayUrl = avatarPath
        ? await resolveSingleAvatarUrl(avatarPath, avatarVersion)
        : null;
      seller = {
        full_name: p.full_name ?? null,
        avatar_url: avatarPath,
        avatar_version: avatarVersion,
        avatar_display_url: avatarDisplayUrl,
        created_at: p.created_at ?? null,
        phone: p.phone ?? null,
        phone_verified: p.phone_verified ?? null,
        is_verified: p.is_verified ?? null,
        is_flagged: p.is_flagged ?? null,
        trust_score: p.trust_score ?? null,
        reports_count: p.reports_count ?? null,
        is_banned: p.is_banned ?? null,
        /**
         * TOM-101 — seller response signal NOT IMPLEMENTED — insufficient reliable data.
         * `profiles` has no last-active field; `last_seen_at` is push-token only;
         * `get_seller_response_indicator` is an unused boolean RPC with no SQL in this repo.
         * Do not invent "Actif aujourd'hui" or a typical reply-time copy.
         */
      };
    }
  }

  const listingShopId = row.shop_id ?? null;
  const shopIdForSummary = listingShopId ?? profileShopId;
  let shop: ShopSummary | null = null;
  if (shopIdForSummary) {
    shop = await getShopSummaryById(shopIdForSummary);
  }

  const { boosted, district, urgent } = normalizeListingSchemaFeatures(row);
  const firstDisplay = paths.length > 0 ? toDisplayImageUrl(paths[0], signedMap).trim() : '';
  const lazyRest = paths.slice(1);
  const data: ListingDetail = {
    id: row.id,
    title: row.title,
    price: row.price,
    city: row.city,
    description: row.description ?? '',
    boosted,
    created_at: row.created_at,
    views_count: row.views_count ?? 0,
    seller_id: row.user_id ?? '',
    images: firstDisplay ? [firstDisplay] : [],
    ...(lazyRest.length > 0 ? { galleryLazySourcePaths: lazyRest } : {}),
    district,
    urgent,
    condition: null,
    brand: null,
    model: null,
    category_id: row.category_id ?? null,
    shop_id: listingShopId,
    seller_type: sellerType,
    shop,
    seller,
  };

  return { data, error: null };
}
