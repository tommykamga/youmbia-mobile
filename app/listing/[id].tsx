import { recordContactIntent } from '@/services/listings/contactIntent';
import { declareListingAvailability, availabilityLabel, UNKNOWN_AVAILABILITY } from '@/services/listings/listingTrust';
import { supabase } from '@/lib/supabase';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  AppState,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppUpdateBannerInset } from '@/context/AppUpdateBannerInsetContext';
import { Screen, Button, Loader, EmptyState, AppHeader } from '@/components';
import {
  getListingById,
  getSimilarListings,
  getListingDynamicAttributesForDisplay,
  markListingSold,
  renewListing,
  updateListingStatus,
  type ListingDetail,
  type ListingDynamicAttributeDisplay,
  type PublicListing,
} from '@/services/listings';
import { useFavorites } from '@/context/FavoritesContext';
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
import { shareListing } from '@/lib/shareListing';
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
  canSellerRenewListing,
  getSellerReactivateActionLabel,
  isSoldListingStatus,
  LISTING_STATUS,
  MARK_LISTING_SOLD_CONFIRM_ACTION,
  MARK_LISTING_SOLD_CONFIRM_MESSAGE,
  MARK_LISTING_SOLD_CONFIRM_TITLE,
  MARK_LISTING_SOLD_ERROR_MESSAGE,
  MARK_LISTING_SOLD_SUCCESS_MESSAGE,
  MARK_LISTING_SOLD_SUCCESS_TITLE,
  REACTIVATE_HIDDEN_CONFIRM_MESSAGE,
  REACTIVATE_HIDDEN_CONFIRM_TITLE,
  REACTIVATE_HIDDEN_SUCCESS_MESSAGE,
  REACTIVATE_LISTING_ERROR_MESSAGE,
  REACTIVATE_SOLD_CONFIRM_MESSAGE,
  REACTIVATE_SOLD_CONFIRM_TITLE,
  REACTIVATE_SOLD_SUCCESS_MESSAGE,
  RENEW_LISTING_CONFIRM_ACTION,
  RENEW_LISTING_CONFIRM_MESSAGE,
  RENEW_LISTING_CONFIRM_TITLE,
  RENEW_LISTING_ERROR_MESSAGE,
  RENEW_LISTING_SUCCESS_MESSAGE,
} from '@/lib/listingStatus';
import { isListingRenewalDue } from '@/lib/listingPublishedAt';

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
  const lowered = message.toLowerCase();
  if (
    lowered.includes('network') ||
    lowered.includes('fetch') ||
    lowered.includes('réseau') ||
    lowered.includes('internet') ||
    lowered.includes('failed to')
  ) {
    return {
      title: 'Connexion indisponible',
      body: 'Vérifiez votre connexion, puis réessayez.',
    };
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
  const appUpdateBannerInset = useAppUpdateBannerInset();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reloadNonce, setReloadNonce] = useState(0);
  const [contactBarHeight, setContactBarHeight] = useState(0);
  const [shareLoading, setShareLoading] = useState(false);
  const { isFavorite: isListingFavorite, toggleFavorite: toggleFavoriteContext } = useFavorites();
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReasonCode | null>(null);
  const [reportComment, setReportComment] = useState('');
  const [messageLoading, setMessageLoading] = useState(false);
  const [markSoldLoading, setMarkSoldLoading] = useState(false);
  const [reactivateLoading, setReactivateLoading] = useState(false);
  const [renewLoading, setRenewLoading] = useState(false);
  const authEpochRef = useRef(0);
  useEffect(() => {
    let alive = true;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_OUT' && event !== 'SIGNED_IN') return;
      const epoch = ++authEpochRef.current;
      setSessionStatus(session?.user ? 'authed' : 'guest');
      setSessionUserId(session?.user?.id ?? null);
      setReportModalVisible(false);
      setReportComment('');
      setReportReason(null);
      setReportedListingId(null);
      setState({ status: 'loading' });
      setTimeout(() => {
        if (!alive || !id) return;
        void Promise.all([getListingById(id), getListingDynamicAttributesForDisplay(id)]).then(([result, dynamicAttributes]) => {
          if (!alive || epoch !== authEpochRef.current) return;
          setState(result.error ? { status: 'error', message: result.error.message }
            : { status: 'success', listing: result.data, dynamicAttributes });
        }).catch(() => {
          if (alive && epoch === authEpochRef.current) setState({ status: 'error', message: 'Impossible de vérifier cette annonce.' });
        });
      }, 0);
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, [id]);
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
    const authEpoch = authEpochRef.current;
    const cached = peekListingDetailSession(id);
    if (cached) setState({ status: 'success', listing: cached.listing, dynamicAttributes: cached.dynamicAttributes });
    else setState({ status: 'loading' });

    (async () => {
      const [listingResult, dynamicAttributes] = await Promise.all([
        getListingById(id),
        getListingDynamicAttributesForDisplay(id),
      ]);
      if (cancelled || authEpoch !== authEpochRef.current) return;
      if (listingResult.error) {
        setState({ status: 'error', message: listingResult.error.message });
        return;
      }
      const listing = listingResult.data!;
      setState({ status: 'success', listing, dynamicAttributes });
      putListingDetailSession(id, listing, dynamicAttributes);
      addRecentlyViewedListingId(id);
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
  }, [id, reloadNonce]);

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

  useFocusEffect(useCallback(() => {
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (!id || pending || AppState.currentState !== 'active') return;
      pending = true;
      const epoch = authEpochRef.current;
      try {
        const result = await getListingById(id);
        if (!active || epoch !== authEpochRef.current) return;
        if (result.error) setState({ status: 'error', message: result.error.message });
        else setState((previous) => previous.status === 'success' ? { ...previous, listing: result.data } : previous);
      } catch {
        if (active && epoch === authEpochRef.current) setState({ status: 'error', message: 'Impossible de vérifier cette annonce.' });
      } finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 60_000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    return () => { active = false; clearInterval(timer); subscription.remove(); };
  }, [id]));

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const epoch = authEpochRef.current;
      setSessionStatus('loading');
      getSession()
        .then((s) => {
          if (!active || epoch !== authEpochRef.current) return;
          setSessionStatus(s?.user ? 'authed' : 'guest');
          setSessionUserId(s?.user?.id ?? null);
        })
        .catch(() => {
          if (!active || epoch !== authEpochRef.current) return;
          setSessionStatus('guest');
          setSessionUserId(null);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  const handleBack = useCallback(() => {
    const navigation = router as {
      canGoBack?: () => boolean;
      back: () => void;
      replace: (href: Href) => void;
    };
    if (typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.back();
      return;
    }
    router.replace('/(tabs)/home');
  }, [router]);

  const retryListing = useCallback(() => {
    setState({ status: 'loading' });
    setReloadNonce((value) => value + 1);
  }, []);

  const handleSharePress = useCallback(async () => {
    if (state.status !== 'success' || shareLoading) return;
    const current = state.listing;
    setShareLoading(true);
    try {
      const result = await shareListing({
        id: current.id,
        title: current.title,
        price: current.price,
        city: current.city,
      });
      if (!result.success && result.error) {
        Alert.alert('Partage', result.error);
      }
    } catch {
      Alert.alert('Partage', 'Impossible de partager cette annonce.');
    } finally {
      setShareLoading(false);
    }
  }, [shareLoading, state]);

  const isFavorite = Boolean(id && isListingFavorite(id));

  const handleFavoritePress = useCallback(async () => {
    if (!id || favoriteLoading) return;
    setFavoriteLoading(true);
    try {
      await toggleFavoriteContext(id, 'listing_detail');
    } finally {
      setFavoriteLoading(false);
    }
  }, [favoriteLoading, id, toggleFavoriteContext]);

  const openConversationForListing = useCallback(async (entryPoint: 'listing_detail' | 'auth_return' = 'listing_detail'): Promise<boolean> => {
    if (!id) return false;
    const available = await getListingById(id);
    if (available.error || available.data.status !== 'active') { Alert.alert('Annonce indisponible'); return false; }
    void recordContactIntent(available.data, 'message', entryPoint);
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
    const current = await getListingById(id);
    if (current.error || current.data.status !== 'active') { Alert.alert('Annonce indisponible'); return; }
    void recordContactIntent(current.data, 'whatsapp');
    await openWhatsAppForListing(current.data);
    trackSellerContactInitiated({ listing_id: id, contact_method: 'whatsapp' });
  }, [id, state, router]);

  const handleSecureCall = useCallback(async () => {
    if (!id || state.status !== 'success') return;
    const session = await getSession();
    if (!session?.user) {
      router.push(buildAuthGateHref('messages', { redirect: `/listing/${id}`, contact: 'call' }));
      return;
    }
    const current = await getListingById(id);
    if (current.error || current.data.status !== 'active') { Alert.alert('Annonce indisponible'); return; }
    void recordContactIntent(current.data, 'call');
    await openSellerPhoneCall(current.data);
    trackSellerContactInitiated({ listing_id: id, contact_method: 'call' });
  }, [id, state, router]);

  const handleSecureSms = useCallback(async () => {
    if (!id || state.status !== 'success') return;
    const session = await getSession();
    if (!session?.user) {
      router.push(buildAuthGateHref('messages', { redirect: `/listing/${id}`, contact: 'sms' }));
      return;
    }
    const current = await getListingById(id);
    if (current.error || current.data.status !== 'active') { Alert.alert('Annonce indisponible'); return; }
    void recordContactIntent(current.data, 'sms');
    await openSellerSms(current.data);
    trackSellerContactInitiated({ listing_id: id, contact_method: 'sms' });
  }, [id, state, router]);

  useEffect(() => {
    const contact = contactParam;
    if (!contact || !isSellerContactAction(contact) || state.status !== 'success' || !id) return;

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
        const current = await getListingById(id);
        if (current.error || current.data.status !== 'active') { Alert.alert('Annonce indisponible'); return; }
        const listing = current.data;
        switch (contact) {
          case 'whatsapp':
            void recordContactIntent(listing, 'whatsapp', 'auth_return');
            await openWhatsAppForListing(listing);
            trackSellerContactInitiated({ listing_id: id, contact_method: 'whatsapp' });
            break;
          case 'call':
            void recordContactIntent(listing, 'call', 'auth_return');
            await openSellerPhoneCall(listing);
            trackSellerContactInitiated({ listing_id: id, contact_method: 'call' });
            break;
          case 'sms':
            void recordContactIntent(listing, 'sms', 'auth_return');
            await openSellerSms(listing);
            trackSellerContactInitiated({ listing_id: id, contact_method: 'sms' });
            break;
          case 'message':
            await openConversationForListing('auth_return');
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

  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const handleAvailability = useCallback(async (value: 'available' | 'unknown') => {
    if (!id || state.status !== 'success' || availabilitySaving) return;
    const epoch = authEpochRef.current;
    setAvailabilitySaving(true);
    try {
      const saved = await declareListingAvailability(id, value, state.listing.status ?? '');
      if (epoch !== authEpochRef.current) return;
      if (!saved) { Alert.alert('Disponibilité non enregistrée', 'Actualisez l’annonce puis réessayez.'); return; }
      const fresh = await getListingById(id);
      if (!fresh.error && epoch === authEpochRef.current) setState(previous => previous.status === 'success' ? { ...previous, listing: fresh.data } : previous);
    } finally { setAvailabilitySaving(false); }
  }, [id, state, availabilitySaving]);

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

  const handleReactivate = useCallback(() => {
    if (!id || reactivateLoading) return;
    const currentStatus =
      state.status === 'success' ? String(state.listing.status ?? '').toLowerCase() : '';
    if (!canSellerReactivateListing(currentStatus)) return;
    const isSoldReactivation = currentStatus === LISTING_STATUS.sold;
    Alert.alert(
      isSoldReactivation ? REACTIVATE_SOLD_CONFIRM_TITLE : REACTIVATE_HIDDEN_CONFIRM_TITLE,
      isSoldReactivation ? REACTIVATE_SOLD_CONFIRM_MESSAGE : REACTIVATE_HIDDEN_CONFIRM_MESSAGE,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: getSellerReactivateActionLabel(currentStatus),
          onPress: async () => {
            setReactivateLoading(true);
            const result = await updateListingStatus(id, LISTING_STATUS.active);
            if (result.error) {
              setReactivateLoading(false);
              Alert.alert('Erreur', result.error.message || REACTIVATE_LISTING_ERROR_MESSAGE);
              return;
            }
            const listingResult = await getListingById(id);
            setReactivateLoading(false);
            if (listingResult.error || !listingResult.data) {
              Alert.alert(
                'Annonce',
                isSoldReactivation ? REACTIVATE_SOLD_SUCCESS_MESSAGE : REACTIVATE_HIDDEN_SUCCESS_MESSAGE
              );
              return;
            }
            const nextListing = listingResult.data;
            setState((prev) => {
              const dynamicAttributes = prev.status === 'success' ? prev.dynamicAttributes : [];
              putListingDetailSession(id, nextListing, dynamicAttributes);
              return { status: 'success', listing: nextListing, dynamicAttributes };
            });
            Alert.alert(
              'Annonce',
              isSoldReactivation ? REACTIVATE_SOLD_SUCCESS_MESSAGE : REACTIVATE_HIDDEN_SUCCESS_MESSAGE
            );
          },
        },
      ]
    );
  }, [id, reactivateLoading, state]);

  const handleRenew = useCallback(() => {
    if (!id || renewLoading) return;
    Alert.alert(RENEW_LISTING_CONFIRM_TITLE, RENEW_LISTING_CONFIRM_MESSAGE, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: RENEW_LISTING_CONFIRM_ACTION,
        onPress: async () => {
          setRenewLoading(true);
          const result = await renewListing(id);
          if (result.error) {
            setRenewLoading(false);
            Alert.alert('Erreur', result.error.message || RENEW_LISTING_ERROR_MESSAGE);
            return;
          }
          const listingResult = await getListingById(id);
          setRenewLoading(false);
          if (listingResult.error || !listingResult.data) {
            Alert.alert('Annonce', RENEW_LISTING_SUCCESS_MESSAGE);
            return;
          }
          const nextListing = listingResult.data;
          setState((prev) => {
            const dynamicAttributes = prev.status === 'success' ? prev.dynamicAttributes : [];
            putListingDetailSession(id, nextListing, dynamicAttributes);
            return { status: 'success', listing: nextListing, dynamicAttributes };
          });
          Alert.alert('Annonce', RENEW_LISTING_SUCCESS_MESSAGE);
        },
      },
    ]);
  }, [id, renewLoading]);

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
              <View style={styles.errorActions}>
                <Button onPress={retryListing}>Réessayer</Button>
                <Button variant="secondary" onPress={handleBack}>
                  Retour
                </Button>
              </View>
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
  const canRenew =
    isOwnListing && canSellerRenewListing(listing.status) && isListingRenewalDue(listing);
  const ownerMutating = markSoldLoading || reactivateLoading || renewLoading;
  const maskedPhone = maskPhoneForPreview(listing.seller?.phone ?? null);
  const showContactBar = !isSoldListing && sessionStatus !== 'loading' && !isOwnListing;
  const showPhoneInBody =
    !isOwnListing && Boolean(listing.seller?.phone) && sessionStatus !== 'loading';
  const categoryLabel = resolveMarketplaceCategoryLabel(marketplaceCategories, listing.category_id);
  const publishedAt = listing.last_published_at || listing.created_at;
  const galleryChromeTop = appUpdateBannerInset > 0 ? spacing.xs : insets.top + 2;
  const footerPad = showContactBar
    ? (contactBarHeight > 0 ? contactBarHeight + spacing.base : 220 + insets.bottom)
    : spacing['3xl'] + insets.bottom;
  const publicShop = listing.shop?.slug && isShopPubliclyActive(listing.shop) ? listing.shop : null;

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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: footerPad },
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
          onBackPress={handleBack}
          isFavorite={isFavorite}
          onFavoritePress={() => { void handleFavoritePress(); }}
          onSharePress={() => { void handleSharePress(); }}
          shareLoading={shareLoading}
          overlayTopInset={galleryChromeTop}
        />
        <View style={[styles.contentSheet, isCompact && styles.contentSheetCompact]}>
        <View style={[styles.body, isCompact && styles.bodyCompact]}>
          <ListingMeta
            title={listing.title}
            price={listing.price}
            city={listing.city}
            created_at={publishedAt}
            views_count={listing.views_count}
            district={listing.district}
            urgent={listing.urgent}
            boosted={listing.boosted}
            categoryLabel={categoryLabel}
          />
          <ListingSeller
            listing={listing}
            memberSince={sellerStats.memberSince}
            listingCount={sellerStats.listingCount}
            onPress={listing.seller_id ? () => router.push(`/user/${listing.seller_id}` as const) : undefined}
            onShopPress={
              publicShop
                ? () => router.push(`/shop/${publicShop.slug}` as Href)
                : undefined
            }
          />
          <ListingCharacteristics
            condition={listing.condition}
            brand={listing.brand}
            model={listing.model}
            dynamicItems={dynamicAttributes}
          />
          <ListingDescription description={listing.description} />
          <Text accessibilityRole="text">{availabilityLabel(isSoldListing ? { state: 'sold', confirmed_at: null } : listing.availability ?? UNKNOWN_AVAILABILITY)}</Text>
          {isOwnListing && listing.status === 'active' ? (
            <View style={styles.ownerSoldAction}>
              <Button variant="outline" disabled={availabilitySaving || ownerMutating} onPress={() => { void handleAvailability('available'); }}>Toujours disponible</Button>
              <Button variant="outline" disabled={availabilitySaving || ownerMutating} onPress={() => { void handleAvailability('unknown'); }}>Disponibilité inconnue</Button>
            </View>
          ) : null}
          <MarketplaceTrustTips compact />

          <SecondaryActions
            listing={listing}
            isFavorite={isFavorite}
            onFavoritePress={handleFavoritePress}
            sellerPhone={listing.seller?.phone}
            onCallPress={handleSecureCall}
            onSmsPress={handleSecureSms}
            showFavorite={false}
            showShare={false}
            showPhoneActions={showPhoneInBody}
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
          ) : canMarkSold || canReactivate || canRenew ? (
            <View style={styles.ownerSoldAction}>
              {canMarkSold ? (
                <Button
                  variant="outline"
                  size="md"
                  onPress={handleMarkSold}
                  disabled={ownerMutating}
                  loading={markSoldLoading}
                >
                  Marquer comme vendue
                </Button>
              ) : null}
              {canRenew ? (
                <Button
                  variant="outline"
                  size="md"
                  onPress={handleRenew}
                  disabled={ownerMutating}
                  loading={renewLoading}
                >
                  {RENEW_LISTING_CONFIRM_ACTION}
                </Button>
              ) : null}
              {canReactivate ? (
                <Button
                  variant="outline"
                  size="md"
                  onPress={handleReactivate}
                  disabled={ownerMutating}
                  loading={reactivateLoading}
                >
                  {getSellerReactivateActionLabel(listing.status)}
                </Button>
              ) : null}
            </View>
          ) : null}
        </View>
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
      {showContactBar ? (
      <ListingActions
        listing={listing}
        sellerId={listing.seller_id}
        sellerName={listing.seller?.full_name ?? null}
        sellerPhone={listing.seller?.phone ?? null}
        safeBottom={insets.bottom}
        onMessagePress={handleMessagePress}
        onWhatsAppPress={handleSecureWhatsApp}
        messageLoading={messageLoading}
        showAuthHint={isGuest}
        maskedPhone={maskedPhone}
        isOwnListing={isOwnListing}
        onBarHeight={setContactBarHeight}
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
  errorActions: {
    width: 280,
    maxWidth: '100%',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  scroll: { flex: 1, backgroundColor: colors.surfaceMuted },
  scrollContent: {
    paddingBottom: FOOTER_HEIGHT_ESTIMATE + spacing['4xl'],
  },
  contentSheet: {
    marginTop: -spacing['2xl'],
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    backgroundColor: colors.surface,
    paddingTop: spacing.lg,
    overflow: 'hidden',
  },
  contentSheetCompact: {
    marginTop: -spacing.xl,
    paddingTop: spacing.base,
  },
  body: {
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 0,
    paddingBottom: spacing.base,
  },
  bodyCompact: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
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
