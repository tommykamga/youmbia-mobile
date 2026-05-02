/**
 * CategoryRail – responsive single-line category tiles (icon + label).
 * Mini tuiles verticales, style premium ; logique responsive conservée (largeur, "Autres").
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ui } from '@/theme';
import { SkeletonShimmer } from './SkeletonShimmer';

const AUTRES_LABEL = 'Autres';

const ITEM_MIN_WIDTH = 80;
const GAP = ui.spacing.sm;
const SAFETY_BUFFER = 8;

const ICON_WRAP_SIZE = 52;
const ICON_SIZE = 22;

/** Mapping local label → icône Ionicons (outline). Fallback: ellipsis-horizontal. */
const CATEGORY_ICON: Record<string, string> = {
  Véhicules: 'car-outline',
  Mode: 'shirt-outline',
  Maison: 'home-outline',
  Électronique: 'laptop-outline',
  Immobilier: 'business-outline',
  Services: 'construct-outline',
  Informatique: 'desktop-outline',
  Autres: 'grid-outline',
};

const CATEGORY_BG: Record<string, string> = {
  Véhicules: '#E0F2FE', // Blue
  Mode: '#FCE7F3',      // Pink
  Maison: '#FEF3C7',    // Amber
  Électronique: '#E0E7FF', // Indigo
  Immobilier: '#FFEDD5',  // Orange
  Services: '#F1F5F9',    // Slate
  Informatique: '#D1FAE5', // Emerald
  Autres: '#F1F5F9',
};

const AUTRES_ICON = 'grid-outline';

function getCategoryIcon(label: string): string {
  return CATEGORY_ICON[label] ?? 'grid-outline';
}

function getCategoryBg(label: string): string {
  return CATEGORY_BG[label] ?? '#F1F5F9';
}

export type CategoryItem = { id: string; label: string };

export type CategoryRailProps = {
  categories: readonly CategoryItem[];
  onCategoryPress: (item: CategoryItem) => void;
  onVoirToutPress: () => void;
  /** Marge latérale du rail (alignée sur le padding Home / feed). */
  edgePadding?: number;
  loading?: boolean;
};

export function CategoryRail({
  categories,
  onCategoryPress,
  onVoirToutPress,
  edgePadding = ui.spacing.lg,
  loading = false,
}: CategoryRailProps) {
  const { width } = useWindowDimensions();

  const { visibleCategories, showAutres } = useMemo(() => {
    const list = Array.isArray(categories) ? [...categories] : [];
    // For a 2x2 grid, we show the first 3 categories + "Autres" (total 4)
    const visible = list.slice(0, 3);
    return {
      visibleCategories: visible,
      showAutres: list.length > 3,
    };
  }, [categories]);

  const renderTile = (
    label: string,
    iconName: string,
    onPress: () => void,
    itemKey: string,
    isAutres?: boolean
  ) => (
    <Pressable
      key={itemKey}
      style={({ pressed }) => [
        styles.tile,
        pressed && styles.tilePressed,
      ]}
      onPress={onPress}
    >
      <View style={[styles.iconWrap, { backgroundColor: getCategoryBg(label) }]}>
        <Ionicons
          name={iconName as keyof typeof Ionicons.glyphMap}
          size={ICON_SIZE + 2}
          color={ui.colors.primary}
        />
      </View>
      <Text
        style={styles.label}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {label}
      </Text>
    </Pressable>
  );

  const renderSkeleton = () => (
    <View style={styles.tile}>
      <View style={styles.skeletonIconWrap}>
        <SkeletonShimmer style={styles.skeletonIcon} />
      </View>
      <SkeletonShimmer style={styles.skeletonText} />
    </View>
  );

  return (
    <View style={[styles.rail, { paddingHorizontal: edgePadding }]} pointerEvents="box-none">
      {loading ? (
        <>
          {renderSkeleton()}
          {renderSkeleton()}
          {renderSkeleton()}
          {renderSkeleton()}
        </>
      ) : (
        <>
          {visibleCategories.map((item) =>
            renderTile(
              item.label,
              getCategoryIcon(item.label),
              () => onCategoryPress(item),
              item.id,
              false
            )
          )}
          {showAutres &&
            renderTile(AUTRES_LABEL, AUTRES_ICON, onVoirToutPress, 'autres-tile', true)}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginBottom: ui.spacing.md,
  },
  tile: {
    width: '48%',
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: ui.spacing.md + 4,
    paddingHorizontal: ui.spacing.sm,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.04)',
    // Micro shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  tilePressed: {
    opacity: 0.9,
    backgroundColor: ui.colors.primarySoft,
    transform: [{ scale: 0.98 }],
  },
  iconWrap: {
    width: ICON_WRAP_SIZE,
    height: ICON_WRAP_SIZE,
    borderRadius: ICON_WRAP_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: ui.spacing.sm,
    opacity: 0.85, // Lighter icon circles
  },
  label: {
    ...ui.typography.bodySmall,
    fontWeight: '700',
    color: ui.colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.1,
  },
  skeletonIconWrap: {
    width: ICON_WRAP_SIZE,
    height: ICON_WRAP_SIZE,
    borderRadius: ICON_WRAP_SIZE / 2,
    backgroundColor: '#F2F2F2',
    overflow: 'hidden',
    marginBottom: ui.spacing.sm,
  },
  skeletonIcon: {
    width: '100%',
    height: '100%',
  },
  skeletonText: {
    width: 60,
    height: 12,
    borderRadius: 4,
    backgroundColor: '#F2F2F2',
  },
});
