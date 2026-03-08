/**
 * Saved searches – "iPhone moins de 200000", etc.
 * In-memory store for MVP; replace with AsyncStorage or Supabase saved_searches for persistence.
 */

export type SavedSearch = {
  id: string;
  query: string;
  priceMin: number | null;
  priceMax: number | null;
  createdAt: string;
};

let store: SavedSearch[] = [];
let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `saved_${Date.now()}_${idCounter}`;
}

export function getSavedSearches(): SavedSearch[] {
  return [...store];
}

export function saveSearch(params: {
  query: string;
  priceMin?: number | null;
  priceMax?: number | null;
}): SavedSearch {
  const trimmed = params.query?.trim() || '';
  const item: SavedSearch = {
    id: nextId(),
    query: trimmed,
    priceMin: params.priceMin ?? null,
    priceMax: params.priceMax ?? null,
    createdAt: new Date().toISOString(),
  };
  store = [item, ...store];
  return item;
}

export function removeSavedSearch(id: string): void {
  store = store.filter((s) => s.id !== id);
}

export function getSavedSearchById(id: string): SavedSearch | null {
  return store.find((s) => s.id === id) ?? null;
}
