/**
 * Toggle favorite: add or remove listing for current user.
 * Uses Supabase favorites table (same as web app).
 */

import { supabase } from '@/lib/supabase';

export type ToggleFavoriteResult =
  | { isFavorite: boolean; error: null }
  | { isFavorite: never; error: { message: string } };

function getFavoriteErrorMessage(message: string, fallback: string): string {
  const msg = message.toLowerCase();
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('internet')) {
    return 'Réseau indisponible';
  }
  if (msg.includes('jwt') || msg.includes('auth')) {
    return 'Connexion requise';
  }
  return fallback;
}

/**
 * If the listing is currently favorited, removes it. Otherwise adds it.
 * Returns the new state (isFavorite) or error if not logged in / request failed.
 */
export async function toggleFavorite(listingId: string): Promise<ToggleFavoriteResult> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { isFavorite: undefined as never, error: { message: 'Non connecté' } };
    }

    const userId = user.id;

    const { data: existing, error: existingError } = await supabase
      .from('favorites')
      .select('listing_id')
      .eq('user_id', userId)
      .eq('listing_id', listingId)
      .maybeSingle();

    if (existingError) {
      return {
        isFavorite: undefined as never,
        error: {
          message: getFavoriteErrorMessage(
            existingError.message,
            'Impossible de mettre à jour le favori'
          ),
        },
      };
    }

    if (existing) {
      const { error: deleteError } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', userId)
        .eq('listing_id', listingId);

      if (deleteError) {
        return {
          isFavorite: undefined as never,
          error: {
            message: getFavoriteErrorMessage(
              deleteError.message,
              'Impossible de mettre à jour le favori'
            ),
          },
        };
      }
      return { isFavorite: false, error: null };
    }

    const { error: insertError } = await supabase
      .from('favorites')
      .insert({ user_id: userId, listing_id: listingId } as never);

    if (insertError) {
      return {
        isFavorite: undefined as never,
        error: {
          message: getFavoriteErrorMessage(
            insertError.message,
            'Impossible de mettre à jour le favori'
          ),
        },
      };
    }
    return { isFavorite: true, error: null };
  } catch {
    return {
      isFavorite: undefined as never,
      error: { message: 'Impossible de mettre à jour le favori' },
    };
  }
}
