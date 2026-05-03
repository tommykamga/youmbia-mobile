/**
 * Single listing by id for the detail screen.
 * Same Supabase listings + listing_images as web; image paths resolved via signed URLs (bucket listing-images).
 * Seller trust fields (is_verified, is_flagged, trust_score, reports_count) from profiles for trust badges.
 */

import { supabase } from '@/lib/supabase';
import { getSignedUrlsMap, toDisplayImageUrl } from '@/lib/listingImageUrl';
import { normalizeListingSchemaFeatures } from '@/lib/listingSchemaFeatures';

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
  /** Colonnes legacy (fallback si pas d’équivalent dynamique affiché). */
  condition?: string | null;
  brand?: string | null;
  model?: string | null;
  seller: {
    full_name: string | null;
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
    /** Optional: "Répond généralement en quelques heures" – computed from conversation history when backend provides it. */
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
      'id, title, price, city, description, boosted, urgent, district, created_at, views_count, user_id, status, category_id, listing_images(url, sort_order)'
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
  if (sellerId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select(
        'full_name, created_at, phone, phone_verified, is_verified, is_flagged, trust_score, reports_count, is_banned'
      )
      .eq('id', sellerId)
      .maybeSingle();
    // If your profiles table has no phone / is_banned column, they can be removed from the select.
    if (profile) {
      const p = profile as {
        full_name: string | null;
        created_at: string | null;
        phone?: string | null;
        phone_verified?: boolean | null;
        is_verified?: boolean | null;
        is_flagged?: boolean | null;
        trust_score?: number | null;
        reports_count?: number | null;
        is_banned?: boolean | null;
      };
      seller = {
        full_name: p.full_name ?? null,
        created_at: p.created_at ?? null,
        phone: p.phone ?? null,
        phone_verified: p.phone_verified ?? null,
        is_verified: p.is_verified ?? null,
        is_flagged: p.is_flagged ?? null,
        trust_score: p.trust_score ?? null,
        reports_count: p.reports_count ?? null,
        is_banned: p.is_banned ?? null,
      };
    }
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
    seller,
  };

  return { data, error: null };
}
