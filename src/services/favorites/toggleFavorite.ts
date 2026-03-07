/**
 * Toggle favorite: add or remove listing for current user.
 * Uses Supabase favorites table (same as web app).
 */

import { supabase } from '@/lib/supabase';

export type ToggleFavoriteResult =
  | { isFavorite: boolean; error: null }
  | { isFavorite: never; error: { message: string } };

/**
 * If the listing is currently favorited, removes it. Otherwise adds it.
 * Returns the new state (isFavorite) or error if not logged in / request failed.
 */
export async function toggleFavorite(listingId: string): Promise<ToggleFavoriteResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { isFavorite: undefined as never, error: { message: 'Non connecté' } };
  }

  const userId = user.id;

  const { data: existing } = await supabase
    .from('favorites')
    .select('listing_id')
    .eq('user_id', userId)
    .eq('listing_id', listingId)
    .maybeSingle();

  if (existing) {
    const { error: deleteError } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('listing_id', listingId);

    if (deleteError) {
      return { isFavorite: undefined as never, error: { message: deleteError.message } };
    }
    return { isFavorite: false, error: null };
  }

  const { error: insertError } = await supabase
    .from('favorites')
    .insert({ user_id: userId, listing_id: listingId } as never);

  if (insertError) {
    return { isFavorite: undefined as never, error: { message: insertError.message } };
  }
  return { isFavorite: true, error: null };
}
