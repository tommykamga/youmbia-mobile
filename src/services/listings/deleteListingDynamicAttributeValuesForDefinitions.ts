/**
 * Supprime les lignes `listing_attribute_values` pour des définitions données (aligné web).
 */

import { supabase } from '@/lib/supabase';

export type DeleteListingDynamicAttributeValuesResult =
  | { success: true }
  | { success: false; error: string };

export async function deleteListingDynamicAttributeValuesForDefinitions(
  listingId: string,
  attributeDefinitionIds: string[]
): Promise<DeleteListingDynamicAttributeValuesResult> {
  if (!attributeDefinitionIds.length) {
    return { success: true };
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
      console.warn('[deleteListingDynamicAttributeValuesForDefinitions] listing', listingErr);
      return { success: false, error: 'Annonce introuvable.' };
    }
    if (String(listing.user_id) !== String(user.id)) {
      return { success: false, error: 'Non autorisé.' };
    }

    const { error } = await supabase
      .from('listing_attribute_values')
      .delete()
      .eq('listing_id', listingId)
      .in('attribute_definition_id', attributeDefinitionIds);

    if (error) {
      console.warn('[deleteListingDynamicAttributeValuesForDefinitions] delete', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e ?? '');
    console.warn('[deleteListingDynamicAttributeValuesForDefinitions]', e);
    return { success: false, error: message || 'Erreur inattendue.' };
  }
}
