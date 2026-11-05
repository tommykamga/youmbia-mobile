import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

type SellPrequalBannerProps = {
  hasSellerName: boolean;
  hasPhone: boolean;
  isAuthed: boolean;
  onCompleteProfile: () => void;
};

export function SellPrequalBanner({
  hasSellerName,
  hasPhone,
  isAuthed,
  onCompleteProfile,
}: SellPrequalBannerProps) {
  if (!isAuthed) {
    return (
      <View style={styles.wrap} accessibilityRole="alert">
        <Ionicons name="information-circle-outline" size={20} color={colors.warning} />
        <View style={styles.textSlot}>
          <Text style={styles.title}>Connectez-vous pour vendre</Text>
          <Text style={styles.body}>
            Vous pourrez préparer votre annonce après connexion.
          </Text>
        </View>
      </View>
    );
  }

  if (hasSellerName && hasPhone) return null;

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
      <View style={styles.textSlot}>
        <Text style={styles.title}>Vous pouvez commencer dès maintenant</Text>
        <Text style={styles.body}>
          {hasSellerName
            ? 'Pour publier, un numéro de téléphone dans votre profil est obligatoire.'
            : hasPhone
              ? 'Pour publier, un nom ou pseudo dans votre profil est obligatoire.'
              : 'Pour publier, votre nom ou pseudo et votre téléphone sont obligatoires. Vous pouvez déjà ajouter photos et détails.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Compléter mon profil vendeur"
          onPress={onCompleteProfile}
          hitSlop={8}
          style={({ pressed }) => [styles.linkRow, pressed && styles.linkPressed]}
        >
          <Text style={styles.link}>Compléter mon profil</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.base,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.primary + '33',
    backgroundColor: colors.primary + '0D',
    marginBottom: spacing.base,
  },
  textSlot: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  body: {
    ...typography.xs,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  linkPressed: {
    opacity: 0.8,
  },
  link: {
    ...typography.xs,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
});
