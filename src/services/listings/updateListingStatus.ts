/**
 * Update a listing's status (pause, reactivate, sold).
 * Only the listing owner can update; enforced via user_id check + row return.
 */

import { supabase } from '@/lib/supabase';
import { trackListingMarkedSold } from '@/lib/analytics';
import {
  canSellerReactivateListing,
  isAllowedListingStatus,
  LISTING_STATUS,
  type ListingStatus,
} from '@/lib/listingStatus';
import { timeToSaleSeconds } from '@/lib/timeToSale';
import { removeListingDetailSession } from './listingDetailSessionCache';

export type { ListingStatus };

export type UpdateListingStatusResult =
  | { data: { id: string; status: ListingStatus }; error: null }
  | { data: null; error: { message: string } };

const GENERIC_UPDATE_ERROR = "Impossible de mettre à jour l'annonce";
const UNAUTHORIZED_ERROR = 'Annonce introuvable ou non autorisée';
const SOLD_ENUM_ERROR =
  "Le statut « vendue » n'est pas encore disponible. Réessayez plus tard.";
const SUSPENDED_REACTIVATE_ERROR = 'Une annonce suspendue ne peut pas être réactivée.';
const SUSPENDED_STATUS_ERROR = 'Statut réservé à la modération.';

function mapUpdateErrorMessage(message: string | undefined): string {
  const raw = String(message ?? '');
  const lower = raw.toLowerCase();
  if (
    lower.includes('invalid input value for enum') ||
    (lower.includes('listing_status') && lower.includes('sold'))
  ) {
    return SOLD_ENUM_ERROR;
  }
  if (raw.length > 0 && raw.length < 120) return raw;
  return GENERIC_UPDATE_ERROR;
}

/**
 * Sets status for a listing owned by the current user.
 * To hide/pause a listing, use status 'hidden' (aligned with web).
 * To mark sold, prefer `markListingSold` (analytics + garde-fous).
 */
export async function updateListingStatus(
  listingId: string,
  status: ListingStatus
): Promise<UpdateListingStatusResult> {
  if (!isAllowedListingStatus(status)) {
    return { data: null, error: { message: 'Statut annonce invalide' } };
  }

  const id = String(listingId ?? '').trim();
  if (!id) {
    return { data: null, error: { message: 'Annonce introuvable' } };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  if (status === LISTING_STATUS.suspended) {
    return { data: null, error: { message: SUSPENDED_STATUS_ERROR } };
  }

  if (status === LISTING_STATUS.active) {
    const { data: existing, error: existingError } = await supabase
      .from('listings')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingError) {
      return { data: null, error: { message: mapUpdateErrorMessage(existingError.message) } };
    }
    if (!existing) {
      return { data: null, error: { message: UNAUTHORIZED_ERROR } };
    }

    const current = String((existing as { status?: string }).status ?? '').toLowerCase();
    if (current === LISTING_STATUS.suspended) {
      return { data: null, error: { message: SUSPENDED_REACTIVATE_ERROR } };
    }
    if (current === LISTING_STATUS.active) {
      return { data: { id, status: LISTING_STATUS.active }, error: null };
    }
    if (!canSellerReactivateListing(current)) {
      return { data: null, error: { message: 'Statut annonce invalide' } };
    }
  }

  // `sold_at` / `sale_cycle_started_at` : trigger DB `listings_set_sale_cycle`, jamais écrits ici.
  const { data, error } = await supabase
    .from('listings')
    .update({ status })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, status')
    .maybeSingle();

  if (error) {
    return { data: null, error: { message: mapUpdateErrorMessage(error.message) } };
  }

  if (!data) {
    return { data: null, error: { message: UNAUTHORIZED_ERROR } };
  }

  removeListingDetailSession(id);

  const nextStatus = String((data as { status?: string }).status ?? status).toLowerCase();
  if (!isAllowedListingStatus(nextStatus)) {
    return { data: null, error: { message: GENERIC_UPDATE_ERROR } };
  }

  return {
    data: { id: String((data as { id: string }).id), status: nextStatus },
    error: null,
  };
}

/**
 * Marque une annonce comme vendue : propriétaire uniquement, pas de DELETE.
 * Interdit depuis `suspended` (modération). Idempotent si déjà `sold`.
 */
export async function markListingSold(listingId: string): Promise<UpdateListingStatusResult> {
  const id = String(listingId ?? '').trim();
  if (!id) {
    return { data: null, error: { message: 'Annonce introuvable' } };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  const { data: existing, error: existingError } = await supabase
    .from('listings')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingError) {
    return { data: null, error: { message: mapUpdateErrorMessage(existingError.message) } };
  }

  if (!existing) {
    return { data: null, error: { message: UNAUTHORIZED_ERROR } };
  }

  const current = String((existing as { status?: string }).status ?? '').toLowerCase();
  if (current === LISTING_STATUS.suspended) {
    return {
      data: null,
      error: { message: 'Une annonce suspendue ne peut pas être marquée comme vendue.' },
    };
  }

  if (current === LISTING_STATUS.sold) {
    removeListingDetailSession(id);
    return { data: { id, status: LISTING_STATUS.sold }, error: null };
  }

  if (current !== LISTING_STATUS.active && current !== LISTING_STATUS.hidden) {
    return { data: null, error: { message: 'Statut annonce invalide' } };
  }

  const result = await updateListingStatus(id, LISTING_STATUS.sold);
  if (result.error) return result;

  trackListingMarkedSold({
    listing_id: id,
    ...(await readTimeToSaleSeconds(id, user.id)),
  });
  return result;
}

/**
 * Enrichit Mixpanel uniquement si les timestamps DB permettent un calcul fiable.
 * N’échoue jamais le marquage vendue (colonne absente, trigger non appliqué, etc.).
 */
async function readTimeToSaleSeconds(
  listingId: string,
  userId: string
): Promise<{ time_to_sale_seconds: number } | Record<string, never>> {
  try {
    const { data, error } = await supabase
      .from('listings')
      .select('created_at, sold_at, sale_cycle_started_at')
      .eq('id', listingId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return {};
    const row = data as {
      created_at?: string | null;
      sold_at?: string | null;
      sale_cycle_started_at?: string | null;
    };
    const seconds = timeToSaleSeconds(row.created_at, row.sold_at, row.sale_cycle_started_at);
    return seconds == null ? {} : { time_to_sale_seconds: seconds };
  } catch {
    return {};
  }
}
