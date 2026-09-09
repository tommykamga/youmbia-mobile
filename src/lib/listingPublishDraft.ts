/**
 * Brouillon de duplication en mémoire (session) — aucune écriture DB tant que
 * l’utilisateur n’enregistre pas / ne publie pas. Les images source sont
 * référencées par path Storage, sans id `listing_images`.
 */

export type ListingDuplicateSourceImage = {
  path: string;
  sort_order: number | null;
  displayUrl: string;
};

export type ListingPublishDuplicateDraft = {
  sourceListingId: string;
  title: string;
  description: string;
  price: number;
  publishCategoryId: number;
  city: string;
  dynamicValues: Record<string, string>;
  shopId: string | null;
  sourceImages: ListingDuplicateSourceImage[];
};

let pendingDuplicateDraft: ListingPublishDuplicateDraft | null = null;

export function setListingPublishDuplicateDraft(draft: ListingPublishDuplicateDraft): void {
  pendingDuplicateDraft = draft;
}

/** Retire et retourne le brouillon en attente (une seule consommation). */
export function consumeListingPublishDuplicateDraft(): ListingPublishDuplicateDraft | null {
  const draft = pendingDuplicateDraft;
  pendingDuplicateDraft = null;
  return draft;
}

export function peekListingPublishDuplicateDraft(): ListingPublishDuplicateDraft | null {
  return pendingDuplicateDraft;
}

/** @internal tests only */
export function resetListingPublishDuplicateDraftForTests(): void {
  pendingDuplicateDraft = null;
}
