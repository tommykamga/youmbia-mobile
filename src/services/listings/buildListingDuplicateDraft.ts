/**
 * Prépare un brouillon local à partir d’une annonce existante (duplication sans publication).
 * Nouveau listing uniquement au Save Draft / Publish — jamais l’id source.
 */

import {
  setListingPublishDuplicateDraft,
  type ListingPublishDuplicateDraft,
} from '@/lib/listingPublishDraft';
import {
  canSellerDuplicateListing,
  LISTING_DUPLICATE_NOT_ELIGIBLE_MESSAGE,
} from '@/lib/listingStatus';
import { toPendingCopiedDraftImages } from '@/lib/listingDuplicateImages';
import { trackListingDuplicateStarted } from '@/lib/analytics';
import { getListingForEdit, type ListingForEdit } from './getListingForEdit';
import { getListingDynamicAttributeValuesForForm } from './getListingDynamicAttributeValuesForForm';

export type BuildListingDuplicateDraftResult =
  | { success: true }
  | { success: false; error: { message: string } };

export const LISTING_DUPLICATE_LIFECYCLE_KEYS = [
  'id',
  'user_id',
  'created_at',
  'updated_at',
  'published_at',
  'last_published_at',
  'sold_at',
  'renewed_at',
  'sale_cycle_started_at',
  'views_count',
  'contact_clicks_count',
  'boosted',
  'urgent',
  'status',
  'favorites',
  'favorite_count',
  'reports',
] as const;

function appendCopySuffix(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return 'Copie';
  const suffix = '(copie)';
  if (trimmed.toLowerCase().endsWith(suffix)) return trimmed;
  const next = `${trimmed} ${suffix}`;
  return next.length > 200 ? trimmed.slice(0, 200 - suffix.length - 1).trim() + ` ${suffix}` : next;
}

/**
 * Champs produit uniquement. Aucun champ lifecycle / stats / modération.
 * `sourceListingId` est un marqueur, pas l’id du futur listing.
 */
export function buildListingDuplicateFormPayload(
  listing: Pick<
    ListingForEdit,
    'id' | 'title' | 'description' | 'price' | 'category_id' | 'city' | 'shop_id' | 'imageItems'
  >,
  dynamicValues: Record<string, string>
): ListingPublishDuplicateDraft {
  return {
    sourceListingId: listing.id,
    title: appendCopySuffix(listing.title),
    description: listing.description ?? '',
    price: listing.price,
    publishCategoryId: listing.category_id as number,
    city: listing.city ?? '',
    dynamicValues: { ...dynamicValues },
    shopId: listing.shop_id ?? null,
    sourceImages: toPendingCopiedDraftImages(listing.imageItems ?? []).map((img) => ({
      path: img.path,
      sort_order: img.sort_order,
      displayUrl: img.displayUrl,
    })),
  };
}

/**
 * Charge l’annonce source (owner-only), construit le brouillon en mémoire.
 * Aucun INSERT / UPDATE listings.
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
  if (!canSellerDuplicateListing(listing.status)) {
    return { success: false, error: { message: LISTING_DUPLICATE_NOT_ELIGIBLE_MESSAGE } };
  }
  if (listing.category_id == null || !Number.isFinite(listing.category_id)) {
    return { success: false, error: { message: 'Catégorie manquante sur cette annonce' } };
  }

  let dynamicValues: Record<string, string> = {};
  try {
    dynamicValues = await getListingDynamicAttributeValuesForForm(id);
  } catch {
    dynamicValues = {};
  }

  const draft = buildListingDuplicateFormPayload(listing, dynamicValues);
  setListingPublishDuplicateDraft(draft);
  trackListingDuplicateStarted({ source_listing_id: listing.id });
  return { success: true };
}
