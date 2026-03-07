/**
 * Update a listing's status (e.g. deactivate).
 * Only the listing owner can update; enforced via user_id check.
 */

import { supabase } from '@/lib/supabase';

export type UpdateListingStatusResult =
  | { data: null; error: null }
  | { data: null; error: { message: string } };

/**
 * Sets status for a listing owned by the current user.
 * Safe for "deactivate" by setting status to 'inactive' (or 'archived' if backend supports it).
 */
export async function updateListingStatus(
  listingId: string,
  status: string
): Promise<UpdateListingStatusResult> {
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
