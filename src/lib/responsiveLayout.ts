/**
 * Breakpoints UI (largeur logique) — Home, tabs, fiches, sans logique métier.
 * compact: petits Android / iPhone SE ; regular: majorité ; large: Pro Max, tablettes étroites.
 */
import { useWindowDimensions } from 'react-native';

export type WindowSizeBucket = 'compact' | 'regular' | 'large';

/** Seuils (voir spec produit) : < compactBound → compact ; < regularBound → regular. */
const WIDTH_COMPACT_BOUND = 390;
const WIDTH_REGULAR_BOUND = 430;

export function getWindowSizeBucket(width: number): WindowSizeBucket {
  if (width < WIDTH_COMPACT_BOUND) return 'compact';
  if (width < WIDTH_REGULAR_BOUND) return 'regular';
  return 'large';
}

export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const bucket = getWindowSizeBucket(width);
  return {
    width,
    height,
    bucket,
    isCompact: bucket === 'compact',
    isRegular: bucket === 'regular',
    isLarge: bucket === 'large',
  };
}

/** Placeholder barre de recherche Home — une ligne sur petits écrans. */
export function getHomeSearchPlaceholder(bucket: WindowSizeBucket): string {
  switch (bucket) {
    case 'compact':
      return 'Rechercher une annonce…';
    case 'regular':
      return 'Téléphone, voiture, maison…';
    default:
      return 'Rechercher téléphone, voiture, maison…';
  }
}
