/**
 * Public seller profile – Sprint 5.2.
 * Header (name, verified, join date), trust section, seller's listings, report user.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Modal, Pressable, Alert, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen, AppHeader, Loader, EmptyState, Button } from '@/components';
import { getSellerStats, getUserProfile } from '@/services/users';
import { reportUser } from '@/services/reports';
import { getSession } from '@/services/auth';
import { ListingCard, SellerBadge } from '@/features/listings';
import type { PublicListing } from '@/services/listings';
import { formatJoinDate } from '@/lib/format';
import { shareSellerProfile } from '@/lib/shareListing';
import { colors, spacing, typography, fontWeights, cardStyles } from '@/theme';

const REPORT_REASONS = ['Arnaque', 'Comportement inapproprié', 'Spam', 'Autre'] as const;

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      profile: {
        full_name: string | null;
        city: string | null;
        bio: string | null;
        created_at: string | null;
        is_verified: boolean | null;
        phone_verified?: boolean | null;
        trust_score: number | null;
        reports_count: number | null;
        is_banned: boolean | null;
        is_flagged: boolean | null;
      };
      stats: {
        memberSince: string | null;
        listingCount: number | null;
      };
      listings: PublicListing[];
    };

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportedUserId, setReportedUserId] = useState<string | null>(null);
  const [sharingProfile, setSharingProfile] = useState(false);
  const loadRequestIdRef = useRef(0);

  useEffect(() => {
    let isActive = true;
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    const load = async () => {
      if (!id) {
        if (isActive && loadRequestIdRef.current === requestId) {
          setState({ status: 'error', message: 'Identifiant manquant' });
        }
        return;
      }

      setState({ status: 'loading' });
      const [profileResult, statsResult] = await Promise.all([
        getUserProfile(id),
        getSellerStats(id),
      ]);

      if (!isActive || loadRequestIdRef.current !== requestId) return;

      if (profileResult.error) {
        setState({ status: 'error', message: profileResult.error.message });
        return;
      }

      const { profile, listings } = profileResult.data;
      setState({
        status: 'success',
        profile: {
          full_name: profile.full_name,
          city: profile.city ?? null,
          bio: profile.bio ?? null,
          created_at: profile.created_at,
          is_verified: profile.is_verified,
          phone_verified: profile.phone_verified ?? null,
          trust_score: profile.trust_score,
          reports_count: profile.reports_count,
          is_banned: profile.is_banned,
          is_flagged: profile.is_flagged,
        },
        stats: {
          memberSince: statsResult.error ? null : statsResult.data.memberSince,
          listingCount: statsResult.error ? null : statsResult.data.listingCount,
        },
        listings,
      });
    };

    load();

    return () => {
      isActive = false;
    };
  }, [id]);

  const handleReportPress = useCallback(() => {
    if (!id) return;
    getSession().then((session) => {
      if (!session?.user) {
        Alert.alert('Connexion requise', 'Connecte-toi pour signaler ce vendeur.');
        return;
      }
      if (session.user.id === id) {
        Alert.alert('Action impossible', 'Vous ne pouvez pas vous signaler vous-même.');
        return;
      }
      if (reportedUserId === id) {
        Alert.alert('Déjà signalé', 'Vous avez déjà signalé ce vendeur.');
        return;
      }
      setReportReason(null);
      setReportModalVisible(true);
    });
  }, [id, reportedUserId]);

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
            const result = await reportUser(id, reportReason.trim());
            setReportLoading(false);
            if (result.error) {
              Alert.alert('Erreur', result.error.message);
              return;
            }
            setReportModalVisible(false);
            setReportedUserId(id);
            Alert.alert('Merci', 'Votre signalement a bien été envoyé.');
          },
        },
      ]
    );
  }, [id, reportReason]);

  const handleShareProfile = useCallback(async () => {
    if (!id || sharingProfile || state.status !== 'success') return;
    setSharingProfile(true);
    try {
      const result = await shareSellerProfile({
        id,
        name: state.profile.full_name ?? null,
        city: state.profile.city ?? null,
      });
      if (!result.success && result.error) {
        Alert.alert('Partage indisponible', result.error || 'Impossible de partager ce profil vendeur.');
      }
    } catch {
      Alert.alert('Partage indisponible', 'Impossible de partager ce profil vendeur.');
    } finally {
      setSharingProfile(false);
    }
  }, [id, sharingProfile, state]);

  const keyExtractor = useCallback((item: PublicListing) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: PublicListing }) => (
      <View style={styles.cardWrap}>
        <ListingCard listing={item} />
      </View>
    ),
    []
  );

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
  const city = state.profile.city?.trim() || null;
  const bio = state.profile.bio?.trim() || null;
  const joinDate = formatJoinDate(state.stats.memberSince ?? state.profile.created_at);
  const isBanned = state.profile.is_banned === true;
  const isFlagged = state.profile.is_flagged === true || (Number(state.profile.reports_count ?? 0) > 0);
  const trustScore = state.profile.trust_score;
  const reportsCount = state.profile.reports_count;
  const showTrustScore = trustScore != null;
  const showReportsCount = reportsCount != null && Number(reportsCount) > 0;
  const listingCount =
    state.stats.listingCount != null ? state.stats.listingCount : state.listings.length;
  const listingCountLabel = `${listingCount} annonce${listingCount > 1 ? 's' : ''}`;

  const renderHeader = (
    <View style={styles.header}>
      <View style={[cardStyles.default, styles.heroCard]}>
        <View style={styles.titleRow}>
          <Text style={styles.name}>{name}</Text>
          {state.profile.is_verified === true && (
            <SellerBadge variant="verified" label="Vérifié" />
          )}
          {state.profile.phone_verified === true && (
            <SellerBadge variant="phoneVerified" label="Téléphone vérifié" />
          )}
          {isFlagged && (
            <SellerBadge variant="flagged" label="Profil signalé" />
          )}
        </View>
        {city ? (
          <Text style={styles.city}>{city}</Text>
        ) : null}
        <View style={styles.metaRow}>
          {joinDate ? <Text style={styles.meta}>Membre depuis {joinDate}</Text> : null}
          <Text style={styles.meta}>{listingCountLabel}</Text>
        </View>
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
        <View style={styles.headerActions}>
          <Button
            variant="secondary"
            size="sm"
            onPress={handleShareProfile}
            disabled={sharingProfile}
            loading={sharingProfile}
          >
            Partager le profil
          </Button>
        </View>
      </View>
      {bio ? (
        <View style={[cardStyles.default, styles.bioCard]}>
          <Text style={styles.bioTitle}>Bio vendeur</Text>
          <Text style={styles.bioText}>{bio}</Text>
        </View>
      ) : null}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Ses annonces</Text>
        <Text style={styles.sectionMeta}>{listingCountLabel}</Text>
      </View>
      {id && (
        <Pressable
          onPress={handleReportPress}
          style={({ pressed }) => [styles.reportLink, pressed && styles.reportLinkPressed]}
        >
          <Text style={styles.reportLinkText}>Signaler ce vendeur</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <Screen scroll={false}>
      <AppHeader title="Profil vendeur" showBack />
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
            <Text style={styles.modalTitle}>Signaler ce vendeur</Text>
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
      <FlatList
        data={state.listings}
        numColumns={2}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <EmptyState
            title="Aucune annonce en ligne"
            message="Ce vendeur n'a pas encore d'annonce publique disponible."
            style={styles.emptyWrap}
          />
        }
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={6}
        windowSize={Platform.OS === 'ios' ? 6 : 10}
        removeClippedSubviews={Platform.OS === 'ios'}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1 },
  header: {
    padding: spacing.base,
    paddingBottom: spacing.lg,
  },
  heroCard: {
    padding: spacing.lg,
    marginBottom: spacing.base,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginBottom: spacing.xs,
  },
  name: {
    ...typography['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  city: {
    ...typography.base,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
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
  headerActions: {
    marginTop: spacing.sm,
    alignItems: 'flex-start',
  },
  trustText: {
    ...typography.sm,
    color: colors.textSecondary,
  },
  bioCard: {
    padding: spacing.lg,
    marginBottom: spacing.base,
  },
  bioTitle: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  bioText: {
    ...typography.base,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  sectionTitle: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionMeta: {
    ...typography.sm,
    color: colors.textMuted,
  },
  reportLink: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
    marginTop: spacing.sm,
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
    borderRadius: 16,
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
    borderRadius: 12,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
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
  listContent: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
    flexGrow: 1,
  },
  cardWrap: {
    flex: 1,
    minWidth: 0,
  },
  gridRow: {
    gap: spacing.base,
    marginBottom: spacing.base,
  },
  emptyWrap: {
    flex: 1,
    paddingTop: spacing.xl,
  },
});
