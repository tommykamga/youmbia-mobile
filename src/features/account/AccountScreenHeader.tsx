import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppUpdateBannerInset } from '@/context/AppUpdateBannerInsetContext';
import { spacing, typography, fontWeights } from '@/theme';
import {
  ACCOUNT_MARKETPLACE_SURFACE,
  ACCOUNT_PROFILE_CARD_OVERLAP,
  MARKETPLACE_TAB_TITLE_PADDING_BOTTOM,
} from './accountScreen.constants';

export { ACCOUNT_MARKETPLACE_SURFACE };

export function AccountScreenHeader() {
  const insets = useSafeAreaInsets();
  const appUpdateBannerInset = useAppUpdateBannerInset();
  const topInset = appUpdateBannerInset > 0 ? spacing.xs : insets.top + 2;

  return (
    <View style={[styles.wrap, { paddingTop: topInset }]}>
      <Text style={styles.title} accessibilityRole="header">
        Compte
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: ACCOUNT_MARKETPLACE_SURFACE,
    paddingHorizontal: spacing.screenHorizontal,
    paddingBottom: MARKETPLACE_TAB_TITLE_PADDING_BOTTOM + ACCOUNT_PROFILE_CARD_OVERLAP,
  },
  title: {
    ...typography.xl,
    fontWeight: fontWeights.bold,
    color: '#FFFFFF',
  },
});
