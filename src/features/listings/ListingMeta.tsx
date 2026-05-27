/**
 * ListingMeta – title, price, city, date or views for listing detail.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import { formatPrice, timeAgo } from '@/lib/format';
import { getDisplayUrgent, getDisplayLocationLine } from '@/lib/listingSchemaFeatures';

const HEART_SIZE = 26;

type ListingMetaProps = {
  title: string;
  price: number;
  city: string;
  created_at: string | null;
  views_count: number;
  isFavorite?: boolean;
  onFavoritePress?: () => void;
  /** Quartier ou zone (localisation améliorée). */
  district?: string | null;
  urgent?: boolean;
  /** Badge "À la une" (boosted). */
  boosted?: boolean;
};

export function ListingMeta({
  title,
  price,
  city,
  created_at,
  views_count,
  isFavorite = false,
  onFavoritePress,
  district,
  urgent,
  boosted,
}: ListingMetaProps) {
  const locationLine = getDisplayLocationLine(city, district);
  const showUrgentBadge = getDisplayUrgent({ urgent });
  const showBoostedBadge = boosted === true;
  const timeLabel = timeAgo(created_at);
  const locationLabel = (locationLine || city || '').trim();
  const viewsLabel = views_count > 0 ? `${views_count} vues` : '';
  const metaLine = [locationLabel, viewsLabel, timeLabel].filter(Boolean).join(' · ');

  return (
    <View style={styles.block}>
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
          {title}
        </Text>
        {onFavoritePress != null ? (
          <Pressable
            onPress={onFavoritePress}
            hitSlop={12}
            style={({ pressed }) => [styles.heartButton, pressed && styles.heartButtonPressed]}
          >
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={HEART_SIZE}
              color={isFavorite ? colors.error : colors.textTertiary}
            />
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.price}>{formatPrice(price)}</Text>

      <View style={styles.badgesRow}>
        {showUrgentBadge && (
          <View style={[styles.badge, styles.urgentBadge]}>
            <Ionicons name="flash" size={12} color={colors.surface} style={styles.badgeIcon} />
            <Text style={styles.badgeText}>Urgent</Text>
          </View>
        )}

        {showBoostedBadge && (
          <View style={[styles.badge, styles.boostedBadge]}>
            <Ionicons name="star" size={12} color={colors.surface} style={styles.badgeIcon} />
            <Text style={styles.badgeText}>À la une</Text>
          </View>
        )}
      </View>

      <View style={styles.essentialInfo}>
        {metaLine ? (
          <Text style={styles.metaLine} numberOfLines={1} ellipsizeMode="tail">
            {metaLine}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: 6,
  },
  title: {
    flex: 1,
    ...typography.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    lineHeight: 26,
  },
  heartButton: {
    padding: spacing.xs,
  },
  heartButtonPressed: {
    opacity: 0.85,
  },
  price: {
    ...typography['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginBottom: spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  badgeIcon: {
    marginRight: 4,
  },
  urgentBadge: {
    backgroundColor: colors.error,
  },
  boostedBadge: {
    backgroundColor: colors.primary,
  },
  badgeText: {
    ...typography.xs,
    fontWeight: fontWeights.bold,
    color: colors.surface,
  },
  essentialInfo: {
    marginTop: 0,
  },
  metaLine: {
    ...typography.sm,
    color: colors.textMuted,
    fontWeight: fontWeights.medium,
    letterSpacing: -0.1,
  },
});
