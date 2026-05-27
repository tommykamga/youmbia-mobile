import { supabase } from '@/lib/supabase';
import type { ShopStatus } from '@/types/shops';
import { invalidatePopularShopsCache } from './popularShopsCache';

export type UpdateShopStatusResult =
  | { data: { status: ShopStatus }; error: null }
  | { data: null; error: { message: string } };

function normalizeNextStatus(next: string): ShopStatus | null {
  const s = next.trim().toLowerCase();
  if (s === 'active' || s === 'hidden' || s === 'suspended') return s;
  return null;
}

/**
 * Owner peut uniquement basculer `active` <-> `hidden`.
 * `suspended` est réservé admin/service role (enforced DB trigger + check côté client).
 */
export async function updateShopStatus(shopId: string, nextStatus: ShopStatus): Promise<UpdateShopStatusResult> {
  const id = String(shopId ?? '').trim();
  if (!id) {
    return { data: null, error: { message: 'Boutique invalide' } };
  }

  const target = normalizeNextStatus(nextStatus);
  if (!target || target === 'suspended') {
    return { data: null, error: { message: 'Action non autorisée' } };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  // Lire le statut actuel pour appliquer la règle de transition.
  const { data: shop, error: readError } = await supabase
    .from('shops')
    .select('id, owner_id, status')
    .eq('id', id)
    .maybeSingle();

  if (readError) {
    return { data: null, error: { message: readError.message } };
  }
  if (!shop) {
    return { data: null, error: { message: 'Boutique introuvable' } };
  }

  const ownerId = String((shop as { owner_id?: string | null }).owner_id ?? '').trim();
  if (!ownerId || ownerId !== user.id) {
    return { data: null, error: { message: 'Action non autorisée' } };
  }

  const currentRaw = String((shop as { status?: string | null }).status ?? 'active').toLowerCase();
  const current: ShopStatus =
    currentRaw === 'hidden' ? 'hidden' : currentRaw === 'suspended' ? 'suspended' : 'active';

  if (current === 'suspended') {
    return { data: null, error: { message: 'Votre boutique est suspendue. Contactez le support.' } };
  }

  if (current === target) {
    return { data: { status: current }, error: null };
  }

  const allowed =
    (current === 'active' && target === 'hidden') || (current === 'hidden' && target === 'active');
  if (!allowed) {
    return { data: null, error: { message: 'Transition de statut impossible' } };
  }

  const { error: updateError } = await supabase
    .from('shops')
    .update({ status: target } as never)
    .eq('id', id)
    .eq('owner_id', user.id);

  if (updateError) {
    return { data: null, error: { message: updateError.message } };
  }

  // cache home shops dépend du statut
  invalidatePopularShopsCache();

  return { data: { status: target }, error: null };
}

