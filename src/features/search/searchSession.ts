import type { PublicListing } from '@/services/listings';

export const SUGGESTIONS_DEBOUNCE_MS = 300;
/** Ne pas relancer `runSearch` si les params de navigation sont identiques sous ce délai (anti double effet / focus). */
export const SEARCH_NAV_PARAMS_RUN_COOLDOWN_MS = 2 * 60 * 1000;
/** Première page recherche — le reste au bouton « Voir plus » (egress). */
export const SEARCH_INITIAL_PAGE_SIZE = 6;
/** Depuis la Home : afficher plus qu’un seul lot (évite “1er clic = rien”). */
export const HOME_EXPLORE_INITIAL_PAGE_SIZE = 12;
export const HOME_LISTING_FEED_NETWORK_COOLDOWN_MS = 2 * 60 * 1000;
export const HOME_FEED_PAGE_SIZE = 6;
/** Apostrophe typographique (’). Constante JS : évite le rendu littéral « \\u2019 » si mis en JSX texte brut. */
export const LABEL_VOIR_PLUS_ANNONCES = 'Voir plus d\u2019annonces';

export type SearchPage1SessionCacheEntry = {
  empty: boolean;
  data: PublicListing[];
  total: number;
};

/** Cache mémoire session : première page par clé query + filtres appliqués (hors tri UI). */
export const searchSessionPage1Cache = new Map<string, SearchPage1SessionCacheEntry>();

export function buildSearchPage1SessionKey(parts: {
  q: string;
  categoryId: number | null;
  city: string | null;
  min: number | null;
  max: number | null;
  pageSize: number;
}): string {
  return JSON.stringify(parts);
}

export type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'empty'; query: string }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      data: PublicListing[];
      query: string;
      total: number;
      page: number;
      hasMore: boolean;
      pageSize?: number;
    };
