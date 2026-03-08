import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Modal,
  Pressable,
  Text,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Button, Loader, EmptyState, AppHeader } from '@/components';
import { getListingById, type ListingDetail } from '@/services/listings';
import { getFavoriteIds, toggleFavorite } from '@/services/favorites';
import { addRecentlyViewedListingId } from '@/services/recentlyViewed';
import { getOrCreateConversation } from '@/services/conversations';
import { getSession } from '@/services/auth';
import { reportListing } from '@/services/reports';
import {
  ListingGallery,
  ListingMeta,
  ListingSeller,
  ListingDescription,
  ListingActions,
} from '@/features/listings';
import { spacing, colors, typography, fontWeights, radius } from '@/theme';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; listing: ListingDetail };

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
      body: "Cette annonce a été retirée et n'est plus visible.",
    };
  }
  if (message === 'Identifiant manquant') {
    return { title: 'Erreur', body: message };
  }
  return { title: 'Erreur', body: message };
}

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [isFavorite, setIsFavorite] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  /** Évite double signalement immédiat en session (Sprint 7.1). */
  const [reportedListingId, setReportedListingId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setState({ status: 'error', message: 'Identifiant manquant' });
      return;
    }
    let cancelled = false;
    (async () => {
      const [listingResult, favResult] = await Promise.all([
        getListingById(id),
        getFavoriteIds(),
      ]);
      if (cancelled) return;
      if (listingResult.error) {
        setState({ status: 'error', message: listingResult.error.message });
        return;
      }
      setState({ status: 'success', listing: listingResult.data! });
      addRecentlyViewedListingId(id);
      if (favResult.data && id) {
        setIsFavorite(favResult.data.includes(id));
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  /** Refresh favorite state when screen gains focus (e.g. return from Favorites tab). */
  useFocusEffect(
    useCallback(() => {
      if (state.status !== 'success' || !id) return;
      getFavoriteIds().then((res) => {
        if (res.data) setIsFavorite(res.data.includes(id));
      });
    }, [id, state.status])
  );

  const handleFavoritePress = useCallback(async () => {
    if (!id) return;
    const nextFavorite = !isFavorite;
    setIsFavorite(nextFavorite);
    const result = await toggleFavorite(id);
    if (result.error) {
      setIsFavorite(!nextFavorite);
      if (result.error.message === 'Non connecté') {
        router.replace(`/(auth)/login?redirect=${encodeURIComponent(`/listing/${id}`)}`);
      }
      return;
    }
  }, [id, isFavorite, router]);

  const handleMessagePress = useCallback(async () => {
    if (!id) return;
    const session = await getSession();
    if (!session?.user) {
      router.replace(`/(auth)/login?redirect=${encodeURIComponent(`/listing/${id}`)}`);
      return;
    }
    const result = await getOrCreateConversation(id);
    if (result.error) {
      if (result.error.message === 'Non connecté') {
        router.replace(`/(auth)/login?redirect=${encodeURIComponent(`/listing/${id}`)}`);
        return;
      }
      Alert.alert('Erreur', result.error.message);
      return;
    }
    const conversationId = result.data?.id;
    if (!conversationId) {
      Alert.alert('Erreur', 'Impossible d\'ouvrir la conversation.');
      return;
    }
    router.push(`/conversation/${conversationId}` as const);
  }, [id, router]);

  const handleReportPress = useCallback(async () => {
    if (!id) return;
    const session = await getSession();
    if (!session?.user) {
      router.replace(`/(auth)/login?redirect=${encodeURIComponent(`/listing/${id}`)}`);
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

  return (
    <Screen scroll={false} noPadding>
      <AppHeader title="Annonce" showBack />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: FOOTER_HEIGHT_ESTIMATE + spacing['4xl'] + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ListingGallery images={listing.images} />
        <View style={styles.body}>
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
          />
          <ListingSeller
            listing={listing}
            onPress={listing.seller_id ? () => router.push(`/user/${listing.seller_id}` as const) : undefined}
          />
          <ListingDescription description={listing.description} />
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
