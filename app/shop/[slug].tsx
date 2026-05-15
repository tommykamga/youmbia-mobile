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
  Alert,
  useWindowDimensions,
  RefreshControl,
  Platform,
  Pressable,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, AppHeader, EmptyState, Button } from '@/components';
import { ListingCard } from '@/features/listings';
import { ProSellerBadge, ShopScreenSkeleton } from '@/features/shops';
import { getShopBySlug, getShopListings } from '@/services/shops';
import { shareShop } from '@/lib/shareShop';
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
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);

  const loadShop = useCallback(async (isRefresh = false) => {
    if (!slug?.trim()) {
      setState({ status: 'error', message: 'Boutique introuvable' });
      return;
    }
    if (!isRefresh) {
      setState({ status: 'loading' });
    }
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadShop(true);
    } finally {
      setRefreshing(false);
    }
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

  const handleShareShop = useCallback(async () => {
    if (state.status !== 'ready' || sharing) return;
    setSharing(true);
    try {
      const result = await shareShop({
        slug: state.shop.slug,
        name: state.shop.name,
        city: state.shop.city,
      });
      if (!result.success && result.error) {
        Alert.alert('Partage indisponible', result.error);
      }
    } finally {
      setSharing(false);
    }
  }, [sharing, state]);

  if (state.status === 'loading') {
    return (
      <Screen scroll={false}>
        <AppHeader title="Boutique" showBack density="compact" />
        <ShopScreenSkeleton />
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
      <AppHeader
        title={shop.name}
        showBack
        density="compact"
        right={
          <Pressable
            onPress={() => void handleShareShop()}
            disabled={sharing}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Partager la boutique"
          >
            <Ionicons name="share-outline" size={22} color={colors.text} />
          </Pressable>
        }
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.primary}
          />
        }
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
            <View style={styles.badgesRow}>
              <ProSellerBadge sellerType="pro" shop={shop} />
              {shop.is_featured ? (
                <View style={styles.featuredChip}>
                  <Ionicons name="star" size={12} color={colors.primary} />
                  <Text style={styles.featuredChipText}>À la une</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {shop.description?.trim() ? (
          <Text style={styles.description}>{shop.description.trim()}</Text>
        ) : null}

        {(hasWhatsApp || hasPhone) && (
          <View style={styles.contactCard}>
            <Text style={styles.contactTitle}>Contacter la boutique</Text>
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
          </View>
        )}

        <View style={styles.listingsHeader}>
          <Text style={styles.sectionTitle}>Annonces</Text>
          <Text style={styles.sectionCount}>
            {listings.length > 0 ? `${listings.length} active${listings.length > 1 ? 's' : ''}` : 'Aucune'}
          </Text>
        </View>

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
    height: 148,
    backgroundColor: colors.surfaceSubtle,
    overflow: 'hidden',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerFallback: {
    flex: 1,
    backgroundColor: 'rgba(22, 163, 74, 0.09)',
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.07)',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.base,
    paddingHorizontal: spacing.base,
    marginTop: -32,
  },
  logo: {
    width: 76,
    height: 76,
    borderRadius: radius.xl,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  logoFallback: {
    width: 76,
    height: 76,
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
    paddingTop: spacing.lg + 6,
    gap: 6,
  },
  shopName: {
    ...typography.xl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    letterSpacing: -0.3,
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
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  featuredChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.primary + '12',
    borderWidth: 1,
    borderColor: colors.primary + '33',
  },
  featuredChipText: {
    ...typography.xs,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
  description: {
    ...typography.base,
    color: colors.textSecondary,
    paddingHorizontal: spacing.base,
    marginTop: spacing.base,
    lineHeight: 22,
  },
  contactCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.base,
    padding: spacing.base,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  contactTitle: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  contactBtn: {
    flexGrow: 1,
    minWidth: 140,
  },
  listingsHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  sectionCount: {
    ...typography.sm,
    color: colors.textMuted,
    fontWeight: fontWeights.medium,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
  },
});
