/**
 * Local recent-search history (not saved/bookmarked searches).
 * AsyncStorage only — no extra network, no PII fields.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'youmbia.recentSearches.v1';
export const MAX_RECENT_SEARCHES = 8;

export type RecentSearch = {
  query: string;
  category: string | null;
  categoryId: number | null;
  city: string | null;
  searchedAt: string;
};

export type RememberRecentSearchInput = {
  query?: string | null;
  category?: string | null;
  categoryId?: number | null;
  city?: string | null;
};

let cache: RecentSearch[] | null = null;

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function normalizeCategoryId(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function recentSearchDedupeKey(item: Pick<RecentSearch, 'query' | 'categoryId' | 'city'>): string {
  return [
    item.query.trim().toLowerCase(),
    item.categoryId ?? '',
    (item.city ?? '').trim().toLowerCase(),
  ].join('|');
}

export function buildRecentSearchLabel(item: Pick<RecentSearch, 'query' | 'category' | 'city'>): string {
  const parts = [item.query.trim() || null, normalizeText(item.category), normalizeText(item.city)].filter(Boolean);
  return parts.join(' · ') || 'Recherche';
}

function isValidRecentSearch(value: unknown): value is RecentSearch {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<RecentSearch>;
  return typeof item.query === 'string' && typeof item.searchedAt === 'string';
}

export function normalizeRecentSearchInput(input: RememberRecentSearchInput): RecentSearch | null {
  const query = String(input.query ?? '').trim();
  const category = normalizeText(input.category);
  const city = normalizeText(input.city);
  const categoryId = normalizeCategoryId(input.categoryId);
  if (!query && !category && categoryId == null && !city) return null;
  return {
    query,
    category,
    categoryId,
    city,
    searchedAt: new Date().toISOString(),
  };
}

export function mergeRecentSearch(
  existing: RecentSearch[],
  incoming: RecentSearch,
  max = MAX_RECENT_SEARCHES
): RecentSearch[] {
  const key = recentSearchDedupeKey(incoming);
  const without = existing.filter((item) => recentSearchDedupeKey(item) !== key);
  return [incoming, ...without].slice(0, Math.max(1, max));
}

function parseStored(raw: string | null): RecentSearch[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidRecentSearch).map((item) => ({
      query: String(item.query ?? '').trim(),
      category: normalizeText(item.category),
      categoryId: normalizeCategoryId(item.categoryId),
      city: normalizeText(item.city),
      searchedAt: item.searchedAt,
    }));
  } catch {
    return [];
  }
}

async function readRecentSearches(): Promise<RecentSearch[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = parseStored(raw);
    return cache;
  } catch {
    cache = [];
    return cache;
  }
}

export async function getRecentSearches(): Promise<RecentSearch[]> {
  const items = await readRecentSearches();
  return items.slice();
}

export async function rememberRecentSearch(input: RememberRecentSearchInput): Promise<RecentSearch[]> {
  const incoming = normalizeRecentSearchInput(input);
  if (!incoming) return getRecentSearches();

  const existing = await readRecentSearches();
  const next = mergeRecentSearch(existing, incoming);
  cache = next;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // non bloquant
  }
  return next.slice();
}

export async function clearRecentSearches(): Promise<void> {
  cache = [];
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // non bloquant
  }
}

export function resetRecentSearchesForTests(): void {
  cache = null;
}
