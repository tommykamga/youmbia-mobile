import { supabase } from '@/lib/supabase';
import { resolveShopMediaUrls } from '@/lib/shopMediaUrl';
import type { PublicShop, SellerType } from '@/types/shops';
import { SHOP_PUBLIC_SELECT } from './shopSelect';

export type MySellerProStatus = {
  sellerType: SellerType;
  shop: PublicShop | null;
};

export type GetMySellerProStatusResult =
  | { data: MySellerProStatus; error: null }
  | { data: null; error: { message: string } };

export async function getMySellerProStatus(): Promise<GetMySellerProStatusResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('seller_type, shop_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      return { data: null, error: { message: profileError.message } };
    }

    const sellerTypeRaw = (profile as { seller_type?: string | null } | null)?.seller_type;
    const sellerType: SellerType = sellerTypeRaw === 'pro' ? 'pro' : 'individual';
    const shopId = (profile as { shop_id?: string | null } | null)?.shop_id ?? null;

    if (!shopId) {
      return { data: { sellerType, shop: null }, error: null };
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
      return { data: { sellerType, shop: null }, error: null };
    }

    const resolved = await resolveShopMediaUrls(shop as PublicShop);
    return { data: { sellerType, shop: resolved }, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return { data: null, error: { message } };
  }
}
