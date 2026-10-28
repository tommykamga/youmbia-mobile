/**
 * Invitation ponctuelle, non bloquante, au consentement marketing sur l'accueil.
 * Aucun opt-in par défaut ; « Pas maintenant » ne modifie aucune donnée serveur.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getEmailPreferences, setMarketingEmailOptIn } from '@/services/emailPreferences';
import { getSession } from '@/services/auth';
import { hasVerifiableMarketingConsent, shouldOfferMarketingConsent } from '@/lib/marketingConsent';
import { MARKETING_CONSENT_COPY } from '@/lib/marketingConsentVersion';
import { colors, fontWeights, radius, spacing, typography } from '@/theme';

// Dismiss pour la session applicative ; ne persiste aucun consentement implicite.
const dismissedSessionUsers = new Set<string>();

export function MarketingConsentBanner() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setVisible(false);
      setError(null);
      const check = async () => {
        const session = await getSession();
        const uid = session?.user?.id ?? null;
        if (!active) return;
        setUserId(uid);
        if (!uid || dismissedSessionUsers.has(uid)) return;
        const result = await getEmailPreferences();
        if (!active || result.error || !result.data) return;
        setVisible(shouldOfferMarketingConsent(result.data));
      };
      void check();
      return () => { active = false; };
    }, [])
  );

  const dismiss = () => {
    if (userId) dismissedSessionUsers.add(userId);
    setVisible(false);
  };

  const accept = async () => {
    if (!userId || saving) return;
    setSaving(true);
    setError(null);
    const result = await setMarketingEmailOptIn(true, 'mobile_home_prompt');
    setSaving(false);
    if (result.error || !result.data || !hasVerifiableMarketingConsent(result.data)) {
      setError(result.error?.message ?? 'Accord non enregistré. Veuillez réessayer.');
      return;
    }
    dismiss();
  };

  const refuse = async () => {
    if (!userId || saving) return;
    setSaving(true);
    setError(null);
    const result = await setMarketingEmailOptIn(false, 'mobile_home_prompt');
    setSaving(false);
    if (result.error || !result.data || result.data.unsubscribed_at == null) {
      setError(result.error?.message ?? 'Votre choix n’a pas été enregistré. Veuillez réessayer.');
      return;
    }
    dismiss();
  };

  if (!visible) return null;

  return (
    <View style={styles.panel} accessibilityRole="summary">
      <Text style={styles.title}>Recevez les nouveautés YOUMBIA par e-mail ?</Text>
      <Text style={styles.description}>{MARKETING_CONSENT_COPY}</Text>
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable
          onPress={() => { void accept(); }}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="J'accepte les e-mails marketing YOUMBIA"
          style={[styles.accept, saving && styles.disabled]}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.acceptText}>Oui, j&apos;accepte</Text>}
        </Pressable>
        <Pressable
          onPress={() => { void refuse(); }}
          disabled={saving}
          accessibilityRole="button"
          style={styles.later}
        >
          <Text style={styles.laterText}>Pas maintenant</Text>
        </Pressable>
      </View>
      <Pressable
        onPress={() => router.push('/account/settings')}
        accessibilityRole="link"
        accessibilityLabel="Gérer mes préférences e-mail"
        style={styles.settings}
      >
        <Text style={styles.settingsText}>Gérer mes préférences</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    marginHorizontal: spacing.base,
    marginTop: spacing.xs,
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: { ...typography.sm, fontWeight: fontWeights.semibold, color: colors.text },
  description: { ...typography.xs, color: colors.textMuted, lineHeight: 19 },
  error: { ...typography.xs, color: colors.error },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  accept: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 40,
    justifyContent: 'center',
  },
  acceptText: { ...typography.xs, color: '#fff', fontWeight: fontWeights.semibold },
  later: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  laterText: { ...typography.xs, color: colors.text },
  disabled: { opacity: 0.65 },
  settings: { alignSelf: 'flex-start', paddingTop: spacing.xs },
  settingsText: { ...typography.xs, color: colors.primary },
});
