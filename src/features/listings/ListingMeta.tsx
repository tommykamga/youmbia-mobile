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
  /** Badge "Urgent". */
  urgent?: boolean;
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
}: ListingMetaProps) {
  const metaSecondary = views_count > 0
    ? `${views_count} vues`
    : timeAgo(created_at);
  const locationLine = getDisplayLocationLine(city, district);
  const showUrgentBadge = getDisplayUrgent({ urgent });

  return (
    <View style={styles.block}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
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
      <View style={styles.row}>
        {showUrgentBadge ? (
          <View style={styles.urgentBadge}>
            <Text style={styles.urgentBadgeText}>Urgent</Text>
          </View>
        ) : null}
        <Text style={styles.city}>{locationLine || city}</Text>
        <Text style={styles.meta}>{metaSecondary}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: spacing.xl,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  title: {
    flex: 1,
    ...typography['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  heartButton: {
    padding: spacing.xs,
  },
  heartButtonPressed: {
    opacity: 0.85,
  },
  price: {
    ...typography['4xl'],
    fontWeight: fontWeights.black,
    letterSpacing: -0.3,
    color: colors.primary,
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  urgentBadge: {
    backgroundColor: colors.error,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  urgentBadgeText: {
    ...typography.xs,
    fontWeight: fontWeights.semibold,
    color: colors.surface,
  },
  city: {
    ...typography.sm,
    color: colors.textMuted,
  },
  meta: {
    ...typography.sm,
    color: colors.textTertiary,
  },
});
