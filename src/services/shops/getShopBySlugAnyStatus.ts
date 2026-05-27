import { supabase } from '@/lib/supabase';
import { resolveShopMediaUrls } from '@/lib/shopMediaUrl';
import type { PublicShop } from '@/types/shops';
import { SHOP_PUBLIC_SELECT } from './shopSelect';

export type GetShopBySlugAnyStatusResult =
  | { data: PublicShop; error: null }
  | { data: null; error: { message: string } | null };

/**
 * Lecture boutique par slug sans filtre de statut.
 * À utiliser uniquement côté propriétaire (pour afficher hidden/suspended).
 */
export async function getShopBySlugAnyStatus(slug: string): Promise<GetShopBySlugAnyStatusResult> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) {
    return { data: null, error: { message: 'Boutique introuvable' } };
  }

  try {
    const { data, error } = await supabase
      .from('shops')
      .select(SHOP_PUBLIC_SELECT)
      .eq('slug', normalized)
      .maybeSingle();

    if (error) {
      return { data: null, error: { message: error.message } };
    }
    if (!data) {
      return { data: null, error: { message: 'Boutique introuvable' } };
    }

    const resolved = await resolveShopMediaUrls(data as PublicShop);
    return { data: resolved, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return { data: null, error: { message } };
  }
}

