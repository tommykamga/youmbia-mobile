/**
 * Saved searches – list and run saved searches.
 * Persistence: in-memory (see src/services/savedSearches). Replace with AsyncStorage or Supabase for production.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, AppHeader, EmptyState } from '@/components';
import { getSavedSearches, removeSavedSearch, type SavedSearch } from '@/services/savedSearches';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

export default function SavedSearchesScreen() {
  const router = useRouter();
  const [list, setList] = useState<SavedSearch[]>([]);

  const load = useCallback(() => {
    setList(getSavedSearches());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handlePress = useCallback(
    (item: SavedSearch) => {
      const params = new URLSearchParams();
      if (item.query) params.set('q', item.query);
      if (item.priceMin != null) params.set('priceMin', String(item.priceMin));
      if (item.priceMax != null) params.set('priceMax', String(item.priceMax));
      if (item.category) params.set('category', item.category);
      if (item.city) params.set('city', item.city);
      router.push(`/(tabs)/search?${params.toString()}` as const);
    },
    [router]
  );

  const handleDelete = useCallback((id: string) => {
    const ok = removeSavedSearch(id);
    if (!ok) return;
    setList(getSavedSearches());
  }, []);

  const keyExtractor = useCallback((item: SavedSearch) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: SavedSearch }) => {
      const subtitle = [
        item.category,
        item.city,
        item.priceMin != null && `Min ${item.priceMin} FCFA`,
        item.priceMax != null && `Max ${item.priceMax} FCFA`,
      ]
        .filter(Boolean)
        .join(' · ');
      return (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => handlePress(item)}
        >
          <View style={styles.rowBody}>
            <Text style={styles.rowQuery} numberOfLines={1}>{item.label || item.query || 'Recherche'}</Text>
            {subtitle ? (
              <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text>
            ) : null}
          </View>
          <Pressable
            style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
            onPress={() => handleDelete(item.id)}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
          </Pressable>
        </Pressable>
      );
    },
    [handlePress, handleDelete]
  );

  if (list.length === 0) {
    return (
      <Screen safe={false}>
        <AppHeader title="Recherches sauvegardées" showBack density="compact" />
        <View style={styles.emptyWrap}>
          <EmptyState
            variant="plain"
            title="Aucune recherche sauvegardée"
            message="Sur l'écran Recherche, lancez une recherche puis appuyez sur « Sauvegarder cette recherche »."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen safe={false}>
      <AppHeader title="Recherches sauvegardées" showBack density="compact" />
      <FlatList
        data={list}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  deleteBtn: {
    padding: spacing.sm,
  },
  deleteBtnPressed: {
    opacity: 0.7,
  },
});
