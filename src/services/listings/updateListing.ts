/**
 * Mise à jour d’une annonce par le propriétaire (champs principaux legacy).
 */

import { supabase } from '@/lib/supabase';

export type UpdateListingPayload = {
  title: string;
  price: number;
  city?: string | null;
  description?: string | null;
};

export type UpdateListingResult =
  | { success: true }
  | { success: false; error: string };

export async function updateListing(
  listingId: string,
  payload: UpdateListingPayload
): Promise<UpdateListingResult> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: 'Non connecté' };
    }

    const title = payload.title?.trim();
    if (!title || title.length < 2) {
      return { success: false, error: 'Titre requis (2 caractères minimum)' };
    }
    if (typeof payload.price !== 'number' || !Number.isFinite(payload.price) || payload.price <= 0) {
      return { success: false, error: 'Prix invalide (doit être supérieur à 0)' };
    }

    /**
     * Ville optionnelle côté UX. Pour éviter un échec si la colonne est NOT NULL,
     * on persiste une chaîne vide plutôt que `null` quand non renseignée.
     */
    const city = payload.city?.trim() || '';
    const description = payload.description?.trim() || null;

    const { error } = await supabase
      .from('listings')
      .update({
        title,
        price: Math.round(payload.price),
        city,
        description,
        updated_at: new Date().toISOString(),
      })
      .eq('id', listingId)
      .eq('user_id', user.id);

    if (error) {
      console.warn('[updateListing]', error);
      return { success: false, error: error.message || 'Impossible de mettre à jour l’annonce.' };
    }

    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e ?? '');
    console.warn('[updateListing]', e);
    return { success: false, error: message || 'Erreur inattendue.' };
  }
}
