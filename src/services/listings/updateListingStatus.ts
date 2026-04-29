/**
 * Update a listing's status (e.g. deactivate).
 * Only the listing owner can update; enforced via user_id check.
 */

import { supabase } from '@/lib/supabase';

export type ListingStatus = 'active' | 'hidden' | 'suspended';

export type UpdateListingStatusResult =
  | { data: null; error: null }
  | { data: null; error: { message: string } };

/**
 * Sets status for a listing owned by the current user.
 * To hide/pause a listing, use status 'hidden' (aligned with web).
 */
export async function updateListingStatus(
  listingId: string,
  status: ListingStatus
): Promise<UpdateListingStatusResult> {
  if (status !== 'active' && status !== 'hidden' && status !== 'suspended') {
    return { data: null, error: { message: 'Statut annonce invalide' } };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  const { error } = await supabase
    .from('listings')
    .update({ status } as never)
    .eq('id', listingId)
    .eq('user_id', user.id);

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  return { data: null, error: null };
}
