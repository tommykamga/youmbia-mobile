/**
 * Brouillon de duplication en mémoire (session) — aucune écriture DB tant que l'utilisateur ne publie pas.
 */

export type ListingPublishDuplicateDraft = {
  sourceListingId: string;
  title: string;
  description: string;
  price: number;
  publishCategoryId: number;
  city: string;
  dynamicValues: Record<string, string>;
  shopId: string | null;
  /** Les images ne sont pas copiées (sécurité stockage) — l'UX l'indique sur l'écran Vendre. */
  imagesSkipped: true;
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
