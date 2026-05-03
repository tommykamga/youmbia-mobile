/**
 * Current user's listings (seller dashboard).
 * Same table and image resolution as public feed; includes status and no status filter.
 */

import { supabase } from '@/lib/supabase';
import { getSignedUrlsMap, listingStoragePathsForCardCover, mapListingCardImages } from '@/lib/listingImageUrl';
import { normalizeListingSchemaFeatures } from '@/lib/listingSchemaFeatures';
import type { Tables } from '@/types/database';
import type { PublicListing } from './getPublicListings';
import { LISTING_MY_LISTINGS_SELECT } from './listingListSelect';

export type MyListing = PublicListing & {
  status: string;
};

type ListingImageRow = Pick<Tables<'listing_images'>, 'url' | 'sort_order' | 'thumb_path' | 'medium_path'>;

type ListingRow = Pick<
  Tables<'listings'>,
  | 'id'
  | 'title'
  | 'price'
  | 'city'
  | 'category_id'
  | 'description'
  | 'created_at'
  | 'updated_at'
  | 'views_count'
  | 'user_id'
  | 'status'
  | 'boosted'
  | 'urgent'
  | 'district'
> & {
  listing_images: ListingImageRow[] | null;
};

function mapRow(row: ListingRow, signedMap: Map<string, string>): MyListing {
  const schema = normalizeListingSchemaFeatures(row);
  const images = mapListingCardImages(row.listing_images, signedMap);
  const base: PublicListing = {
    id: row.id,
    title: row.title,
    price: row.price,
    city: row.city ?? '',
    category_id: row.category_id ?? null,
    description: row.description ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    images,
    views_count: row.views_count ?? 0,
    seller_id: row.user_id ?? '',
    ...schema,
  };
  return {
    ...base,
    status: row.status ?? 'active',
  };
}

export type GetMyListingsResult =
  | { data: MyListing[]; error: null }
  | { data: null; error: { message: string } };

/**
 * Fetches listings for the current user (any status), ordered by updated_at desc then created_at desc.
 */
export async function getMyListings(): Promise<GetMyListingsResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  const { data, error } = await supabase
    .from('listings')
    .select(LISTING_MY_LISTINGS_SELECT)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  const list = (data ?? []) as unknown as ListingRow[];
  const allPaths = list.flatMap((row) => listingStoragePathsForCardCover(row.listing_images));
  const signedMap = await getSignedUrlsMap(allPaths);
  return { data: list.map((row) => mapRow(row, signedMap)), error: null };
}
