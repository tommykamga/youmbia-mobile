import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ImageBackground,
  useWindowDimensions,
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

/** Rail « À la une » : cartes plus larges + snap dédié. */
export const LISTING_CARD_RAIL_WIDTH_FEATURED = 276;
export const LISTING_CARD_RAIL_MARGIN_END_FEATURED = 14;
export const LISTING_CARD_RAIL_STRIDE_FEATURED =
  LISTING_CARD_RAIL_WIDTH_FEATURED + LISTING_CARD_RAIL_MARGIN_END_FEATURED;

/** Zone image home : ratio largeur/hauteur ≈ 1 / 1.2 (image plus haute). */
const HOME_IMAGE_ASPECT_RATIO = 1 / 1.2;

const IMAGE_HEIGHT = 160;
/** Fils rail standard (hauteur fixe). */
const IMAGE_HEIGHT_RAIL_FEATURED = Math.round(LISTING_CARD_RAIL_WIDTH_FEATURED / HOME_IMAGE_ASPECT_RATIO);
const IMAGE_RADIUS = 16;
/** Radius carte / image home (entre xl et 3xl, rendu marketplace premium). */
const CARD_RADIUS_HOME = 21;
const HEART_SIZE = 28;
const HEART_SIZE_HOME = 20;
const OVERLAY_INSET = spacing.sm;

export type ListingCardVariant = 'feed' | 'rail';

export type ListingCardProps = {
  listing: PublicListing;
  variant?: ListingCardVariant;
  /** Rail « À la une » : carte plus large + image plus haute. */
  railPresentation?: 'default' | 'featured';
  /**
   * `home` : carte du fil d’accueil uniquement (surface / radius / ombre / image).
   * Ne pas utiliser hors ListingFeed home pour garder les autres écrans inchangés.
   */
  feedPresentation?: 'standard' | 'home';
};

/** Clé stable (URL / chemin) pour l’image de couverture — évite de dépendre de l’objet `listing` entier. */
function listingCardCoverImageKey(listing: PublicListing): string {
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
  return '';
}

