/**
 * Public seller profile – Sprint 5.2.
 * Header (name, verified, join date), trust section, seller's listings.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen, AppHeader, Loader, EmptyState } from '@/components';
import { getUserProfile } from '@/services/users';
import { ListingCard, SellerBadge } from '@/features/listings';
import type { PublicListing } from '@/services/listings';
import { formatJoinDate } from '@/lib/format';
import { colors, spacing, typography, fontWeights } from '@/theme';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      profile: {
        full_name: string | null;
        created_at: string | null;
        is_verified: boolean | null;
        trust_score: number | null;
        reports_count: number | null;
        is_banned: boolean | null;
        is_flagged: boolean | null;
      };
      listings: PublicListing[];
    };

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    if (!id) {
      setState({ status: 'error', message: 'Identifiant manquant' });
      return;
    }
    setState({ status: 'loading' });
    const result = await getUserProfile(id);
    if (result.error) {
      setState({ status: 'error', message: result.error.message });
      return;
    }
    const { profile, listings } = result.data!;
    setState({
      status: 'success',
      profile: {
        full_name: profile.full_name,
        created_at: profile.created_at,
        is_verified: profile.is_verified,
        trust_score: profile.trust_score,
        reports_count: profile.reports_count,
        is_banned: profile.is_banned,
        is_flagged: profile.is_flagged,
      },
      listings,
    });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const keyExtractor = useCallback((item: PublicListing) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: PublicListing }) => (
      <View style={styles.cardWrap}>
        <ListingCard listing={item} />
      </View>
    ),
    []
  );
  const itemSeparator = useCallback(() => <View style={styles.separator} />, []);

  if (state.status === 'loading') {
    return (
      <Screen>
        <AppHeader title="Profil" showBack />
        <Loader />
      </Screen>
    );
  }

  if (state.status === 'error') {
    return (
      <Screen>
        <AppHeader title="Profil" showBack />
        <EmptyState
          title="Profil introuvable"
          message={state.message}
          style={styles.center}
        />
      </Screen>
    );
  }

  const name = state.profile.full_name?.trim() || 'Vendeur';
  const joinDate = formatJoinDate(state.profile.created_at);
  const isBanned = state.profile.is_banned === true;
  const isFlagged = state.profile.is_flagged === true || (Number(state.profile.reports_count ?? 0) > 0);
  const trustScore = state.profile.trust_score;
  const reportsCount = state.profile.reports_count;
  const showTrustScore = trustScore != null;
  const showReportsCount = reportsCount != null && Number(reportsCount) > 0;

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text style={styles.name}>{name}</Text>
        {state.profile.is_verified === true && (
          <SellerBadge variant="verified" label="Vérifié" />
        )}
        {isFlagged && (
          <SellerBadge variant="flagged" label="Profil signalé" />
        )}
      </View>
      {joinDate ? (
        <Text style={styles.meta}>Inscrit depuis {joinDate}</Text>
      ) : null}
      {isBanned && (
        <Text style={styles.restrictedNotice}>Ce compte ne peut pas être contacté.</Text>
      )}
      {(showTrustScore || showReportsCount) && (
        <View style={styles.trustRow}>
          {showTrustScore && (
            <Text style={styles.trustText}>Score confiance : {trustScore}</Text>
          )}
          {showReportsCount && (
            <Text style={styles.trustText}>Signalements : {reportsCount}</Text>
          )}
        </View>
      )}
      <Text style={styles.sectionTitle}>Annonces</Text>
    </View>
  );

  return (
    <Screen scroll={false}>
      <AppHeader title="Profil vendeur" showBack />
      <FlatList
        data={state.listings}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={itemSeparator}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>Aucune annonce pour le moment.</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1 },
  header: {
    padding: spacing.base,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginBottom: spacing.xs,
  },
  name: {
    ...typography.xl,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  meta: {
    ...typography.sm,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  restrictedNotice: {
    ...typography.sm,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
  },
  trustRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  trustText: {
    ...typography.sm,
    color: colors.textSecondary,
  },
  sectionTitle: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  listContent: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
    flexGrow: 1,
  },
  cardWrap: {
    marginBottom: 0,
  },
  separator: {
    height: spacing.base,
  },
  emptyWrap: {
    paddingVertical: spacing['2xl'],
    alignItems: 'center',
  },
  emptyText: {
    ...typography.sm,
    color: colors.textMuted,
  },
});
