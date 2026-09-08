/**
 * Ranking pur des annonces similaires — pas d’I/O.
 * La requête Supabase reste dans getSimilarListings.ts.
 */

import {
  collectCategoryBranchIds,
  type MarketplaceCategoryIdentity,
} from '@/lib/marketplaceCategories';

export const SIMILAR_LISTINGS_LIMIT = 4;
export const SIMILAR_LISTINGS_FETCH_LIMIT = 20;
export const ACTIVE_LISTING_STATUS = 'active' as const;

export function shouldFetchSimilarListings(categoryId: number | null | undefined): boolean {
  return typeof categoryId === 'number' && Number.isFinite(categoryId) && categoryId > 0;
}

export type SimilarSeed = {
  id: string;
  categoryId: number | null | undefined;
  city?: string | null;
  price?: number | null;
};

export type SimilarRankCandidate = {
  id: string;
  category_id?: number | null;
  city?: string | null;
  price?: number | null;
  created_at: string;
  status?: string | null;
};

function normalizeCity(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parentIdOf(
  categories: readonly MarketplaceCategoryIdentity[],
  categoryId: number | null | undefined
): number | null {
  if (categoryId == null) return null;
  const current = categories.find((category) => category.id === categoryId);
  if (!current) return categoryId;
  return current.parent_id ?? current.id;
}

/**
 * Branche à fetcher : nœud parent (ou soi-même si racine) + descendants.
 * Une feuille récupère ses frères, pas tout l’arbre racine.
 */
export function resolveSimilarFetchCategoryIds(
  categories: readonly MarketplaceCategoryIdentity[],
  categoryId: number
): number[] {
  const parentId = parentIdOf(categories, categoryId) ?? categoryId;
  return [...new Set(collectCategoryBranchIds(categories, parentId))];
}

export function priceProximityBonus(seedPrice: number | null | undefined, itemPrice: number | null | undefined): number {
  if (seedPrice == null || itemPrice == null || !(seedPrice > 0)) return 0;
  const ratio = Math.abs(itemPrice - seedPrice) / seedPrice;
  if (ratio <= 0.25) return 50;
  if (ratio <= 0.5) return 20;
  return 0;
}

export function scoreSimilarListing(
  seed: SimilarSeed,
  item: SimilarRankCandidate,
  categories: readonly MarketplaceCategoryIdentity[]
): number {
  const seedCategoryId = seed.categoryId ?? null;
  const itemCategoryId = item.category_id ?? null;
  let score = 0;

  if (seedCategoryId != null && itemCategoryId === seedCategoryId) {
    score += 400;
  } else if (seedCategoryId != null && itemCategoryId != null) {
    const seedParent = parentIdOf(categories, seedCategoryId);
    const itemParent = parentIdOf(categories, itemCategoryId);
    if (seedParent != null && (itemParent === seedParent || itemCategoryId === seedParent)) {
      score += 200;
    }
  }

  const seedCity = normalizeCity(seed.city);
  if (seedCity && normalizeCity(item.city) === seedCity) {
    score += 80;
  }

  score += priceProximityBonus(seed.price, item.price);
  return score;
}

export function rankSimilarListings(
  seed: SimilarSeed,
  candidates: readonly SimilarRankCandidate[],
  categories: readonly MarketplaceCategoryIdentity[],
  limit: number = SIMILAR_LISTINGS_LIMIT
): SimilarRankCandidate[] {
  if (!shouldFetchSimilarListings(seed.categoryId)) {
    return [];
  }
  const currentId = seed.id.trim();
  const safeLimit = Math.max(1, Math.min(limit, SIMILAR_LISTINGS_LIMIT));
  const seen = new Set<string>();

  const ranked = candidates
    .filter((item) => {
      if (!item.id || item.id === currentId) return false;
      if (item.status != null && item.status !== ACTIVE_LISTING_STATUS) return false;
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .map((item) => ({
      item,
      score: scoreSimilarListing(seed, item, categories),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Date.parse(b.item.created_at) - Date.parse(a.item.created_at);
    })
    .map((entry) => entry.item);

  return ranked.slice(0, safeLimit);
}
