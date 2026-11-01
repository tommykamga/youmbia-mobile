import { supabase } from '@/lib/supabase';
export type Availability = { state: 'available' | 'unknown' | 'sold'; confirmed_at: string | null };
export const UNKNOWN_AVAILABILITY: Availability = { state: 'unknown', confirmed_at: null };
export async function verifiedSubject(kind: 'profile' | 'shop', id: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_v5_verified_subject', { p_subject_type: kind, p_subject_id: id });
    return !error && data === true;
  } catch { return false; }
}
export async function getListingAvailability(id: string): Promise<Availability> {
  try {
    const { data, error } = await supabase.rpc('get_v5_listing_availability', { p_listing_id: id });
    const value = data?.[0];
    if (!error && value && ['available','unknown','sold'].includes(value.state)) return { state: value.state as Availability['state'], confirmed_at: value.confirmed_at };
  } catch { /* Legacy backend: absence is unknown, never "available". */ }
  return { ...UNKNOWN_AVAILABILITY };
}
export async function declareListingAvailability(id: string, state: Availability['state'], expectedStatus: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('declare_v5_listing_availability', { p_listing_id: id, p_state: state, p_expected_status: expectedStatus });
    return !error && data === state;
  } catch { return false; }
}
export function availabilityLabel(value: Availability): string {
  if (value.state === 'sold') return 'Vente déclarée par le vendeur';
  if (value.state === 'available' && value.confirmed_at) return `Disponibilité déclarée le ${new Date(value.confirmed_at).toLocaleDateString('fr-FR')}`;
  return 'Disponibilité non confirmée';
}

export async function withShopVerification<T extends { id: string }>(shops: T[]): Promise<(T & { verification_proven: boolean })[]> {
  const receipts = new Map<string, boolean>();
  if (shops.length) {
    try {
      const { data, error } = await supabase.rpc('get_v5_verified_subjects', { p_subject_type: 'shop', p_subject_ids: shops.map(s => s.id).slice(0, 50) });
      if (!error) for (const row of data ?? []) receipts.set(row.subject_id, row.verification_proven === true);
    } catch { /* No historical flag can substitute for evidence. */ }
  }
  return shops.map(shop => ({ ...shop, verification_proven: receipts.get(shop.id) === true }));
}
