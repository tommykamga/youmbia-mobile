/**
 * Get current user's favorite listings.
 * Uses Supabase favorites table + listings for full listing data.
 */

import { supabase } from '@/lib/supabase';
import { getListingsByIds } from '@/services/listings/getListingsByIds';
import type { PublicListing } from '@/services/listings';

export type GetFavoritesResult =
  | { data: PublicListing[]; error: null }
  | { data: null; error: { message: string } };

/**
 * Returns the list of favorited listings for the current user, ordered by favorite created_at desc.
 * Returns error if not logged in.
 */
export async function getFavorites(): Promise<GetFavoritesResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  const { data: rows, error: favError } = await supabase
    .from('favorites')
    .select('listing_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (favError) {
    return { data: null, error: { message: favError.message } };
  }

  const ids = (rows ?? []).map((r: { listing_id: string }) => r.listing_id).filter(Boolean);
  if (!ids.length) return { data: [], error: null };

  const result = await getListingsByIds(ids);
  if (result.error) return result;
  return { data: result.data ?? [], error: null };
}
