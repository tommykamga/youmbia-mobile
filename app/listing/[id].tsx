import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Modal,
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
import { Screen, Button, Loader, EmptyState, AppHeader } from '@/components';
import {
  getListingById,
  getSimilarListings,
  getListingDynamicAttributesForDisplay,
  type ListingDetail,
  type ListingDynamicAttributeDisplay,
  type PublicListing,
} from '@/services/listings';
import { getFavoriteIds, toggleFavorite } from '@/services/favorites';
import { addRecentlyViewedListingId } from '@/services/recentlyViewed';
import { LISTING_CATEGORIES } from '@/lib/listingCategories';
import { getOrCreateConversation } from '@/services/conversations';
import { getSession } from '@/services/auth';
import { reportListing } from '@/services/reports';
import { getSellerStats } from '@/services/users';
import { ListingCard } from '@/features/listings/ListingCard';
import { SkeletonListingCard } from '@/components/SkeletonListingCard';
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

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; listing: ListingDetail; dynamicAttributes: ListingDynamicAttributeDisplay[] };

const FOOTER_HEIGHT_ESTIMATE = 80;

/** Motifs de signalement (Sprint 7.1 — obligatoire, transmis au backend). */
const REPORT_REASONS = ['Arnaque', 'Faux produit', 'Contenu interdit', 'Autre'] as const;

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
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<'loading' | 'authed' | 'guest'>('loading');
  const [sellerStats, setSellerStats] = useState<{ memberSince: string | null; listingCount: number | null }>({
    memberSince: null,
    listingCount: null,
  });
  const [similarListings, setSimilarListings] = useState<PublicListing[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const similarLoadStartedRef = useRef(false);
  const scrollLayoutHeightRef = useRef(0);
  /** Évite double signalement immédiat en session (Sprint 7.1). */
  const [reportedListingId, setReportedListingId] = useState<string | null>(null);
  /** Évite de rejouer l’action contact après retour auth (pas de boucle). */
  const contactHandledRef = useRef<string | null>(null);
  const listingIdRef = useRef<string | undefined>(undefined);
  listingIdRef.current = id;

  useEffect(() => {
    contactHandledRef.current = null;
  }, [id]);

  useEffect(() => {
    similarLoadStartedRef.current = false;
    setSimilarListings([]);
    setSimilarLoading(false);
  }, [id]);

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
    const currentCategory = listing.category_id
      ? LISTING_CATEGORIES.find((c) => c.id === listing.category_id)?.label
      : null;
    const targetListingId = listing.id;
    void (async () => {
      try {
        const similarResult = await getSimilarListings(
          {
            id: listing.id,
            title: listing.title,
            description: listing.description,
            city: listing.city,
            category: currentCategory,
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
        })
        .catch(() => {
          if (!active) return;
          setSessionStatus('guest');
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
      const result = await toggleFavorite(id);
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
  }, [id, state, router]);

  const handleSecureCall = useCallback(async () => {
    if (!id || state.status !== 'success') return;
    const session = await getSession();
    if (!session?.user) {
      router.push(buildAuthGateHref('messages', { redirect: `/listing/${id}`, contact: 'call' }));
      return;
    }
    await openSellerPhoneCall(state.listing);
  }, [id, state, router]);

  const handleSecureSms = useCallback(async () => {
    if (!id || state.status !== 'success') return;
    const session = await getSession();
    if (!session?.user) {
      router.push(buildAuthGateHref('messages', { redirect: `/listing/${id}`, contact: 'sms' }));
      return;
    }
    await openSellerSms(state.listing);
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
            break;
          case 'call':
            await openSellerPhoneCall(listing);
            break;
          case 'sms':
            await openSellerSms(listing);
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

  const handleReportPress = useCallback(async () => {
    if (!id) return;
    const session = await getSession();
    if (!session?.user) {
      router.replace(buildAuthGateHref('account', { redirect: `/listing/${id}` }));
      return;
    }
    if (reportedListingId === id) {
      Alert.alert('Déjà signalé', 'Vous avez déjà signalé cette annonce.');
      return;
    }
    setReportReason(null);
    setReportModalVisible(true);
  }, [id, router, reportedListingId]);

  const handleReportSubmit = useCallback(() => {
    if (!id || !reportReason?.trim()) return;
    Alert.alert(
      'Confirmer le signalement',
      'Votre signalement sera envoyé pour modération.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Envoyer',
          onPress: async () => {
            setReportLoading(true);
            const result = await reportListing(id, reportReason.trim());
            setReportLoading(false);
            if (result.error) {
              Alert.alert('Erreur', result.error.message);
              return;
            }
            setReportModalVisible(false);
            setReportedListingId(id);
            Alert.alert('Merci', 'Votre signalement a bien été envoyé.');
          },
        },
      ]
    );
  }, [id, reportReason]);

  if (state.status === 'loading') {
    return (
      <Screen>
        <Loader />
      </Screen>
    );
  }

  if (state.status === 'error') {
    const { title, body } = getListingErrorDisplay(state.message);
    return (
      <Screen>
        <EmptyState
          title={title}
          message={body}
          style={styles.center}
          action={
            <Button variant="secondary" onPress={() => router.back()}>
              Retour
            </Button>
          }
        />
      </Screen>
    );
  }

  const listing = state.listing;
  const dynamicAttributes = state.dynamicAttributes;
  const isGuest = sessionStatus === 'guest';
  const maskedPhone = maskPhoneForPreview(listing.seller?.phone ?? null);

  const renderSimilarItem = ({ item }: { item: PublicListing }) => (
    <View style={{ width: CARD_WIDTH }}>
      <ListingCard listing={item} />
    </View>
  );

  const renderSkeletonItem = () => (
    <View style={{ width: CARD_WIDTH }}>
      <SkeletonListingCard />
    </View>
  );

  const similarKeyExtractor = (item: any, index: number) => item.id || `skele-${index}`;

  return (
    <Screen scroll={false} noPadding>
      <AppHeader title="Annonce" showBack />
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
          <ListingCharacteristics
            condition={listing.condition}
            brand={listing.brand}
            model={listing.model}
            dynamicItems={dynamicAttributes}
          />
          <ListingDescription description={listing.description} />

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
          <Pressable
            onPress={handleReportPress}
            style={({ pressed }) => [styles.reportLink, pressed && styles.reportLinkPressed]}
          >
            <Text style={styles.reportLinkText}>Signaler cette annonce</Text>
          </Pressable>
        </View>
      </ScrollView>
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
            <Text style={styles.modalTitle}>Signaler cette annonce</Text>
            <Text style={styles.modalSubtitle}>Choisissez un motif</Text>
            {REPORT_REASONS.map((label) => (
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: FOOTER_HEIGHT_ESTIMATE + spacing['4xl'],
  },
  body: {
    padding: spacing.base,
  },
  bodyCompact: {
    padding: spacing.sm,
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
    paddingHorizontal: spacing.base,
  },
  similarSeparator: {
    width: spacing.base,
  },
  reportLink: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
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
