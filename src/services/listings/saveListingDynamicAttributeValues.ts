/**
 * Upsert `listing_attribute_values` après création d’annonce (aligné web `saveListingDynamicAttributeValuesAction`).
 */

import { supabase } from '@/lib/supabase';
import type { ListingDynamicAttributeRowInsert } from '@/lib/listingDynamicAttributesPayload';

export type SaveListingDynamicAttributeValuesResult =
  | { success: true; saved: number }
  | { success: false; error: string };

export async function saveListingDynamicAttributeValues(
  listingId: string,
  rows: ListingDynamicAttributeRowInsert[]
): Promise<SaveListingDynamicAttributeValuesResult> {
  if (!rows.length) {
    return { success: true, saved: 0 };
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Non connecté' };
    }

    const { data: listing, error: listingErr } = await supabase
      .from('listings')
      .select('user_id')
      .eq('id', listingId)
      .maybeSingle();

    if (listingErr || !listing) {
      console.warn('[saveListingDynamicAttributeValues] listing', listingErr);
      return { success: false, error: 'Annonce introuvable.' };
    }
    if (String(listing.user_id) !== String(user.id)) {
      console.warn('[saveListingDynamicAttributeValues] owner mismatch', listingId);
      return { success: false, error: 'Non autorisé.' };
    }

    const payload = rows.map((r) => ({
      listing_id: listingId,
      attribute_definition_id: r.attribute_definition_id,
      option_id: r.option_id,
      value_text: r.value_text,
      value_number: r.value_number,
      value_boolean: r.value_boolean,
      value_date: r.value_date,
    }));

    const { error } = await supabase.from('listing_attribute_values').upsert(payload, {
      onConflict: 'listing_id,attribute_definition_id',
    });

    if (error) {
      console.warn('[saveListingDynamicAttributeValues] upsert', error);
      return { success: false, error: error.message };
    }

    return { success: true, saved: rows.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e ?? '');
    console.warn('[saveListingDynamicAttributeValues]', e);
    return { success: false, error: message || 'Erreur inattendue.' };
  }
}
