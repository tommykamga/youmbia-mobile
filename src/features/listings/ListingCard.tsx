import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
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
/** Fils d’accueil uniquement — image plus immersive, alignée au radius carte home. */
const IMAGE_HEIGHT_HOME = 240;
const IMAGE_RADIUS = 16;
/** Radius carte / image home (entre xl et 3xl, rendu marketplace premium). */
const CARD_RADIUS_HOME = 16;
const HEART_SIZE = 28;
const HEART_SIZE_HOME = 26;
const OVERLAY_INSET = spacing.sm;

export type ListingCardVariant = 'feed' | 'rail' | 'top';

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
  const [imageFailed, setImageFailed] = useState(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const firstImage = useMemo(() => {
    const any = listing as unknown as Record<string, unknown>;
    const candidates = [
      any.imageUrl,
      any.mainImageUrl,
      any.image_url,
      Array.isArray(any.images) ? (any.images[0] as unknown) : undefined,
    ];
    for (const c of candidates) {
      const s = typeof c === 'string' ? c.trim() : '';
      if (s) return s;
    }
    return undefined;
  }, [listing]);

  useEffect(() => {
    // Si l’URL change (refresh / nouvelles signed URLs), on retente le chargement.
    setImageFailed(false);
  }, [firstImage]);

  const metaTimeOrViews =
    listing.views_count > 0
      ? `${listing.views_count} vues`
      : timeAgo(listing.created_at);
  const locationLine = getDisplayLocationLine(listing.city, listing.district);
  const locationLabel = (locationLine || listing.city || '').trim();
  const metaLine = [locationLabel, metaTimeOrViews].filter(Boolean).join(' • ');

  const sellerBadge = useMemo(() => {
    if (!listing.created_at) return null;
    const createdDate = new Date(listing.created_at);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 7) return { label: 'Nouveau vendeur', color: '#6B7280' };
    if (diffDays >= 30) return { label: 'Vendeur actif', color: '#6EDC5F' };
    return null;
  }, [listing.created_at]);

  const rawStatus = (listing as unknown as { status?: string | null }).status;
  const normalizedStatus = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : null;
  const statusBadgeLabel =
    normalizedStatus === 'hidden'
      ? 'En pause'
      : normalizedStatus === 'suspended'
        ? 'Suspendue'
        : null;

  const showUrgent = getDisplayUrgent(listing);
  const showBoosted = listing.boosted === true;
  const showPriceDropped = listing.price_dropped === true;
  const showNew = isListingNew(listing.created_at);
  const hasBadges = showUrgent || showBoosted || showPriceDropped || showNew || statusBadgeLabel != null;

  const isHomeFeed = feedPresentation === 'home';
  const isTop = variant === 'top';

  const containerStyle = useMemo(() => {
    if (isHomeFeed) return styles.cardHome;
    if (isTop) return [styles.card, styles.cardTop];
    return styles.card;
  }, [isHomeFeed, isTop]);

  const priceLabel = formatPrice(listing.price);

  const handlePress = useCallback(() => {
    router.push(`/listing/${listing.id}`);
  }, [listing.id, router]);

  const onPressIn = () => {
    scale.value = withTiming(0.97, { 
      duration: 120, 
      easing: Easing.out(Easing.ease) 
    });
  };

  const onPressOut = () => {
    scale.value = withTiming(1, { 
      duration: 120, 
      easing: Easing.out(Easing.ease) 
    });
  };

  const renderBadges = () =>
    hasBadges ? (
      <View style={styles.badgesRow}>
        {statusBadgeLabel ? (
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>{statusBadgeLabel}</Text>
          </View>
        ) : null}
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

  const renderImageBody = () => (
    <>
      <View style={[styles.topRow, isHomeFeed && styles.topRowHome]}>
        {renderBadges()}
        <View style={[styles.heartSlot, isHomeFeed && styles.heartSlotHome]}>
          <FavoriteButton listingId={listing.id} size={isHomeFeed ? HEART_SIZE_HOME : HEART_SIZE} />
        </View>
      </View>
      {priceLabel ? (
        <View style={[styles.priceOverlay, isHomeFeed && styles.priceOverlayHome]}>
          <Text style={[styles.priceText, isHomeFeed && styles.priceTextHome]}>{priceLabel}</Text>
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
        containerStyle,
        variant === 'rail' && styles.cardRail,
        animatedStyle,
      ]}
    >
      {firstImage && !imageFailed ? (
        <ImageBackground
          source={{ uri: firstImage }}
          style={[styles.image, isHomeFeed && styles.imageHome, isHomeFeed && styles.imageHomeTall]}
          imageStyle={[styles.imageRadius, isHomeFeed && styles.imageRadiusHome]}
          onError={() => setImageFailed(true)}
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
        {/* Price moved to overlay on image for premium look */}
        <Text
          style={[styles.title, isHomeFeed && styles.titleHome]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {listing.title}
        </Text>

        {sellerBadge && (
          <View style={styles.sellerBadge}>
            <Text style={[styles.sellerBadgeText, { color: sellerBadge.color }]}>
              {sellerBadge.label}
            </Text>
          </View>
        )}

        {metaLine ? (
          <Text
            style={[styles.meta, isHomeFeed && styles.metaHome]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {metaLine}
          </Text>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

export const ListingCard = memo(ListingCardInner, (prev, next) => {
  const prevStatus = (prev.listing as unknown as { status?: string | null }).status ?? null;
  const nextStatus = (next.listing as unknown as { status?: string | null }).status ?? null;
  const prevFirstImage = prev.listing.images?.[0] ?? null;
  const nextFirstImage = next.listing.images?.[0] ?? null;
  return (
    prev.feedPresentation === next.feedPresentation &&
    prev.variant === next.variant &&
    prev.listing.id === next.listing.id &&
    prev.listing.updated_at === next.listing.updated_at &&
    prevStatus === nextStatus &&
    prevFirstImage === nextFirstImage &&
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
    borderRadius: CARD_RADIUS_HOME,
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
    borderTopLeftRadius: CARD_RADIUS_HOME,
    borderTopRightRadius: CARD_RADIUS_HOME,
  },
  imageRadiusHome: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: CARD_RADIUS_HOME,
    borderTopRightRadius: CARD_RADIUS_HOME,
  },
  topRowHome: {
    paddingTop: 12,
    paddingHorizontal: 12,
  },
  heartSlotHome: {
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
    padding: 5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
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
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusBadgeText: {
    ...typography.xs,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    letterSpacing: 0.2,
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
    bottom: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    maxWidth: '92%',
  },
  priceOverlayHome: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    bottom: 16,
    left: 16,
  },
  priceText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  priceTextHome: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.2,
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 22,
    gap: 4,
  },
  priceHomeLead: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: fontWeights.black,
    color: colors.primaryDark,
    letterSpacing: -0.4,
    marginBottom: ui.spacing.md,
  },
  titleHome: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
    color: ui.colors.textPrimary,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  metaHome: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 2,
    opacity: 0.7,
  },
  sellerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  sellerBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
    textTransform: 'uppercase',
  },
  cardTop: {
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
});