function listingCardPropsAreEqual(prev: ListingCardProps, next: ListingCardProps): boolean {
  if ((prev.railPresentation ?? 'default') !== (next.railPresentation ?? 'default')) return false;
  if (prev.feedPresentation !== next.feedPresentation) return false;
  if (prev.variant !== next.variant) return false;
  const a = prev.listing;
  const b = next.listing;
  if (a.id !== b.id) return false;
  if (a.title !== b.title) return false;
  if (a.price !== b.price) return false;
  if (a.city !== b.city) return false;
  if ((a.district ?? '') !== (b.district ?? '')) return false;
  if (a.views_count !== b.views_count) return false;
  if (a.created_at !== b.created_at) return false;
  if (a.updated_at !== b.updated_at) return false;
  if (Boolean(a.boosted) !== Boolean(b.boosted)) return false;
  if (Boolean(a.urgent) !== Boolean(b.urgent)) return false;
  if (Boolean(a.price_dropped) !== Boolean(b.price_dropped)) return false;
  if (listingCardCoverImageKey(a) !== listingCardCoverImageKey(b)) return false;
  const ps = (a as unknown as { status?: string | null }).status ?? null;
  const ns = (b as unknown as { status?: string | null }).status ?? null;
  if (ps !== ns) return false;
  return true;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ListingCardInner({
  listing,
  variant = 'feed',
  railPresentation = 'default',
  feedPresentation = 'standard',
}: ListingCardProps) {
  const router = useRouter();
  const { width: winW } = useWindowDimensions();
  const scale = useSharedValue(1);
  const [imageFailed, setImageFailed] = useState(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const coverKey = listingCardCoverImageKey(listing);
  const firstImage = coverKey.length > 0 ? coverKey : undefined;

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

  const isHomeFeed = feedPresentation === 'home' && variant === 'feed';
  const isFeaturedRail = variant === 'rail' && railPresentation === 'featured';

  const homeImageAspect = useMemo(() => {
    if (!isHomeFeed) return HOME_IMAGE_ASPECT_RATIO;
    if (winW < 380) return 1 / 1.36;
    if (winW >= 430) return 1 / 1.14;
    return HOME_IMAGE_ASPECT_RATIO;
  }, [isHomeFeed, winW]);

  const homeRadius = useMemo(() => {
    if (!isHomeFeed) return CARD_RADIUS_HOME;
    if (winW < 380) return 18;
    if (winW >= 430) return 21;
    return CARD_RADIUS_HOME;
  }, [isHomeFeed, winW]);

  const renderImageBody = () => (
    <>
      <View style={[styles.topRow, isHomeFeed && styles.topRowHome]}>
        {renderBadges()}
        <View style={[styles.heartSlot, isHomeFeed && styles.heartSlotHome]}>
          <FavoriteButton
            listingId={listing.id}
            size={isHomeFeed ? HEART_SIZE_HOME : HEART_SIZE}
            surface={isHomeFeed ? 'home' : 'default'}
          />
        </View>
      </View>
      {priceLabel && !isHomeFeed && !isFeaturedRail ? (
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
        isFeaturedRail && styles.cardRailFeatured,
        isHomeFeed && styles.cardHomeBleed,
        isHomeFeed && { borderRadius: homeRadius },
        animatedStyle,
      ]}
    >
      {firstImage && !imageFailed ? (
        <ImageBackground
          source={{ uri: firstImage }}
          style={[
            styles.imageBase,
            !isHomeFeed && !isFeaturedRail && styles.imageHeightFeed,
            isHomeFeed && styles.imageHome,
            isHomeFeed && { aspectRatio: homeImageAspect },
            isHomeFeed && styles.imageHomeEdge,
            isFeaturedRail && styles.imageRailFeatured,
            !isHomeFeed && !isFeaturedRail && styles.imageRadius,
            isHomeFeed && {
              borderTopLeftRadius: homeRadius,
              borderTopRightRadius: homeRadius,
            },
            isFeaturedRail && styles.imageRadius,
          ]}
          imageStyle={[
            styles.imageRadius,
            isHomeFeed && {
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              borderTopLeftRadius: homeRadius,
              borderTopRightRadius: homeRadius,
            },
          ]}
          onError={() => setImageFailed(true)}
        >
          {renderImageBody()}
        </ImageBackground>
      ) : (
        <View
          style={[
            styles.imageBase,
            styles.imagePlaceholder,
            !isHomeFeed && !isFeaturedRail && styles.imageHeightFeed,
            isHomeFeed && styles.imageHome,
            isHomeFeed && { aspectRatio: homeImageAspect },
            isHomeFeed && styles.imageHomeEdge,
            isFeaturedRail && styles.imageRailFeatured,
            !isHomeFeed && !isFeaturedRail && styles.imageRadius,
            isHomeFeed && {
              borderTopLeftRadius: homeRadius,
              borderTopRightRadius: homeRadius,
            },
            isFeaturedRail && styles.imageRadius,
          ]}
        >
          <View style={styles.placeholderCenter} pointerEvents="none">
            <Ionicons name="image-outline" size={36} color={colors.textTertiary} />
            <Text style={styles.imagePlaceholderText}>Aucune photo</Text>
          </View>
          {renderImageBody()}
        </View>
      )}

      <View style={[styles.info, isHomeFeed && styles.infoHome, isFeaturedRail && styles.infoRailFeatured]}>
        {isHomeFeed && priceLabel ? (
          <Text
            style={styles.priceHomeLead}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {priceLabel}
          </Text>
        ) : null}
        {isFeaturedRail && priceLabel ? (
          <Text style={styles.priceRailFeatured} numberOfLines={1} ellipsizeMode="tail">
            {priceLabel}
          </Text>
        ) : null}
        <Text
          style={[styles.title, isHomeFeed && styles.titleHome, isFeaturedRail && styles.titleRailFeatured]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {listing.title}
        </Text>
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

export const ListingCard = memo(ListingCardInner, listingCardPropsAreEqual);

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
  cardRailFeatured: {
    width: LISTING_CARD_RAIL_WIDTH_FEATURED,
    marginRight: LISTING_CARD_RAIL_MARGIN_END_FEATURED,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 0, 0.35)',
    ...Platform.select({
      ios: {
        shadowColor: '#FFB800',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
    }),
  },
  cardHome: {
    backgroundColor: ui.colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    borderRadius: CARD_RADIUS_HOME,
    overflow: 'hidden',
    padding: 0,
    width: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.055,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  /** Pleine largeur du conteneur (pas d’inset type « carte dans une boîte »). */
  cardHomeBleed: {
    marginHorizontal: 0,
    borderRadius: CARD_RADIUS_HOME,
  },
  imageBase: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  imageHeightFeed: {
    height: IMAGE_HEIGHT,
  },
  imageHomeAspect: {
    aspectRatio: HOME_IMAGE_ASPECT_RATIO,
  },
  /** Léger débordement visuel (carte `overflow: hidden` cadre le rendu). */
  imageHomeEdge: {
    marginHorizontal: -6,
  },
  imageRailFeatured: {
    height: IMAGE_HEIGHT_RAIL_FEATURED,
    borderRadius: IMAGE_RADIUS,
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
    paddingTop: 10,
    paddingHorizontal: 10,
  },
  heartSlotHome: {
    marginLeft: 'auto',
    backgroundColor: 'transparent',
    padding: 0,
    overflow: 'visible',
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
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
    }),
  },
  badgeNewText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.15,
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
  infoRailFeatured: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: 2,
  },
  priceRailFeatured: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: fontWeights.black,
    color: colors.primaryDark,
    letterSpacing: -0.35,
    marginBottom: 4,
  },
  titleRailFeatured: {
    fontSize: 13,
    lineHeight: 17,
    marginBottom: spacing.xs,
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
    paddingTop: spacing.base,
    paddingBottom: ui.spacing.lg,
    gap: 0,
  },
  priceHomeLead: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.primaryDark,
    letterSpacing: -0.4,
    marginBottom: ui.spacing.sm,
  },
  titleHome: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: fontWeights.semibold,
    color: ui.colors.textPrimary,
    marginBottom: spacing.sm,
    letterSpacing: -0.08,
  },
  metaHome: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: fontWeights.normal,
    color: colors.textTertiary,
    marginTop: 2,
  },
});
