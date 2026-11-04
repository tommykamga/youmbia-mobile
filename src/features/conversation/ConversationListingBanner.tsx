import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, colors, typography, fontWeights, radius } from '@/theme';

const BANNER_THUMB = 56;

function BannerThumb({ uri, pending }: { uri?: string | null; pending?: boolean }) {
  const [failed, setFailed] = useState(false);
  const trimmed = uri?.trim() ?? '';
  const show = trimmed.length > 0 && !failed;
  useEffect(() => {
    setFailed(false);
  }, [trimmed]);
  return (
    <View style={thumbStyles.box}>
      {show ? (
        <Image source={{ uri: trimmed }} style={thumbStyles.image} resizeMode="cover" onError={() => setFailed(true)} />
      ) : (
        <View style={thumbStyles.placeholder}>
          <Ionicons name="image-outline" size={22} color={colors.textTertiary} />
        </View>
      )}
      {pending && !show ? (
        <View style={thumbStyles.pending} pointerEvents="none" />
      ) : null}
    </View>
  );
}

const thumbStyles = StyleSheet.create({
  box: {
    width: BANNER_THUMB,
    height: BANNER_THUMB,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSubtle,
  },
  image: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pending: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.35)' },
});

type Props = {
  listingTitle: string;
  priceLabel?: string | null;
  thumbUrl?: string | null;
  thumbPending?: boolean;
  onPress: () => void;
};

export function ConversationListingBanner({
  listingTitle,
  priceLabel,
  thumbUrl,
  thumbPending,
  onPress,
}: Props) {
  const title = listingTitle.trim() || 'Annonce supprimée';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Annonce : ${title}${priceLabel ? `, ${priceLabel}` : ''}. Ouvrir la fiche`}
    >
      <BannerThumb uri={thumbUrl} pending={thumbPending} />
      <View style={styles.textCol}>
        <Text style={styles.kicker}>Annonce</Text>
        <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
          {title}
        </Text>
        {priceLabel ? (
          <Text style={styles.price} numberOfLines={1}>
            {priceLabel}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenHorizontal,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
    gap: spacing.md,
  },
  pressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    ...typography.xs,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
    marginBottom: 2,
  },
  title: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  price: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.primary,
    marginTop: 2,
  },
});
