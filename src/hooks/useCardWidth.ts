import { useWindowDimensions } from 'react-native';
import { spacing } from '@/theme';

export function useCardWidth(): number {
  const { width } = useWindowDimensions();
  // On calcule la largeur utile (viewport - paddings latéraux de la Home).
  // On veut qu'environ 2.3 cartes soient visibles pour montrer qu'il y a du contenu à droite.
  const horizontalPadding = spacing.base * 2;
  const contentWidth = width - horizontalPadding;
  
  // Utiliser ~45% de la largeur utile permet un débordement propre du 3ème élément.
  const idealWidth = contentWidth * 0.45;
  
  // Limites min/max pour éviter les cartes géantes sur Tablette ou minuscules sur petit Android.
  return Math.min(280, Math.max(145, idealWidth));
}
