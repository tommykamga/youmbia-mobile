/** Advisory UI quota check on observed first-publication facts; PostgreSQL enforces the atomic limit. */

import { supabase } from '@/lib/supabase';

/** Aligné app/sell : limite haute publications / 24h. */
export const MAX_LISTINGS_PER_24H = 100;

export const LISTING_PUBLISH_QUOTA_REACHED_MESSAGE =
  "Vous avez atteint la limite de publication pour aujourd’hui. Réessayez plus tard.";

export const LISTING_PUBLISH_QUOTA_CHECK_FAILED_MESSAGE =
  'Impossible de vérifier votre limite de publication pour le moment. Réessayez.';

export type ListingPublishQuotaResult =
  | { ok: true; count: number }
  | { ok: false; error: { message: string }; count?: number };

/** Counts observed first publications in the rolling 24-hour window, including old drafts. */
export async function checkListingPublishDailyQuota(
  userId: string,
  options?: { nowMs?: number }
): Promise<ListingPublishQuotaResult> {
  const uid = String(userId ?? '').trim();
  if (!uid) {
    return { ok: false, error: { message: 'Non connecté' } };
  }

  const nowMs = options?.nowMs ?? Date.now();
  const since = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from('listing_first_publications')
    .select('listing_id', { count: 'exact', head: true })
    .eq('user_id', uid)
    .gt('published_at', since);

  if (error) {
    return { ok: false, error: { message: LISTING_PUBLISH_QUOTA_CHECK_FAILED_MESSAGE } };
  }

  if (typeof count !== 'number') {
    return { ok: false, error: { message: LISTING_PUBLISH_QUOTA_CHECK_FAILED_MESSAGE } };
  }

  if (count >= MAX_LISTINGS_PER_24H) {
    return {
      ok: false,
      count,
      error: { message: LISTING_PUBLISH_QUOTA_REACHED_MESSAGE },
    };
  }

  return { ok: true, count };
}
