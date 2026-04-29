/**
 * Suppression d’une annonce par le propriétaire.
 *
 * Note: on ne supprime PAS les fichiers Storage ici (aligné à la consigne).
 * Selon les contraintes DB/RLS, la suppression peut échouer (ex: conversations existantes).
 */

import { supabase } from '@/lib/supabase';

export type DeleteListingResult =
  | { success: true }
  | { success: false; error: string };

export async function deleteListing(listingId: string): Promise<DeleteListingResult> {
  const id = String(listingId ?? '').trim();
  if (!id) return { success: false, error: 'Annonce introuvable.' };

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: 'Non connecté' };
    }

    const { error } = await supabase
      .from('listings')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.warn('[deleteListing]', error);
      return { success: false, error: error.message || "Impossible de supprimer l'annonce." };
    }

    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e ?? '');
    console.warn('[deleteListing]', e);
    return { success: false, error: message || 'Erreur inattendue.' };
  }
}

