import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useProSellerActivation } from '@/features/shops/useProSellerActivation';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

type PriorityTileProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
};

function PriorityTile({ icon, label, onPress, accessibilityLabel }: PriorityTileProps) {
  return (
    <View style={styles.tile}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.tileSingle, pressed && styles.tilePressed]}
      >
        <View style={styles.tileIconWrap}>
          <Ionicons name={icon} size={22} color={colors.primary} />
        </View>
        <Text style={styles.tileLabel} numberOfLines={2}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
};

type ShopTileProps = {
  shopLabel: string;
  shopName: string | null;
  onOpenShop: () => void;
  onShare: () => void;
  sharing: boolean;
};

function ShopPriorityTile({
  shopLabel,
  shopName,
  onOpenShop,
  onShare,
  sharing,
}: ShopTileProps) {
  return (
    <View style={[styles.tile, styles.tileShop]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={shopLabel}
        onPress={onOpenShop}
        style={({ pressed }) => [styles.shopMain, pressed && styles.tilePressed]}
      >
        <View style={styles.tileIconWrap}>
          <Ionicons name="storefront" size={22} color={colors.primary} />
        </View>
        <Text style={styles.tileLabel} numberOfLines={2}>
          {shopLabel}
        </Text>
        {shopName ? (
          <Text style={styles.tileSubtitle} numberOfLines={1}>
            {shopName}
          </Text>
        ) : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Partager"
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

  if (loading) {
    return null;
  }

  const shopLabel = hasShop ? 'Ma boutique' : 'Créer ma boutique';
  const shopRoute =
    hasShop && shopSlug ? `/shop/${shopSlug}` : '/account/pro-shop';

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <PriorityTile
          icon="list"
          label="Mes annonces"
          onPress={() => router.push('/account/listings')}
          accessibilityLabel="Mes annonces"
        />
        {hasShop && shopSlug ? (
          <ShopPriorityTile
            shopLabel={shopLabel}
            shopName={shopName}
            onOpenShop={() => router.push(shopRoute)}
            onShare={() => void handleShare()}
            sharing={sharing}
          />
        ) : (
          <PriorityTile
            icon="storefront"
            label={shopLabel}
            onPress={() => router.push('/account/pro-shop')}
            accessibilityLabel={shopLabel}
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
    marginHorizontal: spacing.screenHorizontal,
    marginBottom: spacing.sm,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
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
  tileSingle: {
    flex: 1,
    minHeight: 72,
    padding: spacing.sm,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 4,
  },
  tileShop: {
    flex: 1,
  },
  tilePressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  shopMain: {
    flex: 1,
    padding: spacing.sm,
    paddingBottom: spacing.xs,
    alignItems: 'flex-start',
    gap: 4,
    minHeight: 48,
  },
  tileIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
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
  shareAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 48,
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
