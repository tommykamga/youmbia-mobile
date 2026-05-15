/**
 * Boutique publique vendeur pro — `/shop/[slug]`
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, AppHeader, Loader, EmptyState, Button } from '@/components';
import { ListingCard } from '@/features/listings';
import { ProSellerBadge } from '@/features/shops/ProSellerBadge';
import { getShopBySlug, getShopListings } from '@/services/shops';
import { normalizePhoneForWhatsApp, openSellerPhoneCallRaw } from '@/lib/sellerContact';
import { getShopInitials } from '@/lib/shopSeller';
import type { PublicShop } from '@/types/shops';
import type { PublicListing } from '@/services/listings';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

type ShopScreenState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; shop: PublicShop; listings: PublicListing[] };

export default function ShopScreen() {
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = useMemo(() => {
    const horizontalPadding = spacing.base * 2;
    const gap = spacing.sm;
    return Math.floor((screenWidth - horizontalPadding - gap) / 2);
  }, [screenWidth]);
  const [state, setState] = useState<ShopScreenState>({ status: 'loading' });

  const loadShop = useCallback(async () => {
    if (!slug?.trim()) {
      setState({ status: 'error', message: 'Boutique introuvable' });
      return;
    }
    setState({ status: 'loading' });
    const shopResult = await getShopBySlug(slug);
    if (shopResult.error || !shopResult.data) {
      setState({
        status: 'error',
        message: shopResult.error?.message ?? 'Boutique introuvable',
      });
      return;
    }
    const listingsResult = await getShopListings(shopResult.data.id);
    if (listingsResult.error) {
      setState({ status: 'error', message: listingsResult.error.message });
      return;
    }
    setState({
      status: 'ready',
      shop: shopResult.data,
      listings: listingsResult.data ?? [],
    });
  }, [slug]);

  useEffect(() => {
    void loadShop();
  }, [loadShop]);

  const handleWhatsApp = useCallback(async () => {
    if (state.status !== 'ready') return;
    const phone =
      normalizePhoneForWhatsApp(state.shop.whatsapp_phone) ??
      normalizePhoneForWhatsApp(state.shop.phone);
    if (!phone) {
      return;
    }
    const text = encodeURIComponent(`Bonjour, je vous contacte via votre boutique YOUMBIA : ${state.shop.name}.`);
    const url = `https://wa.me/${phone}?text=${text}`;
    try {
      await Linking.openURL(url);
    } catch {
      // silencieux
    }
  }, [state]);

  const handleCall = useCallback(async () => {
    if (state.status !== 'ready' || !state.shop.phone) return;
    await openSellerPhoneCallRaw(state.shop.phone);
  }, [state]);

  if (state.status === 'loading') {
    return (
      <Screen>
        <AppHeader title="Boutique" showBack />
        <Loader />
      </Screen>
    );
  }

  if (state.status === 'error') {
    return (
      <Screen>
        <AppHeader title="Boutique" showBack />
        <EmptyState title="Boutique indisponible" message={state.message} />
      </Screen>
    );
  }

  const { shop, listings } = state;
  const initials = getShopInitials(shop.name);
  const hasWhatsApp =
    normalizePhoneForWhatsApp(shop.whatsapp_phone) != null ||
    normalizePhoneForWhatsApp(shop.phone) != null;
  const hasPhone = !!shop.phone?.trim();

  return (
    <Screen scroll={false}>
      <AppHeader title={shop.name} showBack density="compact" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.banner}>
          {shop.banner_url ? (
            <Image source={{ uri: shop.banner_url }} style={styles.bannerImage} resizeMode="cover" />
          ) : (
            <View style={styles.bannerFallback} />
          )}
          <View style={styles.bannerOverlay} />
        </View>

        <View style={styles.profileRow}>
          {shop.logo_url ? (
            <Image source={{ uri: shop.logo_url }} style={styles.logo} />
          ) : (
            <View style={styles.logoFallback}>
              <Text style={styles.logoInitials}>{initials}</Text>
            </View>
          )}
          <View style={styles.profileText}>
            <Text style={styles.shopName}>{shop.name}</Text>
            {shop.city?.trim() ? (
              <View style={styles.cityRow}>
                <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                <Text style={styles.cityText}>{shop.city.trim()}</Text>
              </View>
            ) : null}
            <ProSellerBadge sellerType="pro" shop={shop} />
          </View>
        </View>

        {shop.description?.trim() ? (
          <Text style={styles.description}>{shop.description.trim()}</Text>
        ) : null}

        {(hasWhatsApp || hasPhone) && (
          <View style={styles.contactRow}>
            {hasWhatsApp ? (
              <Button
                size="md"
                onPress={() => void handleWhatsApp()}
                leftIcon={<Ionicons name="logo-whatsapp" size={18} color={colors.surface} />}
                style={styles.contactBtn}
              >
                WhatsApp
              </Button>
            ) : null}
            {hasPhone ? (
              <Button
                variant="outline"
                size="md"
                onPress={() => void handleCall()}
                leftIcon={<Ionicons name="call-outline" size={18} color={colors.primary} />}
                style={styles.contactBtn}
              >
                Appeler
              </Button>
            ) : null}
          </View>
        )}

        <Text style={styles.sectionTitle}>
          Annonces{listings.length > 0 ? ` (${listings.length})` : ''}
        </Text>

        {listings.length === 0 ? (
          <EmptyState
            variant="plain"
            title="Aucune annonce active"
            message="Cette boutique n’a pas d’annonce publiée pour le moment."
          />
        ) : (
          <View style={styles.grid}>
            {listings.map((listing) => (
              <View key={listing.id} style={{ width: cardWidth }}>
                <ListingCard
                  listing={listing}
                  variant="feed"
                  feedPresentation="standard"
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing['3xl'],
  },
  banner: {
    height: 140,
    backgroundColor: colors.surfaceSubtle,
    overflow: 'hidden',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerFallback: {
    flex: 1,
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.base,
    paddingHorizontal: spacing.base,
    marginTop: -28,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
  },
  logoFallback: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInitials: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  profileText: {
    flex: 1,
    paddingTop: spacing.lg + 4,
    gap: 4,
  },
  shopName: {
    ...typography.xl,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cityText: {
    ...typography.sm,
    color: colors.textMuted,
  },
  description: {
    ...typography.base,
    color: colors.textSecondary,
    paddingHorizontal: spacing.base,
    marginTop: spacing.base,
    lineHeight: 22,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    marginTop: spacing.base,
  },
  contactBtn: {
    flexGrow: 1,
    minWidth: 140,
  },
  sectionTitle: {
    ...typography.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    paddingHorizontal: spacing.base,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
  },
});
