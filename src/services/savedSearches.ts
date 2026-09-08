/**
 * Saved searches – source de vérité Postgres (RLS owner).
 * Plus de localStorage. Les alertes sont serveur (ledger + Edge Function).
 */

import { supabase } from '@/lib/supabase';
import {
  MAX_SAVED_SEARCHES,
  buildSavedSearchHref,
  buildSavedSearchLabel,
  hasSavedSearchCriteria,
  isSameSavedSearchCriteria,
  normalizeSavedSearchCriteria,
  type SavedSearchCriteria,
} from '@/lib/savedSearchCriteria';
import {
  trackSavedSearchCreated,
  trackSavedSearchDeleted,
  trackSavedSearchOpened,
  trackSavedSearchToggled,
} from '@/lib/analytics';

export type SavedSearch = {
  id: string;
  label: string;
  query: string;
  priceMin: number | null;
  priceMax: number | null;
  category: string | null;
  categoryId: number | null;
  city: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SaveSearchResult =
  | { ok: true; status: 'saved'; item: SavedSearch }
  | { ok: true; status: 'exists'; item: SavedSearch }
  | { ok: false; error: { message: string } };

export type SavedSearchMutationResult =
  | { ok: true }
  | { ok: false; error: { message: string } };

type SavedSearchRow = {
  id: string;
  name: string | null;
  query: string;
  category_id: number | null;
  city: string | null;
  min_price: number | null;
  max_price: number | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export { buildSavedSearchHref, isSameSavedSearchCriteria, MAX_SAVED_SEARCHES };

function mapSavedSearchRow(row: SavedSearchRow, categoryName?: string | null): SavedSearch {
  const query = String(row.query ?? '').trim();
  const priceMin = typeof row.min_price === 'number' ? row.min_price : null;
  const priceMax = typeof row.max_price === 'number' ? row.max_price : null;
  const city = row.city?.trim() || null;
  const category = categoryName?.trim() || null;
  return {
    id: row.id,
    query,
    priceMin,
    priceMax,
    category,
    categoryId: typeof row.category_id === 'number' ? row.category_id : null,
    city,
    enabled: row.enabled !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    label:
      row.name?.trim() ||
      buildSavedSearchLabel({
        query,
        category,
        city,
        minPrice: priceMin,
        maxPrice: priceMax,
      }),
  };
}

function getSavedSearchErrorMessage(message: string): string {
  const msg = message.toLowerCase();
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('internet')) {
    return 'Réseau indisponible';
  }
  if (msg.includes('jwt') || msg.includes('jwt expired') || msg.includes('auth')) {
    return 'Connexion requise';
  }
  if (msg.includes('maximum 20') || msg.includes('20 recherches')) {
    return 'Vous pouvez enregistrer au maximum 20 recherches.';
  }
  if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('23505')) {
    return 'Cette recherche existe déjà';
  }
  return 'Impossible d’enregistrer la recherche';
}

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  const msg = String(error.message ?? '').toLowerCase();
  return msg.includes('duplicate') || msg.includes('saved_searches_user_criteria');
}

async function fetchExistingByCriteria(
  userId: string,
  criteria: SavedSearchCriteria
): Promise<SavedSearch | null> {
  const { data, error } = await supabase
    .from('saved_searches')
    .select('id, name, query, category_id, city, min_price, max_price, enabled, created_at, updated_at')
    .eq('user_id', userId);

  if (error || !data) return null;
  return (
    (data as SavedSearchRow[])
      .map((row) => mapSavedSearchRow(row))
      .find((item) =>
        isSameSavedSearchCriteria(
          {
            query: item.query,
            categoryId: item.categoryId,
            city: item.city,
            minPrice: item.priceMin,
            maxPrice: item.priceMax,
          },
          criteria
        )
      ) ?? null
  );
}

