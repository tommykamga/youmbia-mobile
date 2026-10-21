import { supabase } from '@/lib/supabase';
import { resolveShopMediaUrls } from '@/lib/shopMediaUrl';
import type { PublicShop } from '@/types/shops';
import { SHOP_PUBLIC_SELECT } from './shopSelect';

export type GetShopBySlugResult =
  | { data: PublicShop; error: null }
  | { data: null; error: { message: string } | null };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Accepte les URLs canoniques par slug ainsi que les anciennes URLs Web
 * /shop/{owner_id}. L'UUID est d'abord cherché comme ID boutique, puis
 * comme ID propriétaire. En cas de boutiques multiples, sélection stable
 * de la plus ancienne (les nouveaux partages utilisent le slug).
 */
export async function getShopBySlug(slug: string): Promise<GetShopBySlugResult> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) {
    return { data: null, error: { message: 'Boutique introuvable' } };
  }

  try {
    const isUuid = UUID_PATTERN.test(normalized);
    const initial = await supabase
      .from('shops')
      .select(SHOP_PUBLIC_SELECT)
      .eq(isUuid ? 'id' : 'slug', normalized)
      .eq('status', 'active')
      .maybeSingle();

    if (initial.error) {
      return { data: null, error: { message: initial.error.message } };
    }

    let data = initial.data;
    if (!data && isUuid) {
      const byOwner = await supabase
        .from('shops')
        .select(SHOP_PUBLIC_SELECT)
        .eq('owner_id', normalized)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (byOwner.error) {
        return { data: null, error: { message: byOwner.error.message } };
      }
      data = byOwner.data;
    }

    if (!data) {
      return { data: null, error: { message: 'Boutique introuvable' } };
    }

    return { data: await resolveShopMediaUrls(data as PublicShop), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return { data: null, error: { message } };
  }
}
