/**
 * Search suggestions – quick title matches for instant search UX.
 * Queries Supabase listings titles with ilike, returns up to 5 suggestion strings.
 * Same Supabase client and schema as listings; no schema changes.
 */

import { supabase } from '@/lib/supabase';

const SUGGESTIONS_LIMIT = 5;

export type GetSearchSuggestionsResult =
  | { data: string[]; error: null }
  | { data: null; error: { message: string } };

/**
 * Fetches up to 5 listing titles matching the query (ilike on title).
 * Safe for empty/short query: returns [] when query length < 2 or after trim is empty.
 * Escapes % _ \ in query to avoid ilike wildcard injection.
 */
export async function getSearchSuggestions(
  query: string
): Promise<GetSearchSuggestionsResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { data: [], error: null };
  }

  const safe = trimmed.replace(/[%_\\]/g, '');
  const pattern = `%${safe}%`;

  const { data, error } = await supabase
    .from('listings')
    .select('title')
    .eq('status', 'active')
    .ilike('title', pattern)
    .order('created_at', { ascending: false })
    .limit(SUGGESTIONS_LIMIT + 2);

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  const rows = (data ?? []) as { title: string | null }[];
  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const row of rows) {
    const t = row.title?.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      suggestions.push(t);
      if (suggestions.length >= SUGGESTIONS_LIMIT) break;
    }
  }

  return { data: suggestions, error: null };
}
