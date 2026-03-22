/**
 * Breakpoints UI (largeur logique) — Home, tabs, fiches, sans logique métier.
 * compact: petits Android / iPhone SE ; regular: majorité ; large: Pro Max, tablettes étroites.
 */
import { useWindowDimensions } from 'react-native';

export type WindowSizeBucket = 'compact' | 'regular' | 'large';

const WIDTH_COMPACT_MAX = 389;
const WIDTH_REGULAR_MAX = 429;

export function getWindowSizeBucket(width: number): WindowSizeBucket {
  if (width < 390) return 'compact';
  if (width < 430) return 'regular';
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
