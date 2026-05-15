/**
 * Carte boutique partageable (capture écran) — logo, nom, badge Pro, QR, mention YOUMBIA.
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet, Image, Platform } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ProSellerBadge } from './ProSellerBadge';
import { getShopInitials } from '@/lib/shopSeller';
import { getPublicShopUrl } from '@/lib/shareShop';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

export type ShopShareCardProps = {
  name: string;
  slug: string;
  logoUrl?: string | null;
  tagline?: string | null;
  showQr?: boolean;
  qrSize?: number;
};

function ShopShareCardInner({
  name,
  slug,
  logoUrl,
  tagline,
  showQr = true,
  qrSize = 112,
}: ShopShareCardProps) {
  const url = getPublicShopUrl(slug);
  const initials = getShopInitials(name);
  const safeTagline = tagline?.trim() || null;

  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.brandRow}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.logo} resizeMode="cover" />
        ) : (
          <View style={styles.logoFallback}>
            <Text style={styles.logoInitials}>{initials}</Text>
          </View>
        )}
        <View style={styles.titleBlock}>
          <Text style={styles.shopName} numberOfLines={2}>
            {name}
          </Text>
          {safeTagline ? (
            <Text style={styles.tagline} numberOfLines={2}>
              {safeTagline}
            </Text>
          ) : null}
          <ProSellerBadge sellerType="pro" compact />
        </View>
      </View>

      {showQr && url ? (
        <View style={styles.qrWrap}>
          <View style={styles.qrFrame}>
            <QRCode value={url} size={qrSize} color={colors.text} backgroundColor={colors.surface} />
          </View>
          <Text style={styles.qrHint} numberOfLines={1}>
            Scannez pour ouvrir la boutique
          </Text>
        </View>
      ) : null}

      {url ? (
        <Text style={styles.url} numberOfLines={1} selectable>
          {url.replace(/^https:\/\//, '')}
        </Text>
      ) : null}

      <Text style={styles.footer}>YOUMBIA</Text>
    </View>
  );
}

export const ShopShareCard = memo(ShopShareCardInner);

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    gap: spacing.base,
    alignItems: 'center',
    maxWidth: 340,
    width: '100%',
    alignSelf: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.base,
    alignSelf: 'stretch',
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
  },
  logoFallback: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInitials: {
    ...typography.base,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  shopName: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    letterSpacing: -0.2,
  },
  tagline: {
    ...typography.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  qrWrap: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  qrFrame: {
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  qrHint: {
    ...typography.xs,
    color: colors.textMuted,
    fontWeight: fontWeights.medium,
  },
  url: {
    ...typography.xs,
    color: colors.primary,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  footer: {
    ...typography.xs,
    color: colors.textMuted,
    letterSpacing: 1.2,
    fontWeight: fontWeights.semibold,
    marginTop: spacing.xs,
  },
});
