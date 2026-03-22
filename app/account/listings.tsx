/**
 * Mes annonces – list of listings published by the current user.
 * Shows status, view entry, and deactivate/reactivate (Sprint 6.2: redirection si non connecté, erreur claire).
 */
import React, { useCallback, useEffect, memo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, Redirect } from 'expo-router';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, AppHeader, EmptyState, Loader, Button } from '@/components';
import { ListingCard } from '@/features/listings';
import {
  bumpListing,
  getMyListings,
  getListingStats,
  updateListingStatus,
  updateListingUrgent,
  type ListingStats,
  type MyListing,
} from '@/services/listings';
import { shareListing } from '@/lib/shareListing';
import { spacing, colors, typography, fontWeights, radius } from '@/theme';

type State =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: MyListing[] };

function buildInitialStats(listing: MyListing): ListingStats {
  return {
    views: Math.max(0, Number(listing.views_count ?? 0) || 0),
    favorites: 0,
    contacts: 0,
  };
}

type ListingQualityBadge = {
  title: string;
  subtitle: string;
  tone: 'warning' | 'neutral';
};

function getAgeInDays(value: string | null | undefined): number | null {
  const timestamp = Date.parse(String(value ?? ''));
  if (!Number.isFinite(timestamp)) return null;
  const diff = Date.now() - timestamp;
  if (!Number.isFinite(diff) || diff < 0) return null;
  return diff / (1000 * 60 * 60 * 24);
}

function getListingQualityBadge(
  listing: MyListing,
  stats: ListingStats
): ListingQualityBadge | null {
  const hasImages = Array.isArray(listing.images) && listing.images.length > 0;
  const hasPrice = Number.isFinite(Number(listing.price)) && Number(listing.price) > 0;
  const hasCity = String(listing.city ?? '').trim().length > 0;
  const description = typeof listing.description === 'string' ? listing.description.trim() : null;
  const hasShortDescription = description != null && description.length < 30;
  const ageInDays = getAgeInDays(listing.created_at);
  const views = Math.max(0, Number(stats.views ?? 0) || 0);

  if (!hasImages || hasShortDescription || !hasPrice || !hasCity) {
    return {
      title: 'Annonce à compléter',
      subtitle: 'Ajoutez des photos ou une description pour recevoir plus de contacts',
      tone: 'warning',
    };
  }

  if (views === 0 && ageInDays != null && ageInDays > 3) {
    return {
      title: 'Relancer l’annonce',
      subtitle: 'Modifiez l’annonce pour la remettre en tête',
      tone: 'warning',
    };
  }

  if (ageInDays != null && ageInDays > 30) {
    return {
      title: 'Annonce ancienne',
      subtitle: 'Modifiez l’annonce pour la remettre en avant',
      tone: 'neutral',
    };
  }

  return null;
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'active';
  return (
    <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusInactive]}>
      <Text style={[styles.statusText, isActive ? styles.statusTextActive : styles.statusTextInactive]}>
        {isActive ? 'En ligne' : 'Hors ligne'}
      </Text>
    </View>
  );
}

function SellerFlagBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'urgent' | 'boosted';
}) {
  return (
    <View
      style={[
        styles.flagBadge,
        tone === 'urgent' ? styles.flagBadgeUrgent : styles.flagBadgeBoosted,
      ]}
    >
      <Text
        style={[
          styles.flagBadgeText,
          tone === 'urgent' ? styles.flagBadgeTextUrgent : styles.flagBadgeTextBoosted,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const MyListingRowInner = memo(function MyListingRow({
  listing,
  stats,
  onPatchListing,
  onPromoteListing,
}: {
  listing: MyListing;
  stats: ListingStats;
  onPatchListing: (listingId: string, patch: Partial<MyListing>) => void;
  onPromoteListing: (listingId: string) => void;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<null | 'status' | 'urgent' | 'bump'>(null);
  const [sharing, setSharing] = useState(false);
  const isMutating = pendingAction != null;

  const handleDeactivate = useCallback(() => {
    if (isMutating) return;
    Alert.alert(
      'Désactiver l\'annonce',
      'L\'annonce ne sera plus visible dans le fil. Vous pourrez la réactiver plus tard.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Désactiver',
          style: 'destructive',
          onPress: async () => {
            setPendingAction('status');
            onPatchListing(listing.id, { status: 'inactive' });
            const result = await updateListingStatus(listing.id, 'inactive');
            if (result.error) {
              onPatchListing(listing.id, { status: listing.status });
              Alert.alert('Erreur', "Impossible de mettre à jour l'annonce");
              setPendingAction(null);
              return;
            }
            setPendingAction(null);
          },
        },
      ]
    );
  }, [isMutating, listing.id, listing.status, onPatchListing]);

  const handleReactivate = useCallback(async () => {
    if (isMutating) return;
    setPendingAction('status');
    onPatchListing(listing.id, { status: 'active' });
    const result = await updateListingStatus(listing.id, 'active');
    if (result.error) {
      onPatchListing(listing.id, { status: listing.status });
      Alert.alert('Erreur', "Impossible de mettre à jour l'annonce");
      setPendingAction(null);
      return;
    }
    setPendingAction(null);
  }, [isMutating, listing.id, listing.status, onPatchListing]);

  const handleToggleUrgent = useCallback(async () => {
    if (isMutating) return;
    const nextUrgent = listing.urgent !== true;
    const previousUrgent = listing.urgent === true;
    setPendingAction('urgent');
    onPatchListing(listing.id, { urgent: nextUrgent });
    const result = await updateListingUrgent(listing.id, nextUrgent);
    if (result.error) {
      onPatchListing(listing.id, { urgent: previousUrgent });
      Alert.alert('Erreur', "Impossible de mettre à jour l'annonce");
      setPendingAction(null);
      return;
    }
    Alert.alert('Annonce', nextUrgent ? 'Annonce marquée comme urgente' : 'Statut urgent retiré');
    setPendingAction(null);
  }, [isMutating, listing.id, listing.urgent, onPatchListing]);

  const handleBoostPress = useCallback(() => {
    Alert.alert(
      'Boost bientôt disponible',
      "Le boost d'annonce sera bientôt disponible pour améliorer la visibilité de votre annonce."
    );
  }, []);

  const handleImproveListing = useCallback(() => {
    router.push(`/listing/${listing.id}`);
  }, [listing.id, router]);

  const handleBumpListing = useCallback(async () => {
    if (isMutating) return;
    setPendingAction('bump');
    const result = await bumpListing(listing.id);
    if (result.error) {
      Alert.alert('Erreur', "Impossible de remonter l'annonce");
      setPendingAction(null);
      return;
    }
    onPromoteListing(listing.id);
    setPendingAction(null);
  }, [isMutating, listing.id, onPromoteListing]);

  const handleShareListing = useCallback(async () => {
    const listingId = listing.id?.trim();
    if (!listingId || sharing) return;
    setSharing(true);
    try {
      const result = await shareListing({
        id: listingId,
        title: listing.title,
        price: listing.price,
        city: listing.city ?? null,
      });
      if (!result.success && result.error) {
        Alert.alert('Partage indisponible', result.error);
      }
    } catch {
      Alert.alert('Partage indisponible', "Impossible de partager cette annonce");
    } finally {
      setSharing(false);
    }
  }, [listing.city, listing.id, listing.price, listing.title, sharing]);

  const isActive = listing.status === 'active';
  const isUrgent = listing.urgent === true;
  const isBoosted = listing.boosted === true;
  const qualityBadge = getListingQualityBadge(listing, stats);
  const listingAgeInDays = getAgeInDays(listing.created_at);
  const canBumpListing = isActive && listingAgeInDays != null && listingAgeInDays > 3;
  const showImproveAction = qualityBadge?.title === 'Annonce à compléter';
  const canShareListing = String(listing.id ?? '').trim().length > 0;

  return (
    <View style={styles.cardWrap}>
      <ListingCard listing={listing} />
      <View style={styles.metaBlock}>
        {qualityBadge ? (
          <View
            style={[
              styles.qualityBadge,
              qualityBadge.tone === 'warning' ? styles.qualityBadgeWarning : styles.qualityBadgeNeutral,
            ]}
          >
            <Text
              style={[
                styles.qualityBadgeTitle,
                qualityBadge.tone === 'warning'
                  ? styles.qualityBadgeTitleWarning
                  : styles.qualityBadgeTitleNeutral,
              ]}
            >
              {qualityBadge.title}
            </Text>
            <Text style={styles.qualityBadgeSubtitle}>{qualityBadge.subtitle}</Text>
          </View>
        ) : null}
        {showImproveAction ? (
          <View style={styles.improveActionWrap}>
            <Button
              variant="secondary"
              size="sm"
              onPress={handleImproveListing}
              disabled={isMutating}
            >
              {"Améliorer l'annonce"}
            </Button>
          </View>
        ) : null}
        <View style={styles.badgesRow}>
          <StatusBadge status={listing.status} />
          {isUrgent ? <SellerFlagBadge label="Urgent" tone="urgent" /> : null}
          {isBoosted ? <SellerFlagBadge label="Boostée" tone="boosted" /> : null}
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statsText}>Vues : {stats.views}</Text>
          <Text style={styles.statsText}>Favoris : {stats.favorites}</Text>
          {stats.contacts > 0 ? (
            <Text style={styles.statsText}>Contacts : {stats.contacts}</Text>
          ) : null}
        </View>
        <View style={styles.actions}>
          {canShareListing ? (
            <Button
              variant="ghost"
              size="sm"
              onPress={handleShareListing}
              disabled={sharing}
              loading={sharing}
            >
              Partager
            </Button>
          ) : null}
          {canBumpListing ? (
            <Button
              variant="outline"
              size="sm"
              onPress={handleBumpListing}
              disabled={isMutating}
              loading={pendingAction === 'bump'}
            >
              {"Remonter l'annonce"}
            </Button>
          ) : null}
          <Button
            variant={isUrgent ? 'secondary' : 'ghost'}
            size="sm"
            onPress={handleToggleUrgent}
            disabled={isMutating}
            loading={pendingAction === 'urgent'}
          >
            {isUrgent ? 'Retirer urgent' : 'Marquer urgent'}
          </Button>
          <Button
            variant={isBoosted ? 'secondary' : 'outline'}
            size="sm"
            onPress={handleBoostPress}
            disabled={isMutating}
          >
            {isBoosted ? 'Boostée' : 'Booster'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => router.push(`/listing/${listing.id}`)}
            disabled={isMutating}
          >
            Voir
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => router.push(`/listing/${listing.id}`)}
            disabled={isMutating}
          >
            Modifier
          </Button>
          {isActive ? (
            <Button
              variant="ghost"
              size="sm"
              onPress={handleDeactivate}
              disabled={isMutating}
              loading={pendingAction === 'status'}
            >
              Désactiver
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onPress={handleReactivate}
              disabled={isMutating}
              loading={pendingAction === 'status'}
            >
              Réactiver
            </Button>
          )}
        </View>
      </View>
    </View>
  );
});

export default function AccountListingsScreen() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [statsByListingId, setStatsByListingId] = useState<Record<string, ListingStats>>({});

  const load = useCallback(async () => {
    const result = await getMyListings();
    if (result.error) {
      setStatsByListingId({});
      if (result.error.message === 'Non connecté') {
        setState({ status: 'unauthenticated' });
        return;
      }
      setState({ status: 'error', message: result.error.message });
      return;
    }
    const list = result.data ?? [];
    if (list.length === 0) {
      setStatsByListingId({});
    } else {
      setStatsByListingId(
        Object.fromEntries(list.map((item) => [item.id, buildInitialStats(item)]))
      );
    }
    setState(
      list.length === 0 ? { status: 'empty' } : { status: 'success', data: list }
    );
  }, []);

  useEffect(() => {
    load().then(() => setRefreshing(false));
  }, [load]);

  const successListings = state.status === 'success' ? state.data : null;

  useEffect(() => {
    if (!successListings || successListings.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        successListings.map(async (listing) => {
          const result = await getListingStats(listing.id);
          const fallback = buildInitialStats(listing);
          return [listing.id, { ...fallback, ...result.data }] as const;
        })
      );
      if (cancelled) return;
      setStatsByListingId((prev) => ({
        ...prev,
        ...Object.fromEntries(entries),
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [state.status, successListings]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const patchListing = useCallback((listingId: string, patch: Partial<MyListing>) => {
    setState((prev) => {
      if (prev.status !== 'success') return prev;
      return {
        status: 'success',
        data: prev.data.map((item) => (item.id === listingId ? { ...item, ...patch } : item)),
      };
    });
  }, []);

  const promoteListing = useCallback((listingId: string) => {
    setState((prev) => {
      if (prev.status !== 'success') return prev;
      const index = prev.data.findIndex((item) => item.id === listingId);
      if (index <= 0) return prev;
      const nextData = [...prev.data];
      const [promotedListing] = nextData.splice(index, 1);
      nextData.unshift(promotedListing);
      return {
        status: 'success',
        data: nextData,
      };
    });
  }, []);

  const keyExtractor = useCallback((item: MyListing) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: MyListing }) => (
      <MyListingRowInner
        listing={item}
        stats={statsByListingId[item.id] ?? buildInitialStats(item)}
        onPatchListing={patchListing}
        onPromoteListing={promoteListing}
      />
    ),
    [patchListing, promoteListing, statsByListingId]
  );
  const itemSeparator = useCallback(() => <View style={styles.separator} />, []);

  return (
    <Screen>
      <AppHeader title="Mes annonces" showBack />
      {state.status === 'loading' && (
        <Loader />
      )}
      {state.status === 'unauthenticated' && (
        <Redirect href={buildAuthGateHref('listings')} />
      )}
      {state.status === 'error' && (
        <EmptyState
          title="Erreur"
          message={state.message}
          action={
            <Button variant="secondary" onPress={() => load()}>
              Réessayer
            </Button>
          }
          style={styles.center}
        />
      )}
      {state.status === 'empty' && (
        <EmptyState
          icon={<Ionicons name="pricetags-outline" size={24} color={colors.primary} />}
          title="Aucune annonce publiee"
          message="Publiez votre premiere annonce en quelques minutes."
          action={
            <View style={styles.emptyAction}>
              <Button variant="secondary" onPress={() => router.push('/sell')}>
                Publier une annonce
              </Button>
            </View>
          }
          style={styles.center}
        />
      )}
      {state.status === 'success' && (
        <FlatList
          data={state.data}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ItemSeparatorComponent={itemSeparator}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={6}
          windowSize={Platform.OS === 'ios' ? 6 : 10}
          removeClippedSubviews={Platform.OS === 'ios'}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1 },
  listContent: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  separator: { height: spacing.base },
  cardWrap: {
    marginBottom: spacing.xs,
  },
  metaBlock: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
    marginBottom: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  statusActive: {
    backgroundColor: colors.primary + '20',
  },
  statusInactive: {
    backgroundColor: colors.textMuted + '30',
  },
  statusText: {
    ...typography.xs,
    fontWeight: fontWeights.semibold,
  },
  statusTextActive: {
    color: colors.primary,
  },
  statusTextInactive: {
    color: colors.textMuted,
  },
  flagBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  flagBadgeUrgent: {
    backgroundColor: colors.error + '18',
  },
  flagBadgeBoosted: {
    backgroundColor: colors.primary + '18',
  },
  flagBadgeText: {
    ...typography.xs,
    fontWeight: fontWeights.semibold,
  },
  flagBadgeTextUrgent: {
    color: colors.error,
  },
  flagBadgeTextBoosted: {
    color: colors.primary,
  },
  emptyAction: {
    minWidth: 220,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  statsText: {
    ...typography.xs,
    color: colors.textMuted,
  },
  qualityBadge: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  qualityBadgeWarning: {
    backgroundColor: colors.primaryLight + '33',
    borderColor: colors.primary + '33',
  },
  qualityBadgeNeutral: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.borderLight,
  },
  qualityBadgeTitle: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    marginBottom: 2,
  },
  qualityBadgeTitleWarning: {
    color: colors.primary,
  },
  qualityBadgeTitleNeutral: {
    color: colors.text,
  },
  qualityBadgeSubtitle: {
    ...typography.xs,
    color: colors.textMuted,
  },
  improveActionWrap: {
    marginBottom: spacing.sm,
    alignItems: 'flex-start',
  },
});
