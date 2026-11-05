import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '@/components';
import { SELL_FLOW_SURFACE } from '@/features/sell/sellFlowSteps';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

type SellPublishSuccessProps = {
  onViewListing: () => void;
  onShareWhatsApp: () => void;
  onPublishAnother: () => void;
  sharingWhatsApp: boolean;
};

export function SellPublishSuccess({
  onViewListing,
  onShareWhatsApp,
  onPublishAnother,
  sharingWhatsApp,
}: SellPublishSuccessProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Votre annonce est en ligne
        </Text>
        <Text style={styles.subtitle}>
          Consultez-la, partagez-la avec vos contacts ou publiez une autre annonce.
        </Text>
      </View>

      <View style={styles.card}>
        <Button size="lg" onPress={onViewListing} style={styles.btn}>
          Voir mon annonce
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onPress={onShareWhatsApp}
          loading={sharingWhatsApp}
          disabled={sharingWhatsApp}
          style={styles.btn}
        >
          Partager sur WhatsApp
        </Button>
        <Button variant="ghost" size="lg" onPress={onPublishAnother} style={styles.btn}>
          Publier une autre annonce
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing['2xl'],
    gap: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    ...typography['2xl'],
    fontWeight: fontWeights.bold,
    color: SELL_FLOW_SURFACE,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.base,
  },
  btn: {
    width: '100%',
  },
});
