/**
 * Bande catégories — scroll horizontal, états actif/inactif (tuiles compactes type Leboncoin).
 * Variante accueil : pictogrammes sur support menthe, libellés dessous ; mêmes données métier.
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
import type { WindowSizeBucket } from '@/lib/responsiveLayout';
import { getRootMarketplaceCategories, getSellParentIcon } from '@/lib/marketplaceCategories';
import type { MarketplaceCategory } from '@/services/categories';
import { useMarketplaceCategories } from '@/hooks/useMarketplaceCategories';
import { colors, getShadowStyle, semantic } from '@/theme';

const AUTRES_LABEL = 'Autres';

/** Jetons locaux au strip rapide (ne pas élargir aux autres écrans sans besoin explicite). */
const STRIP = {
  activeBg: 'rgba(22, 163, 74, 0.09)',
  activeBorder: 'rgba(22, 163, 74, 0.34)',
  activeBorderWidth: 1.2,
  inactiveBg: '#FFFFFF',
  inactiveBorder: 'rgba(15, 23, 42, 0.07)',
  inactiveBorderWidth: 1,
  radius: 17,
  itemGap: 16,
  iconActive: colors.primary,
  iconInactive: 'rgba(15, 23, 42, 0.42)',
  labelActive: colors.primary,
  labelInactive: 'rgba(15, 23, 42, 0.72)',
} as const;

/** The displayed label must describe the full category branch selected by its ID. */
function stripLabel(category: { name: string }): string {
  return category.name;
}

function stripIcon(category: { slug: string }, active: boolean): keyof typeof Ionicons.glyphMap {
  const icon = getSellParentIcon(category.slug);
  if (!active) {
    return icon;
  }
  return icon.endsWith('-outline') ? (icon.replace(/-outline$/, '') as keyof typeof Ionicons.glyphMap) : icon;
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

/** Ombre légère — Android elevation 1 pour éviter halo derrière l’icône. */
const cellShadow = getShadowStyle('subtle', { androidElevation: 1 });

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
  /** Variante compacte activée uniquement par l’accueil. */
  compact?: boolean;
};

export function HomeCategoryStrip(props: HomeCategoryStripProps) {
  const { categories } = useMarketplaceCategories();
  return <HomeCategoryStripContent {...props} categories={categories} />;
}

