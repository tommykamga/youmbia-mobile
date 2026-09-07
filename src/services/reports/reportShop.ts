/**
 * Signalement boutique — insert dans shop_reports.
 */

import { REPORT_OWN_CONTENT_MESSAGE } from '@/constants/reportMessages';
import { buildPersistedReason, normalizeReportReason } from '@/constants/reportReasons';
import { supabase } from '@/lib/supabase';

export type ReportShopResult =
  | { data: null; error: null }
  | { data: null; error: { message: string } };
export async function reportShop(
  shopId: string,
  reason?: string | null,
  options?: { ownerId?: string | null; comment?: string | null }
): Promise<ReportShopResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  if (!shopId?.trim()) {
    return { data: null, error: { message: 'Boutique invalide' } };
  }

  if (options?.ownerId?.trim() === user.id) {
    return { data: null, error: { message: REPORT_OWN_CONTENT_MESSAGE } };
  }

  if (!options?.ownerId?.trim()) {
    const { data: shopRow, error: shopError } = await supabase
      .from('shops')
      .select('owner_id')
      .eq('id', shopId.trim())
      .maybeSingle();

    if (shopError) {
      return { data: null, error: { message: shopError.message } };
    }
    if (shopRow?.owner_id === user.id) {
      return { data: null, error: { message: REPORT_OWN_CONTENT_MESSAGE } };
    }
  }

  const code = normalizeReportReason(reason, 'listing');
  if (!code) {
    return { data: null, error: { message: 'Veuillez choisir un motif' } };
  }

  const { error } = await supabase.from('shop_reports').insert({
    shop_id: shopId.trim(),
    user_id: user.id,
    reason: buildPersistedReason(code, options?.comment),
  } as never);

  if (error) {
    if (error.code === '23505') return { data: null, error: null };
    return { data: null, error: { message: error.message } };
  }

  return { data: null, error: null };
}
