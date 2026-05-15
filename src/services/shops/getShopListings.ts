import { supabase } from '@/lib/supabase';
import { getSignedUrlsMap, listingStoragePathsForCardCover, mapListingCardImages } from '@/lib/listingImageUrl';
import { normalizeListingSchemaFeatures } from '@/lib/listingSchemaFeatures';
import type { PublicListing } from '@/services/listings/getPublicListings';
import { listingPublicListSelect } from '@/services/listings/listingListSelect';

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
  shop_id?: string | null;
  listing_images: ListingImageRow[] | null;
};

export type GetShopListingsResult =
  | { data: PublicListing[]; error: null }
  | { data: null; error: { message: string } };

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
    shop_id: row.shop_id ?? null,
    ...schema,
  };
}

export async function getShopListings(shopId: string): Promise<GetShopListingsResult> {
  if (!shopId?.trim()) {
    return { data: [], error: null };
  }

  try {
    const { data, error } = await supabase
      .from('listings')
      .select(listingPublicListSelect(false))
      .eq('shop_id', shopId)
      .eq('status', 'active')
      .order('urgent', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    const rows = (data ?? []) as unknown as ListingRow[];
    const paths = rows.flatMap((row) => listingStoragePathsForCardCover(row.listing_images));
    const signedMap = await getSignedUrlsMap(paths);

    return {
      data: rows.map((row) => mapRow(row, signedMap)),
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return { data: null, error: { message } };
  }
}
