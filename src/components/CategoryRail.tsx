/**
 * CategoryRail – responsive single-line category tiles (icon + label).
 * Mini tuiles verticales, style premium ; logique responsive conservée (largeur, "Autres").
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ui } from '@/theme';

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
  Sport: 'fitness-outline',
  Loisirs: 'game-controller-outline',
  Autre: 'ellipsis-horizontal-outline',
};

const AUTRES_ICON = 'grid-outline';

function getCategoryIcon(label: string): string {
  return CATEGORY_ICON[label] ?? 'ellipsis-horizontal-outline';
}

export type CategoryRailProps = {
  categories: readonly string[];
  onCategoryPress: (label: string) => void;
  onVoirToutPress: () => void;
  /** Marge latérale du rail (alignée sur le padding Home / feed). */
  edgePadding?: number;
};

export function CategoryRail({
  categories,
  onCategoryPress,
  onVoirToutPress,
  edgePadding = ui.spacing.lg,
}: CategoryRailProps) {
  const { width } = useWindowDimensions();

  const { visibleCategories, showAutres, itemWidth } = useMemo(() => {
    const list = Array.isArray(categories) ? [...categories] : [];
    if (list.length === 0) {
      return { visibleCategories: [], showAutres: false, itemWidth: 0 };
    }

    const horizontalPaddingTotal = edgePadding * 4;
    const availableWidth =
      width - horizontalPaddingTotal - SAFETY_BUFFER;

    let nVisible = Math.max(
      1,
      Math.min(
        list.length,
        Math.floor(
          (availableWidth - ITEM_MIN_WIDTH) / (ITEM_MIN_WIDTH + GAP)
        )
      )
    );
    const showAutres = nVisible < list.length;
    const chipCount = nVisible + (showAutres ? 1 : 0);
    const totalGaps = (chipCount - 1) * GAP;
    let itemWidth = Math.floor((availableWidth - totalGaps) / chipCount);

    if (itemWidth < ITEM_MIN_WIDTH && chipCount > 1) {
      nVisible = Math.max(1, nVisible - 1);
      const newCount = nVisible + (nVisible < list.length ? 1 : 0);
      const newGaps = (newCount - 1) * GAP;
      itemWidth = Math.floor((availableWidth - newGaps) / newCount);
    }
    itemWidth = Math.max(ITEM_MIN_WIDTH, itemWidth);

    const visible = list.slice(
      0,
      showAutres ? nVisible : list.length
    );
    const finalCount = visible.length + (showAutres ? 1 : 0);
    const finalGaps = (finalCount - 1) * GAP;
    const finalItemWidth =
      finalCount > 0
        ? Math.floor((availableWidth - finalGaps) / finalCount)
        : ITEM_MIN_WIDTH;

    return {
      visibleCategories: visible,
      showAutres,
      itemWidth: Math.max(ITEM_MIN_WIDTH, finalItemWidth),
    };
  }, [categories, width, edgePadding]);

  const renderTile = (
    label: string,
    iconName: string,
    onPress: () => void,
    isAutres?: boolean
  ) => (
    <Pressable
      key={isAutres ? AUTRES_LABEL : label}
      style={({ pressed }) => [
        styles.tile,
        itemWidth > 0 && {
          width: itemWidth,
          minWidth: itemWidth,
          maxWidth: itemWidth,
        },
        pressed && styles.tilePressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.iconWrap}>
        <Ionicons
          name={iconName as keyof typeof Ionicons.glyphMap}
          size={ICON_SIZE}
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

  return (
    <View style={[styles.rail, { paddingHorizontal: edgePadding }]} pointerEvents="box-none">
      {visibleCategories.map((label) =>
        renderTile(
          label,
          getCategoryIcon(label),
          () => onCategoryPress(label),
          false
        )
      )}
      {showAutres &&
        renderTile(AUTRES_LABEL, AUTRES_ICON, onVoirToutPress, true)}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: GAP,
    paddingVertical: ui.spacing.xs,
    marginBottom: ui.spacing.sm,
    overflow: 'hidden',
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: ui.spacing.xs,
    borderRadius: ui.radius.lg,
  },
  tilePressed: {
    opacity: 0.92,
    backgroundColor: ui.colors.primarySoft,
    transform: [{ scale: 0.97 }],
  },
  iconWrap: {
    width: ICON_WRAP_SIZE,
    height: ICON_WRAP_SIZE,
    borderRadius: ICON_WRAP_SIZE / 2,
    backgroundColor: ui.colors.surface,
    borderWidth: 1,
    borderColor: ui.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: ui.spacing.xs,
    ...ui.typography.bodySmall,
    fontWeight: '600',
    color: ui.colors.textPrimary,
    textAlign: 'center',
  },
});
