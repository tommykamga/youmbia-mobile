/**
 * ListingActions – sticky contact bar: Message (primary) + WhatsApp (secondary), then Favoris / Partager / Appeler.
 * Bar stays visible when scrolling. WhatsApp: wa.me/PHONE or wa.me/?text=…; phone CTA when seller.phone provided.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring
} from 'react-native-reanimated';
import { colors, spacing, radius, typography, fontWeights, shadows } from '@/theme';
import { getPublicListingUrl } from '@/lib/shareListing';
import { formatPrice } from '@/lib/format';
import type { ListingDetail } from '@/services/listings';

const HEART_SIZE = 20;
const SHARE_ICON_SIZE = 20;

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
};

const WHATSAPP_PREFIX = 'https://wa.me';

/** Normalize to digits only for wa.me. French: 0xxxxxxxxx → 33xxxxxxxxx; 9 digits → 33 + digits. */
function normalizePhoneForWhatsApp(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 9) return null;
  if (digits.length === 10 && digits.startsWith('0')) return '33' + digits.slice(1);
  if (digits.length === 9) return '33' + digits;
  if (digits.length >= 10) return digits;
  return null;
}

/** Normalized phone for tel: URI. Same as WhatsApp (international format). Returns null if invalid. */
function normalizePhoneForCall(raw: string | null | undefined): string | null {
  return normalizePhoneForWhatsApp(raw);
}

function buildWhatsAppMessage(title: string): string {
  return `Bonjour, je suis intéressé(e) par votre annonce : ${title}`;
}

export function ListingActions({
  listing,
  sellerPhone: sellerPhoneProp,
  safeBottom = 0,
  onMessagePress,
}: ListingActionsProps) {
  const [openingWhatsApp, setOpeningWhatsApp] = useState(false);

  const sellerPhone = sellerPhoneProp ?? listing.seller?.phone ?? null;
  const whatsappNumber = useMemo(() => normalizePhoneForWhatsApp(sellerPhone), [sellerPhone]);
  const sellerRestricted = listing.seller?.is_banned === true;
  const hasContact = !!listing.seller && !sellerRestricted;
  const canWhatsApp = hasContact && !!whatsappNumber;
  const canMessage = hasContact && !!onMessagePress;
  const publicListingUrl = useMemo(() => getPublicListingUrl(listing.id), [listing.id]);

  const messageScale = useSharedValue(1);
  const whatsappScale = useSharedValue(1);

  const whatsAppMessage = useMemo(() => {
    const title = String(listing.title ?? '').trim() || 'Annonce YOUMBIA';
    const price =
      typeof listing.price === 'number' && Number.isFinite(listing.price)
        ? formatPrice(listing.price)
        : null;
    const parts = [
      `Bonjour, je vous contacte au sujet de votre annonce YOUMBIA : ${title}.`,
      price ? `Prix : ${price}.` : null,
      publicListingUrl,
    ].filter(Boolean);
    return parts.join('\n');
  }, [listing.price, listing.title, publicListingUrl]);

  const handleWhatsApp = useCallback(async () => {
    if (openingWhatsApp || !whatsappNumber) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const encoded = encodeURIComponent(whatsAppMessage || buildWhatsAppMessage(listing.title ?? ''));
    const url = `${WHATSAPP_PREFIX}/${whatsappNumber}?text=${encoded}`;
    setOpeningWhatsApp(true);
    try {
      const supported = await Linking.canOpenURL(url).catch(() => false);
      if (!supported) {
        Alert.alert('WhatsApp indisponible', "Impossible d'ouvrir WhatsApp.");
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('WhatsApp indisponible', "Impossible d'ouvrir WhatsApp.");
    } finally {
      setOpeningWhatsApp(false);
    }
  }, [listing.title, openingWhatsApp, whatsAppMessage, whatsappNumber]);

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
