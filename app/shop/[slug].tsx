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
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, AppHeader, EmptyState, Button } from '@/components';
import { ListingCard } from '@/features/listings';
import {
  ProSellerBadge,
  ShopScreenSkeleton,
  ShopQrModal,
  ShopPromoActions,
  SellerAcquisitionTips,
} from '@/features/shops';
import { MarketplaceTrustTips, NewShopBadge } from '@/features/trust';
import { getShopBySlug, getShopListings } from '@/services/shops';
import { reportShop } from '@/services/reports';
import { getSession } from '@/services/auth';
import { getSellerStats } from '@/services/users';
import { shareShop, shareShopViaWhatsApp, pickShopShareTagline } from '@/lib/shareShop';
import { resolveShopVisibilityFlags } from '@/lib/shopAcquisition';
import { normalizePhoneForWhatsApp, openSellerPhoneCallRaw } from '@/lib/sellerContact';
import { getShopInitials } from '@/lib/shopSeller';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import { formatJoinDate } from '@/lib/format';
import { REPORT_OWN_CONTENT_MESSAGE } from '@/constants/reportMessages';
import { MARKETPLACE_REPORT_REASONS } from '@/constants/reportReasons';
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
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = useMemo(() => {
    const horizontalPadding = spacing.base * 2;
    const gap = spacing.sm;
    return Math.floor((screenWidth - horizontalPadding - gap) / 2);
  }, [screenWidth]);
  const [state, setState] = useState<ShopScreenState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [ownerMemberSince, setOwnerMemberSince] = useState<string | null>(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportedShopId, setReportedShopId] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

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
    const shop = shopResult.data;
    const statsResult = await getSellerStats(shop.owner_id);
    setOwnerMemberSince(statsResult.error ? null : statsResult.data.memberSince);
    setState({
      status: 'ready',
      shop,
      listings: listingsResult.data ?? [],
    });
  }, [slug]);

  useEffect(() => {
    void loadShop();
  }, [loadShop]);

  useEffect(() => {
    let active = true;
    getSession()
      .then((s) => {
        if (!active) return;
        setSessionUserId(s?.user?.id ?? null);
      })
      .catch(() => {
        if (!active) return;
        setSessionUserId(null);
      });
    return () => {
      active = false;
    };
  }, []);

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
    const { shop } = state;
    setSharing(true);
    try {
      const result = await shareShop({
        slug: shop.slug,
        name: shop.name,
        city: shop.city,
        tagline: pickShopShareTagline({ description: shop.description, city: shop.city }),
      });
      if (!result.success && result.error) {
        Alert.alert('Partage indisponible', result.error);
      }
    } finally {
      setSharing(false);
    }
  }, [sharing, state]);

  const handleShareShopWhatsApp = useCallback(async () => {
    if (state.status !== 'ready') return;
    const { shop } = state;
    const ok = await shareShopViaWhatsApp({
      slug: shop.slug,
      name: shop.name,
      city: shop.city,
      tagline: pickShopShareTagline({ description: shop.description, city: shop.city }),
    });
    if (!ok) {
      Alert.alert('WhatsApp indisponible', 'Impossible d’ouvrir WhatsApp sur cet appareil.');
    }
  }, [state]);

  const handleReportPress = useCallback(async () => {
    if (state.status !== 'ready') return;
    const shop = state.shop;
    const session = await getSession();
    if (!session?.user) {
      router.replace(buildAuthGateHref('account', { redirect: `/shop/${shop.slug}` }));
      return;
    }
    if (shop.owner_id === session.user.id) {
      Alert.alert('Action impossible', REPORT_OWN_CONTENT_MESSAGE);
      return;
    }
    if (reportedShopId === shop.id) {
      Alert.alert('Déjà signalé', 'Vous avez déjà signalé cette boutique.');
      return;
    }
    setReportReason(null);
    setReportModalVisible(true);
  }, [router, reportedShopId, state]);

  const handleReportSubmit = useCallback(() => {
    if (state.status !== 'ready' || !reportReason?.trim()) return;
    const shop = state.shop;
    Alert.alert(
      'Confirmer le signalement',
      'Votre signalement sera envoyé pour modération.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Envoyer',
          onPress: async () => {
            setReportLoading(true);
            const result = await reportShop(shop.id, reportReason.trim(), {
              ownerId: shop.owner_id,
            });
            setReportLoading(false);
            if (result.error) {
              Alert.alert('Erreur', result.error.message);
              return;
            }
            setReportModalVisible(false);
            setReportedShopId(shop.id);
            Alert.alert('Merci', 'Votre signalement a bien été envoyé.');
          },
        },
      ]
    );
  }, [reportReason, state]);

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
  const isOwnShop = sessionUserId != null && shop.owner_id === sessionUserId;
  const visibility = resolveShopVisibilityFlags(shop);
  const initials = getShopInitials(shop.name);
  const ownerJoinDate = formatJoinDate(ownerMemberSince);
  const activeListingsCount = listings.length;
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
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => setQrModalVisible(true)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="QR Code boutique"
            >
              <Ionicons name="qr-code-outline" size={22} color={colors.text} />
            </Pressable>
            <Pressable
              onPress={() => void handleShareShop()}
              disabled={sharing}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Partager la boutique"
            >
              <Ionicons name="share-outline" size={22} color={colors.text} />
            </Pressable>
          </View>
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
              <NewShopBadge createdAt={shop.created_at} />
              {visibility.isFeatured ? (
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

        {isOwnShop ? (
          <>
            <ShopPromoActions
              slug={shop.slug}
              onShare={() => void handleShareShop()}
              onWhatsApp={() => void handleShareShopWhatsApp()}
              onQr={() => setQrModalVisible(true)}
              sharing={sharing}
              showWhatsApp
            />
            <View style={styles.ownerTipsWrap}>
              <SellerAcquisitionTips compact />
            </View>
          </>
        ) : null}

        {(ownerJoinDate || activeListingsCount > 0) && (
          <View style={styles.trustMeta}>
            {ownerJoinDate ? (
              <Text style={styles.trustMetaText}>Membre depuis {ownerJoinDate}</Text>
            ) : null}
            {activeListingsCount > 0 ? (
              <Text style={styles.trustMetaText}>
                {activeListingsCount}{' '}
                {activeListingsCount > 1 ? 'annonces actives' : 'annonce active'}
              </Text>
            ) : null}
          </View>
        )}

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
            title={isOwnShop ? 'Publiez vos premiers produits' : 'Aucune annonce active'}
            message={
              isOwnShop
                ? 'Partagez votre boutique avec vos clients, puis publiez vos produits en quelques secondes depuis Mes annonces.'
                : 'Cette boutique n’a pas d’annonce publiée pour le moment.'
            }
            action={
              isOwnShop ? (
                <Button onPress={() => router.push('/sell')} style={styles.emptyCta}>
                  Publier une annonce
                </Button>
              ) : undefined
            }
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

        <View style={styles.trustSection}>
          <MarketplaceTrustTips />
          {!isOwnShop ? (
            <Pressable
              onPress={() => void handleReportPress()}
              style={({ pressed }) => [styles.reportLink, pressed && styles.reportLinkPressed]}
            >
              <Text style={styles.reportLinkText}>Signaler cette boutique</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      <ShopQrModal
        visible={qrModalVisible}
        onClose={() => setQrModalVisible(false)}
        name={shop.name}
        slug={shop.slug}
        logoUrl={shop.logo_url}
        description={shop.description}
        city={shop.city}
        onShare={() => void handleShareShop()}
        sharing={sharing}
      />

      <Modal
        visible={reportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !reportLoading && setReportModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !reportLoading && setReportModalVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Signaler cette boutique</Text>
            <Text style={styles.modalSubtitle}>Choisissez un motif</Text>
            {MARKETPLACE_REPORT_REASONS.map((label) => (
              <Pressable
                key={label}
                style={({ pressed }) => [
                  styles.reasonOption,
                  reportReason === label && styles.reasonOptionSelected,
                  pressed && styles.reasonOptionPressed,
                ]}
                onPress={() => setReportReason(reportReason === label ? null : label)}
              >
                <Text
                  style={[
                    styles.reasonOptionText,
                    reportReason === label && styles.reasonOptionTextSelected,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
            <View style={styles.modalActions}>
              <Button
                variant="ghost"
                onPress={() => !reportLoading && setReportModalVisible(false)}
                disabled={reportLoading}
              >
                Annuler
              </Button>
              <Button
                onPress={handleReportSubmit}
                loading={reportLoading}
                disabled={reportLoading || !reportReason?.trim()}
              >
                Envoyer le signalement
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ownerTipsWrap: {
    paddingHorizontal: spacing.base,
  },
  emptyCta: {
    minWidth: 200,
  },
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
  trustMeta: {
    paddingHorizontal: spacing.base,
    marginTop: spacing.sm,
    gap: 4,
  },
  trustMetaText: {
    ...typography.sm,
    color: colors.textMuted,
  },
  trustSection: {
    paddingHorizontal: spacing.base,
    marginTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  reportLink: {
    alignSelf: 'flex-start',
    marginTop: spacing.base,
    paddingVertical: spacing.sm,
  },
  reportLinkPressed: {
    opacity: 0.7,
  },
  reportLinkText: {
    ...typography.sm,
    color: colors.textMuted,
    fontWeight: fontWeights.medium,
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    alignSelf: 'stretch',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    ...typography.sm,
    color: colors.textMuted,
    marginBottom: spacing.base,
  },
  reasonOption: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.lg,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  reasonOptionPressed: {
    opacity: 0.9,
  },
  reasonOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '18',
  },
  reasonOptionText: {
    ...typography.base,
    color: colors.text,
  },
  reasonOptionTextSelected: {
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
});
