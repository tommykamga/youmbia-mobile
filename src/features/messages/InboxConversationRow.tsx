import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, withSpring } from 'react-native-reanimated';
import type { Conversation } from '@/services/conversations/types';
import { spacing, colors, typography, fontWeights, radius } from '@/theme';
import { formatInboxDate, INBOX_LISTING_THUMB_SIZE } from './inboxDisplay';
import { InboxListingThumb } from './InboxListingThumb';

type InboxConversationRowProps = {
  item: Conversation;
  listingThumbUrl?: string | null;
  listingThumbPending?: boolean;
  onPress: () => void;
};

export function InboxConversationRow({
  item,
  listingThumbUrl,
  listingThumbPending,
  onPress,
}: InboxConversationRowProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const unread = (item.unread_count ?? 0) > 0;
  const listingTitle = item.listing_title?.trim() || 'Annonce supprimée';
  const participant = item.other_party_name?.trim() || 'Utilisateur';
  const preview = item.last_message_preview?.trim() || 'Démarrer la conversation';
  const activityDate = formatInboxDate(item.last_message_at || item.created_at);

  const onPressIn = () => {
    scale.value = withTiming(0.98, { duration: 100, easing: Easing.out(Easing.quad) });
  };
  const onPressOut = () => {
    scale.value = withSpring(1);
  };

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${listingTitle}, ${participant}, ${preview}${unread ? ', non lu' : ''}`}
        accessibilityHint="Balayez vers la gauche pour supprimer de votre messagerie"
      >
        <View style={styles.thumbSlot}>
          <InboxListingThumb uri={listingThumbUrl} pending={listingThumbPending} />
        </View>
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.listingTitle, unread && styles.textUnread]}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {listingTitle}
            </Text>
            {activityDate ? (
              <Text style={[styles.date, unread && styles.dateUnread]} numberOfLines={1}>
                {activityDate}
              </Text>
            ) : null}
          </View>
          <Text style={styles.participant} numberOfLines={1} ellipsizeMode="tail">
            {participant}
          </Text>
          <View style={styles.previewRow}>
            <Text
              style={[styles.preview, unread && styles.textUnread]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {preview}
            </Text>
            {unread ? (
              <View style={styles.badge} accessibilityLabel={`${item.unread_count} non lus`}>
                <Text style={styles.badgeText}>
                  {(item.unread_count ?? 0) > 9 ? '9+' : item.unread_count}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Skeleton aligné sur la densité de ligne marketplace. */
export function InboxConversationRowSkeleton() {
  return (
    <View style={styles.row}>
      <View style={[styles.thumb, styles.skeletonBlock]} />
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <View style={[styles.skeletonLine, { flex: 1, height: 16 }]} />
          <View style={[styles.skeletonLine, { width: 36, height: 12, marginLeft: spacing.sm }]} />
        </View>
        <View style={[styles.skeletonLine, { width: '45%', height: 14, marginTop: 6 }]} />
        <View style={[styles.skeletonLine, { width: '78%', height: 14, marginTop: 8 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    minHeight: INBOX_LISTING_THUMB_SIZE + spacing.sm * 2 + 4,
  },
  rowPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  thumbSlot: {
    marginRight: spacing.md,
  },
  thumb: {
    width: INBOX_LISTING_THUMB_SIZE,
    height: INBOX_LISTING_THUMB_SIZE,
    borderRadius: radius.lg,
    marginRight: spacing.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSubtle,
  },
  content: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  listingTitle: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    flex: 1,
    minWidth: 0,
    letterSpacing: -0.15,
  },
  date: {
    ...typography.xs,
    color: colors.textTertiary,
    flexShrink: 0,
    maxWidth: 56,
    textAlign: 'right',
  },
  dateUnread: {
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
  },
  participant: {
    ...typography.xs,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: fontWeights.medium,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: spacing.sm,
  },
  preview: {
    ...typography.sm,
    color: colors.textMuted,
    flex: 1,
    minWidth: 0,
  },
  textUnread: {
    color: colors.text,
    fontWeight: fontWeights.bold,
  },
  badge: {
    backgroundColor: colors.primary,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    flexShrink: 0,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: fontWeights.bold,
  },
  skeletonBlock: {
    backgroundColor: colors.surfaceSubtle,
  },
  skeletonLine: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
  },
});
