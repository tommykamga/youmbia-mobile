/**
 * Get public profile and active listings for a user (seller profile page).
 * Sprint 5.2 – Profil public vendeur.
 */

import { supabase } from '@/lib/supabase';
import { getSignedUrlsMap, listingStoragePathsForCardCover, mapListingCardImages } from '@/lib/listingImageUrl';
import { resolveSingleAvatarUrl } from '@/lib/avatarImageUrl';
import { getAvatarVersion } from '@/services/profile';
import { normalizeListingSchemaFeatures } from '@/lib/listingSchemaFeatures';
import type { Tables } from '@/types/database';
import type { PublicListing } from '@/services/listings';
import { listingPublicListSelect, LISTING_DISCOVERY_ORDER_COLUMN } from '@/services/listings/listingListSelect';
import { pickListingRecency } from '@/lib/listingPublishedAt';

export type UserProfile = {
  id: string;
  full_name: string | null;
  avatar_url?: string | null;
  avatar_version?: string;
  avatar_display_url?: string | null;
  city?: string | null;
  bio?: string | null;
  created_at: string | null;
  is_verified: boolean | null;
  phone_verified?: boolean | null;
  trust_score: number | null;
  reports_count: number | null;
  is_banned: boolean | null;
  is_flagged: boolean | null;
};

type UserProfileRow = Pick<
  Tables<'profiles'>,
  | 'id'
  | 'full_name'
  | 'avatar_url'
  | 'city'
  | 'bio'
  | 'created_at'
  | 'is_verified'
  | 'phone_verified'
  | 'trust_score'
  | 'reports_count'
  | 'is_banned'
  | 'is_flagged'
>;

type ListingImageRow = Pick<Tables<'listing_images'>, 'url' | 'sort_order' | 'thumb_path' | 'medium_path'>;

type ListingRow = Pick<
  Tables<'listings'>,
  | 'id'
  | 'title'
  | 'price'
  | 'city'
  | 'category_id'
  | 'created_at'
  | 'updated_at'
  | 'last_published_at'
  | 'views_count'
  | 'user_id'
  | 'boosted'
  | 'urgent'
  | 'district'
> & {
  listing_images: ListingImageRow[] | null;
};

function mapListingRow(row: ListingRow, signedMap: Map<string, string>): PublicListing {
  const images = mapListingCardImages(row.listing_images, signedMap);
  const schema = normalizeListingSchemaFeatures(row);
  return {
    id: row.id,
    title: row.title,
    price: row.price,
    city: row.city ?? '',
    category_id: row.category_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...pickListingRecency(row),
    images,
    views_count: row.views_count ?? 0,
    seller_id: row.user_id ?? '',
    ...schema,
  };
}

export type GetUserProfileResult =
  | { data: { profile: UserProfile; listings: PublicListing[] }; error: null }
  | { data: null; error: { message: string } };

/**
 * Fetches profile (profiles) and active listings (listings) for the given user id.
 * Used for the public seller profile screen.
 */
export async function getUserProfile(userId: string): Promise<GetUserProfileResult> {
  const id = userId?.trim();
  if (!id) {
    return { data: null, error: { message: 'Identifiant manquant' } };
  }

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select(
      'id, full_name, avatar_url, city, bio, created_at, is_verified, phone_verified, trust_score, reports_count, is_banned, is_flagged'
    )
    .eq('id', id)
    .maybeSingle();

  if (profileError) {
    return { data: null, error: { message: profileError.message } };
  }

  if (!profileRow) {
    return { data: null, error: { message: 'Profil introuvable' } };
  }

  const safeProfileRow = profileRow as UserProfileRow;
  const avatarPath = String(safeProfileRow.avatar_url ?? '').trim() || null;
  const avatarVersion = getAvatarVersion(safeProfileRow);
  const avatarDisplayUrl = avatarPath
    ? await resolveSingleAvatarUrl(avatarPath, avatarVersion)
    : null;

  const profile: UserProfile = {
    id: safeProfileRow.id,
    full_name: safeProfileRow.full_name ?? null,
    avatar_url: avatarPath,
    avatar_version: avatarVersion,
    avatar_display_url: avatarDisplayUrl,
    city: safeProfileRow.city ?? null,
    bio: safeProfileRow.bio ?? null,
    created_at: safeProfileRow.created_at ?? null,
    is_verified: safeProfileRow.is_verified ?? null,
    phone_verified: safeProfileRow.phone_verified ?? null,
    trust_score: safeProfileRow.trust_score ?? null,
    reports_count: safeProfileRow.reports_count ?? null,
    is_banned: safeProfileRow.is_banned ?? null,
    is_flagged: safeProfileRow.is_flagged ?? null,
  };

  const { data: listingRows, error: listingsError } = await supabase
    .from('listings')
    .select(listingPublicListSelect(false))
    .eq('user_id', id)
    .eq('status', 'active')
    .order(LISTING_DISCOVERY_ORDER_COLUMN, { ascending: false });

  if (listingsError) {
    return { data: null, error: { message: listingsError.message } };
  }

  const rows = (listingRows ?? []) as unknown as ListingRow[];
  const allPaths = rows.flatMap((row) => listingStoragePathsForCardCover(row.listing_images));
  const signedMap = await getSignedUrlsMap(allPaths);
  const listings = rows.map((row) => mapListingRow(row, signedMap));

  return { data: { profile, listings }, error: null };
}
