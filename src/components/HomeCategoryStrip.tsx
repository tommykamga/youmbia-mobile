/**
 * Bande catégories — scroll horizontal, états actif/inactif (tuiles compactes type Leboncoin).
 * Icônes rendues directement dans la tuile : pas de wrapper, pas de fond / radius sous l’icône.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LISTING_CATEGORIES } from '@/lib/listingCategories';
import type { WindowSizeBucket } from '@/lib/responsiveLayout';
import { spacing, colors } from '@/theme';

const AUTRES_LABEL = 'Autres';

/** Jetons locaux au strip rapide (ne pas élargir aux autres écrans sans besoin explicite). */
const STRIP = {
  activeBg: 'rgba(110, 220, 95, 0.10)',
  activeBorder: 'rgba(22, 163, 74, 0.45)',
  activeBorderWidth: 1.35,
  inactiveBg: '#FFFFFF',
  inactiveBorder: 'rgba(15, 23, 42, 0.06)',
  inactiveBorderWidth: 1,
  radius: 17,
  itemGap: 16,
  iconActive: colors.primary,
  iconInactive: 'rgba(15, 23, 42, 0.45)',
  labelActive: colors.primary,
  labelInactive: 'rgba(15, 23, 42, 0.70)',
} as const;

/** Libellés courts affichés (pas de troncature sur ces chaînes). */
const STRIP_LABEL: Record<string, string> = {
  Véhicules: 'Auto',
  Électronique: 'Tech',
  Maison: 'Maison',
  Mode: 'Mode',
  Immobilier: 'Immo',
  Services: 'Services',
  Informatique: 'Info',
};

const CATEGORY_ICON_ACTIVE: Record<string, keyof typeof Ionicons.glyphMap> = {
  Véhicules: 'car',
  Mode: 'shirt',
  Maison: 'home',
  Électronique: 'laptop',
  Immobilier: 'business',
  Services: 'construct',
  Informatique: 'hardware-chip',
};

const CATEGORY_ICON_INACTIVE: Record<string, keyof typeof Ionicons.glyphMap> = {
  Véhicules: 'car-outline',
  Mode: 'shirt-outline',
  Maison: 'home-outline',
  Électronique: 'laptop-outline',
  Immobilier: 'business-outline',
  Services: 'construct-outline',
  Informatique: 'hardware-chip-outline',
};

function stripLabel(fullLabel: string): string {
  return STRIP_LABEL[fullLabel] ?? fullLabel;
}

function targetScreenInset(bucket: WindowSizeBucket): number {
  if (bucket === 'large') return 24;
  return 20;
}

/** Largeur / hauteur fixes — pas d’étirement pour remplir l’écran (scroll type Leboncoin). */
function stripDimensions(bucket: WindowSizeBucket): {
  itemWidth: number;
  minHeight: number;
  iconSize: number;
} {
  if (bucket === 'large') {
    return { itemWidth: 62, minHeight: 66, iconSize: 19 };
  }
  if (bucket === 'compact') {
    return { itemWidth: 58, minHeight: 62, iconSize: 18 };
  }
  return { itemWidth: 60, minHeight: 64, iconSize: 19 };
}

/** Ombre légère iOS uniquement — pas d’elevation Android (évite halo / plaque claire derrière l’icône). */
const cellShadow = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  default: {},
});

const androidIconStyle =
  Platform.OS === 'android'
    ? ({
        backgroundColor: 'transparent' as const,
        includeFontPadding: false,
      } as const)
    : null;

export type HomeCategoryStripProps = {
  bucket: WindowSizeBucket;
  onCategoryPress: (id: string, label: string) => void;
  onAutresPress: () => void;
  insetHorizontal?: number;
  parentContentPad?: number;
  selectedCategoryId?: number | null;
};

