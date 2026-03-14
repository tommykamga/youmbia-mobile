/**
 * Update a listing's urgent flag for the current seller.
 * Only the listing owner can update; enforced via user_id check.
 */

import { supabase } from '@/lib/supabase';

export type UpdateListingUrgentResult =
  | { data: null; error: null }
  | { data: null; error: { message: string } };

const GENERIC_ERROR_MESSAGE = "Impossible de mettre a jour l'annonce";

export async function updateListingUrgent(
  listingId: string,
  urgent: boolean
): Promise<UpdateListingUrgentResult> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { data: null, error: { message: 'Non connecté' } };
    }

    const { data, error } = await supabase
      .from('listings')
      .update({ urgent } as never)
      .eq('id', listingId)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle();

    if (error) {
      return { data: null, error: { message: GENERIC_ERROR_MESSAGE } };
    }

    if (!data) {
      return { data: null, error: { message: GENERIC_ERROR_MESSAGE } };
    }

    return { data: null, error: null };
  } catch {
    return { data: null, error: { message: GENERIC_ERROR_MESSAGE } };
  }
}