export async function listSavedSearches(): Promise<SavedSearch[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('saved_searches')
    .select('id, name, query, category_id, city, min_price, max_price, enabled, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return (data as SavedSearchRow[]).map((row) => mapSavedSearchRow(row));
}

/** Compat UI existante — alias async. */
export async function getSavedSearches(): Promise<SavedSearch[]> {
  return listSavedSearches();
}

export async function saveSearch(params: {
  query: string;
  priceMin?: number | null;
  priceMax?: number | null;
  category?: string | null;
  categoryId?: number | null;
  city?: string | null;
}): Promise<SaveSearchResult> {
  const criteria = normalizeSavedSearchCriteria({
    query: params.query,
    categoryId: params.categoryId,
    city: params.city,
    minPrice: params.priceMin,
    maxPrice: params.priceMax,
  });

  if (!hasSavedSearchCriteria(criteria)) {
    return { ok: false, error: { message: 'Impossible d’enregistrer la recherche' } };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { ok: false, error: { message: 'Connexion requise' } };
  }

  const name = buildSavedSearchLabel({
    query: criteria.query,
    category: params.category,
    city: criteria.city,
    minPrice: criteria.minPrice,
    maxPrice: criteria.maxPrice,
  });

  const { data, error } = await supabase
    .from('saved_searches')
    .insert({
      user_id: user.id,
      name,
      query: criteria.query,
      category_id: criteria.categoryId,
      city: criteria.city,
      min_price: criteria.minPrice,
      max_price: criteria.maxPrice,
      enabled: true,
    })
    .select('id, name, query, category_id, city, min_price, max_price, enabled, created_at, updated_at')
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      const existing = await fetchExistingByCriteria(user.id, criteria);
      if (existing) {
        return { ok: true, status: 'exists', item: existing };
      }
    }
    return { ok: false, error: { message: getSavedSearchErrorMessage(error.message) } };
  }

  if (!data) {
    return { ok: false, error: { message: 'Impossible d’enregistrer la recherche' } };
  }

  const item = mapSavedSearchRow(data as SavedSearchRow, params.category);
  trackSavedSearchCreated({
    saved_search_id: item.id,
    has_query: criteria.query.length > 0,
    has_category: criteria.categoryId != null,
    has_city: criteria.city != null,
    has_price: criteria.minPrice != null || criteria.maxPrice != null,
  });
  return { ok: true, status: 'saved', item };
}

export async function removeSavedSearch(id: string): Promise<boolean> {
  const result = await deleteSavedSearch(id);
  return result.ok;
}

export async function deleteSavedSearch(id: string): Promise<SavedSearchMutationResult> {
  const searchId = String(id ?? '').trim();
  if (!searchId) {
    return { ok: false, error: { message: 'Impossible de supprimer la recherche' } };
  }

  const { error } = await supabase.from('saved_searches').delete().eq('id', searchId);
  if (error) {
    return { ok: false, error: { message: 'Impossible de supprimer la recherche' } };
  }
  trackSavedSearchDeleted({ saved_search_id: searchId });
  return { ok: true };
}

export async function setSavedSearchEnabled(
  id: string,
  enabled: boolean
): Promise<SavedSearchMutationResult> {
  const searchId = String(id ?? '').trim();
  if (!searchId) {
    return { ok: false, error: { message: 'Impossible de modifier l’alerte' } };
  }

  const { error } = await supabase
    .from('saved_searches')
    .update({ enabled })
    .eq('id', searchId);

  if (error) {
    return { ok: false, error: { message: 'Impossible de modifier l’alerte' } };
  }
  trackSavedSearchToggled({ saved_search_id: searchId, enabled });
  return { ok: true };
}

export function trackSavedSearchOpen(id: string): void {
  const searchId = String(id ?? '').trim();
  if (!searchId) return;
  trackSavedSearchOpened({ saved_search_id: searchId });
}

export async function getSavedSearchById(id: string): Promise<SavedSearch | null> {
  const searchId = String(id ?? '').trim();
  if (!searchId) return null;
  const { data, error } = await supabase
    .from('saved_searches')
    .select('id, name, query, category_id, city, min_price, max_price, enabled, created_at, updated_at')
    .eq('id', searchId)
    .maybeSingle();
  if (error || !data) return null;
  return mapSavedSearchRow(data as SavedSearchRow);
}
