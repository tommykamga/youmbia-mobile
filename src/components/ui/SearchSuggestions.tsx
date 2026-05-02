/**
 * SearchSuggestions – Chips rapides.
 * Section positionnée SOUS la barre de recherche.
 * Interaction: clic → navigation vers Search avec la query pré-remplie.
 */

import React, { useEffect } from 'react';
import {
  StyleSheet,
  ScrollView,
  Pressable,
  Text
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { ui, spacing } from '@/theme';

export type SearchSuggestionsProps = {
  onSuggestionPress: (query: string) => void;
  visible?: boolean;
};

const QUICK_CHIPS: string[] = [
  'Téléphones',
  'Voitures',
  'Maisons',
  'Locations',
  'Terrains',
  'Motos',
];

export function SearchSuggestions({
  onSuggestionPress,
  visible = true,
}: SearchSuggestionsProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(6);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) });
      translateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.ease) });
    } else {
      opacity.value = withTiming(0, { duration: 150 });
      translateY.value = withTiming(6, { duration: 150 });
    }
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.wrapper, animStyle]}>
      {/* Quick chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsScroll}
      >
        {QUICK_CHIPS.map((chip) => (
          <Pressable
            key={chip}
            style={({ pressed }) => [
              styles.chip,
              pressed && styles.chipPressed,
            ]}
            onPress={() => onSuggestionPress(chip)}
          >
            <Text style={styles.chipText}>{chip}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: -8,
    marginBottom: spacing.xs,
  },
  // Quick chips
  chipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    backgroundColor: '#F2FFF5',
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(110, 220, 95, 0.3)',
  },
  chipPressed: {
    backgroundColor: '#D9FAE0',
    transform: [{ scale: 0.96 }],
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803D',
    letterSpacing: 0.1,
  },
});
