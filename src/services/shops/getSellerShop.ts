import { supabase } from '@/lib/supabase';
import type { PublicShop } from '@/types/shops';
import { SHOP_PUBLIC_SELECT } from './shopSelect';

export type GetSellerShopResult =
  | { data: PublicShop; error: null }
  | { data: null; error: null }
  | { data: null; error: { message: string } };

/**
 * Boutique liée à un profil vendeur (`profiles.shop_id`).
 * Retourne null sans erreur si le vendeur est particulier ou sans boutique.
 */
export async function getSellerShop(profileId: string): Promise<GetSellerShopResult> {
  if (!profileId?.trim()) {
    return { data: null, error: null };
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('shop_id, seller_type')
      .eq('id', profileId)
      .maybeSingle();

    if (profileError) {
      return { data: null, error: { message: profileError.message } };
    }

    const shopId = (profile as { shop_id?: string | null } | null)?.shop_id ?? null;
    if (!shopId) {
      return { data: null, error: null };
    }

    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select(SHOP_PUBLIC_SELECT)
      .eq('id', shopId)
      .maybeSingle();

    if (shopError) {
      return { data: null, error: { message: shopError.message } };
    }
    if (!shop) {
      return { data: null, error: null };
    }

    return { data: shop as PublicShop, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return { data: null, error: { message } };
  }
}
