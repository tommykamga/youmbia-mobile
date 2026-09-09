/**
 * Quota anti-spam publication : max N annonces non-brouillon créées / 24h.
 * Contrôle client/service uniquement (aucune contrainte DB).
 * Partagé par createListing (INSERT active) et publishListingDraft (draft→active).
 * createListingDraft / updateListingDraft ne consomment pas ce quota.
 */

import { supabase } from '@/lib/supabase';
import { LISTING_STATUS } from '@/lib/listingStatus';

/** Aligné app/sell : limite haute publications / 24h. */
export const MAX_LISTINGS_PER_24H = 100;

export const LISTING_PUBLISH_QUOTA_REACHED_MESSAGE =
  "Vous avez atteint la limite de publication pour aujourd’hui. Réessayez plus tard.";

export const LISTING_PUBLISH_QUOTA_CHECK_FAILED_MESSAGE =
  'Impossible de vérifier votre limite de publication pour le moment. Réessayez.';

export type ListingPublishQuotaResult =
  | { ok: true; count: number }
  | { ok: false; error: { message: string }; count?: number };

/**
 * Compte les annonces du user créées dans les 24 dernières heures,
 * hors statut `draft` (les brouillons ne consomment pas le quota tant qu’ils restent brouillons).
 * La publication draft→active est soumise au même contrôle avant UPDATE.
 */
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
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid)
    .neq('status', LISTING_STATUS.draft)
    .gte('created_at', since);

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
