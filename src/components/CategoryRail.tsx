/**
 * CategoryRail – rangée compacte (non scroll) alignée sur `categoryQuickStrip`.
 * Icônes sans wrapper ni fond ; même lecture visuelle que HomeCategoryStrip (état inactif).
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ui, categoryQuickStrip as q } from '@/theme';

const AUTRES_LABEL = 'Autres';

const SAFETY_BUFFER = 8;

/** Mapping label → icône outline (pas de variante sélectionnée dans ce rail). */
const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  Véhicules: 'car-outline',
  Mode: 'shirt-outline',
  Maison: 'home-outline',
  Électronique: 'laptop-outline',
  Sport: 'fitness-outline',
  Loisirs: 'game-controller-outline',
  Autre: 'ellipsis-horizontal-outline',
};

const AUTRES_ICON: keyof typeof Ionicons.glyphMap = 'grid-outline';

function getCategoryIcon(label: string): keyof typeof Ionicons.glyphMap {
  return CATEGORY_ICON[label] ?? 'ellipsis-horizontal-outline';
}

const cellShadow = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  android: { elevation: 1 },
  default: {},
});

export type CategoryRailProps = {
  categories: readonly string[];
  onCategoryPress: (label: string) => void;
  onVoirToutPress: () => void;
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

    const gap = q.itemGap;
    const minW = 80;
    const horizontalPaddingTotal = edgePadding * 2;
    const availableWidth = width - horizontalPaddingTotal - SAFETY_BUFFER;

    let nVisible = Math.max(
      1,
      Math.min(
        list.length,
        Math.floor((availableWidth - minW) / (minW + gap))
      )
    );
    const showAutres = nVisible < list.length;
    const chipCount = nVisible + (showAutres ? 1 : 0);
    const totalGaps = (chipCount - 1) * gap;
    let computed = Math.floor((availableWidth - totalGaps) / chipCount);

    if (computed < minW && chipCount > 1) {
      nVisible = Math.max(1, nVisible - 1);
      const newCount = nVisible + (nVisible < list.length ? 1 : 0);
      const newGaps = (newCount - 1) * gap;
      computed = Math.floor((availableWidth - newGaps) / newCount);
    }
    computed = Math.max(minW, computed);

    const visible = list.slice(0, showAutres ? nVisible : list.length);
    const finalCount = visible.length + (showAutres ? 1 : 0);
    const finalGaps = (finalCount - 1) * gap;
    const finalItemWidth =
      finalCount > 0
        ? Math.floor((availableWidth - finalGaps) / finalCount)
        : minW;

    return {
      visibleCategories: visible,
      showAutres,
      itemWidth: Math.max(minW, finalItemWidth),
    };
  }, [categories, width, edgePadding]);

  const iconSz = width >= 430 ? 24 : 22;

  const renderTile = (
    label: string,
    iconName: keyof typeof Ionicons.glyphMap,
    onPress: () => void,
    isAutres?: boolean
  ) => (
    <Pressable
      key={isAutres ? AUTRES_LABEL : label}
      style={({ pressed }) => [
        styles.tile,
        cellShadow,
        itemWidth > 0 && {
          width: itemWidth,
          minWidth: itemWidth,
          maxWidth: itemWidth,
        },
        pressed && styles.tilePressed,
      ]}
      onPress={onPress}
    >
      <Ionicons name={iconName} size={iconSz} color={q.iconInactive} style={styles.iconInactiveDim} />
      <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.rail, { paddingHorizontal: edgePadding }]} pointerEvents="box-none">
      {visibleCategories.map((label) =>
        renderTile(label, getCategoryIcon(label), () => onCategoryPress(label), false)
      )}
      {showAutres && renderTile(AUTRES_LABEL, AUTRES_ICON, onVoirToutPress, true)}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: q.itemGap,
    paddingVertical: ui.spacing.xs,
    marginBottom: ui.spacing.sm,
    overflow: 'hidden',
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 9,
    minHeight: 74,
    backgroundColor: q.inactiveBg,
    borderWidth: q.inactiveBorderWidth,
    borderColor: q.inactiveBorder,
    borderRadius: q.radius,
    gap: 5,
  },
  tilePressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  iconInactiveDim: {
    opacity: q.iconInactiveOpacity,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: q.labelInactive,
    textAlign: 'center',
  },
});
