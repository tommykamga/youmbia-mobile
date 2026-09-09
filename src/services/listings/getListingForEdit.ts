/**
 * Annonce à éditer : propriétaire uniquement, tout statut (aligné besoin édition mobile).
 *
 * Images : `listing_images.url` = PATH Storage (ex. userId/listingId/0.jpg), signé via bucket
 * `listing-images`. Chargement images en requête dédiée (fiable vs embed nested).
 */

import { supabase } from '@/lib/supabase';
import {
  getSignedUrlsMap,
  isListingImageHttpUrl,
  resolveSingleListingImageUrl,
  toDisplayImageUrl,
} from '@/lib/listingImageUrl';
import { normalizeListingSchemaFeatures } from '@/lib/listingSchemaFeatures';

export type ListingForEdit = {
  id: string;
  title: string;
  price: number;
  city: string;
  description: string;
  category_id: number | null;
  status: string;
  shop_id: string | null;
  images: string[];
  imageItems: { id: string; path: string; sort_order: number | null; displayUrl: string }[];
  district?: string | null;
  urgent?: boolean;
  boosted?: boolean;
};

type ListingImageRow = { id: string; url: string; sort_order: number | null };

type ListingRow = {
  id: string;
  title: string;
  price: number;
  city: string | null;
  description: string | null;
  category_id: number | null;
  status: string | null;
  shop_id?: string | null;
  boosted?: boolean | null;
  district?: string | null;
  urgent?: boolean | null;
  user_id: string | null;
};

export type GetListingForEditResult =
  | { data: ListingForEdit; error: null }
  | { data: null; error: { message: string } };

const GENERIC_ERROR_MESSAGE = "Une erreur s'est produite. Réessayez plus tard.";

function sortImageRows(rows: ListingImageRow[]): ListingImageRow[] {
  return [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/**
 * Mappe les lignes DB → items UI avec signed URL.
 * Une image non signable est loguée et ignorée seule — on ne vide pas toute la liste.
 */
export async function mapListingImageRowsToEditItems(
  rows: ListingImageRow[] | null | undefined
): Promise<{ id: string; path: string; sort_order: number | null; displayUrl: string }[]> {
  const sorted = sortImageRows(rows ?? []);
  if (sorted.length === 0) return [];

  const storagePaths = sorted
    .map((img) => String(img.url ?? '').trim())
    .filter((p) => p !== '' && !isListingImageHttpUrl(p));

  const signedMap = await getSignedUrlsMap(storagePaths);

  const items: { id: string; path: string; sort_order: number | null; displayUrl: string }[] = [];

  for (const img of sorted) {
    const id = String(img.id ?? '').trim();
    const path = String(img.url ?? '').trim();
    if (!id || !path) continue;

    let displayUrl = toDisplayImageUrl(path, signedMap);
    if (!displayUrl && isListingImageHttpUrl(path)) {
      displayUrl = path;
    }
    if (!displayUrl) {
      displayUrl = await resolveSingleListingImageUrl(path);
    }
    if (!displayUrl) {
      if (__DEV__) {
        console.warn('[DRAFT_RESUME] image non signée — conservée hors UI', {
          imageId: id,
          path,
        });
      }
      continue;
    }

    items.push({
      id,
      path,
      sort_order: img.sort_order ?? null,
      displayUrl,
    });
  }

  return items;
}

export async function getListingForEdit(id: string): Promise<GetListingForEditResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  const listingId = String(id ?? '').trim();
  if (!listingId) {
    return { data: null, error: { message: 'Annonce introuvable ou accès refusé.' } };
  }

  const { data: listingRow, error: listingError } = await supabase
    .from('listings')
    .select(
      'id, title, price, city, description, category_id, status, shop_id, boosted, urgent, district, user_id'
    )
    .eq('id', listingId)
    .eq('user_id', user.id)
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
    return { data: null, error: { message: 'Annonce introuvable ou accès refusé.' } };
  }

  const row = listingRow as unknown as ListingRow;

  // Requête dédiée : source de vérité images (évite embed nested vide / ordre instable).
  const { data: imageRowsRaw, error: imagesError } = await supabase
    .from('listing_images')
    .select('id, url, sort_order')
    .eq('listing_id', listingId)
    .order('sort_order', { ascending: true });

  if (imagesError && __DEV__) {
    console.warn('[DRAFT_RESUME] listing_images query error', imagesError.message);
  }

  const dbImages = sortImageRows((imageRowsRaw ?? []) as ListingImageRow[]);

  if (__DEV__) {
    console.log('[DRAFT_RESUME] listingId', listingId);
    console.log('[DRAFT_RESUME] dbImages count', dbImages.length);
    console.log(
      '[DRAFT_RESUME] storagePaths',
      dbImages.map((img) => String(img.url ?? '').trim())
    );
  }

  const imageItems = await mapListingImageRowsToEditItems(dbImages);

  if (__DEV__) {
    console.log('[DRAFT_RESUME] signedImages count', imageItems.length);
  }

  const { boosted, district, urgent } = normalizeListingSchemaFeatures(row);

  const data: ListingForEdit = {
    id: row.id,
    title: row.title,
    price: row.price,
    city: row.city ?? '',
    description: row.description ?? '',
    category_id: row.category_id ?? null,
    status: (row.status ?? 'active').toLowerCase(),
    shop_id: row.shop_id ?? null,
    images: imageItems.map((item) => item.displayUrl),
    imageItems,
    district,
    urgent,
    boosted,
  };

  return { data, error: null };
}