/** Shared visual component; callers supply the same business taxonomy. */
export function HomeCategoryStripContent({
  bucket,
  onCategoryPress,
  onAutresPress,
  insetHorizontal,
  parentContentPad,
  selectedCategoryId = null,
  compact = false,
  categories,
}: HomeCategoryStripProps & { categories: readonly MarketplaceCategory[] }) {
  const rootCategories = useMemo(() => getRootMarketplaceCategories([...categories]), [categories]);
  const insetTarget = targetScreenInset(bucket);

  const outerStyle = useMemo(() => {
    if (insetHorizontal != null) {
      return { paddingHorizontal: insetHorizontal };
    }
    if (parentContentPad != null) {
      const delta = insetTarget - parentContentPad;
      return {
        marginHorizontal: Math.min(0, delta),
        paddingHorizontal: Math.max(0, delta),
      };
    }
    return { paddingHorizontal: insetTarget };
  }, [parentContentPad, insetHorizontal, insetTarget]);

  const { itemWidth, minHeight, iconSize } = compact
    ? { itemWidth: 68, minHeight: 52, iconSize: 18 }
    : stripDimensions(bucket);

  /** Pas de `foreground: true` (évite une plaque / carré clair derrière le glyphe sur Android). */
  const ripple =
    Platform.OS === 'android'
      ? { color: 'rgba(15, 23, 42, 0.08)', borderless: false }
      : undefined;

  if (compact) {
    const options = rootCategories.filter(category => category.slug !== 'autres');
    return <View style={[styles.wrap, outerStyle]}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.homeScroll}>
      {options.map(category => {
        const active = selectedCategoryId === category.id;
        return <Pressable key={category.id} accessibilityRole="button" accessibilityLabel={category.name}
          accessibilityState={{ selected: active }} style={styles.homeCell}
          onPress={() => onCategoryPress(String(category.id), category.name)}>
          <View style={[styles.homeIcon, active && styles.homeIconActive]}>
            <Ionicons name={stripIcon(category, active)} size={25} color="#0B4D3C" />
          </View>
          <Text style={[styles.homeLabel, active && styles.homeLabelActive]}>{stripLabel(category)}</Text>
        </Pressable>;
      })}
      <Pressable accessibilityRole="button" accessibilityLabel={AUTRES_LABEL} style={styles.homeCell} onPress={onAutresPress}>
        <View style={styles.homeIcon}><Ionicons name="grid-outline" size={25} color="#0B4D3C" /></View>
        <Text style={styles.homeLabel}>{AUTRES_LABEL}</Text>
      </Pressable>
    </ScrollView></View>;
  }

  return (
    <View style={[styles.wrap, outerStyle]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
      >
        {rootCategories
          .filter((category) => category.slug !== 'autres')
          .map((category) => {
          const isActive = selectedCategoryId != null && selectedCategoryId === category.id;
          const iconName = stripIcon(category, isActive);

          return (
            <Pressable
              key={category.id}
              android_ripple={ripple}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              style={({ pressed }) => [
                styles.cell,
                !compact && cellShadow,
                {
                  width: itemWidth,
                  marginRight: compact ? 8 : STRIP.itemGap,
                  minHeight,
                  paddingVertical: compact ? 6 : 9,
                  paddingHorizontal: 7,
                  backgroundColor: compact ? (isActive ? STRIP.activeBg : 'transparent') : isActive ? STRIP.activeBg : STRIP.inactiveBg,
                  borderColor: isActive ? STRIP.activeBorder : STRIP.inactiveBorder,
                  borderWidth: compact ? 0 : isActive ? STRIP.activeBorderWidth : STRIP.inactiveBorderWidth,
                  borderRadius: compact ? 12 : STRIP.radius,
                },
                pressed && styles.cellPressed,
              ]}
              onPress={() => onCategoryPress(String(category.id), category.name)}
              accessibilityRole="button"
              accessibilityLabel={category.name}
              accessibilityState={{ selected: isActive }}
            >
              <Ionicons
                name={iconName}
                size={iconSize}
                color={compact ? semantic.successText : isActive ? STRIP.iconActive : STRIP.iconInactive}
                style={androidIconStyle ?? undefined}
              />
              <Text
                style={[
                  styles.label,
                  isActive ? styles.labelActive : styles.labelInactive,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.86}
              >
                {stripLabel(category)}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          android_ripple={ripple}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          style={({ pressed }) => [
            styles.cell,
            !compact && cellShadow,
            {
              width: itemWidth,
              marginRight: 0,
              minHeight,
              paddingVertical: compact ? 6 : 9,
              paddingHorizontal: 7,
              backgroundColor: compact ? 'transparent' : STRIP.inactiveBg,
              borderColor: STRIP.inactiveBorder,
              borderWidth: compact ? 0 : STRIP.inactiveBorderWidth,
              borderRadius: compact ? 12 : STRIP.radius,
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
            color={compact ? semantic.successText : STRIP.iconInactive}
            style={androidIconStyle ?? undefined}
          />
          <Text
            style={[styles.label, styles.labelInactive]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.86}
          >
            {AUTRES_LABEL}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  homeScroll: { gap: 4, paddingVertical: 8, alignItems: 'flex-start' },
  homeCell: { width: 76, minHeight: 80, alignItems: 'center', gap: 6 },
  homeIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#E9F5EF', borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  homeIconActive: { backgroundColor: '#CFEBDF', borderColor: '#0B4D3C' },
  homeLabel: { width: '100%', fontSize: 12, lineHeight: 16, textAlign: 'center', color: '#334155', fontWeight: '500' },
  homeLabelActive: { color: '#0B4D3C', fontWeight: '700' },
  wrap: {
    marginBottom: 0,
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
