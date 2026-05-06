/**
 * Full categories screen – opened from home "Voir tout" pill.
 * Tap a category → search tab with that query.
 */

import React from 'react';
import { Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, AppHeader } from '@/components';
import { LISTING_CATEGORIES } from '@/lib/listingCategories';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

/** Full list of categories – same as home rail + optional extras. */
const ALL_CATEGORIES = [
  'Véhicules',
  'Électronique',
  'Maison',
  'Mode',
  'Immobilier',
  'Services',
  'Informatique',
];

export default function CategoriesScreen() {
  const router = useRouter();

  const handleCategoryPress = (label: string) => {
    const category = LISTING_CATEGORIES.find(c => c.label === label);
    if (category) {
      // Navigation structurée : ID officiel + libellé pour l'affichage
      router.push(`/(tabs)/search?categoryLabel=${encodeURIComponent(label)}&categoryId=${category.id}`);
    } else {
      // Fallback temporaire : recherche par texte si l'ID n'est pas encore mappé
      router.push(`/(tabs)/search?q=${encodeURIComponent(label)}`);
    }
  };

  return (
    <Screen safe={false}>
      <AppHeader title="Catégories" showBack density="compact" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {ALL_CATEGORIES.map((label) => (
          <Pressable
            key={label}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => handleCategoryPress(label)}
          >
            <Text style={styles.label}>{label}</Text>
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
});
