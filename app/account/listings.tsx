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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, AppHeader, EmptyState, Loader, Button } from '@/components';
import { ListingCard } from '@/features/listings';
import { getMyListings, updateListingStatus, type MyListing } from '@/services/listings';
import { spacing, colors, typography, fontWeights, radius } from '@/theme';

type State =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: MyListing[] };

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

const MyListingRowInner = memo(function MyListingRow({
  listing,
  onRefresh,
}: {
  listing: MyListing;
  onRefresh: () => void;
}) {
  const router = useRouter();

  const handleDeactivate = useCallback(() => {
    Alert.alert(
      'Désactiver l\'annonce',
      'L\'annonce ne sera plus visible dans le fil. Vous pourrez la réactiver plus tard.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Désactiver',
          style: 'destructive',
          onPress: async () => {
            const result = await updateListingStatus(listing.id, 'inactive');
            if (result.error) {
              Alert.alert('Erreur', result.error.message);
              return;
            }
            onRefresh();
          },
        },
      ]
    );
  }, [listing.id, onRefresh]);

  const handleReactivate = useCallback(async () => {
    const result = await updateListingStatus(listing.id, 'active');
    if (result.error) {
      Alert.alert('Erreur', result.error.message);
      return;
    }
    onRefresh();
  }, [listing.id, onRefresh]);

  const isActive = listing.status === 'active';

  return (
    <View style={styles.cardWrap}>
      <ListingCard listing={listing} />
      <View style={styles.metaRow}>
        <StatusBadge status={listing.status} />
        <View style={styles.actions}>
          <Button variant="ghost" size="sm" onPress={() => router.push(`/listing/${listing.id}`)}>
            Voir
          </Button>
          <Button variant="ghost" size="sm" onPress={() => router.push(`/listing/${listing.id}`)}>
            Modifier
          </Button>
          {isActive ? (
            <Button variant="ghost" size="sm" onPress={handleDeactivate}>
              Désactiver
            </Button>
          ) : (
            <Button variant="outline" size="sm" onPress={handleReactivate}>
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

  const load = useCallback(async () => {
    const result = await getMyListings();
    if (result.error) {
      if (result.error.message === 'Non connecté') {
        router.replace(`/(auth)/login?redirect=${encodeURIComponent('/account/listings')}` as import('expo-router').Href);
        return;
      }
      setState({ status: 'error', message: result.error.message });
      return;
    }
    const list = result.data ?? [];
    setState(
      list.length === 0 ? { status: 'empty' } : { status: 'success', data: list }
    );
  }, [router]);

  useEffect(() => {
    load().then(() => setRefreshing(false));
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const keyExtractor = useCallback((item: MyListing) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: MyListing }) => (
      <MyListingRowInner listing={item} onRefresh={onRefresh} />
    ),
    [onRefresh]
  );
  const itemSeparator = useCallback(() => <View style={styles.separator} />, []);

  return (
    <Screen>
      <AppHeader title="Mes annonces" showBack />
      {state.status === 'loading' && (
        <Loader />
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
          title="Vos annonces"
          message="Les annonces que vous publiez apparaîtront ici."
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
          windowSize={6}
          removeClippedSubviews
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
