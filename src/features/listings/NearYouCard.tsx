/**
 * NearYouCard – variante locale pour la section "Près de vous".
 * Carte fixe (même largeur/hauteur), image dominante, micro badges, ville / proximité honnête.
 * Ne modifie pas ListingCard global.
 */

import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography, fontWeights, radius, cardStyles } from '@/theme';
import { formatPrice } from '@/lib/format';
import { getDisplayLocationLine, getDisplayUrgent } from '@/lib/listingSchemaFeatures';
import type { PublicListing } from '@/services/listings';

const CARD_WIDTH = 168;
const IMAGE_ASPECT = 4 / 3;
const IMAGE_HEIGHT = Math.round(CARD_WIDTH / IMAGE_ASPECT);
const BODY_PADDING = spacing.sm;
const TITLE_LINES = 1;
const TITLE_LINE_HEIGHT = 20;
const BODY_HEIGHT =
  BODY_PADDING * 2 +
  TITLE_LINE_HEIGHT * TITLE_LINES +
  22 +
  18;
export const NEAR_YOU_CARD_HEIGHT = IMAGE_HEIGHT + BODY_HEIGHT;

const HEART_SIZE = 20;
const NEW_DAYS = 7;
const OVERLAY_INSET = spacing.sm;

function isNew(createdAt: string): boolean {
  try {
    const d = new Date(createdAt);
    const days = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= NEW_DAYS;
  } catch {
    return false;
  }
}

type NearYouCardProps = {
  listing: PublicListing;
  isFavorite?: boolean;
  onFavoritePress?: () => void;
  userCity?: string | null;
};

function NearYouCardInner({
  listing,
  isFavorite = false,
  onFavoritePress,
  userCity,
}: NearYouCardProps) {
  const router = useRouter();
  const firstImage =
    listing.images?.length && String(listing.images[0] ?? '').trim()
      ? listing.images[0]
      : undefined;
  const showNew = isNew(listing.created_at);
  const showUrgent = getDisplayUrgent(listing);
  const locationLine = getDisplayLocationLine(listing.city, listing.district);
  const city = listing.city?.trim() || null;
  const isNear = Boolean(userCity?.trim() && city && userCity.trim().toLowerCase() === city.toLowerCase());

  const handlePress = useCallback(() => {
    router.push(`/listing/${listing.id}`);
  }, [listing.id, router]);

  const handleFavoriteButtonPress = useCallback((e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    onFavoritePress?.();
  }, [onFavoritePress]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
        { width: CARD_WIDTH, height: NEAR_YOU_CARD_HEIGHT },
      ]}
    >
      <View style={styles.imageWrap}>
        {firstImage ? (
          <Image
            source={{ uri: firstImage }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={32} color={colors.textTertiary} />
            <Text style={styles.imagePlaceholderText}>Aucune photo</Text>
          </View>
        )}
        {(showNew || showUrgent) ? (
          <View style={styles.badgesWrap}>
            {showNew ? (
              <View style={styles.badgeNew}>
                <Text style={styles.badgeNewText}>Nouveau</Text>
              </View>
            ) : null}
            {showUrgent ? (
              <View style={styles.urgentBadge}>
                <Text style={styles.urgentBadgeText}>Urgent</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {onFavoritePress != null ? (
          <Pressable
            style={({ pressed: p }) => [styles.heartWrap, p && styles.heartWrapPressed]}
            onPress={handleFavoriteButtonPress}
            hitSlop={10}
          >
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={HEART_SIZE}
              color={isFavorite ? colors.error : colors.surface}
            />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
          {listing.title || 'Sans titre'}
        </Text>
        <Text style={styles.price}>{formatPrice(listing.price)}</Text>
        <View style={styles.cityRow}>
          <Ionicons name="location-outline" size={12} color={colors.textMuted} style={styles.cityIcon} />
          <Text style={styles.city} numberOfLines={1}>
            {locationLine || city || 'Ville non précisée'}
            {isNear ? ' · À proximité' : ''}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export const NearYouCard = memo(NearYouCardInner, (prev, next) =>
  prev.listing === next.listing &&
  prev.isFavorite === next.isFavorite &&
  prev.userCity === next.userCity &&
  (prev.onFavoritePress != null) === (next.onFavoritePress != null)
);

const styles = StyleSheet.create({
  card: {
    ...cardStyles.default,
    overflow: 'hidden',
    padding: 0,
  },
  cardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.98 }],
  },
  imageWrap: {
    width: CARD_WIDTH,
    height: IMAGE_HEIGHT,
    backgroundColor: colors.surfaceMuted,
  },
  image: {
    width: CARD_WIDTH,
    height: IMAGE_HEIGHT,
  },
  imagePlaceholder: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  imagePlaceholderText: {
    ...typography.xs,
    color: colors.textTertiary,
  },
  badgesWrap: {
    position: 'absolute',
    top: OVERLAY_INSET,
    left: OVERLAY_INSET,
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  badgeNew: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.badgeNeutralBg,
  },
  badgeNewText: {
    ...typography.label.badge,
    color: colors.badgeNeutralText,
    textTransform: 'uppercase',
  },
  urgentBadge: {
    backgroundColor: colors.error,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  urgentBadgeText: {
    ...typography.xs,
    fontWeight: fontWeights.semibold,
    color: colors.surface,
  },
  heartWrap: {
    position: 'absolute',
    top: OVERLAY_INSET,
    right: OVERLAY_INSET,
    padding: spacing.xs,
    borderRadius: 9999,
    backgroundColor: 'rgba(15,23,42,0.28)',
  },
  heartWrapPressed: {
    opacity: 0.85,
  },
  body: {
    padding: BODY_PADDING,
    height: BODY_HEIGHT,
    justifyContent: 'space-between',
  },
  title: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    lineHeight: TITLE_LINE_HEIGHT,
  },
  price: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  cityIcon: {
    marginRight: 4,
  },
  city: {
    flex: 1,
    ...typography.xs,
    color: colors.textMuted,
  },
});
