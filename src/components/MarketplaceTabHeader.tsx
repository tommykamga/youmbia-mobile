import React from 'react';
import { View, Text, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppUpdateBannerInset } from '@/context/AppUpdateBannerInsetContext';
import { MARKETPLACE_TAB_TITLE_PADDING_BOTTOM } from '@/features/account/accountScreen.constants';
import { spacing, typography, fontWeights } from '@/theme';

/** Vert profond marketplace (Accueil, Favoris, Messages, Compte). */
export const MARKETPLACE_TAB_SURFACE = '#0B4D3C';

/** Contrat layout partagé Favoris / Messages (tests + doc). */
export const MARKETPLACE_TAB_HEADER_LAYOUT = {
  surface: MARKETPLACE_TAB_SURFACE,
  paddingHorizontal: spacing.screenHorizontal,
  paddingBottom: MARKETPLACE_TAB_TITLE_PADDING_BOTTOM,
  subtitleMarginTop: 4,
} as const;

type MarketplaceTabHeaderProps = {
  title: string;
  /** Toujours fourni — réserve la 2ᵉ ligne même si le compteur est nul. */
  subtitle: string;
  subtitleAccessibilityLabel?: string;
};

export function MarketplaceTabHeader({
  title,
  subtitle,
  subtitleAccessibilityLabel,
}: MarketplaceTabHeaderProps) {
  const insets = useSafeAreaInsets();
  const appUpdateBannerInset = useAppUpdateBannerInset();
  const topInset = appUpdateBannerInset > 0 ? spacing.xs : insets.top + 2;

  return (
    <View style={[styles.wrap, { paddingTop: topInset }]}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text
        style={styles.subtitle}
        numberOfLines={2}
        accessibilityLabel={subtitleAccessibilityLabel ?? subtitle}
      >
        {subtitle}
      </Text>
    </View>
  );
}

/** Styles du bandeau (hors inset safe area dynamique). */
export function getMarketplaceTabHeaderWrapStyle(): ViewStyle {
  return {
    backgroundColor: MARKETPLACE_TAB_HEADER_LAYOUT.surface,
    paddingHorizontal: MARKETPLACE_TAB_HEADER_LAYOUT.paddingHorizontal,
    paddingBottom: MARKETPLACE_TAB_HEADER_LAYOUT.paddingBottom,
  };
}

export function getMarketplaceTabHeaderSubtitleStyle(): TextStyle {
  return {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: 'rgba(255,255,255,0.88)',
    marginTop: MARKETPLACE_TAB_HEADER_LAYOUT.subtitleMarginTop,
  };
}

const styles = StyleSheet.create({
  wrap: getMarketplaceTabHeaderWrapStyle(),
  title: {
    ...typography.xl,
    fontWeight: fontWeights.bold,
    color: '#FFFFFF',
  },
  subtitle: {
    ...getMarketplaceTabHeaderSubtitleStyle(),
  },
});
