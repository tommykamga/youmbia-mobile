/**
 * Saved searches – persisted locally for MVP.
 * Uses Expo SQLite localStorage polyfill already present in the app.
 */

import 'expo-sqlite/localStorage/install';

const STORAGE_KEY = 'youmbia.savedSearches.v1';

export type SavedSearch = {
  id: string;
  label: string;
  query: string;
  priceMin: number | null;
  priceMax: number | null;
  category: string | null;
  city: string | null;
  createdAt: string;
};

export type SaveSearchResult =
  | { ok: true; status: 'saved'; item: SavedSearch }
  | { ok: true; status: 'exists'; item: SavedSearch }
  | { ok: false; error: { message: string } };

let cache: SavedSearch[] | null = null;

function nextId(): string {
  return `saved_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function buildSavedSearchLabel(params: {
  query: string;
  priceMin?: number | null;
  priceMax?: number | null;
  category?: string | null;
  city?: string | null;
}): string {
  const query = params.query.trim();
  const rawParts = [
    query || null,
    normalizeText(params.category),
    normalizeText(params.city),
    params.priceMin != null ? `Min ${params.priceMin} FCFA` : null,
    params.priceMax != null ? `Max ${params.priceMax} FCFA` : null,
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

function isValidSavedSearch(value: unknown): value is SavedSearch {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SavedSearch>;
  return (
    typeof item.id === 'string' &&
    typeof item.query === 'string' &&
    (typeof item.priceMin === 'number' || item.priceMin === null) &&
    (typeof item.priceMax === 'number' || item.priceMax === null) &&
    typeof item.createdAt === 'string'
  );
}

function normalizeSavedSearch(value: SavedSearch): SavedSearch {
  const normalized = {
    id: value.id,
    query: String(value.query ?? '').trim(),
    priceMin: normalizeNumber(value.priceMin),
    priceMax: normalizeNumber(value.priceMax),
    category: normalizeText(value.category),
    city: normalizeText(value.city),
    createdAt: String(value.createdAt ?? '') || new Date().toISOString(),
  };
  return {
    ...normalized,
    label:
      normalizeText(value.label) ??
      buildSavedSearchLabel({
        query: normalized.query,
        priceMin: normalized.priceMin,
        priceMax: normalized.priceMax,
        category: normalized.category,
        city: normalized.city,
      }),
  };
}

function readStore(): SavedSearch[] {
  if (cache != null) return [...cache];
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    const safe = Array.isArray(parsed) ? parsed.filter(isValidSavedSearch).map(normalizeSavedSearch) : [];
    cache = safe.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return [...cache];
  } catch {
    cache = [];
    return [];
  }
}

function persistStore(nextStore: SavedSearch[]): boolean {
  try {
    cache = [...nextStore];
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextStore));
    }
    return true;
  } catch {
    return false;
  }
}

function isSameSearch(
  a: Pick<SavedSearch, 'query' | 'priceMin' | 'priceMax' | 'category' | 'city'>,
  b: Pick<SavedSearch, 'query' | 'priceMin' | 'priceMax' | 'category' | 'city'>
): boolean {
  return (
    a.query.trim().toLowerCase() === b.query.trim().toLowerCase() &&
    normalizeNumber(a.priceMin) === normalizeNumber(b.priceMin) &&
    normalizeNumber(a.priceMax) === normalizeNumber(b.priceMax) &&
    normalizeText(a.category)?.toLowerCase() === normalizeText(b.category)?.toLowerCase() &&
    normalizeText(a.city)?.toLowerCase() === normalizeText(b.city)?.toLowerCase()
  );
}

export function buildSavedSearchHref(search: SavedSearch): string {
  const params = new URLSearchParams();
  if (search.query) params.set('q', search.query);
  if (search.priceMin != null) params.set('priceMin', String(search.priceMin));
  if (search.priceMax != null) params.set('priceMax', String(search.priceMax));
  if (search.category) params.set('category', search.category);
  if (search.city) params.set('city', search.city);
  return `/(tabs)/search?${params.toString()}`;
}

export function getSavedSearches(): SavedSearch[] {
  return readStore();
}

export function saveSearch(params: {
  query: string;
  priceMin?: number | null;
  priceMax?: number | null;
  category?: string | null;
  city?: string | null;
}): SaveSearchResult {
  const query = params.query?.trim() || '';
  if (!query) {
    return { ok: false, error: { message: 'Impossible d’enregistrer la recherche' } };
  }

  const nextItem: SavedSearch = {
    id: nextId(),
    label: buildSavedSearchLabel(params),
    query,
    priceMin: normalizeNumber(params.priceMin),
    priceMax: normalizeNumber(params.priceMax),
    category: normalizeText(params.category),
    city: normalizeText(params.city),
    createdAt: new Date().toISOString(),
  };

  const current = readStore();
  const existing = current.find((item) => isSameSearch(item, nextItem));
  if (existing) {
    const updatedExisting = { ...existing, createdAt: nextItem.createdAt };
    const nextStore = [updatedExisting, ...current.filter((item) => item.id !== existing.id)];
    if (!persistStore(nextStore)) {
      return { ok: false, error: { message: 'Impossible d’enregistrer la recherche' } };
    }
    return { ok: true, status: 'exists', item: updatedExisting };
  }

  const nextStore = [nextItem, ...current];
  if (!persistStore(nextStore)) {
    return { ok: false, error: { message: 'Impossible d’enregistrer la recherche' } };
  }
  return { ok: true, status: 'saved', item: nextItem };
}

export function removeSavedSearch(id: string): boolean {
  const current = readStore();
  const nextStore = current.filter((s) => s.id !== id);
  return persistStore(nextStore);
}

export function getSavedSearchById(id: string): SavedSearch | null {
  return readStore().find((s) => s.id === id) ?? null;
}
