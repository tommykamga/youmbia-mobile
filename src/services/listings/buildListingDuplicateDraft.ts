/**
 * Prépare un brouillon local à partir d'une annonce existante (duplication sans publication).
 */

import { setListingPublishDuplicateDraft, type ListingPublishDuplicateDraft } from '@/lib/listingPublishDraft';
import { getListingForEdit } from './getListingForEdit';
import { getListingDynamicAttributeValuesForForm } from './getListingDynamicAttributeValuesForForm';

export type BuildListingDuplicateDraftResult =
  | { success: true }
  | { success: false; error: { message: string } };

function appendCopySuffix(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return 'Copie';
  const suffix = '(copie)';
  if (trimmed.toLowerCase().endsWith(suffix)) return trimmed;
  const next = `${trimmed} ${suffix}`;
  return next.length > 200 ? trimmed.slice(0, 200 - suffix.length - 1).trim() + ` ${suffix}` : next;
}

/**
 * Charge l'annonce source, construit le brouillon en mémoire et le place pour l'écran Vendre.
 */
export async function buildListingDuplicateDraft(
  listingId: string
): Promise<BuildListingDuplicateDraftResult> {
  const id = listingId?.trim();
  if (!id) {
    return { success: false, error: { message: 'Identifiant manquant' } };
  }

  const res = await getListingForEdit(id);
  if (res.error || !res.data) {
    return {
      success: false,
      error: { message: res.error?.message ?? 'Annonce introuvable' },
    };
  }

  const listing = res.data;
  if (listing.category_id == null || !Number.isFinite(listing.category_id)) {
    return { success: false, error: { message: 'Catégorie manquante sur cette annonce' } };
  }

  const dynamicValues = await getListingDynamicAttributeValuesForForm(id);

  const draft: ListingPublishDuplicateDraft = {
    sourceListingId: listing.id,
    title: appendCopySuffix(listing.title),
    description: listing.description ?? '',
    price: listing.price,
    publishCategoryId: listing.category_id,
    city: listing.city ?? '',
    dynamicValues,
    shopId: listing.shop_id ?? null,
    imagesSkipped: true,
  };

  setListingPublishDuplicateDraft(draft);
  return { success: true };
}
