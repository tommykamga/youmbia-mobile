/**
 * Helpers purs de Recherche V2 — pas d’I/O.
 * La requête Supabase (ilike / or / order) reste dans searchListings.ts.
 */

import {
  collectCategoryBranchIds,
  type MarketplaceCategoryIdentity,
} from '@/lib/marketplaceCategories';

const SEARCH_STOPWORDS = new Set([
  'de',
  'la',
  'le',
  'les',
  'du',
  'des',
  'et',
  'un',
  'une',
  'en',
  'au',
  'aux',
]);

export type SearchCategoryFilter =
  | { mode: 'eq'; id: number }
  | { mode: 'in'; ids: number[] };

export type SearchRelevanceListing = {
  id?: string;
  title: string;
  city?: string | null;
  description?: string | null;
  category_id?: number | null;
  created_at?: string;
  price?: number;
};

export function normalizeSearchText(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function tokenizeSearchQuery(query: string): string[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];

  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const part of normalized.split(/[^a-z0-9]+/)) {
    if (part.length < 2 || SEARCH_STOPWORDS.has(part) || seen.has(part)) {
      continue;
    }
    seen.add(part);
    tokens.push(part);
  }
  return tokens;
}

function escapeIlikeToken(token: string): string {
  return token.replace(/[^a-z0-9]/gi, '');
}

/**
 * Clauses `.or()` à enchaîner (AND entre tokens).
 * Les boutiques matchées sont ajoutées uniquement sur le premier token pour ne pas
 * faire passer toutes les annonces d’une boutique hors tokens restants.
 */
export function buildSearchTextOrClauses(
  tokens: string[],
  includeDescription: boolean,
  shopOwnerIds: string[] = []
): string[] {
  if (tokens.length === 0) {
    if (shopOwnerIds.length === 0) return [];
    return [`user_id.in.(${shopOwnerIds.join(',')})`];
  }

  const safeTokens = tokens
    .map((token) => escapeIlikeToken(token))
    .filter((token) => token.length >= 2);

  if (safeTokens.length === 0) {
    if (shopOwnerIds.length === 0) return [];
    return [`user_id.in.(${shopOwnerIds.join(',')})`];
  }

  return safeTokens.map((safe, index) => {
    const pattern = `%${safe}%`;
    const parts = [`title.ilike.${pattern}`, `city.ilike.${pattern}`];
    if (includeDescription) {
      parts.push(`description.ilike.${pattern}`);
    }
    if (index === 0 && shopOwnerIds.length > 0) {
      const ownerList = shopOwnerIds
        .map((id) => String(id).replace(/[^a-zA-Z0-9-]/g, ''))
        .filter(Boolean)
        .join(',');
      if (ownerList) {
        parts.push(`user_id.in.(${ownerList})`);
      }
    }
    return parts.join(',');
  });
}

export function resolveSearchCategoryFilter(
  categories: readonly MarketplaceCategoryIdentity[],
  categoryId: number
): SearchCategoryFilter {
  const branch = [...new Set(collectCategoryBranchIds(categories, categoryId))];
  if (branch.length > 1) {
    return { mode: 'in', ids: branch };
  }
  return { mode: 'eq', id: categoryId };
}

export function listingMatchesCategoryFilter(
  listingCategoryId: number | null | undefined,
  filter: SearchCategoryFilter
): boolean {
  if (listingCategoryId == null) return false;
  if (filter.mode === 'eq') return listingCategoryId === filter.id;
  return filter.ids.includes(listingCategoryId);
}

export function listingMatchesCityFilter(
  listingCity: string | null | undefined,
  cityFilter: string | null | undefined
): boolean {
  const needle = normalizeSearchText(cityFilter);
  if (!needle) return true;
  return normalizeSearchText(listingCity).includes(needle);
}

export function listingMatchesPriceFilter(
  price: number,
  minPrice: number | null | undefined,
  maxPrice: number | null | undefined
): boolean {
  if (minPrice != null && !Number.isNaN(minPrice) && price < minPrice) return false;
  if (maxPrice != null && !Number.isNaN(maxPrice) && price > maxPrice) return false;
  return true;
}

export function listingMatchesQueryTokens(
  listing: SearchRelevanceListing,
  query: string
): boolean {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return true;
  const title = normalizeSearchText(listing.title);
  const city = normalizeSearchText(listing.city);
  const description = normalizeSearchText(listing.description);
  const haystack = `${title} ${city} ${description}`;
  return tokens.every((token) => haystack.includes(token));
}

function containsWholeWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return (
    haystack === needle ||
    haystack.startsWith(`${needle} `) ||
    haystack.endsWith(` ${needle}`) ||
    haystack.includes(` ${needle} `)
  );
}

function categoryKeys(
  categories: readonly MarketplaceCategoryIdentity[],
  categoryId: number | null | undefined
): string[] {
  if (categoryId == null) return [];
  const current = categories.find((category) => category.id === categoryId);
  if (!current) return [];
  const keys = [normalizeSearchText(current.name), normalizeSearchText(current.slug ?? '')];
  if (current.parent_id != null) {
    const parent = categories.find((category) => category.id === current.parent_id);
    if (parent) {
      keys.push(normalizeSearchText(parent.name), normalizeSearchText(parent.slug ?? ''));
    }
  }
  return keys.filter(Boolean);
}

/**
 * Titre = poids principal, catégorie = secondaire, ville-dans-la-requête = signal, description = inférieur.
 */
export function computeSearchRelevanceScore(
  listing: SearchRelevanceListing,
  query: string,
  categories: readonly MarketplaceCategoryIdentity[] = []
): number {
  const q = normalizeSearchText(query);
  if (!q) return 0;

  const tokens = tokenizeSearchQuery(query);
  const title = normalizeSearchText(listing.title);
  const city = normalizeSearchText(listing.city);
  const description = normalizeSearchText(listing.description);
  let score = 0;

  if (title === q) {
    score += 100;
  } else if (containsWholeWord(title, q)) {
    score += 50;
  } else if (title.startsWith(q)) {
    score += 30;
  } else if (title.includes(q)) {
    score += 10;
  }

  for (const token of tokens) {
    if (title === token) score += 40;
    else if (containsWholeWord(title, token)) score += 24;
    else if (title.startsWith(token)) score += 16;
    else if (title.includes(token)) score += 8;

    if (city === token || city.includes(token)) {
      score += 28;
    }
  }

  const keys = categoryKeys(categories, listing.category_id);
  const categoryHit = keys.some(
    (key) => q === key || tokens.includes(key) || tokens.some((token) => token.length >= 4 && key.includes(token))
  );
  if (categoryHit) {
    score += 20;
  }

  if (containsWholeWord(description, q)) {
    score += 5;
  } else if (q.length > 3 && description.includes(q)) {
    score += 1;
  }
  for (const token of tokens) {
    if (containsWholeWord(description, token)) score += 2;
    else if (description.includes(token)) score += 1;
  }

  return score;
}

export function compareSearchRelevance(
  a: SearchRelevanceListing,
  b: SearchRelevanceListing,
  query: string,
  categories: readonly MarketplaceCategoryIdentity[] = []
): number {
  const scoreDelta =
    computeSearchRelevanceScore(b, query, categories) - computeSearchRelevanceScore(a, query, categories);
  if (scoreDelta !== 0) return scoreDelta;
  return Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? '') || 0;
}

export function appendUniqueSearchListings<T extends { id: string }>(existing: T[], batch: T[]): T[] {
  const seen = new Set(existing.map((item) => item.id));
  const added = batch.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return [...existing, ...added];
}
