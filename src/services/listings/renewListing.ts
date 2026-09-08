/**
 * Renouvelle une annonce déjà active (ranking discovery via renewed_at).
 * Ne change pas le statut, ne recrée pas la ligne, n’écrit pas created_at / updated_at / sold_at.
 * La valeur finale de renewed_at est posée par le trigger DB.
 */

import { supabase } from '@/lib/supabase';
import { trackListingRenewed } from '@/lib/analytics';
import { LISTING_RENEWAL_COOLDOWN_ERROR } from '@/lib/listingRenewal';
import {
  canSellerRenewListing,
  LISTING_STATUS,
  RENEW_LISTING_ERROR_MESSAGE,
} from '@/lib/listingStatus';
import { removeListingDetailSession } from './listingDetailSessionCache';

export type RenewListingResult =
  | { data: { id: string; status: typeof LISTING_STATUS.active }; error: null }
  | { data: null; error: { message: string } };

const UNAUTHORIZED_ERROR = 'Annonce introuvable ou non autorisée';
const SUSPENDED_RENEW_ERROR = 'Une annonce suspendue ne peut pas être renouvelée.';
const NOT_ACTIVE_ERROR = "Seule une annonce en ligne peut être renouvelée.";

function mapRenewErrorMessage(message: string | undefined): string {
  const raw = String(message ?? '');
  const lower = raw.toLowerCase();
  if (lower.includes('3 jours') || lower.includes('3 days') || lower.includes('cooldown')) {
    return LISTING_RENEWAL_COOLDOWN_ERROR;
  }
  if (lower.includes('suspendue') || lower.includes('suspended')) {
    return 'Une annonce suspendue ne peut pas être renouvelée.';
  }
  if (raw.length > 0 && raw.length < 120) return raw;
  return RENEW_LISTING_ERROR_MESSAGE;
}

export async function renewListing(listingId: string): Promise<RenewListingResult> {
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
    return { data: null, error: { message: mapRenewErrorMessage(existingError.message) } };
  }
  if (!existing) {
    return { data: null, error: { message: UNAUTHORIZED_ERROR } };
  }

  const current = String((existing as { status?: string }).status ?? '').toLowerCase();
  if (current === LISTING_STATUS.suspended) {
    return { data: null, error: { message: SUSPENDED_RENEW_ERROR } };
  }
  if (!canSellerRenewListing(current)) {
    return { data: null, error: { message: NOT_ACTIVE_ERROR } };
  }

  const { data, error } = await supabase
    .from('listings')
    .update({ renewed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, status')
    .maybeSingle();

  if (error) {
    return { data: null, error: { message: mapRenewErrorMessage(error.message) } };
  }
  if (!data) {
    return { data: null, error: { message: UNAUTHORIZED_ERROR } };
  }

  removeListingDetailSession(id);
  trackListingRenewed({ listing_id: id, source: 'manual_renewal' });

  return {
    data: { id: String((data as { id: string }).id), status: LISTING_STATUS.active },
    error: null,
  };
}
