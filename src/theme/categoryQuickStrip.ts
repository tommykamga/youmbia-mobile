/**
 * Jetons visuels uniques pour les tuiles « catégories rapides » (strip + rail).
 * UI uniquement — pas de logique métier.
 */
import { colors } from './colors';

export const categoryQuickStrip = {
  activeBg: 'rgba(110, 220, 95, 0.10)',
  activeBorder: colors.primary,
  activeBorderWidth: 1.35,
  inactiveBg: '#FFFFFF',
  inactiveBorder: 'rgba(15, 23, 42, 0.06)',
  inactiveBorderWidth: 1,
  radius: 19,
  iconActive: colors.primary,
  /** Base inactive ; combiner avec `iconInactiveOpacity` sur l’icône. */
  iconInactive: 'rgba(15, 23, 42, 0.45)',
  iconInactiveOpacity: 0.55,
  labelActive: colors.primary,
  labelInactive: 'rgba(15, 23, 42, 0.75)',
  itemGap: 12,
} as const;
