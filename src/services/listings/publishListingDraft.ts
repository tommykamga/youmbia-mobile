/**
 * Publication d’un brouillon : UPDATE status draft → active (même id).
 * Les validations de publication sont appliquées par l’appelant (écran Vendre).
 */

import { supabase } from '@/lib/supabase';
import { LISTING_STATUS } from '@/lib/listingStatus';
import type { ListingCategoryId } from '@/lib/listingCategories';
import type { TablesUpdate } from '@/types/database';
import { checkListingPublishDailyQuota } from './checkListingPublishDailyQuota';
import { removeListingDetailSession } from './listingDetailSessionCache';

export type PublishListingDraftPayload = {
  title: string;
  price: number;
  categoryId: ListingCategoryId;
  city?: string | null;
  description?: string | null;
  shopId?: string | null;
};

export type PublishListingDraftResult =
  | { data: { id: string; status: typeof LISTING_STATUS.active }; error: null }
  | { data: null; error: { message: string } };

const GENERIC_ERROR = "Impossible de publier l'annonce";
const UNAUTHORIZED = 'Brouillon introuvable ou non autorisé';

function mapPublishError(message: string): string {
  const msg = message.toLowerCase();
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('internet')) {
    return 'Réseau indisponible';
  }
  if (msg.includes('jwt') || msg.includes('auth')) {
    return 'Connexion requise';
  }
  if (msg.includes('invalid input value for enum') || msg.includes('listing_status')) {
    return "Les brouillons ne sont pas encore disponibles. Réessayez plus tard.";
  }
  return message.length > 0 && message.length < 120 ? message : GENERIC_ERROR;
}

export async function publishListingDraft(
  listingId: string,
  payload: PublishListingDraftPayload
): Promise<PublishListingDraftResult> {
  try {
    const id = String(listingId ?? '').trim();
    if (!id) {
      return { data: null, error: { message: 'Brouillon introuvable' } };
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { data: null, error: { message: 'Non connecté' } };
    }

    const title = payload.title?.trim();
    const categoryId = Number(payload.categoryId);
    const city = payload.city?.trim() || '';
    const description = payload.description?.trim() || null;
    const shopId = payload.shopId?.trim() || null;

    if (!title || title.length < 2) {
      return { data: null, error: { message: 'Titre requis (2 caractères minimum)' } };
    }
    if (typeof payload.price !== 'number' || !Number.isFinite(payload.price) || payload.price <= 0) {
      return { data: null, error: { message: 'Prix invalide (doit être supérieur à 0)' } };
    }
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return { data: null, error: { message: 'Catégorie requise' } };
    }

    // Même quota que createListing : empêche de contourner via N drafts puis publish.
    // Échec ici → statut reste `draft` (aucun UPDATE).
    const quota = await checkListingPublishDailyQuota(user.id);
    if (!quota.ok) {
      return { data: null, error: { message: quota.error.message } };
    }

    const updatePayload: TablesUpdate<'listings'> = {
      title,
      price: Math.round(payload.price),
      category_id: categoryId,
      city,
      description,
      status: LISTING_STATUS.active,
      updated_at: new Date().toISOString(),
      ...(shopId ? { shop_id: shopId } : {}),
    };

    const { data, error } = await supabase
      .from('listings')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', LISTING_STATUS.draft)
      .select('id, status')
      .maybeSingle();

    if (error) {
      return { data: null, error: { message: mapPublishError(error.message) } };
    }
    if (!data?.id) {
      return { data: null, error: { message: UNAUTHORIZED } };
    }

    removeListingDetailSession(id);

    return { data: { id: String(data.id), status: LISTING_STATUS.active }, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return { data: null, error: { message: mapPublishError(message) } };
  }
}
