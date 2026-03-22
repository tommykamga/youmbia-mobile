import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography, fontWeights, cardStyles } from '@/theme';
import { useCardWidth } from '@/hooks/useCardWidth';

type ListingSectionSkeletonProps = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  variant?: 'default' | 'nearYou';
  hasSubtitle?: boolean;
  /** Titres de section « premium » (phrase naturelle) vs chips uppercase. */
  titleVariant?: 'default' | 'featured';
};

export function ListingSectionSkeleton({
  title,
  icon,
  iconColor,
  variant = 'default',
  hasSubtitle,
  titleVariant = 'default',
}: ListingSectionSkeletonProps) {
  const cardWidth = useCardWidth();
  const data = [1, 2, 3];

  const titleRowHeight = titleVariant === 'featured' ? 36 : 32;
  const subtitleHeight = hasSubtitle ? 22 : 0;
  const titleBlockGap = hasSubtitle ? spacing.xs : 0;
  const imageHeight = cardWidth * 0.75;
  const bodyHeight = variant === 'nearYou' ? 120 : 136;
  const sectionPaddingBottom = spacing.sm;
  const totalHeight =
    titleRowHeight +
    subtitleHeight +
    titleBlockGap +
    imageHeight +
    bodyHeight +
    sectionPaddingBottom;

  const titleStyle = titleVariant === 'featured' ? styles.titleFeatured : styles.titleDefault;

  return (
    <View style={[styles.section, { height: totalHeight }]}>
      <View style={styles.headerBlock}>
        <View style={[styles.titleRow, titleVariant === 'featured' && styles.titleRowFeatured]}>
          <Ionicons
            name={icon}
            size={titleVariant === 'featured' ? 20 : 18}
            color={iconColor || colors.textMuted}
            style={styles.titleIcon}
          />
          <Text style={[titleStyle]} numberOfLines={2}>
            {title}
          </Text>
        </View>
        {hasSubtitle ? <View style={styles.subtitleSkeleton} /> : null}
      </View>
      <FlatList
        data={data}
        keyExtractor={(item) => String(item)}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
        ItemSeparatorComponent={() => <View style={{ width: spacing.sm }} />}
        renderItem={() => (
          <View style={{ width: cardWidth }}>
            <View style={[styles.skeletonCard, { height: imageHeight + bodyHeight }]}>
              <View style={[styles.skeletonImage, { height: imageHeight }]} />
              <View style={[styles.skeletonBody, { height: bodyHeight }]} />
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xl,
  },
  headerBlock: {
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 24,
  },
  titleRowFeatured: {
    alignItems: 'flex-start',
  },
  skeletonCard: {
    ...cardStyles.default,
    overflow: 'hidden',
    padding: 0,
    backgroundColor: colors.surface,
  },
  skeletonImage: {
    width: '100%',
    backgroundColor: colors.surfaceMuted,
  },
  skeletonBody: {
    padding: spacing.base,
    backgroundColor: colors.surface,
  },
  titleIcon: {
    marginRight: spacing.sm,
    marginTop: 2,
  },
  titleDefault: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  titleFeatured: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    letterSpacing: -0.3,
    flex: 1,
  },
  subtitleSkeleton: {
    height: 12,
    width: '72%',
    borderRadius: 6,
    backgroundColor: colors.surfaceMuted,
    marginTop: spacing.xs,
    marginLeft: 28,
  },
  scroll: {
    marginHorizontal: -spacing.base,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
});
