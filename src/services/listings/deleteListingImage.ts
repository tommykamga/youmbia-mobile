/**
 * Supprime une ligne `listing_images` (ne supprime pas le fichier Storage).
 */

import { supabase } from '@/lib/supabase';

export type DeleteListingImageResult =
  | { success: true }
  | { success: false; error: string };

export async function deleteListingImage(listingImageId: string): Promise<DeleteListingImageResult> {
  const id = String(listingImageId ?? '').trim();
  if (!id) return { success: false, error: 'Image introuvable.' };

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: 'Non connecté' };
    }

    const { data: row, error: rowErr } = await supabase
      .from('listing_images')
      .select('id, listing_id')
      .eq('id', id)
      .maybeSingle();

    if (rowErr || !row?.listing_id) {
      return { success: false, error: 'Image introuvable.' };
    }

    const { data: listing, error: listingErr } = await supabase
      .from('listings')
      .select('user_id')
      .eq('id', row.listing_id)
      .maybeSingle();

    if (listingErr || !listing) {
      return { success: false, error: 'Annonce introuvable.' };
    }

    if (String((listing as { user_id?: string | null }).user_id ?? '') !== String(user.id)) {
      return { success: false, error: 'Non autorisé.' };
    }

    const { error } = await supabase.from('listing_images').delete().eq('id', id);
    if (error) {
      console.warn('[deleteListingImage]', error);
      return { success: false, error: error.message || 'Suppression impossible.' };
    }

    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e ?? '');
    console.warn('[deleteListingImage]', e);
    return { success: false, error: message || 'Erreur inattendue.' };
  }
}

