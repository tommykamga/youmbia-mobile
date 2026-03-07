/**
 * Create a new listing (current user as seller).
 * Inserts into listings; then caller can upload images and insert listing_images.
 */

import { supabase } from '@/lib/supabase';

export type CreateListingPayload = {
  title: string;
  price: number;
  city: string;
  description: string;
};

export type CreateListingResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { message: string } };

export async function createListing(payload: CreateListingPayload): Promise<CreateListingResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  const title = payload.title?.trim();
  const city = payload.city?.trim();
  const description = payload.description?.trim() ?? '';

  if (!title || title.length < 2) {
    return { data: null, error: { message: 'Titre requis (2 caractères minimum)' } };
  }
  if (typeof payload.price !== 'number' || !Number.isFinite(payload.price) || payload.price <= 0) {
    return { data: null, error: { message: 'Prix invalide (doit être supérieur à 0)' } };
  }
  if (!city) {
    return { data: null, error: { message: 'Ville requise' } };
  }

  const { data, error } = await supabase
    .from('listings')
    .insert({
      title,
      price: Math.round(payload.price),
      city,
      description: description || null,
      user_id: user.id,
      status: 'active',
      views_count: 0,
    } as never)
    .select('id')
    .single();

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  return { data: { id: (data as { id: string }).id }, error: null };
}
