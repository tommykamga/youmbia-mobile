/**
 * Report a listing (e.g. inappropriate, scam).
 * Reuses existing backend: insert into listing_reports (listing_id, user_id, reason).
 * Auth required; caller should redirect to login if not authenticated.
 */

import { supabase } from '@/lib/supabase';

export type ReportListingResult =
  | { data: null; error: null }
  | { data: null; error: { message: string } };

/**
 * Submits a report for the given listing as the current user.
 * Returns error if not authenticated or backend rejects.
 */
export async function reportListing(
  listingId: string,
  reason?: string | null
): Promise<ReportListingResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  if (!listingId?.trim()) {
    return { data: null, error: { message: 'Annonce invalide' } };
  }

  const trimmedReason = reason?.trim() || null;
  if (!trimmedReason) {
    return { data: null, error: { message: 'Veuillez choisir un motif' } };
  }

  const { error } = await supabase.from('listing_reports').insert({
    listing_id: listingId.trim(),
    user_id: user.id,
    reason: trimmedReason,
  } as never);

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  return { data: null, error: null };
}
