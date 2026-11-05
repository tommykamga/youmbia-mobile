/**
 * ListingDescription – description lisible, sauts de ligne conservés.
 * « Lire la suite » seulement pour un texte long, toujours réversible.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, typography, fontWeights } from '@/theme';

type ListingDescriptionProps = {
  description: string;
};

const COLLAPSE_CHAR_THRESHOLD = 280;
const COLLAPSED_LINES = 6;

export function ListingDescription({ description }: ListingDescriptionProps) {
  const text = description?.trim() ?? '';
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;

  const collapsible = text.length > COLLAPSE_CHAR_THRESHOLD;

  return (
    <View style={styles.block}>
      <Text style={styles.label}>Description</Text>
      <Text style={styles.text} numberOfLines={collapsible && !expanded ? COLLAPSED_LINES : undefined}>
        {text}
      </Text>
      {collapsible ? (
        <Pressable
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Réduire la description' : 'Lire la suite de la description'}
          hitSlop={8}
          style={styles.moreHit}
        >
          <Text style={styles.more}>{expanded ? 'Réduire' : 'Lire la suite'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  text: {
    ...typography.base,
    color: colors.text,
    lineHeight: 24,
  },
  moreHit: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  more: {
    ...typography.base,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
});
