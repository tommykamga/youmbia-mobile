import React from 'react';
import { MarketplaceTabHeader, MARKETPLACE_TAB_SURFACE } from '@/components/MarketplaceTabHeader';

/** @deprecated Préférer `MARKETPLACE_TAB_SURFACE` — alias Favoris. */
export const FAVORITES_MARKETPLACE_SURFACE = MARKETPLACE_TAB_SURFACE;

type FavoritesScreenHeaderProps = {
  /** Annonces actives affichées dans la grille. */
  count: number;
};

function favoritesSubtitle(count: number): string {
  if (count === 0) return '0 annonce';
  return `${count} ${count === 1 ? 'annonce' : 'annonces'}`;
}

export function FavoritesScreenHeader({ count }: FavoritesScreenHeaderProps) {
  const subtitle = favoritesSubtitle(count);
  return (
    <MarketplaceTabHeader
      title="Favoris"
      subtitle={subtitle}
      subtitleAccessibilityLabel={`${count} annonce${count === 1 ? '' : 's'}`}
    />
  );
}

export { favoritesSubtitle };
