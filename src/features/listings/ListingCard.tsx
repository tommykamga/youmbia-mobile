import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import { cardStyles } from '@/theme';
import { formatPrice } from '@/lib/format';
import { timeAgo } from '@/utils/timeAgo';
import { getDisplayUrgent, getDisplayLocationLine } from '@/lib/listingSchemaFeatures';
import type { PublicListing } from '@/services/listings';

const IMAGE_ASPECT = 4 / 3;
const HEART_SIZE = 28;
const OVERLAY_INSET = spacing.sm;

type ListingCardProps = {
  listing: PublicListing;
  isFavorite?: boolean;
  onFavoritePress?: () => void;
};

function ListingCardInner({ listing, isFavorite = false, onFavoritePress }: ListingCardProps) {
  const router = useRouter();
  const firstImage =
    listing.images?.length && String(listing.images[0] ?? '').trim()
      ? listing.images[0]
      : undefined;
  const meta = listing.views_count > 0
    ? `${listing.views_count} vues`
    : timeAgo(listing.created_at);
  const locationLine = getDisplayLocationLine(listing.city, listing.district);
  const showUrgent = getDisplayUrgent(listing);
  const showPriceDropped = listing.price_dropped === true;

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
        { transform: [{ scale: pressed ? 0.98 : 1 }] },
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
            <Ionicons name="image-outline" size={40} color={colors.textTertiary} />
            <Text style={styles.imagePlaceholderText}>Aucune photo</Text>
          </View>
        )}
        {(showUrgent || showPriceDropped) ? (
          <View style={styles.badgesWrap}>
            {showUrgent ? (
              <View style={styles.urgentBadge}>
                <Text style={styles.urgentBadgeText}>Urgent</Text>
              </View>
            ) : null}
            {showPriceDropped ? (
              <View style={styles.priceDroppedBadge}>
                <Text style={styles.priceDroppedBadgeText}>Prix baissé</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {onFavoritePress != null ? (
          <Pressable
            style={({ pressed }) => [styles.heartWrap, pressed && styles.heartWrapPressed]}
            onPress={handleFavoriteButtonPress}
            hitSlop={12}
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
        <Text style={styles.title} numberOfLines={2}>
          {listing.title}
        </Text>
        <Text style={styles.price} numberOfLines={1}>
          {formatPrice(listing.price)}
        </Text>
        <View style={styles.footerRow}>
          <Text style={styles.city} numberOfLines={1}>
            {locationLine || listing.city}
          </Text>
          <Text style={styles.meta}>{meta}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export const ListingCard = memo(ListingCardInner, (prev, next) =>
  prev.listing === next.listing &&
  prev.isFavorite === next.isFavorite &&
  (prev.onFavoritePress != null) === (next.onFavoritePress != null)
);

const styles = StyleSheet.create({
  card: {
    ...cardStyles.default,
    overflow: 'hidden',
    padding: 0,
  },
  cardPressed: {
    opacity: 0.95,
  },
  imageWrap: {
    width: '100%',
    aspectRatio: IMAGE_ASPECT,
    backgroundColor: colors.surfaceMuted,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  imagePlaceholderText: {
    ...typography.xs,
    color: colors.textTertiary,
  },
  heartWrap: {
    position: 'absolute',
    top: OVERLAY_INSET,
    right: OVERLAY_INSET,
    padding: spacing.xs,
    borderRadius: 9999,
    backgroundColor: 'rgba(15,23,42,0.32)',
  },
  heartWrapPressed: {
    opacity: 0.85,
  },
  badgesWrap: {
    position: 'absolute',
    top: OVERLAY_INSET,
    left: OVERLAY_INSET,
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  urgentBadge: {
    backgroundColor: colors.error,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  urgentBadgeText: {
    ...typography.xs,
    fontWeight: fontWeights.semibold,
    color: colors.surface,
  },
  priceDroppedBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  priceDroppedBadgeText: {
    ...typography.xs,
    fontWeight: fontWeights.semibold,
    color: colors.surface,
  },
  body: {
    padding: spacing.base,
    minHeight: 136,
    justifyContent: 'space-between',
  },
  title: {
    ...typography.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
    lineHeight: 22,
  },
  price: {
    ...typography.xl,
    fontWeight: fontWeights.black,
    color: colors.primary,
    letterSpacing: -0.3,
    marginBottom: spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  city: {
    ...typography.sm,
    color: colors.textMuted,
    flex: 1,
    marginRight: spacing.sm,
  },
  meta: {
    ...typography.xs,
    color: colors.textTertiary,
  },
});
