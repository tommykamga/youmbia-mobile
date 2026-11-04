/**
 * ListingMeta – prix, titre, lieu et ancienneté de la fiche annonce.
 * Le favori est porté par la galerie, pas par ce bloc.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import { formatPrice, timeAgo } from '@/lib/format';
import { getDisplayUrgent, getDisplayLocationLine } from '@/lib/listingSchemaFeatures';

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
  /** Libellé de catégorie déjà résolu. Absent si la taxonomie ne le connaît pas. */
  categoryLabel?: string | null;
};

function reliableTimeLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time) || time > Date.now() + 60_000) return '';
  return timeAgo(iso);
}

export function ListingMeta({
  title,
  price,
  city,
  created_at,
  views_count,
  district,
  urgent,
  boosted,
  categoryLabel,
}: ListingMetaProps) {
  const locationLine = getDisplayLocationLine(city, district).trim();
  const showUrgentBadge = getDisplayUrgent({ urgent });
  const showBoostedBadge = boosted === true;
  const timeLabel = reliableTimeLabel(created_at);
  const viewsLabel = views_count > 0 ? `${views_count} ${views_count > 1 ? 'vues' : 'vue'}` : '';
  const category = categoryLabel?.trim() ?? '';
  const hasBadges = showUrgentBadge || showBoostedBadge;

  return (
    <View style={styles.block}>
      <Text style={styles.price} accessibilityRole="text">
        {formatPrice(price)}
      </Text>

      <Text style={styles.title}>{title}</Text>

      {locationLine ? (
        <View style={styles.factRow}>
          <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.factText}>{locationLine}</Text>
        </View>
      ) : null}

      {timeLabel || viewsLabel || category ? (
        <Text style={styles.metaLine}>
          {[timeLabel, viewsLabel, category].filter(Boolean).join(' · ')}
        </Text>
      ) : null}

      {hasBadges ? (
        <View style={styles.badgesRow}>
          {showUrgentBadge ? (
            <View style={[styles.badge, styles.urgentBadge]}>
              <Text style={styles.badgeText}>Urgent</Text>
            </View>
          ) : null}
          {showBoostedBadge ? (
            <View style={[styles.badge, styles.boostedBadge]}>
              <Text style={styles.badgeText}>À la une</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  price: {
    ...typography.price.detail,
    color: colors.primary,
  },
  title: {
    ...typography.xl,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    lineHeight: 28,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  factText: {
    ...typography.base,
    flex: 1,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  metaLine: {
    ...typography.sm,
    color: colors.textMuted,
    fontWeight: fontWeights.medium,
    marginTop: spacing.xs,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
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
});
