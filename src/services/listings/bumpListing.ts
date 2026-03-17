import { supabase } from '@/lib/supabase';
import type { TablesUpdate } from '@/types/database';

export type BumpListingResult =
  | { data: null; error: null }
  | { data: null; error: { message: string } };

const GENERIC_ERROR_MESSAGE = "Impossible de remonter l'annonce";

export async function bumpListing(listingId: string): Promise<BumpListingResult> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { data: null, error: { message: 'Non connecté' } };
    }

    const updates: TablesUpdate<'listings'> = {
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('listings')
      .update(updates)
      .eq('id', listingId)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle();

    if (error || !data) {
      return { data: null, error: { message: GENERIC_ERROR_MESSAGE } };
    }

    return { data: null, error: null };
  } catch {
    return { data: null, error: { message: GENERIC_ERROR_MESSAGE } };
  }
}
