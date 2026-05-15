/**
 * Modal QR boutique — génération locale, carte partageable intégrée.
 */

import React, { memo, useMemo } from 'react';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '@/components';
import { ShopShareCard } from './ShopShareCard';
import { pickShopShareTagline } from '@/lib/shareShop';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

export type ShopQrModalProps = {
  visible: boolean;
  onClose: () => void;
  name: string;
  slug: string;
  logoUrl?: string | null;
  description?: string | null;
  city?: string | null;
  onShare?: () => void;
  sharing?: boolean;
};

function ShopQrModalInner({
  visible,
  onClose,
  name,
  slug,
  logoUrl,
  description,
  city,
  onShare,
  sharing = false,
}: ShopQrModalProps) {
  const tagline = useMemo(
    () => pickShopShareTagline({ description, city }),
    [description, city]
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>QR Code boutique</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            Affichez ou imprimez ce code en boutique — vos clients accèdent directement à votre page.
          </Text>

          {visible ? (
            <ShopShareCard
              name={name}
              slug={slug}
              logoUrl={logoUrl}
              tagline={tagline}
              showQr
            />
          ) : null}

          <View style={styles.actions}>
            {onShare ? (
              <Button
                onPress={onShare}
                loading={sharing}
                disabled={sharing}
                leftIcon={<Ionicons name="share-outline" size={18} color={colors.surface} />}
                style={styles.shareBtn}
              >
                Partager la boutique
              </Button>
            ) : null}
            <Button variant="ghost" onPress={onClose}>
              Fermer
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export const ShopQrModal = memo(ShopQrModalInner);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  sheet: {
    alignSelf: 'stretch',
    maxWidth: 400,
    backgroundColor: colors.background,
    borderRadius: radius['2xl'],
    padding: spacing.lg,
    gap: spacing.base,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    flex: 1,
  },
  subtitle: {
    ...typography.sm,
    color: colors.textMuted,
    lineHeight: 20,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  shareBtn: {
    alignSelf: 'stretch',
  },
});
