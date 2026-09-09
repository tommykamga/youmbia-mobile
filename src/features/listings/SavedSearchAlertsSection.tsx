/**
 * Entrée légère vers les recherches sauvegardées (Home / compte).
 * Aucun scan de feed, aucun matching client : la détection d’alerte est serveur.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { buildSavedSearchHref, getSavedSearches, trackSavedSearchOpen, type SavedSearch } from '@/services/savedSearches';
import { colors, spacing, typography, fontWeights, radius, ui } from '@/theme';

export function SavedSearchAlertsSection() {
  const router = useRouter();
  const [searches, setSearches] = useState<SavedSearch[]>([]);

  const load = useCallback(async () => {
    const items = await getSavedSearches();
    setSearches(items.filter((item) => item.enabled).slice(0, 5));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const handleOpenSearch = useCallback(
    (item: SavedSearch) => {
      trackSavedSearchOpen(item.id);
      router.push(buildSavedSearchHref(item) as never);
    },
    [router]
  );

  const handleSeeAll = useCallback(() => {
    router.push('/account/saved-searches' as never);
  }, [router]);

  if (searches.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerBody}>
          <View style={styles.titleRow}>
            <Ionicons
              name="bookmark-outline"
              size={18}
              color={colors.textMuted}
              style={styles.titleIcon}
            />
            <Text style={styles.title}>Vos recherches sauvegardées</Text>
          </View>
          <Text style={styles.subtitle}>Ouvrez une recherche ou gérez vos alertes.</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          onPress={handleSeeAll}
        >
          <Text style={styles.actionText}>Gérer</Text>
        </Pressable>
      </View>
      {searches.map((item) => (
        <Pressable
          key={item.id}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => handleOpenSearch(item)}
        >
          <Text style={styles.rowLabel} numberOfLines={1}>
            {item.label || item.query || 'Recherche'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.borderLight} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerBody: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleIcon: {
    marginRight: spacing.xs,
  },
  title: {
    ...ui.typography.h2,
    letterSpacing: -0.35,
    color: ui.colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  subtitle: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  actionBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  actionBtnPressed: {
    opacity: 0.85,
  },
  actionText: {
    ...typography.xs,
    color: colors.text,
    fontWeight: fontWeights.semibold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  rowPressed: {
    opacity: 0.9,
  },
  rowLabel: {
    ...typography.sm,
    color: colors.text,
    flex: 1,
    minWidth: 0,
    marginRight: spacing.sm,
  },
});
