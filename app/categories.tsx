/**
 * Full categories screen – opened from home "Voir tout" pill.
 * Tap a category → search tab with that query.
 */

import React, { useMemo } from 'react';
import { Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, AppHeader, Loader } from '@/components';
import { useMarketplaceCategories } from '@/hooks/useMarketplaceCategories';
import { getRootMarketplaceCategories } from '@/lib/marketplaceCategories';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

export default function CategoriesScreen() {
  const router = useRouter();
  const { categories, loading, error } = useMarketplaceCategories();
  const rootCategories = useMemo(() => getRootMarketplaceCategories(categories), [categories]);

  const handleCategoryPress = (categoryId: number, label: string) => {
    router.push(
      `/(tabs)/search?categoryLabel=${encodeURIComponent(label)}&categoryId=${categoryId}`
    );
  };

  return (
    <Screen safe={false}>
      <AppHeader title="Catégories" showBack density="compact" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {loading ? <Loader /> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {rootCategories.map((category) => (
          <Pressable
            key={category.id}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => handleCategoryPress(category.id, category.name)}
          >
            <Text style={styles.label}>{category.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.sm,
  },
  rowPressed: {
    opacity: 0.9,
    backgroundColor: colors.surfaceSubtle,
  },
  label: {
    ...typography.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  errorText: {
    ...typography.sm,
    color: colors.error,
    marginBottom: spacing.sm,
  },
});
