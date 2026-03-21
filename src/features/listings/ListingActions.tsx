/**
 * ListingActions – sticky contact bar: Message (primary) + WhatsApp (secondary), then Favoris / Partager / Appeler.
 * Bar stays visible when scrolling. WhatsApp: wa.me/PHONE or wa.me/?text=…; phone CTA when seller.phone provided.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring
} from 'react-native-reanimated';
import { colors, spacing, radius, typography, fontWeights, shadows } from '@/theme';
import { normalizePhoneForWhatsApp, openWhatsAppForListing } from '@/lib/sellerContact';
import type { ListingDetail } from '@/services/listings';

type ListingActionsProps = {
  listing: ListingDetail;
  /** Seller id (listing.seller_id). Exposed for future messagerie. */
  sellerId?: string;
  /** Seller display name (listing.seller?.full_name). */
  sellerName?: string | null;
  /** Seller phone if available (listing.seller?.phone). */
  sellerPhone?: string | null;
  safeBottom?: number;
  isFavorite?: boolean;
  onFavorisPress?: () => void;
  /** Opens internal messaging thread (conversation). When provided, shows "Message" CTA. */
  onMessagePress?: () => void;
  /**
   * Si défini (ex. gate auth sur la fiche), remplace l’ouverture WhatsApp par défaut.
   */
  onWhatsAppPress?: () => void | Promise<void>;
};

export function ListingActions({
  listing,
  sellerPhone: sellerPhoneProp,
  safeBottom = 0,
  onMessagePress,
  onWhatsAppPress,
}: ListingActionsProps) {
  const [openingWhatsApp, setOpeningWhatsApp] = useState(false);

  const sellerPhone = sellerPhoneProp ?? listing.seller?.phone ?? null;
  const whatsappNumber = useMemo(() => normalizePhoneForWhatsApp(sellerPhone), [sellerPhone]);
  const sellerRestricted = listing.seller?.is_banned === true;
  const hasContact = !!listing.seller && !sellerRestricted;
  const canWhatsApp = hasContact && !!whatsappNumber;
  const canMessage = hasContact && !!onMessagePress;

  const messageScale = useSharedValue(1);
  const whatsappScale = useSharedValue(1);

  const handleWhatsApp = useCallback(async () => {
    if (openingWhatsApp) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (onWhatsAppPress) {
      await onWhatsAppPress();
      return;
    }

    if (!whatsappNumber) return;
    setOpeningWhatsApp(true);
    try {
      await openWhatsAppForListing(listing);
    } finally {
      setOpeningWhatsApp(false);
    }
  }, [listing, onWhatsAppPress, openingWhatsApp, whatsappNumber]);

  const handleMessage = useCallback(() => {
    if (onMessagePress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onMessagePress();
    }
  }, [onMessagePress]);

  const messageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: messageScale.value }],
  }));

  const whatsappAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: whatsappScale.value }],
  }));

  const handlePressIn = (scale: any) => {
    scale.value = withSpring(0.97, { damping: 10, stiffness: 300 });
  };

  const handlePressOut = (scale: any) => {
    scale.value = withSpring(1, { damping: 10, stiffness: 300 });
  };

  if (!canMessage && !canWhatsApp) {
    return (
      <View style={[styles.footer, { paddingBottom: spacing.lg + safeBottom }]}>
        <View style={styles.unavailableWrap}>
          <Text style={styles.unavailableText}>
            {sellerRestricted ? 'Contact du vendeur indisponible' : 'Contact non disponible'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.footer, { paddingBottom: spacing.base + safeBottom }]}>
      <View style={styles.container}>
        {canMessage && (
          <Animated.View style={[styles.flex, messageAnimatedStyle]}>
            <Pressable
              onPress={handleMessage}
              onPressIn={() => handlePressIn(messageScale)}
              onPressOut={() => handlePressOut(messageScale)}
              style={({ pressed }) => [
                styles.btn,
                styles.btnPrimary,
                pressed && styles.btnPressed
              ]}
            >
              <Ionicons name="chatbubble" size={20} color={colors.surface} style={styles.btnIcon} />
              <Text style={styles.btnTextPrimary}>Message</Text>
            </Pressable>
          </Animated.View>
        )}

        {canWhatsApp && (
          <Animated.View style={[styles.flex, whatsappAnimatedStyle]}>
            <Pressable
              onPress={handleWhatsApp}
              onPressIn={() => handlePressIn(whatsappScale)}
              onPressOut={() => handlePressOut(whatsappScale)}
              style={({ pressed }) => [
                styles.btn,
                styles.btnSecondary,
                pressed && styles.btnPressed
              ]}
              disabled={openingWhatsApp}
            >
              <Ionicons name="logo-whatsapp" size={20} color={colors.primary} style={styles.btnIcon} />
              <Text style={styles.btnTextSecondary}>WhatsApp</Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    ...shadows.soft,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
  },
  btnPrimary: {
    backgroundColor: colors.primary,
  },
  btnSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  btnPressed: {
    opacity: 0.9,
  },
  btnIcon: {
    marginRight: spacing.sm,
  },
  btnTextPrimary: {
    ...typography.base,
    fontWeight: fontWeights.bold,
    color: colors.surface,
  },
  btnTextSecondary: {
    ...typography.base,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  unavailableWrap: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  unavailableText: {
    ...typography.sm,
    color: colors.textMuted,
    fontWeight: fontWeights.medium,
  },
});
