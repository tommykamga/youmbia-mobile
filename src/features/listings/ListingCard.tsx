import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ImageBackground,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { cardStyles, colors, spacing, typography, fontWeights, radius, ui } from '@/theme';
import { formatPrice } from '@/lib/format';
import { FavoriteButton } from '@/components/FavoriteButton';
import { timeAgo, isListingNew } from '@/utils/timeAgo';
import { getDisplayUrgent, getDisplayLocationLine } from '@/lib/listingSchemaFeatures';
import type { PublicListing } from '@/services/listings';

/** Largeur carte en carrousel (home sections horizontales). */
export const LISTING_CARD_RAIL_WIDTH = 220;
export const LISTING_CARD_RAIL_MARGIN_END = 12;
export const LISTING_CARD_RAIL_STRIDE = LISTING_CARD_RAIL_WIDTH + LISTING_CARD_RAIL_MARGIN_END;

const IMAGE_HEIGHT = 160;
/** Fils d’accueil uniquement (`feedPresentation="home"`) — un peu plus immersif. */
const IMAGE_HEIGHT_HOME = 172;
const IMAGE_RADIUS = 16;
const HEART_SIZE = 28;
const OVERLAY_INSET = spacing.sm;

export type ListingCardVariant = 'feed' | 'rail';

export type ListingCardProps = {
  listing: PublicListing;
  variant?: ListingCardVariant;
  /**
   * `home` : carte du fil d’accueil uniquement (surface / radius / ombre / image).
   * Ne pas utiliser hors ListingFeed home pour garder les autres écrans inchangés.
   */
  feedPresentation?: 'standard' | 'home';
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ListingCardInner({
  listing,
  variant = 'feed',
  feedPresentation = 'standard',
}: ListingCardProps) {
  const router = useRouter();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const firstImage =
    listing.images?.length && String(listing.images[0] ?? '').trim()
      ? listing.images[0]
      : undefined;

  const metaTimeOrViews =
    listing.views_count > 0
      ? `${listing.views_count} vues`
      : timeAgo(listing.created_at);
  const locationLine = getDisplayLocationLine(listing.city, listing.district);
  const locationLabel = (locationLine || listing.city || '').trim();
  const metaLine = [locationLabel, metaTimeOrViews].filter(Boolean).join(' • ');

  const showUrgent = getDisplayUrgent(listing);
  const showBoosted = listing.boosted === true;
  const showPriceDropped = listing.price_dropped === true;
  const showNew = isListingNew(listing.created_at);
  const hasBadges = showUrgent || showBoosted || showPriceDropped || showNew;

  const priceLabel = formatPrice(listing.price);

  const handlePress = useCallback(() => {
    router.push(`/listing/${listing.id}`);
  }, [listing.id, router]);

  const onPressIn = () => {
    scale.value = withTiming(0.97, { duration: 100, easing: Easing.out(Easing.quad) });
  };

  const onPressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const renderBadges = () =>
    hasBadges ? (
      <View style={styles.badgesRow}>
        {showBoosted ? (
          <View style={styles.boostedBadge}>
            <Ionicons name="flash" size={12} color={colors.surface} style={styles.badgeIcon} />
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
    ) : (
      <View style={styles.badgesRow} />
    );

  const isHomeFeed = feedPresentation === 'home' && variant === 'feed';

  const renderImageBody = () => (
    <>
      <View style={styles.topRow}>
        {renderBadges()}
        <View style={styles.heartSlot}>
          <FavoriteButton listingId={listing.id} size={HEART_SIZE} />
        </View>
      </View>
      {priceLabel ? (
        <View style={styles.priceOverlay}>
          <Text style={styles.priceText}>{priceLabel}</Text>
        </View>
      ) : null}
    </>
  );

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      entering={FadeInDown.duration(400).springify()}
      style={[
        isHomeFeed ? styles.cardHome : styles.card,
        variant === 'rail' && styles.cardRail,
        animatedStyle,
      ]}
    >
      {firstImage ? (
        <ImageBackground
          source={{ uri: firstImage }}
          style={[styles.image, isHomeFeed && styles.imageHome, isHomeFeed && styles.imageHomeTall]}
          imageStyle={[styles.imageRadius, isHomeFeed && styles.imageRadiusHome]}
        >
          {renderImageBody()}
        </ImageBackground>
      ) : (
        <View
          style={[
            styles.image,
            styles.imagePlaceholder,
            isHomeFeed && styles.imageHome,
            isHomeFeed && styles.imageHomeTall,
          ]}
        >
          <View style={styles.placeholderCenter} pointerEvents="none">
            <Ionicons name="image-outline" size={36} color={colors.textTertiary} />
            <Text style={styles.imagePlaceholderText}>Aucune photo</Text>
          </View>
          {renderImageBody()}
        </View>
      )}

      <View style={[styles.info, isHomeFeed && styles.infoHome]}>
        <Text style={[styles.title, isHomeFeed && styles.titleHome]} numberOfLines={2}>
          {listing.title}
        </Text>
        {metaLine ? (
          <Text style={[styles.meta, isHomeFeed && styles.metaHome]} numberOfLines={1}>
            {metaLine}
          </Text>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

export const ListingCard = memo(ListingCardInner, (prev, next) => {
  return (
    prev.feedPresentation === next.feedPresentation &&
    prev.variant === next.variant &&
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
    width: '100%',
    borderRadius: IMAGE_RADIUS,
  },
  cardRail: {
    width: LISTING_CARD_RAIL_WIDTH,
    marginRight: LISTING_CARD_RAIL_MARGIN_END,
  },
  cardHome: {
    backgroundColor: ui.colors.surface,
    borderWidth: 1,
    borderColor: ui.colors.borderLight,
    borderRadius: ui.radius.xl,
    overflow: 'hidden',
    padding: 0,
    width: '100%',
    ...ui.shadow.soft,
  },
  image: {
    width: '100%',
    height: IMAGE_HEIGHT,
    borderRadius: IMAGE_RADIUS,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  imageHomeTall: {
    height: IMAGE_HEIGHT_HOME,
  },
  imageRadius: {
    borderRadius: IMAGE_RADIUS,
  },
  imageHome: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  imageRadiusHome: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  imagePlaceholder: {
    position: 'relative',
  },
  placeholderCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  imagePlaceholderText: {
    ...typography.xs,
    color: colors.textTertiary,
  },
  topRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: OVERLAY_INSET,
    paddingHorizontal: OVERLAY_INSET,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    flex: 1,
    marginRight: spacing.xs,
    maxWidth: '72%',
  },
  badgeIcon: {
    marginRight: 2,
  },
  heartSlot: {
    marginLeft: 'auto',
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
    backgroundColor: '#FFB800',
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
  priceOverlay: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: '92%',
  },
  priceText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: typography.sm.fontSize,
  },
  info: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
  },
  title: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
    lineHeight: 20,
  },
  meta: {
    fontSize: 12,
    color: '#6B7280',
  },
  infoHome: {
    paddingHorizontal: ui.spacing.md,
    paddingTop: ui.spacing.md,
    paddingBottom: ui.spacing.md,
  },
  titleHome: {
    ...ui.typography.bodySmall,
    fontWeight: fontWeights.semibold,
    color: ui.colors.textPrimary,
    marginBottom: ui.spacing.xs,
    lineHeight: 20,
  },
  metaHome: {
    ...ui.typography.caption,
    color: ui.colors.textMuted,
  },
});
