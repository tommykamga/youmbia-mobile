import { supabase } from '@/lib/supabase';
import { LISTING_STATUS } from '@/lib/listingStatus';

export type CountMyActiveListingsResult =
  | { data: { count: number }; error: null }
  | { data: null; error: { message: string } };

/** Compte les annonces actives du vendeur connecté (RLS, sans charger les lignes). */
export async function countMyActiveListings(): Promise<CountMyActiveListingsResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  try {
    const { count, error } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', LISTING_STATUS.active);

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return { data: { count: count ?? 0 }, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return { data: null, error: { message } };
  }
}
