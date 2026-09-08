import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Text,
  Alert,
  FlatList,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Button, Loader, EmptyState, AppHeader } from '@/components';
import {
  getListingById,
  getSimilarListings,
  getListingDynamicAttributesForDisplay,
  markListingSold,
  updateListingStatus,
  type ListingDetail,
  type ListingDynamicAttributeDisplay,
  type PublicListing,
} from '@/services/listings';
import { getFavoriteIds, toggleFavorite } from '@/services/favorites';
import { addRecentlyViewedListingId } from '@/services/recentlyViewed';
import { resolveMarketplaceCategoryLabel } from '@/lib/marketplaceCategories';
import { useMarketplaceCategories } from '@/hooks/useMarketplaceCategories';
import { getOrCreateConversation } from '@/services/conversations';
import { getSession } from '@/services/auth';
import { reportListing } from '@/services/reports';
import { REPORT_OWN_CONTENT_MESSAGE, REPORT_SUCCESS_MESSAGE } from '@/constants/reportMessages';
import type { ReportReasonCode } from '@/constants/reportReasons';
import { ReportComposerModal } from '@/features/reports';
import { MarketplaceTrustTips } from '@/features/trust';
import { getSellerStats } from '@/services/users';
import { ListingCard } from '@/features/listings/ListingCard';
import { SkeletonListingCard } from '@/components/SkeletonListingCard';
import { isShopPubliclyActive } from '@/lib/shopSeller';
import {
  ListingGallery,
  ListingMeta,
  ListingSeller,
  ListingDescription,
  ListingCharacteristics,
  ListingActions,
  SecondaryActions,
} from '@/features/listings';
import { spacing, colors, typography, fontWeights, radius } from '@/theme';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import {
  isSellerContactAction,
  openSellerPhoneCall,
  openSellerSms,
  openWhatsAppForListing,
} from '@/lib/sellerContact';
import { useResponsiveLayout } from '@/lib/responsiveLayout';
import { FF_SIMILAR_LISTINGS } from '@/lib/featureFlags';
import { peekListingDetailSession, putListingDetailSession } from '@/services/listings/listingDetailSessionCache';
import {
  getListingViewSource,
  trackListingViewed,
  trackSellerContactInitiated,
} from '@/lib/analytics';
import {
  canSellerMarkListingSold,
  canSellerReactivateListing,
  isSoldListingStatus,
  LISTING_STATUS,
  MARK_LISTING_SOLD_CONFIRM_ACTION,
  MARK_LISTING_SOLD_CONFIRM_MESSAGE,
  MARK_LISTING_SOLD_CONFIRM_TITLE,
  MARK_LISTING_SOLD_ERROR_MESSAGE,
  MARK_LISTING_SOLD_SUCCESS_MESSAGE,
  MARK_LISTING_SOLD_SUCCESS_TITLE,
} from '@/lib/listingStatus';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; listing: ListingDetail; dynamicAttributes: ListingDynamicAttributeDisplay[] };

const FOOTER_HEIGHT_ESTIMATE = 80;

/**
 * Sprint 2.3 – Listing detail conversion screen.
 * States: loading, error (missing/unavailable), success.
 * Content: gallery, meta, seller, description, report link; sticky ListingActions with safe area.
 * Navigation: from home feed and search results via ListingCard → /listing/[id].
 */

/** Map known listing error messages to premium title + body for EmptyState. */
/** expo-router peut exposer les query params en `string | string[]`. */
function coalesceRouteParam(param: string | string[] | undefined): string | undefined {
  if (typeof param === 'string') {
    const t = param.trim();
    return t.length > 0 ? t : undefined;
  }
  if (Array.isArray(param) && param.length > 0) {
    const t = String(param[0]).trim();
    return t.length > 0 ? t : undefined;
  }
  return undefined;
}

