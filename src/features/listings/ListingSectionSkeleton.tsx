import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SkeletonListingCard } from '@/components/SkeletonListingCard';
import { colors, spacing, typography, fontWeights, cardStyles } from '@/theme';
import { useCardWidth } from '@/hooks/useCardWidth';

type ListingSectionSkeletonProps = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  variant?: 'default' | 'nearYou';
  hasSubtitle?: boolean;
};

export function ListingSectionSkeleton({ title, icon, iconColor, variant = 'default', hasSubtitle }: ListingSectionSkeletonProps) {
  const cardWidth = useCardWidth();
  const data = [1, 2, 3]; // Show 3 skeleton cards

  // Precise calculations
  const titleRowHeight = 32;
  const subtitleHeight = hasSubtitle ? 24 : 0;
  const imageHeight = cardWidth * 0.75;
  const bodyHeight = variant === 'nearYou' ? 120 : 136;
  const sectionPaddingBottom = spacing.sm;
  const totalHeight = titleRowHeight + subtitleHeight + imageHeight + bodyHeight + sectionPaddingBottom;

  return (
    <View style={[styles.section, { height: totalHeight }]}>
      <View style={styles.titleRow}>
        <Ionicons
          name={icon}
          size={18}
          color={iconColor || colors.textMuted}
          style={styles.titleIcon}
        />
        <Text style={styles.title}>{title}</Text>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    height: 24, // Fixed height for title
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
    marginRight: spacing.xs,
  },
  title: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scroll: {
    marginHorizontal: -spacing.base,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
});
