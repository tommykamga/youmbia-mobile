/**
 * Critères structurés d’une recherche sauvegardée.
 * Aligné sur les filtres réels de Search (`searchListings`), sans blob opaque.
 * Le tri n’est pas un critère de matching (affichage seulement).
 */

export const MAX_SAVED_SEARCHES = 20;

export type SavedSearchCriteria = {
  query: string;
  categoryId: number | null;
  city: string | null;
  minPrice: number | null;
  maxPrice: number | null;
};

export function normalizeSavedSearchText(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

export function normalizeSavedSearchPrice(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

export function normalizeSavedSearchCategoryId(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

export function normalizeSavedSearchCriteria(input: {
  query?: string | null;
  categoryId?: number | null;
  city?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
}): SavedSearchCriteria {
  return {
    query: String(input.query ?? '').trim(),
    categoryId: normalizeSavedSearchCategoryId(input.categoryId),
    city: normalizeSavedSearchText(input.city),
    minPrice: normalizeSavedSearchPrice(input.minPrice),
    maxPrice: normalizeSavedSearchPrice(input.maxPrice),
  };
}

export function hasSavedSearchCriteria(criteria: SavedSearchCriteria): boolean {
  return (
    criteria.query.length > 0 ||
    criteria.categoryId != null ||
    criteria.city != null ||
    criteria.minPrice != null ||
    criteria.maxPrice != null
  );
}

export function savedSearchCriteriaKey(criteria: SavedSearchCriteria): string {
  return [
    criteria.query.trim().toLowerCase(),
    criteria.categoryId ?? '',
    (criteria.city ?? '').trim().toLowerCase(),
    criteria.minPrice ?? '',
    criteria.maxPrice ?? '',
  ].join('|');
}

export function isSameSavedSearchCriteria(a: SavedSearchCriteria, b: SavedSearchCriteria): boolean {
  return savedSearchCriteriaKey(a) === savedSearchCriteriaKey(b);
}

export function buildSavedSearchLabel(params: {
  query?: string | null;
  category?: string | null;
  city?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
}): string {
  const query = String(params.query ?? '').trim();
  const rawParts = [
    query || null,
    normalizeSavedSearchText(params.category),
    normalizeSavedSearchText(params.city),
    params.minPrice != null ? `Min ${params.minPrice} FCFA` : null,
    params.maxPrice != null ? `Max ${params.maxPrice} FCFA` : null,
  ].filter(Boolean);
  const seen = new Set<string>();
  const parts = rawParts.filter((part) => {
    const key = String(part).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return parts.join(' · ') || 'Recherche';
}

export function buildSavedSearchHref(search: {
  query?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  category?: string | null;
  categoryId?: number | null;
  city?: string | null;
}): string {
  const params = new URLSearchParams();
  const query = String(search.query ?? '').trim();
  if (query) params.set('q', query);
  if (search.minPrice != null) params.set('priceMin', String(search.minPrice));
  if (search.maxPrice != null) params.set('priceMax', String(search.maxPrice));
  const category = normalizeSavedSearchText(search.category);
  if (category) params.set('category', category);
  if (search.categoryId != null) params.set('categoryId', String(search.categoryId));
  if (search.city) params.set('city', search.city);
  const qs = params.toString();
  return qs ? `/(tabs)/search?${qs}` : '/(tabs)/search';
}

export function buildSavedSearchListingHref(listingId: string): string {
  const id = String(listingId ?? '').trim();
  return id ? `/listing/${id}` : '/(tabs)/search';
}
