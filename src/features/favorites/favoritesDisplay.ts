import type { PublicListing } from '@/services/listings';

export type FavoritesScreenMode = 'list' | 'empty_none' | 'empty_unavailable';

export type FavoritesDisplayModel = {
  /** Annonces actives favorisées, ordre du pool serveur, retraits optimistes exclus. */
  visibleListings: PublicListing[];
  /** Nombre d’ids favoris côté client (Set global). */
  registeredCount: number;
  /** Favoris enregistrés sans annonce active hydratée (vendue, pause, etc.). */
  unavailableCount: number;
  mode: FavoritesScreenMode;
  /** Compteur en-tête : annonces visibles dans la grille. */
  headerCount: number;
};

/**
 * Dérive l’affichage onglet Favoris sans supprimer les favoris distants
 * lorsqu’une annonce n’est plus active (`getListingsByIds` / `getFavorites`).
 */
export function deriveFavoritesDisplay(
  pool: PublicListing[],
  favoriteIds: ReadonlySet<string>
): FavoritesDisplayModel {
  const registeredCount = favoriteIds.size;
  const seen = new Set<string>();
  const visibleListings: PublicListing[] = [];

  for (const item of pool) {
    if (!favoriteIds.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    visibleListings.push(item);
  }

  const unavailableCount = Math.max(0, registeredCount - visibleListings.length);
  const headerCount = visibleListings.length;

  if (registeredCount === 0) {
    return {
      visibleListings,
      registeredCount,
      unavailableCount: 0,
      mode: 'empty_none',
      headerCount: 0,
    };
  }

  if (visibleListings.length === 0) {
    return {
      visibleListings,
      registeredCount,
      unavailableCount,
      mode: 'empty_unavailable',
      headerCount: 0,
    };
  }

  return {
    visibleListings,
    registeredCount,
    unavailableCount,
    mode: 'list',
    headerCount,
  };
}
