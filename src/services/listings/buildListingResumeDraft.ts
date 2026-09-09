/**
 * Charge un brouillon propriétaire depuis Supabase (source de vérité).
 * Owner-only via getListingForEdit (filtre user_id). Aucune dépendance à une mémoire session.
 */

import { LISTING_STATUS } from '@/lib/listingStatus';
import { getListingForEdit } from './getListingForEdit';
import { getListingDynamicAttributeValuesForForm } from './getListingDynamicAttributeValuesForForm';

export type ListingResumeDraftData = {
  listingId: string;
  title: string;
  description: string;
  price: number;
  publishCategoryId: number | null;
  city: string;
  dynamicValues: Record<string, string>;
  shopId: string | null;
  /** Images déjà en base (affichage + conservation à la publication). */
  existingImages: { id: string; path: string; sort_order: number | null; displayUrl: string }[];
};

export type BuildListingResumeDraftResult =
  | { success: true; data: ListingResumeDraftData }
  | { success: false; error: { message: string } };

/**
 * Reconstruit le payload de reprise uniquement depuis la DB (persistant après relaunch).
 */
export async function buildListingResumeDraft(
  listingId: string
): Promise<BuildListingResumeDraftResult> {
  const id = String(listingId ?? '').trim();
  if (!id) {
    return { success: false, error: { message: 'Brouillon introuvable' } };
  }

  const editRes = await getListingForEdit(id);
  if (editRes.error || !editRes.data) {
    return {
      success: false,
      error: { message: editRes.error?.message ?? 'Brouillon introuvable ou non autorisé' },
    };
  }

  const listing = editRes.data;
  if (String(listing.status ?? '').toLowerCase() !== LISTING_STATUS.draft) {
    return { success: false, error: { message: "Cette annonce n'est pas un brouillon." } };
  }

  let dynamicValues: Record<string, string> = {};
  try {
    dynamicValues = await getListingDynamicAttributeValuesForForm(listing.id);
  } catch {
    dynamicValues = {};
  }

  return {
    success: true,
    data: {
      listingId: listing.id,
      title: listing.title === 'Brouillon' ? '' : listing.title,
      description: listing.description ?? '',
      price: listing.price > 0 ? listing.price : 0,
      publishCategoryId: listing.category_id,
      city: listing.city ?? '',
      dynamicValues,
      shopId: listing.shop_id,
      existingImages: listing.imageItems ?? [],
    },
  };
}
