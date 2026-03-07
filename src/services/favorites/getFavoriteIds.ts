/**
 * Get current user's favorite listing ids only (lightweight, for heart state).
 */

import { supabase } from '@/lib/supabase';

export type GetFavoriteIdsResult =
  | { data: string[]; error: null }
  | { data: null; error: { message: string } };

export async function getFavoriteIds(): Promise<GetFavoriteIdsResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: [], error: null };
  }

  const { data: rows, error } = await supabase
    .from('favorites')
    .select('listing_id')
    .eq('user_id', user.id);

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  const ids = (rows ?? []).map((r: { listing_id: string }) => r.listing_id).filter(Boolean);
  return { data: ids, error: null };
}