function getListingErrorDisplay(message: string): { title: string; body: string } {
  if (message === 'Annonce introuvable') {
    return {
      title: 'Annonce introuvable',
      body: "Cette annonce a peut-être été supprimée ou n'existe plus.",
    };
  }
  if (message === "Cette annonce n'est plus disponible.") {
    return {
      title: 'Annonce indisponible',
      body: "Cette annonce n'est plus disponible. Elle a peut-être été mise en pause ou supprimée.",
    };
  }
  if (message === 'Identifiant manquant') {
    return { title: 'Erreur', body: message };
  }
  return { title: 'Erreur', body: message };
}

function getActionErrorMessage(message: string, fallback: string): string {
  const msg = message.toLowerCase();
  if (msg.includes('non connecté')) return 'Connexion requise';
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('réseau')) {
    return 'Réseau indisponible';
  }
  return fallback;
}

function maskPhoneForPreview(phone: string | null | undefined): string | null {
  const raw = String(phone ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  const pureDigits = digits.replace(/[^\d]/g, '');
  if (pureDigits.length < 6) return '••••••';
  const first = pureDigits.slice(0, 2);
  const last = pureDigits.slice(-2);
  const prefix = digits.startsWith('+') ? '+' : '';
  return `${prefix}${first}••••${last}`;
}

export default function ListingDetailScreen() {
  const { width: screenWidth, isCompact } = useResponsiveLayout();
  const CARD_WIDTH = screenWidth * 0.8;
  const CARD_GAP = isCompact ? spacing.sm : spacing.base;

  const params = useLocalSearchParams<{ id?: string | string[]; contact?: string | string[] }>();
  const id = useMemo(() => coalesceRouteParam(params.id), [params.id]);
  const contactParam = useMemo(() => coalesceRouteParam(params.contact), [params.contact]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [isFavorite, setIsFavorite] = useState(false);
  const lastFavoriteIdsFetchAtRef = useRef<number>(0);
  const FAVORITES_FETCH_TTL_MS = 120_000;
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReasonCode | null>(null);
  const [reportComment, setReportComment] = useState('');
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [markSoldLoading, setMarkSoldLoading] = useState(false);
  const [reactivateLoading, setReactivateLoading] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<'loading' | 'authed' | 'guest'>('loading');
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sellerStats, setSellerStats] = useState<{ memberSince: string | null; listingCount: number | null }>({
    memberSince: null,
    listingCount: null,
  });
  const [similarListings, setSimilarListings] = useState<PublicListing[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const similarLoadStartedRef = useRef(false);
  const { categories: marketplaceCategories } = useMarketplaceCategories();
  const scrollLayoutHeightRef = useRef(0);
  /** Évite double signalement immédiat en session (Sprint 7.1). */
  const [reportedListingId, setReportedListingId] = useState<string | null>(null);
  /** Évite de rejouer l’action contact après retour auth (pas de boucle). */
  const contactHandledRef = useRef<string | null>(null);
  const listingIdRef = useRef<string | undefined>(undefined);
  const viewedListingIdRef = useRef<string | null>(null);
  listingIdRef.current = id;

  useEffect(() => {
    contactHandledRef.current = null;
    viewedListingIdRef.current = null;
  }, [id]);

  useEffect(() => {
    similarLoadStartedRef.current = false;
    setSimilarListings([]);
    setSimilarLoading(false);
  }, [id]);

  useEffect(() => {
    if (state.status !== 'success' || !id) return;
    if (viewedListingIdRef.current === id) return;
    viewedListingIdRef.current = id;
    trackListingViewed({
      listing_id: id,
      listing_category: resolveMarketplaceCategoryLabel(
        marketplaceCategories,
        state.listing.category_id
      ),
      listing_city: state.listing.city,
      source: getListingViewSource(),
    });
  }, [id, marketplaceCategories, state]);

  useEffect(() => {
    if (!id) {
      setState({ status: 'error', message: 'Identifiant manquant' });
      return;
    }
    setSellerStats({ memberSince: null, listingCount: null });
    let cancelled = false;

    const cached = peekListingDetailSession(id);
    if (cached) {
      setState({
        status: 'success',
        listing: cached.listing,
        dynamicAttributes: cached.dynamicAttributes,
      });
      addRecentlyViewedListingId(id);
      void (async () => {
        const favResult = await getFavoriteIds();
        if (cancelled) return;
        if (favResult.data && id) {
          setIsFavorite(favResult.data.includes(id));
        }
        lastFavoriteIdsFetchAtRef.current = Date.now();
        const sellerId = cached.listing.seller_id;
        if (sellerId) {
          const statsResult = await getSellerStats(sellerId);
          if (!cancelled && !statsResult.error) {
            setSellerStats({
              memberSince: statsResult.data.memberSince,
              listingCount: statsResult.data.listingCount,
            });
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      const [listingResult, favResult, dynamicAttributes] = await Promise.all([
        getListingById(id),
        getFavoriteIds(),
        getListingDynamicAttributesForDisplay(id),
      ]);
      if (cancelled) return;
      if (listingResult.error) {
        setState({ status: 'error', message: listingResult.error.message });
        return;
      }
      const listing = listingResult.data!;
      setState({ status: 'success', listing, dynamicAttributes });
      putListingDetailSession(id, listing, dynamicAttributes);
      addRecentlyViewedListingId(id);
      if (favResult.data && id) {
        setIsFavorite(favResult.data.includes(id));
      }
      lastFavoriteIdsFetchAtRef.current = Date.now();
      if (listing.seller_id) {
        const statsResult = await getSellerStats(listing.seller_id);
        if (!cancelled && !statsResult.error) {
          setSellerStats({
            memberSince: statsResult.data.memberSince,
            listingCount: statsResult.data.listingCount,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const tryBeginSimilarLoad = useCallback(() => {
    if (!FF_SIMILAR_LISTINGS) return;
    if (similarLoadStartedRef.current) return;
    if (state.status !== 'success') return;
    similarLoadStartedRef.current = true;
    setSimilarLoading(true);
    const listing = state.listing;
    const targetListingId = listing.id;
    void (async () => {
      try {
        const similarResult = await getSimilarListings(
          {
            id: listing.id,
            city: listing.city,
            categoryId: listing.category_id ?? null,
            price: listing.price,
          },
          4
        );
        if (listingIdRef.current !== targetListingId) return;
        if (!similarResult.error) {
          setSimilarListings(similarResult.data);
        }
      } finally {
        if (listingIdRef.current === targetListingId) {
          setSimilarLoading(false);
        }
      }
    })();
  }, [state]);

  const handleDetailScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 320) {
        tryBeginSimilarLoad();
      }
    },
    [tryBeginSimilarLoad]
  );

  const handleDetailContentSizeChange = useCallback(
    (_w: number, contentHeight: number) => {
      const lh = scrollLayoutHeightRef.current;
      if (lh > 0 && contentHeight > 0 && contentHeight <= lh + 40) {
        tryBeginSimilarLoad();
      }
    },
    [tryBeginSimilarLoad]
  );

  /** Refresh favorite state when screen gains focus (e.g. return from Favorites tab). */
  useFocusEffect(
    useCallback(() => {
      if (state.status !== 'success' || !id) return;
      const now = Date.now();
      if (now - lastFavoriteIdsFetchAtRef.current < FAVORITES_FETCH_TTL_MS) return;
      lastFavoriteIdsFetchAtRef.current = now;
      getFavoriteIds().then((res) => {
        if (res.data) setIsFavorite(res.data.includes(id));
      });
    }, [id, state.status])
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setSessionStatus('loading');
      getSession()
        .then((s) => {
          if (!active) return;
          setSessionStatus(s?.user ? 'authed' : 'guest');
          setSessionUserId(s?.user?.id ?? null);
        })
        .catch(() => {
          if (!active) return;
          setSessionStatus('guest');
          setSessionUserId(null);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  const handleFavoritePress = useCallback(async () => {
    if (!id || favoriteLoading) return;
    const nextFavorite = !isFavorite;
    setIsFavorite(nextFavorite);
    setFavoriteLoading(true);
    try {
      const result = await toggleFavorite(id, { source: 'listing_detail' });
      if (!result.error) return;

      setIsFavorite(!nextFavorite);
      if (result.error.message === 'Non connecté') {
        router.replace(buildAuthGateHref('favorites', { redirect: `/listing/${id}` }));
        return;
      }
      Alert.alert(
        'Erreur',
        getActionErrorMessage(result.error.message, 'Impossible de mettre à jour le favori.')
      );
    } catch {
      setIsFavorite(!nextFavorite);
      Alert.alert('Erreur', 'Impossible de mettre à jour le favori.');
    } finally {
      setFavoriteLoading(false);
    }
  }, [favoriteLoading, id, isFavorite, router]);

  const openConversationForListing = useCallback(async (): Promise<boolean> => {
    if (!id) return false;
    const result = await getOrCreateConversation(id);
    if (result.error) {
      if (result.error.message === 'Non connecté') {
        router.push(
          buildAuthGateHref('messages', { redirect: `/listing/${id}`, contact: 'message' })
        );
        return false;
      }
      Alert.alert(
        'Erreur',
        getActionErrorMessage(result.error.message, 'Impossible d\'ouvrir la conversation.')
      );
      return false;
    }
    const conversationId = result.data?.id;
    if (!conversationId) {
      Alert.alert('Erreur', 'Impossible d\'ouvrir la conversation.');
      return false;
    }
    router.push(`/conversation/${conversationId}` as const);
    trackSellerContactInitiated({ listing_id: id, contact_method: 'message' });
    return true;
  }, [id, router]);

  const handleMessagePress = useCallback(async () => {
    if (!id || messageLoading) return;
    setMessageLoading(true);
    try {
      const session = await getSession();
      if (!session?.user) {
        router.push(
          buildAuthGateHref('messages', { redirect: `/listing/${id}`, contact: 'message' })
        );
        return;
      }
      await openConversationForListing();
    } catch {
      Alert.alert('Erreur', 'Impossible d\'ouvrir la conversation.');
    } finally {
      setMessageLoading(false);
    }
  }, [id, messageLoading, router, openConversationForListing]);

  const handleSecureWhatsApp = useCallback(async () => {
    if (!id || state.status !== 'success') return;
    const session = await getSession();
    if (!session?.user) {
      router.push(
        buildAuthGateHref('messages', { redirect: `/listing/${id}`, contact: 'whatsapp' })
      );
      return;
    }
    await openWhatsAppForListing(state.listing);
    trackSellerContactInitiated({ listing_id: id, contact_method: 'whatsapp' });
  }, [id, state, router]);

  const handleSecureCall = useCallback(async () => {
    if (!id || state.status !== 'success') return;
    const session = await getSession();
    if (!session?.user) {
      router.push(buildAuthGateHref('messages', { redirect: `/listing/${id}`, contact: 'call' }));
      return;
    }
    await openSellerPhoneCall(state.listing);
    trackSellerContactInitiated({ listing_id: id, contact_method: 'call' });
  }, [id, state, router]);

  const handleSecureSms = useCallback(async () => {
    if (!id || state.status !== 'success') return;
    const session = await getSession();
    if (!session?.user) {
      router.push(buildAuthGateHref('messages', { redirect: `/listing/${id}`, contact: 'sms' }));
      return;
    }
    await openSellerSms(state.listing);
    trackSellerContactInitiated({ listing_id: id, contact_method: 'sms' });
  }, [id, state, router]);

  useEffect(() => {
    const contact = contactParam;
    if (!contact || !isSellerContactAction(contact) || state.status !== 'success' || !id) return;

    const listing = state.listing;

    const key = `${id}:${contact}`;
    if (contactHandledRef.current === key) return;

    const ac = new AbortController();

    (async () => {
      const session = await getSession();
      if (ac.signal.aborted) return;
      if (!session?.user) return;
      if (contactHandledRef.current === key) return;

      contactHandledRef.current = key;

      if (contact !== 'message') {
        router.replace(`/listing/${id}` as Href);
      }

      if (ac.signal.aborted) return;

      try {
        switch (contact) {
          case 'whatsapp':
            await openWhatsAppForListing(listing);
            trackSellerContactInitiated({ listing_id: id, contact_method: 'whatsapp' });
            break;
          case 'call':
            await openSellerPhoneCall(listing);
            trackSellerContactInitiated({ listing_id: id, contact_method: 'call' });
            break;
          case 'sms':
            await openSellerSms(listing);
            trackSellerContactInitiated({ listing_id: id, contact_method: 'sms' });
            break;
          case 'message':
            await openConversationForListing();
            break;
          default:
            break;
        }
      } catch {
        // Les helpers affichent déjà les alertes.
      }
    })();

    return () => {
      ac.abort();
    };
  }, [contactParam, state, id, router, openConversationForListing]);

  const handleMarkSold = useCallback(() => {
    if (!id || markSoldLoading) return;
    Alert.alert(MARK_LISTING_SOLD_CONFIRM_TITLE, MARK_LISTING_SOLD_CONFIRM_MESSAGE, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: MARK_LISTING_SOLD_CONFIRM_ACTION,
        onPress: async () => {
          setMarkSoldLoading(true);
          const result = await markListingSold(id);
          setMarkSoldLoading(false);
          if (result.error) {
            Alert.alert('Erreur', result.error.message || MARK_LISTING_SOLD_ERROR_MESSAGE);
            return;
          }
          Alert.alert(MARK_LISTING_SOLD_SUCCESS_TITLE, MARK_LISTING_SOLD_SUCCESS_MESSAGE, [
            { text: 'OK', onPress: () => router.back() },
          ]);
        },
      },
    ]);
  }, [id, markSoldLoading, router]);

  const handleReactivate = useCallback(async () => {
    if (!id || reactivateLoading) return;
    setReactivateLoading(true);
    const result = await updateListingStatus(id, LISTING_STATUS.active);
    if (result.error) {
      setReactivateLoading(false);
      Alert.alert('Erreur', result.error.message || "Impossible de remettre l'annonce en ligne");
      return;
    }
    const listingResult = await getListingById(id);
    setReactivateLoading(false);
    if (listingResult.error || !listingResult.data) {
      Alert.alert('Annonce', "L'annonce a été remise en ligne.");
      return;
    }
    const nextListing = listingResult.data;
    setState((prev) => {
      const dynamicAttributes = prev.status === 'success' ? prev.dynamicAttributes : [];
      putListingDetailSession(id, nextListing, dynamicAttributes);
      return { status: 'success', listing: nextListing, dynamicAttributes };
    });
    Alert.alert('Annonce', "L'annonce est de nouveau en ligne.");
  }, [id, reactivateLoading]);

  const handleReportPress = useCallback(async () => {
    if (!id) return;
    const session = await getSession();
    if (!session?.user) {
      router.replace(buildAuthGateHref('account', { redirect: `/listing/${id}` }));
      return;
    }
    const sellerId = state.status === 'success' ? state.listing.seller_id : null;
    if (sellerId && sellerId === session.user.id) {
      Alert.alert('Action impossible', REPORT_OWN_CONTENT_MESSAGE);
      return;
    }
    if (reportedListingId === id) {
      Alert.alert('Déjà signalé', 'Vous avez déjà signalé cette annonce.');
      return;
    }
    setReportReason(null);
    setReportComment('');
    setReportModalVisible(true);
  }, [id, router, reportedListingId, state]);

  const handleReportSubmit = useCallback(() => {
    if (!id || !reportReason || reportLoading) return;
    Alert.alert(
      'Confirmer le signalement',
      'Votre signalement sera envoyé pour modération.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Envoyer',
          onPress: async () => {
            if (reportLoading) return;
            setReportLoading(true);
            const sellerId = state.status === 'success' ? state.listing.seller_id : null;
            const result = await reportListing(id, reportReason, {
              sellerId,
              comment: reportComment,
            });
            setReportLoading(false);
            if (result.error) {
              Alert.alert('Erreur', result.error.message);
              return;
            }
            setReportModalVisible(false);
            setReportedListingId(id);
            Alert.alert('Merci', REPORT_SUCCESS_MESSAGE);
          },
        },
      ]
    );
  }, [id, reportReason, reportComment, reportLoading, state]);

  if (state.status === 'loading') {
    return (
      <Screen safe={false}>
        <AppHeader title="Annonce" showBack density="compact" />
        <Loader />
      </Screen>
    );
  }

  if (state.status === 'error') {
    const { title, body } = getListingErrorDisplay(state.message);
    return (
      <Screen safe={false}>
        <AppHeader title="Annonce" showBack density="compact" />
        <View style={styles.emptyWrapPlain}>
          <EmptyState
            variant="plain"
            title={title}
            message={body}
            action={
              <Button variant="secondary" onPress={() => router.back()}>
                Retour
              </Button>
            }
          />
        </View>
      </Screen>
    );
  }

  const listing = state.listing;
  const dynamicAttributes = state.dynamicAttributes;
  const isGuest = sessionStatus === 'guest';
  const isOwnListing =
    sessionUserId != null && listing.seller_id != null && listing.seller_id === sessionUserId;
  const isSoldListing = isSoldListingStatus(listing.status);
  const canMarkSold = isOwnListing && canSellerMarkListingSold(listing.status);
  const canReactivate = isOwnListing && canSellerReactivateListing(listing.status);
  const maskedPhone = maskPhoneForPreview(listing.seller?.phone ?? null);

  const renderSimilarItem = ({ item }: { item: PublicListing }) => (
    <View style={{ width: CARD_WIDTH }}>
      <ListingCard listing={item} source="other" />
    </View>
  );

  const renderSkeletonItem = () => (
    <View style={{ width: CARD_WIDTH }}>
      <SkeletonListingCard />
    </View>
  );

  const similarKeyExtractor = (item: any, index: number) => item.id || `skele-${index}`;

  return (
    <Screen scroll={false} noPadding safe={false}>
      <AppHeader title="Annonce" showBack density="compact" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 120 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        onLayout={(ev) => {
          scrollLayoutHeightRef.current = ev.nativeEvent.layout.height;
        }}
        onContentSizeChange={handleDetailContentSizeChange}
        onScroll={handleDetailScroll}
        scrollEventThrottle={16}
      >
        <ListingGallery
          key={listing.id}
          listingId={listing.id}
          images={listing.images}
          lazySourcePaths={listing.galleryLazySourcePaths}
        />
        <View style={[styles.body, isCompact && styles.bodyCompact]}>
          <ListingMeta
            title={listing.title}
            price={listing.price}
            city={listing.city}
            created_at={listing.created_at}
            views_count={listing.views_count}
            isFavorite={isFavorite}
            onFavoritePress={handleFavoritePress}
            district={listing.district}
            urgent={listing.urgent}
            boosted={listing.boosted}
          />
          <ListingSeller
            listing={listing}
            memberSince={sellerStats.memberSince}
            listingCount={sellerStats.listingCount}
            onPress={listing.seller_id ? () => router.push(`/user/${listing.seller_id}` as const) : undefined}
          />
          {listing.shop?.slug && isShopPubliclyActive(listing.shop) ? (
            <Button
              variant="outline"
              size="md"
              onPress={() => router.push(`/shop/${listing.shop!.slug}` as Href)}
              leftIcon={<Ionicons name="storefront-outline" size={18} color={colors.primary} />}
              style={styles.shopLinkBtn}
            >
              Voir la boutique
            </Button>
          ) : null}
          <ListingCharacteristics
            condition={listing.condition}
            brand={listing.brand}
            model={listing.model}
            dynamicItems={dynamicAttributes}
          />
          <ListingDescription description={listing.description} />
          <MarketplaceTrustTips compact />

          <SecondaryActions
            listing={listing}
            isFavorite={isFavorite}
            onFavoritePress={handleFavoritePress}
            sellerPhone={listing.seller?.phone}
            onCallPress={handleSecureCall}
            onSmsPress={handleSecureSms}
          />
          {FF_SIMILAR_LISTINGS && (similarLoading || similarListings.length > 0) ? (
            <View style={styles.similarSection}>
              <Text style={styles.similarTitle}>Annonces similaires</Text>
              <FlatList
                data={similarLoading ? ([{ id: 'skele-1' }, { id: 'skele-2' }] as any) : similarListings}
                horizontal
                keyExtractor={similarKeyExtractor}
                renderItem={similarLoading ? renderSkeletonItem : renderSimilarItem}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.similarListContent}
                ItemSeparatorComponent={() => <View style={styles.similarSeparator} />}
                initialNumToRender={3}
                maxToRenderPerBatch={3}
                windowSize={3}
                removeClippedSubviews={Platform.OS === 'ios'}
                snapToInterval={CARD_WIDTH + CARD_GAP}
                decelerationRate="fast"
              />
            </View>
          ) : null}
          {!isOwnListing ? (
            <Pressable
              onPress={handleReportPress}
              style={({ pressed }) => [styles.reportLink, pressed && styles.reportLinkPressed]}
            >
              <Text style={styles.reportLinkText}>Signaler cette annonce</Text>
            </Pressable>
          ) : canMarkSold || canReactivate ? (
            <View style={styles.ownerSoldAction}>
              {canMarkSold ? (
                <Button
                  variant="outline"
                  size="md"
                  onPress={handleMarkSold}
                  disabled={markSoldLoading || reactivateLoading}
                  loading={markSoldLoading}
                >
                  Marquer comme vendue
                </Button>
              ) : null}
              {canReactivate ? (
                <Button
                  variant="outline"
                  size="md"
                  onPress={() => void handleReactivate()}
                  disabled={markSoldLoading || reactivateLoading}
                  loading={reactivateLoading}
                >
                  Réactiver
                </Button>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
      <ReportComposerModal
        visible={reportModalVisible}
        targetType="listing"
        title="Signaler cette annonce"
        loading={reportLoading}
        reason={reportReason}
        comment={reportComment}
        onChangeReason={setReportReason}
        onChangeComment={setReportComment}
        onCancel={() => !reportLoading && setReportModalVisible(false)}
        onSubmit={handleReportSubmit}
      />
      {!isSoldListing ? (
      <ListingActions
        listing={listing}
        sellerId={listing.seller_id}
        sellerName={listing.seller?.full_name ?? null}
        sellerPhone={listing.seller?.phone ?? null}
        safeBottom={insets.bottom}
        isFavorite={isFavorite}
        onFavorisPress={handleFavoritePress}
        onMessagePress={handleMessagePress}
        onWhatsAppPress={handleSecureWhatsApp}
        messageLoading={messageLoading}
        showAuthHint={isGuest}
        maskedPhone={maskedPhone}
      />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1 },
  emptyWrapPlain: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: FOOTER_HEIGHT_ESTIMATE + spacing['4xl'],
  },
  body: {
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
  },
  bodyCompact: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  shopLinkBtn: {
    marginBottom: spacing.base,
    alignSelf: 'flex-start',
  },
  similarSection: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  similarTitle: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.base,
  },
  similarListContent: {
    paddingHorizontal: spacing.screenHorizontal,
  },
  similarSeparator: {
    width: spacing.base,
  },
  reportLink: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
  },
  ownerSoldAction: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.sm,
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
    paddingHorizontal: spacing.screenHorizontal,
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
    backgroundColor: colors.primaryLight + '40',
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
