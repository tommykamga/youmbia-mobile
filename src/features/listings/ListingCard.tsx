import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Image } from 'expo-image';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  FadeInDown,
  withTiming,
  Easing
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { cardStyles, colors, spacing, typography, fontWeights, radius } from '@/theme';
import { formatPrice } from '@/lib/format';
import { FavoriteButton } from '@/components/FavoriteButton';
import { timeAgo, isListingNew } from '@/utils/timeAgo';
import { getDisplayUrgent, getDisplayLocationLine } from '@/lib/listingSchemaFeatures';
import type { PublicListing } from '@/services/listings';

const IMAGE_ASPECT = 4 / 3;
const HEART_SIZE = 28;
const OVERLAY_INSET = spacing.sm;

type ListingCardProps = {
  listing: PublicListing;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ListingCardInner({ listing }: ListingCardProps) {
  const router = useRouter();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const firstImage =
    listing.images?.length && String(listing.images[0] ?? '').trim()
      ? listing.images[0]
      : undefined;
  const meta = listing.views_count > 0
    ? `${listing.views_count} vues`
    : timeAgo(listing.created_at);
  const locationLine = getDisplayLocationLine(listing.city, listing.district);
  const showUrgent = getDisplayUrgent(listing);
  const showBoosted = listing.boosted === true;
  const showPriceDropped = listing.price_dropped === true;
  const showNew = isListingNew(listing.created_at);

  const handlePress = useCallback(() => {
    router.push(`/listing/${listing.id}`);
  }, [listing.id, router]);

  const onPressIn = () => {
    scale.value = withTiming(0.97, { duration: 100, easing: Easing.out(Easing.quad) });
  };

  const onPressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      entering={FadeInDown.duration(400).springify()}
      style={[styles.card, animatedStyle]}
    >
      <View style={styles.imageWrap}>
        {firstImage ? (
          <Image
            source={{ uri: firstImage }}
            style={styles.image}
            contentFit="cover"
            transition={Platform.OS === 'ios' ? 200 : 0}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={40} color={colors.textTertiary} />
            <Text style={styles.imagePlaceholderText}>Aucune photo</Text>
          </View>
        )}
        {(showUrgent || showBoosted || showPriceDropped || showNew) ? (
          <View style={styles.badgesWrap}>
            {showBoosted ? (
              <View style={styles.boostedBadge}>
                <Ionicons name="flash" size={12} color={colors.surface} style={{ marginRight: 2 }} />
                <Text style={styles.boostedBadgeText}>À la une</Text>
              </View>
            ) : null}
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
            {showNew ? (
              <View style={styles.badgeNew}>
                <Text style={styles.badgeNewText}>Nouveau</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={styles.heartPosition}>
          <FavoriteButton listingId={listing.id} size={HEART_SIZE} />
        </View>
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
    </AnimatedPressable>
  );
}

export const ListingCard = memo(ListingCardInner, (prev, next) => {
  return (
    prev.listing.id === next.listing.id &&
    prev.listing.updated_at === next.listing.updated_at &&
    prev.listing.views_count === next.listing.views_count &&
    prev.listing.created_at === next.listing.created_at
  );
});

const styles = StyleSheet.create({
  card: {
    ...cardStyles.default,
    overflow: 'hidden',
    padding: 0,
  },
  cardPressed: {
    opacity: 0.98,
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
  heartPosition: {
    position: 'absolute',
    top: OVERLAY_INSET,
    right: OVERLAY_INSET,
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
  boostedBadge: {
    backgroundColor: '#FFB800', // Premium Gold/Amber
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
    ...Platform.select({
      ios: {
        shadowColor: '#FFB800',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
    }),
  },
  boostedBadgeText: {
    ...typography.xs,
    fontWeight: fontWeights.bold,
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
  badgeNew: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      ios: {
        shadowColor: colors.text,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
      },
      android: { elevation: 1 },
    }),
  },
  badgeNewText: {
    ...typography.xs,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  body: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base + 2,
    paddingBottom: spacing.base + 4,
    minHeight: 140,
    justifyContent: 'space-between',
  },
  title: {
    ...typography.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
    lineHeight: 22,
  },
  price: {
    ...typography.xl,
    fontWeight: fontWeights.black,
    color: colors.primary,
    letterSpacing: -0.3,
    marginBottom: spacing.md,
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
