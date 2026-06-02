/**
 * Suppression de compte — conforme App Store Review Guideline 5.1.1(v).
 * Accessible depuis Compte. Confirmation forte : l'utilisateur doit saisir le
 * mot « SUPPRIMER » puis confirmer une seconde fois avant l'action définitive.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, AppHeader, Button, Input } from '@/components';
import { deleteAccount } from '@/services/auth';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

const CONFIRM_WORD = 'SUPPRIMER';

const CONSEQUENCES = [
  'Votre profil et vos informations personnelles',
  'Toutes vos annonces et leurs photos',
  'Vos favoris et vos recherches',
  'Vos conversations et messages',
  'Votre boutique professionnelle (le cas échéant)',
];

export default function DeleteAccountScreen() {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = confirmText.trim().toUpperCase() === CONFIRM_WORD && !deleting;

  const performDeletion = useCallback(async () => {
    setError(null);
    setDeleting(true);
    const result = await deleteAccount();
    setDeleting(false);

    if (result.ok) {
      Alert.alert(
        'Compte supprimé',
        'Votre compte et vos données ont été supprimés définitivement.'
      );
      router.replace('/(tabs)/search');
      return;
    }
    setError(result.message);
  }, [router]);

  const handleDeletePress = useCallback(() => {
    if (!canConfirm) return;
    Alert.alert(
      'Supprimer définitivement ?',
      'Cette action est irréversible. Votre compte et toutes vos données seront supprimés et ne pourront pas être récupérés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer mon compte',
          style: 'destructive',
          onPress: () => {
            void performDeletion();
          },
        },
      ]
    );
  }, [canConfirm, performDeletion]);

  return (
    <Screen scroll={false} safe={false}>
      <AppHeader title="Supprimer mon compte" showBack density="compact" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.warningBanner}>
          <Ionicons name="warning-outline" size={22} color={colors.error} />
          <Text style={styles.warningText}>
            La suppression de votre compte est définitive et irréversible.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Ce qui sera supprimé</Text>
        <View style={styles.card}>
          {CONSEQUENCES.map((item) => (
            <View key={item} style={styles.bulletRow}>
              <Ionicons name="close-circle" size={18} color={colors.error} />
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.helper}>
          Pour confirmer, saisissez « {CONFIRM_WORD} » ci-dessous.
        </Text>
        <Input
          value={confirmText}
          onChangeText={(t) => {
            setConfirmText(t);
            setError(null);
          }}
          placeholder={CONFIRM_WORD}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!deleting}
        />

        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Button
          variant="primary"
          onPress={handleDeletePress}
          loading={deleting}
          disabled={!canConfirm}
          style={[styles.deleteBtn, !canConfirm ? styles.deleteBtnDisabled : null]}
        >
          Supprimer définitivement mon compte
        </Button>

        <Button variant="ghost" onPress={() => router.back()} disabled={deleting}>
          Annuler
        </Button>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.md,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: spacing['3xl'],
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FEE2E2',
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.error + '40',
  },
  warningText: {
    flex: 1,
    ...typography.sm,
    color: colors.error,
    fontWeight: fontWeights.semibold,
    lineHeight: 20,
  },
  sectionTitle: {
    ...typography.sm,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.base,
    gap: spacing.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bulletText: {
    flex: 1,
    ...typography.base,
    color: colors.text,
  },
  helper: {
    ...typography.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    flex: 1,
    ...typography.sm,
    color: colors.error,
    fontWeight: fontWeights.semibold,
  },
  deleteBtn: {
    backgroundColor: colors.error,
    marginTop: spacing.sm,
  },
  deleteBtnDisabled: {
    opacity: 0.5,
  },
});
