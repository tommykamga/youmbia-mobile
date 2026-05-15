import { supabase } from '@/lib/supabase';
import type { PublicShop } from '@/types/shops';
import { SHOP_PUBLIC_SELECT } from './shopSelect';

export type GetFeaturedShopsResult =
  | { data: PublicShop[]; error: null }
  | { data: null; error: { message: string } };

const FEATURED_SHOPS_LIMIT = 12;

export async function getFeaturedShops(): Promise<GetFeaturedShopsResult> {
  try {
    const { data, error } = await supabase
      .from('shops')
      .select(SHOP_PUBLIC_SELECT)
      .eq('is_featured', true)
      .order('updated_at', { ascending: false })
      .limit(FEATURED_SHOPS_LIMIT);

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return { data: (data ?? []) as PublicShop[], error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return { data: null, error: { message } };
  }
}
