/**
 * Annonce à éditer : propriétaire uniquement, tout statut (aligné besoin édition mobile).
 */

import { supabase } from '@/lib/supabase';
import { getSignedUrlsMap, toDisplayImageUrl } from '@/lib/listingImageUrl';
import { normalizeListingSchemaFeatures } from '@/lib/listingSchemaFeatures';

export type ListingForEdit = {
  id: string;
  title: string;
  price: number;
  city: string;
  description: string;
  category_id: number | null;
  status: string;
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
  boosted?: boolean | null;
  district?: string | null;
  urgent?: boolean | null;
  user_id: string | null;
  listing_images: ListingImageRow[] | null;
};

function mapImageItems(
  rows: ListingImageRow[] | null,
  signedMap: Map<string, string>
): { id: string; path: string; sort_order: number | null; displayUrl: string }[] {
  if (!rows?.length) return [];
  return [...rows]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((img) => ({
      id: String(img.id ?? '').trim(),
      path: String(img.url ?? '').trim(),
      sort_order: img.sort_order ?? null,
      displayUrl: toDisplayImageUrl(img.url ?? '', signedMap),
    }))
    .filter((item) => item.id !== '' && item.path !== '' && item.displayUrl !== '');
}

export type GetListingForEditResult =
  | { data: ListingForEdit; error: null }
  | { data: null; error: { message: string } };

const GENERIC_ERROR_MESSAGE = "Une erreur s'est produite. Réessayez plus tard.";

export async function getListingForEdit(id: string): Promise<GetListingForEditResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  const { data: listingRow, error: listingError } = await supabase
    .from('listings')
    .select(
      'id, title, price, city, description, category_id, status, boosted, urgent, district, user_id, listing_images(id, url, sort_order)'
    )
    .eq('id', id)
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
  const paths = (row.listing_images ?? [])
    .map((i) => String(i.url ?? '').trim())
    .filter(Boolean);
  const signedMap = await getSignedUrlsMap(paths);
  const { boosted, district, urgent } = normalizeListingSchemaFeatures(row);
  const imageItems = mapImageItems(row.listing_images, signedMap);

  const data: ListingForEdit = {
    id: row.id,
    title: row.title,
    price: row.price,
    city: row.city ?? '',
    description: row.description ?? '',
    category_id: row.category_id ?? null,
    status: (row.status ?? 'active').toLowerCase(),
    images: imageItems.map((item) => item.displayUrl),
    imageItems,
    district,
    urgent,
    boosted,
  };

  return { data, error: null };
}
