/**
 * Create a new listing (current user as seller).
 * Inserts into listings; then caller can upload images and insert listing_images.
 */

import { supabase } from '@/lib/supabase';
import type { ListingCategoryId } from '@/lib/listingCategories';
import type { TablesInsert } from '@/types/database';

export type CreateListingPayload = {
  title: string;
  price: number;
  categoryId: ListingCategoryId;
  city?: string | null;
  description?: string | null;
};

export type CreateListingResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { message: string } };

function getCreateListingErrorMessage(message: string): string {
  const msg = message.toLowerCase();
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('internet')) {
    return 'Réseau indisponible';
  }
  if (msg.includes('jwt') || msg.includes('auth')) {
    return 'Connexion requise';
  }
  return "Impossible de publier l'annonce";
}

export async function createListing(payload: CreateListingPayload): Promise<CreateListingResult> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { data: null, error: { message: 'Non connecté' } };
    }

    const title = payload.title?.trim();
    const categoryId = Number(payload.categoryId);
    const city = payload.city?.trim() || null;
    const description = payload.description?.trim() || null;

    if (!title || title.length < 2) {
      return { data: null, error: { message: 'Titre requis (2 caractères minimum)' } };
    }
    if (typeof payload.price !== 'number' || !Number.isFinite(payload.price) || payload.price <= 0) {
      return { data: null, error: { message: 'Prix invalide (doit être supérieur à 0)' } };
    }
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return { data: null, error: { message: 'Catégorie requise' } };
    }
    const insertPayload: TablesInsert<'listings'> = {
      title,
      price: Math.round(payload.price),
      category_id: categoryId,
      city,
      description,
      user_id: user.id,
      status: 'active',
      views_count: 0,
    };

    const { data, error } = await supabase
      .from('listings')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) {
      return { data: null, error: { message: getCreateListingErrorMessage(error.message) } };
    }

    if (!data?.id) {
      return { data: null, error: { message: "Impossible de publier l'annonce" } };
    }

    return { data: { id: data.id }, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return { data: null, error: { message: getCreateListingErrorMessage(message) } };
  }
}
