import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography, fontWeights } from '@/theme';
import { cardStyles } from '@/theme';
import { formatPrice } from '@/lib/format';
import { timeAgo } from '@/utils/timeAgo';
import type { PublicListing } from '@/services/listings';

const IMAGE_ASPECT = 4 / 3;
const HEART_SIZE = 28;

type ListingCardProps = {
  listing: PublicListing;
  isFavorite?: boolean;
  onFavoritePress?: () => void;
};

export function ListingCard({ listing, isFavorite = false, onFavoritePress }: ListingCardProps) {
  const router = useRouter();
  const firstImage =
    listing.images?.length && String(listing.images[0] ?? '').trim()
      ? listing.images[0]
      : undefined;
  const meta = listing.views_count > 0
    ? `${listing.views_count} vues`
    : timeAgo(listing.created_at);

  const handlePress = () => {
    router.push(`/listing/${listing.id}`);
  };

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
        {onFavoritePress != null ? (
          <Pressable
            style={({ pressed }) => [styles.heartWrap, pressed && styles.heartWrapPressed]}
            onPress={(e) => {
              e?.stopPropagation?.();
              onFavoritePress();
            }}
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
        <Text style={styles.price}>{formatPrice(listing.price)}</Text>
        <Text style={styles.city} numberOfLines={1}>
          {listing.city}
        </Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
    </Pressable>
  );
}

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
    gap: spacing.sm,
  },
  imagePlaceholderText: {
    ...typography.sm,
    color: colors.textTertiary,
  },
  heartWrap: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    padding: spacing.xs,
    borderRadius: 9999,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  heartWrapPressed: {
    opacity: 0.85,
  },
  body: {
    padding: spacing.base,
  },
  title: {
    ...typography.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  price: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  city: {
    ...typography.sm,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  meta: {
    ...typography.xs,
    color: colors.textTertiary,
  },
});
