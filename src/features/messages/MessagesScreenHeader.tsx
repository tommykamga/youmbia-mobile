import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppUpdateBannerInset } from '@/context/AppUpdateBannerInsetContext';
import { spacing, typography, fontWeights } from '@/theme';

/** Vert profond aligné Favoris / accueil marketplace. */
export const MESSAGES_MARKETPLACE_SURFACE = '#0B4D3C';

type MessagesScreenHeaderProps = {
  /** Conversations avec au moins un message non lu (dérivé des lignes inbox, pas du badge onglet). */
  unreadConversationsCount: number;
};

export function MessagesScreenHeader({ unreadConversationsCount }: MessagesScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const appUpdateBannerInset = useAppUpdateBannerInset();
  const topInset = appUpdateBannerInset > 0 ? spacing.xs : insets.top + 2;

  return (
    <View style={[styles.wrap, { paddingTop: topInset }]}>
      <Text style={styles.title} accessibilityRole="header">
        Messages
      </Text>
      {unreadConversationsCount > 0 ? (
        <Text
          style={styles.subtitle}
          accessibilityLabel={`${unreadConversationsCount} conversation${unreadConversationsCount === 1 ? '' : 's'} non lue${unreadConversationsCount === 1 ? '' : 's'}`}
        >
          {unreadConversationsCount}{' '}
          {unreadConversationsCount === 1 ? 'conversation non lue' : 'conversations non lues'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: MESSAGES_MARKETPLACE_SURFACE,
    paddingHorizontal: spacing.screenHorizontal,
    paddingBottom: 6,
  },
  title: {
    ...typography.xl,
    fontWeight: fontWeights.bold,
    color: '#FFFFFF',
  },
  subtitle: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 4,
  },
});
