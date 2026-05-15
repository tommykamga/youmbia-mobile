/**
 * Actions visibilité boutique — partage, WhatsApp, QR, lien public.
 */

import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { getPublicShopUrl } from '@/lib/shareShop';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

type ShopPromoActionsProps = {
  slug: string;
  onShare: () => void;
  onWhatsApp: () => void;
  onQr: () => void;
  sharing?: boolean;
  showWhatsApp?: boolean;
  style?: StyleProp<ViewStyle>;
};

function ShopPromoActionsInner({
  slug,
  onShare,
  onWhatsApp,
  onQr,
  sharing = false,
  showWhatsApp = true,
  style,
}: ShopPromoActionsProps) {
  const publicUrl = getPublicShopUrl(slug);
  const displayUrl = publicUrl?.replace(/^https:\/\//, '') ?? '';

  const handleCopyUrl = useCallback(async () => {
    if (!publicUrl) return;
    try {
      await Clipboard.setStringAsync(publicUrl);
      Alert.alert('Lien copié', 'L’adresse de votre boutique est dans le presse-papiers.');
    } catch {
      Alert.alert('Copie impossible', 'Réessayez ou partagez via le bouton Partager.');
    }
  }, [publicUrl]);

  return (
    <View style={[styles.wrap, style]}>
      {displayUrl ? (
        <Pressable
          onPress={() => void handleCopyUrl()}
          style={({ pressed }) => [styles.urlRow, pressed && styles.urlRowPressed]}
          accessibilityRole="button"
          accessibilityLabel="Copier le lien de la boutique"
        >
          <Ionicons name="link-outline" size={16} color={colors.primary} />
          <Text style={styles.urlText} numberOfLines={1}>
            {displayUrl}
          </Text>
          <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}

      <View style={styles.actionsRow}>
        <Pressable
          onPress={onShare}
          disabled={sharing}
          style={({ pressed }) => [styles.actionChip, pressed && styles.actionChipPressed]}
          accessibilityRole="button"
          accessibilityLabel="Partager la boutique"
        >
          <Ionicons name="share-outline" size={18} color={colors.primary} />
          <Text style={styles.actionLabel}>Partager</Text>
        </Pressable>

        {showWhatsApp ? (
          <Pressable
            onPress={onWhatsApp}
            style={({ pressed }) => [styles.actionChip, pressed && styles.actionChipPressed]}
            accessibilityRole="button"
            accessibilityLabel="Partager sur WhatsApp"
          >
            <Ionicons name="logo-whatsapp" size={18} color={colors.primary} />
            <Text style={styles.actionLabel}>WhatsApp</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={onQr}
          style={({ pressed }) => [styles.actionChip, pressed && styles.actionChipPressed]}
          accessibilityRole="button"
          accessibilityLabel="Afficher le QR code"
        >
          <Ionicons name="qr-code-outline" size={18} color={colors.primary} />
          <Text style={styles.actionLabel}>QR Code</Text>
        </Pressable>
      </View>
    </View>
  );
}

export const ShopPromoActions = memo(ShopPromoActionsInner);

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.base,
    marginTop: spacing.base,
    padding: spacing.base,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
  },
  urlRowPressed: {
    opacity: 0.88,
  },
  urlText: {
    ...typography.sm,
    color: colors.primary,
    fontWeight: fontWeights.medium,
    flex: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.background,
  },
  actionChipPressed: {
    opacity: 0.9,
  },
  actionLabel: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
});
