/**
 * ListingActions – sticky contact bar: Message (primary) + WhatsApp (secondary), then Favoris / Partager / Appeler.
 * Bar stays visible when scrolling. WhatsApp: wa.me/PHONE or wa.me/?text=…; phone CTA when seller.phone provided.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '@/components';
import { colors, spacing, radius, typography, fontWeights } from '@/theme';
import { shareListing, getPublicListingUrl } from '@/lib/shareListing';
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
  sellerId: sellerIdProp,
  sellerName: sellerNameProp,
  sellerPhone: sellerPhoneProp,
  safeBottom = 0,
  isFavorite = false,
  onFavorisPress,
  onMessagePress,
}: ListingActionsProps) {
  const [sharing, setSharing] = useState(false);
  const [openingWhatsApp, setOpeningWhatsApp] = useState(false);

  const sellerId = sellerIdProp ?? listing.seller_id ?? '';
  const sellerName = sellerNameProp ?? listing.seller?.full_name ?? null;
  const sellerPhone = sellerPhoneProp ?? listing.seller?.phone ?? null;
  const whatsappNumber = useMemo(() => normalizePhoneForWhatsApp(sellerPhone), [sellerPhone]);
  const callNumber = useMemo(() => normalizePhoneForCall(sellerPhone), [sellerPhone]);
  const sellerRestricted = listing.seller?.is_banned === true;
  const hasContact = !!listing.seller && !sellerRestricted;
  const canWhatsApp = hasContact && !!whatsappNumber;
  const canCall = hasContact && !!callNumber;
  const canMessage = hasContact && !!onMessagePress;
  const publicListingUrl = useMemo(() => getPublicListingUrl(listing.id), [listing.id]);

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
    if (openingWhatsApp) return;
    if (!whatsappNumber) {
      Alert.alert('WhatsApp indisponible', 'Numero vendeur indisponible.');
      return;
    }

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

  const handleCall = useCallback(async () => {
    const num = callNumber;
    if (!num || num.length < 9) return;
    const telUrl = 'tel:+' + num;
    try {
      const canOpen = await Linking.canOpenURL(telUrl).catch(() => false);
      if (canOpen) {
        await Linking.openURL(telUrl);
      } else {
        Alert.alert('Appel indisponible', 'Impossible d\'ouvrir l\'application téléphone.');
      }
    } catch {
      Alert.alert('Appel indisponible', 'Impossible d\'ouvrir l\'application téléphone.');
    }
  }, [callNumber]);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    if (!listing?.id || listing.title == null) return;
    setSharing(true);
    try {
      const result = await shareListing({
        id: listing.id,
        title: String(listing.title),
        price: listing.price,
        city: listing.city ?? null,
      });
      if (!result.success && result.error) {
        Alert.alert('Partage indisponible', result.error || 'Impossible de partager cette annonce.');
      }
    } catch {
      Alert.alert('Partage indisponible', 'Impossible de partager cette annonce.');
    } finally {
      setSharing(false);
    }
  }, [listing?.city, listing?.id, listing?.price, listing?.title, sharing]);

  return (
    <View style={[styles.footer, { paddingBottom: spacing.xl + safeBottom }]}>
      {/* Sticky contact bar: Message (primary) + WhatsApp (secondary) */}
      <View style={styles.contactBar}>
        {canMessage ? (
          <Button
            variant="primary"
            size="md"
            style={styles.contactPrimary}
            onPress={onMessagePress}
          >
            Message
          </Button>
        ) : null}
        {canWhatsApp ? (
          <Button
            variant="secondary"
            size="md"
            style={styles.contactSecondary}
            onPress={handleWhatsApp}
            loading={openingWhatsApp}
            disabled={openingWhatsApp}
          >
            WhatsApp
          </Button>
        ) : !canMessage && !canWhatsApp ? (
          <View style={styles.unavailableWrap}>
            <Text style={styles.unavailableText} numberOfLines={1}>
              {sellerRestricted ? 'Contact du vendeur indisponible' : 'Contact non disponible'}
            </Text>
          </View>
        ) : null}
      </View>
      {/* Secondary actions */}
      <View style={styles.actionsRow}>
        <Pressable
          style={({ pressed }) => [styles.favButton, pressed && styles.pressed]}
          onPress={onFavorisPress}
        >
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={HEART_SIZE}
            color={isFavorite ? colors.error : colors.text}
            style={styles.favIcon}
          />
          <Text style={styles.favLabel} numberOfLines={1}>Favoris</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.shareButton,
            (pressed && !sharing) && styles.pressed,
            sharing && styles.shareButtonDisabled,
          ]}
          onPress={handleShare}
          disabled={sharing}
        >
          <Ionicons
            name="share-outline"
            size={SHARE_ICON_SIZE}
            color={colors.textSecondary}
            style={styles.favIcon}
          />
          <Text style={styles.shareLabel} numberOfLines={1}>Partager</Text>
        </Pressable>
        {canCall ? (
          <Pressable
            style={({ pressed }) => [styles.phoneButton, pressed && styles.pressed]}
            onPress={handleCall}
          >
            <Ionicons name="call-outline" size={SHARE_ICON_SIZE} color={colors.textSecondary} />
            <Text style={styles.phoneLabel} numberOfLines={1}>Appeler</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'column',
    gap: spacing.lg,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    overflow: 'hidden',
  },
  contactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
  },
  contactPrimary: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
  },
  contactSecondary: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    overflow: 'hidden',
  },
  favButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 48,
    flexShrink: 0,
  },
  pressed: {
    opacity: 0.9,
  },
  favIcon: {},
  favLabel: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 48,
    flexShrink: 0,
  },
  shareButtonDisabled: {
    opacity: 0.55,
  },
  shareLabel: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
  },
  phoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 48,
    flexShrink: 0,
  },
  phoneLabel: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
  },
  unavailableWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 48,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    opacity: 0.9,
  },
  unavailableText: {
    ...typography.sm,
    color: colors.textMuted,
    fontWeight: fontWeights.medium,
  },
});
