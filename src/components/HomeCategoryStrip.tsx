/**
 * Bande catégories Home — grille compacte responsive (pas de swipe horizontal cheap).
 * Petits écrans : 3 + Autres ; moyens : 4 + Autres ; grands : 5 + Autres.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LISTING_CATEGORIES } from '@/lib/listingCategories';
import type { WindowSizeBucket } from '@/lib/responsiveLayout';
import { ui, colors, spacing } from '@/theme';

const CATEGORY_ICON: Record<string, string> = {
  Véhicules: 'car-outline',
  Mode: 'shirt-outline',
  Maison: 'home-outline',
  Électronique: 'laptop-outline',
  Immobilier: 'business-outline',
  Services: 'construct-outline',
  Informatique: 'desktop-outline',
};

const AUTRES_LABEL = 'Autres';

/** Libellés courts affichés uniquement sur la Home (navigation inchangée : `cat.label` conservé). */
const HOME_CATEGORY_SHORT_LABEL: Record<string, string> = {
  Véhicules: 'Véhicules',
  Électronique: 'Tech',
  Maison: 'Maison',
  Mode: 'Mode',
  Immobilier: 'Immo',
  Services: 'Services',
  Informatique: 'Info',
};

function homeCategoryDisplayLabel(fullLabel: string): string {
  return HOME_CATEGORY_SHORT_LABEL[fullLabel] ?? fullLabel;
}

function mainCountForBucket(bucket: WindowSizeBucket): number {
  if (bucket === 'compact') return 3;
  if (bucket === 'regular') return 4;
  return 5;
}

export type HomeCategoryStripProps = {
  bucket: WindowSizeBucket;
  onCategoryPress: (id: string, label: string) => void;
  onAutresPress: () => void;
};

export function HomeCategoryStrip({ bucket, onCategoryPress, onAutresPress }: HomeCategoryStripProps) {
  const nMain = mainCountForBucket(bucket);
  const { visible, restCount } = useMemo(() => {
    const list = [...LISTING_CATEGORIES];
    const main = list.slice(0, nMain);
    const rest = Math.max(0, list.length - nMain);
    return { visible: main, restCount: rest };
  }, [nMain]);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {visible.map((cat) => {
          const iconName = CATEGORY_ICON[cat.label] ?? 'grid-outline';
          return (
            <Pressable
              key={cat.id}
              style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
              onPress={() => onCategoryPress(String(cat.id), cat.label)}
              accessibilityRole="button"
              accessibilityLabel={cat.label}
            >
              <Ionicons
                name={iconName as keyof typeof Ionicons.glyphMap}
                size={22}
                color={ui.colors.primary}
              />
              <Text style={styles.label} numberOfLines={1}>
                {homeCategoryDisplayLabel(cat.label)}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          style={({ pressed }) => [styles.cell, styles.cellAutres, pressed && styles.cellPressed]}
          onPress={onAutresPress}
          accessibilityRole="button"
          accessibilityLabel={restCount > 0 ? `${AUTRES_LABEL}, ${restCount} autres catégories` : AUTRES_LABEL}
        >
          <Ionicons name="apps-outline" size={22} color={ui.colors.textSecondary} />
          <Text style={[styles.label, styles.labelAutres]} numberOfLines={1}>
            {AUTRES_LABEL}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const CELL_RADIUS = 15;

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: ui.colors.borderLight,
    borderRadius: CELL_RADIUS,
    minHeight: 78,
  },
  cellAutres: {
    backgroundColor: colors.surface,
  },
  cellPressed: {
    opacity: 0.88,
    backgroundColor: ui.colors.primarySoft,
    borderColor: ui.colors.primary + '35',
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: ui.colors.textPrimary,
    textAlign: 'center',
    width: '100%',
  },
  labelAutres: {
    color: ui.colors.textSecondary,
  },
});
