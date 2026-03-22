/**
 * NearYouCard – variante locale pour la section "Près de vous".
 * Carte fixe (même largeur/hauteur), image dominante, micro badges, ville / proximité honnête.
 * Ne modifie pas ListingCard global.
 */

import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
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
import { colors, spacing, typography, fontWeights, radius, cardStyles } from '@/theme';
import { formatPrice } from '@/lib/format';
import { FavoriteButton } from '@/components/FavoriteButton';
import { getDisplayLocationLine, getDisplayUrgent } from '@/lib/listingSchemaFeatures';
import { timeAgo, isListingNew } from '@/utils/timeAgo';
import type { PublicListing } from '@/services/listings';

const IMAGE_ASPECT = 4 / 3;
const BODY_PADDING = spacing.sm;
const TITLE_LINE_HEIGHT = 20;

const HEART_SIZE = 20;
const OVERLAY_INSET = spacing.sm;

type NearYouCardProps = {
  listing: PublicListing;
  userCity?: string | null;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function NearYouCardInner({
  listing,
  userCity,
}: NearYouCardProps) {
  const router = useRouter();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const firstImage =
    listing.images?.length && String(listing.images[0] ?? '').trim()
      ? listing.images[0]
      : undefined;
  const showNew = isListingNew(listing.created_at);
  const relativeTime = timeAgo(listing.created_at);
  const showUrgent = getDisplayUrgent(listing);
  const showBoosted = listing.boosted === true;
  const locationLine = getDisplayLocationLine(listing.city, listing.district);
  const city = listing.city?.trim() || null;
  const isNear = Boolean(userCity?.trim() && city && userCity.trim().toLowerCase() === city.toLowerCase());

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
            transition={200}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={32} color={colors.textTertiary} />
            <Text style={styles.imagePlaceholderText}>Aucune photo</Text>
          </View>
        )}
        {(showNew || showUrgent || showBoosted) ? (
          <View style={styles.badgesWrap}>
            {showBoosted ? (
              <View style={styles.boostedBadge}>
                <Ionicons name="flash" size={10} color={colors.surface} />
              </View>
            ) : null}
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
        <View style={styles.heartPosition}>
          <FavoriteButton listingId={listing.id} size={HEART_SIZE} />
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
          {listing.title || 'Sans titre'}
        </Text>
        <Text style={styles.price} numberOfLines={1}>
          {formatPrice(listing.price)}
        </Text>
        <View style={styles.cityRow}>
          <Ionicons name="location-outline" size={12} color={colors.textMuted} style={styles.cityIcon} />
          <Text style={styles.city} numberOfLines={1}>
            {locationLine || city || 'Ville non précisée'}
            {isNear ? ' · À proximité' : ''}
          </Text>
        </View>
        {relativeTime ? (
          <Text style={styles.timeMeta} numberOfLines={1}>
            {relativeTime}
          </Text>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

export const NearYouCard = memo(NearYouCardInner, (prev, next) => {
  return (
    prev.listing.id === next.listing.id &&
    prev.listing.updated_at === next.listing.updated_at &&
    prev.listing.created_at === next.listing.created_at &&
    prev.userCity === next.userCity
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
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeNewText: {
    ...typography.xs,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
    letterSpacing: 0.2,
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
  boostedBadge: {
    backgroundColor: '#FFB800',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartPosition: {
    position: 'absolute',
    top: OVERLAY_INSET,
    right: OVERLAY_INSET,
  },
  body: {
    padding: BODY_PADDING,
    paddingBottom: spacing.sm,
    minHeight: 102,
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
  timeMeta: {
    ...typography.xs,
    color: colors.textTertiary,
    marginTop: 4,
  },
});
