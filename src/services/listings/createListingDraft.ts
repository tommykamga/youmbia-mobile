/**
 * Création / mise à jour d’un brouillon d’annonce (status = draft).
 * Validations souples : pas les règles de publication finale.
 */

import { supabase } from '@/lib/supabase';
import type { ListingCategoryId } from '@/lib/listingCategories';
import { LISTING_STATUS } from '@/lib/listingStatus';
import type { TablesInsert, TablesUpdate } from '@/types/database';

export type SaveListingDraftPayload = {
  title?: string | null;
  price?: number | null;
  categoryId?: ListingCategoryId | null;
  city?: string | null;
  description?: string | null;
  shopId?: string | null;
};

export type SaveListingDraftResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { message: string } };

const DRAFT_DEFAULT_TITLE = 'Brouillon';
const GENERIC_ERROR = "Impossible d'enregistrer le brouillon";

function mapDraftError(message: string): string {
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
  return GENERIC_ERROR;
}

function normalizeDraftFields(payload: SaveListingDraftPayload): {
  title: string;
  price: number;
  categoryId: number | null;
  city: string;
  description: string | null;
  shopId: string | null;
} {
  const titleRaw = payload.title?.trim() ?? '';
  const title = titleRaw.length > 0 ? titleRaw.slice(0, 80) : DRAFT_DEFAULT_TITLE;
  const priceRaw = payload.price;
  const price =
    typeof priceRaw === 'number' && Number.isFinite(priceRaw) && priceRaw > 0
      ? Math.round(priceRaw)
      : 0;
  const categoryRaw = payload.categoryId != null ? Number(payload.categoryId) : null;
  const categoryId =
    categoryRaw != null && Number.isInteger(categoryRaw) && categoryRaw > 0 ? categoryRaw : null;
  const city = payload.city?.trim() || '';
  const description = payload.description?.trim() || null;
  const shopId = payload.shopId?.trim() || null;
  return { title, price, categoryId, city, description, shopId };
}

/** True s’il y a au moins un champ utile (évite les brouillons totalement vides). */
export function hasListingDraftContent(payload: SaveListingDraftPayload): boolean {
  const title = payload.title?.trim() ?? '';
  const description = payload.description?.trim() ?? '';
  const city = payload.city?.trim() ?? '';
  const priceOk =
    typeof payload.price === 'number' && Number.isFinite(payload.price) && payload.price > 0;
  const categoryOk =
    payload.categoryId != null &&
    Number.isInteger(Number(payload.categoryId)) &&
    Number(payload.categoryId) > 0;
  return title.length > 0 || description.length > 0 || city.length > 0 || priceOk || categoryOk;
}

export async function createListingDraft(
  payload: SaveListingDraftPayload
): Promise<SaveListingDraftResult> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { data: null, error: { message: 'Non connecté' } };
    }

    if (!hasListingDraftContent(payload)) {
      return {
        data: null,
        error: { message: 'Ajoutez au moins un titre, un prix, une catégorie ou une description.' },
      };
    }

    const fields = normalizeDraftFields(payload);
    const insertPayload: TablesInsert<'listings'> = {
      title: fields.title,
      price: fields.price,
      category_id: fields.categoryId,
      city: fields.city,
      description: fields.description,
      user_id: user.id,
      status: LISTING_STATUS.draft,
      views_count: 0,
      ...(fields.shopId ? { shop_id: fields.shopId } : {}),
    };

    const { data, error } = await supabase
      .from('listings')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) {
      return { data: null, error: { message: mapDraftError(error.message) } };
    }
    if (!data?.id) {
      return { data: null, error: { message: GENERIC_ERROR } };
    }

    return { data: { id: data.id }, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return { data: null, error: { message: mapDraftError(message) } };
  }
}

/**
 * Met à jour un brouillon existant (même id). Refuse si ce n’est pas un draft du user.
 */
export async function updateListingDraft(
  listingId: string,
  payload: SaveListingDraftPayload
): Promise<SaveListingDraftResult> {
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

    if (!hasListingDraftContent(payload)) {
      return {
        data: null,
        error: { message: 'Ajoutez au moins un titre, un prix, une catégorie ou une description.' },
      };
    }

    const fields = normalizeDraftFields(payload);
    const updatePayload: TablesUpdate<'listings'> = {
      title: fields.title,
      price: fields.price,
      category_id: fields.categoryId,
      city: fields.city,
      description: fields.description,
      updated_at: new Date().toISOString(),
      ...(fields.shopId ? { shop_id: fields.shopId } : {}),
    };

    const { data, error } = await supabase
      .from('listings')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', LISTING_STATUS.draft)
      .select('id')
      .maybeSingle();

    if (error) {
      return { data: null, error: { message: mapDraftError(error.message) } };
    }
    if (!data?.id) {
      return { data: null, error: { message: 'Brouillon introuvable ou non autorisé' } };
    }

    return { data: { id: data.id }, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return { data: null, error: { message: mapDraftError(message) } };
  }
}
