import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { UserAvatar } from '@/components';
import { useAppUpdateBannerInset } from '@/context/AppUpdateBannerInsetContext';
import { MESSAGES_MARKETPLACE_SURFACE } from '@/features/messages/MessagesScreenHeader';
import { spacing, typography, fontWeights } from '@/theme';

type Props = {
  peerName: string;
  peerAvatarUrl?: string | null;
  peerAvatarVersion?: string;
  peerAvatarDisplayUrl?: string | null;
  onReportPress?: () => void;
  showReport?: boolean;
  /** Démo fil : retour explicite sans router /conversation. */
  onBackPress?: () => void;
};

export function ConversationHeader({
  peerName,
  peerAvatarUrl,
  peerAvatarVersion,
  peerAvatarDisplayUrl,
  onReportPress,
  showReport,
  onBackPress,
}: Props) {
  const insets = useSafeAreaInsets();
  const appUpdateBannerInset = useAppUpdateBannerInset();
  const router = useRouter();
  const topInset = appUpdateBannerInset > 0 ? spacing.xs : insets.top + 2;
  const fallbackHref: Href = '/(tabs)/messages';

  return (
    <View style={[styles.wrap, { paddingTop: topInset }]}>
      <View style={styles.row}>
        <Pressable
          onPress={() => {
            if (onBackPress) {
              onBackPress();
              return;
            }
            const canGoBack =
              typeof (router as unknown as { canGoBack?: () => boolean }).canGoBack === 'function'
                ? (router as unknown as { canGoBack: () => boolean }).canGoBack()
                : false;
            if (canGoBack) router.back();
            else router.replace(fallbackHref);
          }}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons
            name={Platform.OS === 'android' ? 'arrow-back' : 'chevron-back'}
            size={26}
            color="#FFFFFF"
          />
        </Pressable>
        <View style={styles.center} accessibilityRole="header">
          <UserAvatar
            name={peerName}
            avatarUrl={peerAvatarUrl}
            avatarVersion={peerAvatarVersion}
            displayUrl={peerAvatarDisplayUrl}
            size={32}
          />
          <Text style={styles.peerName} numberOfLines={1}>
            {peerName}
          </Text>
        </View>
        {showReport && onReportPress ? (
          <Pressable
            onPress={onReportPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Signaler"
            style={({ pressed }) => [styles.reportBtn, pressed && styles.pressed]}
          >
            <Text style={styles.reportText}>Signaler</Text>
          </Pressable>
        ) : (
          <View style={styles.sidePlaceholder} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: MESSAGES_MARKETPLACE_SURFACE,
    paddingHorizontal: spacing.screenHorizontal,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  backBtn: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  center: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  peerName: {
    flexShrink: 1,
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: '#FFFFFF',
  },
  reportBtn: {
    minWidth: 64,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  reportText: {
    ...typography.sm,
    color: 'rgba(255,255,255,0.88)',
    fontWeight: fontWeights.semibold,
  },
  sidePlaceholder: {
    width: 64,
  },
  pressed: {
    opacity: 0.75,
  },
});
