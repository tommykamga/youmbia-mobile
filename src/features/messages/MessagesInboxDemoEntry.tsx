import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { spacing, typography, fontWeights } from '@/theme';

type Props = { onPress: () => void };

/** Entrée Dev Client uniquement — branchée via `onRequestDemo` depuis l’inbox connectée. */
export function MessagesInboxDemoEntry({ onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Ouvrir la démonstration locale de la boîte de réception"
    >
      <Text style={styles.label}>Ouvrir la démonstration locale</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.screenHorizontal,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: '#FFF8E2',
  },
  pressed: { opacity: 0.85 },
  label: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: '#614700',
    textAlign: 'center',
  },
});
