import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type ListingStats = {
  views: number;
  favorites: number;
  contacts: number;
};

/**
 * Structure pensée pour extensions futures sans casser le contrat actuel :
 * - shareCount
 * - conversionRate
 * - lastContactAt
 */
export type GetListingStatsResult = {
  data: ListingStats;
  error: null | { message: string };
};

const DEFAULT_LISTING_STATS: ListingStats = {
  views: 0,
  favorites: 0,
  contacts: 0,
};

const GENERIC_ERROR_MESSAGE = 'Impossible de charger les statistiques de l’annonce';

function toSafeCount(value: unknown): number {
  return Math.max(0, Number(value ?? 0) || 0);
}

export async function getListingStats(listingId: string): Promise<GetListingStatsResult> {
  const id = listingId?.trim();
  if (!id) {
    return {
      data: DEFAULT_LISTING_STATS,
      error: { message: 'Identifiant annonce manquant' },
    };
  }

  try {
    const [
      { data: listingRow, error: listingError },
      { count: favoritesCount, error: favoritesError },
      { count: contactsCount, error: contactsError },
    ] = await Promise.all([
      supabase.from('listings').select('views_count').eq('id', id).maybeSingle(),
      supabase
        .from('favorites')
        .select('listing_id', { count: 'exact', head: true })
        .eq('listing_id', id),
      supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('listing_id', id),
    ]);

    const data: ListingStats = {
      views: toSafeCount((listingRow as Pick<Tables<'listings'>, 'views_count'> | null)?.views_count),
      favorites: favoritesError ? 0 : toSafeCount(favoritesCount),
      contacts: contactsError ? 0 : toSafeCount(contactsCount),
    };

    if (listingError) {
      return { data, error: { message: GENERIC_ERROR_MESSAGE } };
    }

    if (favoritesError || contactsError) {
      return { data, error: { message: GENERIC_ERROR_MESSAGE } };
    }

    return { data, error: null };
  } catch {
    return {
      data: DEFAULT_LISTING_STATS,
      error: { message: GENERIC_ERROR_MESSAGE },
    };
  }
}