export function HomeCategoryStrip({
  bucket,
  onCategoryPress,
  onAutresPress,
  insetHorizontal,
  parentContentPad,
  selectedCategoryId = null,
}: HomeCategoryStripProps) {
  const insetTarget = targetScreenInset(bucket);

  const outerStyle = useMemo(() => {
    if (parentContentPad != null) {
      const delta = insetTarget - parentContentPad;
      return {
        marginHorizontal: Math.min(0, delta),
        paddingHorizontal: Math.max(0, delta),
      };
    }
    return { paddingHorizontal: insetHorizontal ?? insetTarget };
  }, [parentContentPad, insetHorizontal, insetTarget]);

  const { itemWidth, minHeight, iconSize } = stripDimensions(bucket);

  /** Pas de `foreground: true` (évite une plaque / carré clair derrière le glyphe sur Android). */
  const ripple =
    Platform.OS === 'android'
      ? { color: 'rgba(15, 23, 42, 0.08)', borderless: false }
      : undefined;

  return (
    <View style={[styles.wrap, outerStyle]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
      >
        {LISTING_CATEGORIES.map((cat) => {
          const isActive = selectedCategoryId != null && selectedCategoryId === cat.id;
          const iconActive =
            CATEGORY_ICON_ACTIVE[cat.label] ?? ('grid' as keyof typeof Ionicons.glyphMap);
          const iconInactive =
            CATEGORY_ICON_INACTIVE[cat.label] ?? ('grid-outline' as keyof typeof Ionicons.glyphMap);
          const iconName = isActive ? iconActive : iconInactive;

          return (
            <Pressable
              key={cat.id}
              android_ripple={ripple}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              style={({ pressed }) => [
                styles.cell,
                cellShadow,
                {
                  width: itemWidth,
                  marginRight: STRIP.itemGap,
                  minHeight,
                  paddingVertical: 9,
                  paddingHorizontal: 7,
                  backgroundColor: isActive ? STRIP.activeBg : STRIP.inactiveBg,
                  borderColor: isActive ? STRIP.activeBorder : STRIP.inactiveBorder,
                  borderWidth: isActive ? STRIP.activeBorderWidth : STRIP.inactiveBorderWidth,
                  borderRadius: STRIP.radius,
                },
                pressed && styles.cellPressed,
              ]}
              onPress={() => onCategoryPress(String(cat.id), cat.label)}
              accessibilityRole="button"
              accessibilityLabel={cat.label}
              accessibilityState={{ selected: isActive }}
            >
              <Ionicons
                name={iconName}
                size={iconSize}
                color={isActive ? STRIP.iconActive : STRIP.iconInactive}
                style={androidIconStyle ?? undefined}
              />
              <Text
                style={[
                  styles.label,
                  isActive ? styles.labelActive : styles.labelInactive,
                ]}
                numberOfLines={1}
              >
                {stripLabel(cat.label)}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          android_ripple={ripple}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          style={({ pressed }) => [
            styles.cell,
            cellShadow,
            {
              width: itemWidth,
              marginRight: 0,
              minHeight,
              paddingVertical: 9,
              paddingHorizontal: 7,
              backgroundColor: STRIP.inactiveBg,
              borderColor: STRIP.inactiveBorder,
              borderWidth: STRIP.inactiveBorderWidth,
              borderRadius: STRIP.radius,
            },
            pressed && styles.cellPressed,
          ]}
          onPress={onAutresPress}
          accessibilityRole="button"
          accessibilityLabel={AUTRES_LABEL}
        >
          <Ionicons
            name="grid-outline"
            size={iconSize}
            color={STRIP.iconInactive}
            style={androidIconStyle ?? undefined}
          />
          <Text
            style={[styles.label, styles.labelInactive]}
            numberOfLines={1}
          >
            {AUTRES_LABEL}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.sm,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 4,
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  label: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 13,
    textAlign: 'center',
    width: '100%',
  },
  labelActive: {
    fontWeight: '700',
    color: STRIP.labelActive,
  },
  labelInactive: {
    fontWeight: '600',
    color: STRIP.labelInactive,
  },
});
