import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppUpdateBannerInset } from '@/context/AppUpdateBannerInsetContext';
import { spacing, typography, fontWeights } from '@/theme';

/** Vert profond aligné sur l’accueil marketplace (`search.tsx`). */
export const FAVORITES_MARKETPLACE_SURFACE = '#0B4D3C';

type FavoritesScreenHeaderProps = {
  /** Annonces actives affichées dans la grille. */
  count: number;
};

export function FavoritesScreenHeader({ count }: FavoritesScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const appUpdateBannerInset = useAppUpdateBannerInset();
  const topInset = appUpdateBannerInset > 0 ? spacing.xs : insets.top + 2;

  return (
    <View style={[styles.wrap, { paddingTop: topInset }]}>
      <Text style={styles.title} accessibilityRole="header">
        Favoris
      </Text>
      {count > 0 ? (
        <Text style={styles.count} accessibilityLabel={`${count} annonce${count === 1 ? '' : 's'}`}>
          {count} {count === 1 ? 'annonce' : 'annonces'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: FAVORITES_MARKETPLACE_SURFACE,
    paddingHorizontal: spacing.screenHorizontal,
    /** Aligné sur `AppHeader` density compact (paddingBottom: 6). */
    paddingBottom: 6,
  },
  title: {
    ...typography.xl,
    fontWeight: fontWeights.bold,
    color: '#FFFFFF',
  },
  count: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 4,
  },
});
