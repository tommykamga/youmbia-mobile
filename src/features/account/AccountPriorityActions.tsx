import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useProSellerActivation } from '@/features/shops/useProSellerActivation';
import { formatActiveListingsCountLabel } from '@/features/account/activeListingsCountLabel';
import { useSellerActiveListingsCount } from '@/features/account/useSellerActiveListingsCount';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

type PriorityTileProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string | null;
  subtitleLoading?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
};

function PriorityTile({
  icon,
  title,
  subtitle,
  subtitleLoading,
  onPress,
  accessibilityLabel,
}: PriorityTileProps) {
  return (
    <View style={styles.tile}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.tileBody, pressed && styles.tilePressed]}
      >
        <View style={styles.tileIconWrap}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <Text style={styles.tileTitle} numberOfLines={2}>
          {title}
        </Text>
        {subtitleLoading ? (
          <ActivityIndicator size="small" color={colors.textMuted} style={styles.subtitleLoader} />
        ) : subtitle ? (
          <Text style={styles.tileSubtitle} numberOfLines={2} accessibilityRole="text">
            {subtitle}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

type ShopTileProps = {
  shopName: string | null;
  onOpenShop: () => void;
  onShare: () => void;
  sharing: boolean;
};

function ShopPriorityTile({ shopName, onOpenShop, onShare, sharing }: ShopTileProps) {
  return (
    <View style={styles.tile}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ma boutique"
        onPress={onOpenShop}
        style={({ pressed }) => [styles.shopMain, pressed && styles.tilePressed]}
      >
        <View style={styles.tileIconWrap}>
          <Ionicons name="storefront" size={20} color={colors.primary} />
        </View>
        <Text style={styles.tileTitle} numberOfLines={2}>
          Ma boutique
        </Text>
        {shopName ? (
          <Text style={styles.tileSubtitle} numberOfLines={2}>
            {shopName}
          </Text>
        ) : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Partager ma boutique"
        onPress={onShare}
        disabled={sharing}
        style={({ pressed }) => [
          styles.shareAction,
          pressed && styles.shareActionPressed,
          sharing && styles.shareActionDisabled,
        ]}
      >
        {sharing ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <>
            <Ionicons name="share-outline" size={16} color={colors.primary} />
            <Text style={styles.shareActionText}>Partager</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

/** Raccourcis vendeur : Mes annonces + boutique (sans dupliquer la carte ProSeller complète). */
export function AccountPriorityActions() {
  const router = useRouter();
  const { loading, hasShop, shopSlug, shopName, sharing, handleShare } = useProSellerActivation();
  const {
    loading: countLoading,
    count,
    error: countError,
  } = useSellerActiveListingsCount();

  if (loading) {
    return null;
  }

  const listingsSubtitle =
    countError && count == null
      ? 'Compteur indisponible'
      : count != null
        ? formatActiveListingsCountLabel(count)
        : null;

  const shopRoute = hasShop && shopSlug ? `/shop/${shopSlug}` : '/account/pro-shop';

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <PriorityTile
          icon="list"
          title="Mes annonces"
          subtitle={listingsSubtitle}
          subtitleLoading={countLoading && count == null && !countError}
          onPress={() => router.push('/account/listings')}
          accessibilityLabel="Mes annonces"
        />
        {hasShop && shopSlug ? (
          <ShopPriorityTile
            shopName={shopName}
            onOpenShop={() => router.push(shopRoute)}
            onShare={() => void handleShare()}
            sharing={sharing}
          />
        ) : (
          <PriorityTile
            icon="storefront"
            title="Créer ma boutique"
            onPress={() => router.push('/account/pro-shop')}
            accessibilityLabel="Créer ma boutique"
          />
        )}
      </View>
    </View>
  );
}

const tileShadow = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  android: { elevation: 1 },
  default: {},
});

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.screenHorizontal,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  tile: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...tileShadow,
  },
  tileBody: {
    flex: 1,
    minHeight: 64,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    alignItems: 'flex-start',
    gap: 2,
  },
  tilePressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  shopMain: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    alignItems: 'flex-start',
    gap: 2,
    minHeight: 56,
  },
  tileIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  tileSubtitle: {
    ...typography.xs,
    color: colors.textSecondary,
    alignSelf: 'stretch',
    maxWidth: '100%',
  },
  subtitleLoader: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  shareAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  shareActionPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  shareActionDisabled: {
    opacity: 0.7,
  },
  shareActionText: {
    ...typography.xs,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
});
