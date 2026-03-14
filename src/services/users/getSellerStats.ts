import { supabase } from '@/lib/supabase';

export type SellerStats = {
  memberSince: string | null;
  listingCount: number;
};

export type GetSellerStatsResult =
  | { data: SellerStats; error: null }
  | { data: null; error: { message: string } };

const GENERIC_ERROR_MESSAGE = 'Impossible de charger les informations du vendeur';

export async function getSellerStats(userId: string): Promise<GetSellerStatsResult> {
  const id = userId?.trim();
  if (!id) {
    return { data: null, error: { message: 'Identifiant vendeur manquant' } };
  }

  try {
    const [{ data: profileRow, error: profileError }, { count, error: listingsError }] =
      await Promise.all([
        supabase.from('profiles').select('created_at').eq('id', id).maybeSingle(),
        supabase
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', id)
          .eq('status', 'active'),
      ]);

    if (profileError || listingsError) {
      return { data: null, error: { message: GENERIC_ERROR_MESSAGE } };
    }

    return {
      data: {
        memberSince: (profileRow as { created_at?: string | null } | null)?.created_at ?? null,
        listingCount: Math.max(0, Number(count ?? 0)),
      },
      error: null,
    };
  } catch {
    return { data: null, error: { message: GENERIC_ERROR_MESSAGE } };
  }
}
