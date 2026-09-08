/**
 * Saved searches – list, toggle alerts, delete, reopen Search.
 * Source de vérité : Supabase RLS (owner only).
 */

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, AppHeader, EmptyState, NotificationsActivationCard } from '@/components';
import {
  buildSavedSearchHref,
  deleteSavedSearch,
  getSavedSearches,
  setSavedSearchEnabled,
  trackSavedSearchOpen,
  type SavedSearch,
} from '@/services/savedSearches';
import { getSession } from '@/services/auth';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

export default function SavedSearchesScreen() {
  const router = useRouter();
  const [list, setList] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const session = await getSession();
    if (!session?.user) {
      router.replace(
        buildAuthGateHref('search', { redirect: '/account/saved-searches' })
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await getSavedSearches();
      setList(next);
    } catch {
      setError('Impossible de charger vos recherches');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const handlePress = useCallback(
    (item: SavedSearch) => {
      trackSavedSearchOpen(item.id);
      router.push(buildSavedSearchHref(item) as never);
    },
    [router]
  );

  const handleToggle = useCallback(async (item: SavedSearch) => {
    const nextEnabled = !item.enabled;
    setList((current) =>
      current.map((row) => (row.id === item.id ? { ...row, enabled: nextEnabled } : row))
    );
    const result = await setSavedSearchEnabled(item.id, nextEnabled);
    if (!result.ok) {
      setList((current) =>
        current.map((row) => (row.id === item.id ? { ...row, enabled: item.enabled } : row))
      );
      setError(result.error.message);
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    const result = await deleteSavedSearch(id);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setList((current) => current.filter((item) => item.id !== id));
  }, []);

  const keyExtractor = useCallback((item: SavedSearch) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: SavedSearch }) => {
      const subtitle = [
        item.category,
        item.city,
        item.priceMin != null && `Min ${item.priceMin} FCFA`,
        item.priceMax != null && `Max ${item.priceMax} FCFA`,
        item.enabled ? 'Alerte activée' : 'Alerte désactivée',
      ]
        .filter(Boolean)
        .join(' · ');
      return (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => handlePress(item)}
        >
          <View style={styles.rowBody}>
            <Text style={styles.rowQuery} numberOfLines={1}>
              {item.label || item.query || 'Recherche'}
            </Text>
            {subtitle ? (
              <Text style={styles.rowSubtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            onPress={() => void handleToggle(item)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={item.enabled ? 'Désactiver l’alerte' : 'Activer l’alerte'}
          >
            <Ionicons
              name={item.enabled ? 'notifications-outline' : 'notifications-off-outline'}
              size={20}
              color={item.enabled ? colors.primary : colors.textMuted}
            />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            onPress={() => void handleDelete(item.id)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Supprimer cette recherche"
          >
            <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
          </Pressable>
        </Pressable>
      );
    },
    [handlePress, handleToggle, handleDelete]
  );

  return (
    <Screen safe={false}>
      <AppHeader title="Recherches sauvegardées" showBack density="compact" />
      <View style={styles.activationWrap}>
        <NotificationsActivationCard />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {loading && list.length === 0 ? (
        <View style={styles.emptyWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : list.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            variant="plain"
            title="Aucune recherche sauvegardée"
            message="Sur l'écran Recherche, lancez une recherche puis appuyez sur « Sauvegarder cette recherche »."
          />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  activationWrap: {
    paddingHorizontal: spacing.base,
  },
  errorText: {
    ...typography.xs,
    color: colors.error,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    transform: [{ translateY: -24 }],
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xs,
    paddingBottom: spacing['3xl'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  rowPressed: {
    opacity: 0.95,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowQuery: {
    ...typography.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  rowSubtitle: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  iconBtn: {
    padding: spacing.sm,
  },
  iconBtnPressed: {
    opacity: 0.7,
  },
});
