import { supabase } from '@/lib/supabase';
import type { ShopSummary } from '@/types/shops';
import { SHOP_SUMMARY_SELECT } from './shopSelect';

export async function getShopSummaryById(shopId: string): Promise<ShopSummary | null> {
  if (!shopId?.trim()) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('shops')
      .select(SHOP_SUMMARY_SELECT)
      .eq('id', shopId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data as ShopSummary;
  } catch {
    return null;
  }
}
