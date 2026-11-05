/**
 * ListingActions – barre fixe : Contacter le vendeur, puis les canaux réellement disponibles.
 * Le propriétaire ne se contacte pas lui-même (le parent passe isOwnListing).
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { colors, spacing, radius, typography, fontWeights, getShadowStyle } from '@/theme';
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
  /** Opens internal messaging thread (conversation). When provided, shows the primary CTA. */
  onMessagePress?: () => void;
  /** When true, shows auth hint copy (UI only). */
  showAuthHint?: boolean;
  /** Masked phone to display in auth hint (UI only). */
  maskedPhone?: string | null;
  /** Loading state for message CTA (UI only). */
  messageLoading?: boolean;
  /**
   * Si défini (ex. gate auth sur la fiche), remplace l’ouverture WhatsApp par défaut.
   */
  onWhatsAppPress?: () => void | Promise<void>;
  onCallPress?: () => void | Promise<void>;
  onSmsPress?: () => void | Promise<void>;
  /** Le propriétaire ne voit pas la barre de contact. */
  isOwnListing?: boolean;
  /** Hauteur réelle, safe area comprise, pour dégager le contenu. */
  onBarHeight?: (height: number) => void;
};

export function ListingActions({
  listing,
  sellerPhone: sellerPhoneProp,
  safeBottom = 0,
  onMessagePress,
  onWhatsAppPress,
  onCallPress,
  onSmsPress,
  showAuthHint = false,
  maskedPhone = null,
  messageLoading = false,
  isOwnListing = false,
  onBarHeight,
}: ListingActionsProps) {
  const [openingWhatsApp, setOpeningWhatsApp] = useState(false);
  const [whatsAppConfirmed, setWhatsAppConfirmed] = useState(false);

  const sellerPhone = sellerPhoneProp ?? listing.seller?.phone ?? null;
  const whatsappNumber = useMemo(() => normalizePhoneForWhatsApp(sellerPhone), [sellerPhone]);
  const sellerRestricted = listing.seller?.is_banned === true;
  const hasContact = !!listing.seller && !sellerRestricted;
  const canWhatsApp = hasContact && !!whatsappNumber;
  const canMessage = hasContact && !!onMessagePress;
  const canCall = hasContact && !!sellerPhone && !!onCallPress;
  const canSms = hasContact && !!sellerPhone && !!onSmsPress;
  void canCall;
  void canSms;

  const messageScale = useSharedValue(1);

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
      setWhatsAppConfirmed(true);
      setTimeout(() => setWhatsAppConfirmed(false), 1400);
    } finally {
      setOpeningWhatsApp(false);
    }
  }, [listing, onWhatsAppPress, openingWhatsApp, whatsappNumber]);

  const handleMessage = useCallback(() => {
    if (onMessagePress && !messageLoading) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onMessagePress();
    }
  }, [onMessagePress, messageLoading]);

  const messageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: messageScale.value }],
  }));

  const handlePressIn = () => {
    messageScale.value = withSpring(0.97, { damping: 10, stiffness: 300 });
  };

  const handlePressOut = () => {
    messageScale.value = withSpring(1, { damping: 10, stiffness: 300 });
  };

  const reportBarHeight = (height: number) => {
    onBarHeight?.(height);
  };

  if (isOwnListing) return null;

  if (!canMessage && !canWhatsApp) {
    return (
      <View
        style={[styles.footer, { paddingBottom: spacing.lg + safeBottom }]}
        onLayout={(event) => reportBarHeight(event.nativeEvent.layout.height)}
      >
        <View style={styles.unavailableWrap}>
          <Text style={styles.unavailableText}>
            {sellerRestricted ? 'Contact du vendeur indisponible' : 'Contact non disponible'}
          </Text>
        </View>
      </View>
    );
  }

  const whatsAppLabel = openingWhatsApp ? 'Ouverture…' : whatsAppConfirmed ? 'Ouvert' : 'WhatsApp';
  const messageLabel = messageLoading ? 'Ouverture…' : 'Envoyer un message';

  return (
    <View
      style={[styles.footer, { paddingBottom: spacing.base + safeBottom }]}
      onLayout={(event) => reportBarHeight(event.nativeEvent.layout.height)}
    >
      {showAuthHint ? (
        <View style={styles.authHint}>
          <View style={styles.authHintRow}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
            <Text style={styles.authHintText}>Connecte-toi pour contacter le vendeur</Text>
          </View>
          {maskedPhone ? (
            <Text style={styles.authHintPhone}>
              Numéro : {maskedPhone}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.dualRow}>
        {canWhatsApp ? (
          <Pressable
            onPress={() => { void handleWhatsApp(); }}
            disabled={openingWhatsApp}
            accessibilityRole="button"
            accessibilityLabel="Contacter sur WhatsApp"
            style={({ pressed }) => [
              styles.dualBtn,
              styles.dualBtnOutline,
              !canMessage && styles.dualBtnSolo,
              pressed && styles.btnPressed,
            ]}
          >
            {openingWhatsApp ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Ionicons name="logo-whatsapp" size={20} color={colors.primary} style={styles.btnIcon} />
            )}
            <Text style={styles.dualBtnTextOutline}>{whatsAppLabel}</Text>
          </Pressable>
        ) : null}
        {canMessage ? (
          <Animated.View style={[styles.dualBtnWrap, messageAnimatedStyle, !canWhatsApp && styles.dualBtnSolo]}>
            <Pressable
              onPress={handleMessage}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              style={({ pressed }) => [
                styles.dualBtn,
                styles.dualBtnPrimary,
                pressed && styles.btnPressed,
              ]}
              disabled={messageLoading}
              accessibilityRole="button"
              accessibilityLabel="Envoyer un message au vendeur"
            >
              {messageLoading ? (
                <ActivityIndicator color={colors.surface} style={styles.btnIcon} />
              ) : (
                <Ionicons name="chatbubble" size={20} color={colors.surface} style={styles.btnIcon} />
              )}
              <Text style={styles.dualBtnTextPrimary}>{messageLabel}</Text>
            </Pressable>
          </Animated.View>
        ) : null}
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
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    ...getShadowStyle('sticky'),
  },
  authHint: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surfaceSubtle,
    marginBottom: spacing.sm,
    gap: 4,
  },
  authHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  authHintText: {
    ...typography.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
    flexShrink: 1,
  },
  authHintPhone: {
    ...typography.xs,
    color: colors.textMuted,
    fontWeight: fontWeights.medium,
  },
  dualRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  dualBtnWrap: {
    flex: 1,
    minWidth: 0,
  },
  dualBtnSolo: {
    flex: 1,
    width: '100%',
  },
  dualBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dualBtnPrimary: {
    backgroundColor: colors.primary,
  },
  dualBtnOutline: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  dualBtnTextPrimary: {
    ...typography.base,
    flexShrink: 1,
    fontWeight: fontWeights.bold,
    color: colors.surface,
    textAlign: 'center',
  },
  dualBtnTextOutline: {
    ...typography.base,
    flexShrink: 1,
    fontWeight: fontWeights.bold,
    color: colors.primary,
    textAlign: 'center',
  },
  btnPressed: {
    opacity: 0.9,
  },
  btnIcon: {
    marginRight: spacing.sm,
  },
  unavailableWrap: {
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  unavailableText: {
    ...typography.sm,
    color: colors.textMuted,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
  },
});
