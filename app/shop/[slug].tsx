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
import { LinearGradient } from 'expo-linear-gradient';
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
import { getShopBySlug, getShopBySlugAnyStatus, getShopListings, updateShopStatus } from '@/services/shops';
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

/** Grille de contenu unique — référence : carte Annonces (~92 % écran, max 440). */
const CONTENT_HORIZONTAL_PADDING = spacing.base;
const CONTENT_MAX_WIDTH = 440;
const CONTENT_WIDTH_RATIO = 0.92;
/** Marge interne pour éviter le clipping des ombres carte. */
const SHOP_LISTING_CARD_SHADOW_INSET = 4;

export default function ShopScreen() {
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [state, setState] = useState<ShopScreenState>({ status: 'loading' });
  const shopContentLayout = useMemo(() => {
    const alignedMax = screenWidth - CONTENT_HORIZONTAL_PADDING * 2;
    const ratioWidth = Math.floor(screenWidth * CONTENT_WIDTH_RATIO);
    const contentWidth = Math.min(ratioWidth, alignedMax, CONTENT_MAX_WIDTH);
    return { contentWidth };
  }, [screenWidth]);
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
    const session = await getSession().catch(() => null);
    const currentUserId = session?.user?.id ?? null;
    setSessionUserId(currentUserId);

    // 1) Lecture publique (active uniquement) – rapide, cache-friendly
    const shopResult = await getShopBySlug(slug);
    // 2) Si non trouvé et connecté: tenter lecture owner (hidden/suspended)
    const shouldTryOwnerFallback = !shopResult.data && currentUserId != null;
    const ownerFallbackResult = shouldTryOwnerFallback ? await getShopBySlugAnyStatus(slug) : null;

    const resolvedShop = (shopResult.data ?? ownerFallbackResult?.data) as PublicShop | null;
    if (!resolvedShop) {
      setState({
        status: 'error',
        message: shopResult.error?.message ?? ownerFallbackResult?.error?.message ?? 'Boutique introuvable',
      });
      return;
    }

    const isOwn = currentUserId != null && resolvedShop.owner_id === currentUserId;
    const shopStatus = (resolvedShop.status ?? 'active') as string;
    if (!isOwn && (shopStatus === 'hidden' || shopStatus === 'suspended')) {
      setState({
        status: 'error',
        message: 'Cette boutique n’est pas disponible pour le moment.',
      });
      return;
    }

    const listingsResult = await getShopListings(resolvedShop.id);
    if (listingsResult.error) {
      setState({ status: 'error', message: listingsResult.error.message });
      return;
    }
    const shop = resolvedShop;
    const statsResult = await getSellerStats(resolvedShop.owner_id);
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

  // sessionUserId est désormais alimenté par `loadShop()` pour éviter un flicker owner/non-owner.

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

  const handleOwnerToggleHidden = useCallback(
    async (next: 'active' | 'hidden') => {
      if (state.status !== 'ready') return;
      const shopId = state.shop.id;
      const result = await updateShopStatus(shopId, next);
      if (result.error) {
        Alert.alert('Erreur', result.error.message);
        return;
      }
      await loadShop(true);
    },
    [loadShop, state]
  );

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
  const shopStatus = (shop.status ?? 'active') as string;
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
            <ShopBannerFallback />
          )}
          <View style={styles.bannerOverlay} />
        </View>

        <View style={[styles.contentColumn, { width: shopContentLayout.contentWidth }]}>
          <View style={styles.profileRow}>
            {shop.logo_url ? (
              <Image source={{ uri: shop.logo_url }} style={styles.logo} />
            ) : (
              <View style={styles.logoFallback}>
                <Text style={styles.logoInitials}>{initials}</Text>
              </View>
            )}
            <View style={styles.profileText}>
              <View style={styles.shopTitleRow}>
                <Text style={styles.shopName}>{shop.name}</Text>
                {isOwnShop && shopStatus === 'hidden' ? (
                  <View style={styles.ownerStatusChipHidden}>
                    <Ionicons name="eye-off-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.ownerStatusChipText}>Boutique masquée</Text>
                  </View>
                ) : null}
                {isOwnShop && shopStatus === 'suspended' ? (
                  <View style={styles.ownerStatusChipSuspended}>
                    <Ionicons name="alert-circle-outline" size={12} color={colors.error} />
                    <Text style={styles.ownerStatusChipTextSuspended}>Boutique suspendue</Text>
                  </View>
                ) : null}
              </View>
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
              {shopStatus === 'active' ? (
                <Button
                  variant="outline"
                  onPress={() => {
                    Alert.alert(
                      'Masquer ma boutique',
                      'Votre boutique ne sera plus visible publiquement. Vos annonces restent actives.',
                      [
                        { text: 'Annuler', style: 'cancel' },
                        {
                          text: 'Masquer',
                          style: 'destructive',
                          onPress: () => {
                            void handleOwnerToggleHidden('hidden');
                          },
                        },
                      ]
                    );
                  }}
                  style={styles.ownerStatusAction}
                >
                  Masquer ma boutique
                </Button>
              ) : null}
              {shopStatus === 'hidden' ? (
                <Button
                  onPress={() => {
                    Alert.alert(
                      'Remettre en ligne',
                      'Votre boutique redevient visible publiquement.',
                      [
                        { text: 'Annuler', style: 'cancel' },
                        {
                          text: 'Remettre en ligne',
                          onPress: () => {
                            void handleOwnerToggleHidden('active');
                          },
                        },
                      ]
                    );
                  }}
                  style={styles.ownerStatusAction}
                >
                  Remettre en ligne
                </Button>
              ) : null}
              <ShopPromoActions
                slug={shop.slug}
                onShare={() => void handleShareShop()}
                onWhatsApp={() => void handleShareShopWhatsApp()}
                onQr={() => setQrModalVisible(true)}
                sharing={sharing}
                showWhatsApp
                style={styles.contentBlockFlush}
              />
              <SellerAcquisitionTips compact />
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

          <View style={styles.listingsSection}>
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
              <View style={styles.listingsList}>
                {listings.map((listing) => (
                  <View key={listing.id} style={styles.shopListingCardWrapper}>
                    <View style={{ width: shopContentLayout.contentWidth }}>
                      <ListingCard
                        listing={listing}
                        variant="feed"
                        feedPresentation="standard"
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.trustSection}>
            <MarketplaceTrustTips style={styles.trustTipsEmbedded} />
            {!isOwnShop ? (
              <Pressable
                onPress={() => void handleReportPress()}
                style={({ pressed }) => [styles.reportLink, pressed && styles.reportLinkPressed]}
              >
                <Text style={styles.reportLinkText}>Signaler cette boutique</Text>
              </Pressable>
            ) : null}
          </View>
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
  shopTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  contentColumn: {
    alignSelf: 'center',
    overflow: 'visible',
  },
  contentBlockFlush: {
    marginHorizontal: 0,
    marginTop: spacing.sm,
    width: '100%',
  },
  emptyCta: {
    minWidth: 200,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing['3xl'] + spacing.sm,
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
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.07)',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: -24,
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
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  shopName: {
    ...typography.xl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    letterSpacing: -0.3,
  },
  ownerStatusChipHidden: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  ownerStatusChipSuspended: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.error + '10',
    borderWidth: 1,
    borderColor: colors.error + '22',
  },
  ownerStatusChipText: {
    ...typography.xs,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
  },
  ownerStatusChipTextSuspended: {
    ...typography.xs,
    fontWeight: fontWeights.semibold,
    color: colors.error,
  },
  ownerStatusAction: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
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
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  contactCard: {
    marginTop: spacing.sm,
    padding: spacing.base,
    width: '100%',
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
  listingsSection: {
    marginTop: spacing.base,
    width: '100%',
  },
  listingsHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
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
  listingsList: {
    alignItems: 'center',
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    overflow: 'visible',
  },
  shopListingCardWrapper: {
    alignItems: 'center',
    width: '100%',
    paddingVertical: SHOP_LISTING_CARD_SHADOW_INSET,
    marginBottom: spacing.md,
    overflow: 'visible',
  },
  trustMeta: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  trustMetaText: {
    ...typography.sm,
    color: colors.textMuted,
  },
  trustSection: {
    marginTop: spacing.base,
    paddingBottom: spacing.sm,
    width: '100%',
    overflow: 'visible',
  },
  trustTipsEmbedded: {
    marginTop: 0,
    width: '100%',
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

function ShopBannerFallback() {
  return (
    <View style={bannerFallbackStyles.root}>
      <LinearGradient
        colors={['#F0FDF4', '#ECFDF5', '#F8FAFC', '#F1F5F9']}
        locations={[0, 0.35, 0.72, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={bannerFallbackStyles.orbPrimary} />
      <View style={bannerFallbackStyles.orbSecondary} />
      <View style={bannerFallbackStyles.iconWrap}>
        <Ionicons name="storefront-outline" size={36} color="rgba(22, 163, 74, 0.22)" />
      </View>
    </View>
  );
}

const bannerFallbackStyles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  orbPrimary: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    top: -48,
    right: -36,
    backgroundColor: 'rgba(22, 163, 74, 0.07)',
  },
  orbSecondary: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    bottom: -28,
    left: -20,
    backgroundColor: 'rgba(15, 23, 42, 0.04)',
  },
  iconWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
