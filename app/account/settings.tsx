/**
 * Paramètres – logout, préférences email marketing + opposition rappels brouillon.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Screen, AppHeader, Button } from '@/components';
import { signOut } from '@/services/auth';
import {
  getEmailPreferences,
  setDraftRemindersAllowed,
  setMarketingEmailOptIn,
} from '@/services/emailPreferences';
import { captureSentryTestException } from '@/lib/sentry';
import { hasVerifiableMarketingConsent } from '@/lib/marketingConsent';
import { colors, spacing, typography, fontWeights } from '@/theme';

export default function AccountSettingsScreen() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [draftRemindersAllowed, setDraftRemindersAllowedState] = useState(true);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setPrefsLoading(true);
      const result = await getEmailPreferences();
      if (!mounted) return;
      if (result.error) {
        setPrefsError(result.error.message);
        setMarketingOptIn(false);
        setDraftRemindersAllowedState(true);
      } else {
        setPrefsError(null);
        // Les flags importés ne sont pas des accords vérifiables.
        setMarketingOptIn(hasVerifiableMarketingConsent(result.data));
        setDraftRemindersAllowedState(!result.data.optional_draft_reminders_opt_out);
      }
      setPrefsLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleMarketingToggle = useCallback(async (next: boolean) => {
    setPrefsSaving(true);
    setPrefsError(null);
    setMarketingOptIn(next);
    const result = await setMarketingEmailOptIn(next, 'settings');
    if (result.error || !result.data) {
      setMarketingOptIn(!next);
      setPrefsError(result.error?.message ?? 'Préférence non enregistrée');
    } else {
      setMarketingOptIn(hasVerifiableMarketingConsent(result.data));
    }
    setPrefsSaving(false);
  }, []);

  const handleDraftRemindersToggle = useCallback(async (next: boolean) => {
    setDraftSaving(true);
    setPrefsError(null);
    setDraftRemindersAllowedState(next);
    const result = await setDraftRemindersAllowed(next);
    if (result.error) {
      setDraftRemindersAllowedState(!next);
      setPrefsError(result.error.message);
    }
    setDraftSaving(false);
  }, []);

  const handleLogout = useCallback(async () => {
    setSigningOut(true);
    const { error } = await signOut();
    setSigningOut(false);
    if (!error) {
      router.replace('/(auth)/login');
    }
  }, [router]);

  const appName = Constants.expoConfig?.name ?? 'YOUMBIA Mobile';
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const prefsBusy = prefsSaving || draftSaving || signingOut;

  return (
    <Screen scroll={false} safe={false}>
      <AppHeader title="Paramètres" showBack density="compact" />
      <View style={styles.content}>
        <View style={styles.actions}>
          <View style={styles.prefsBlock}>
            <Text style={styles.prefsTitle}>E-mails marketing</Text>
            <Text style={styles.prefsHint}>
              Communications commerciales YOUMBIA uniquement. Les e-mails de connexion, confirmation et réinitialisation restent séparés.
            </Text>
            <View style={styles.prefsRow}>
              <Text style={styles.prefsLabel}>Recevoir les e-mails marketing</Text>
              {prefsLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Switch
                  value={marketingOptIn}
                  onValueChange={handleMarketingToggle}
                  disabled={prefsBusy}
                  trackColor={{ false: colors.border, true: colors.primaryLight }}
                  thumbColor={marketingOptIn ? colors.primary : colors.textTertiary}
                  accessibilityLabel="Recevoir les e-mails marketing"
                />
              )}
            </View>
          </View>

          <View style={styles.prefsBlock}>
            <Text style={styles.prefsTitle}>Rappels de brouillon</Text>
            <Text style={styles.prefsHint}>
              Rappels facultatifs lorsqu’un brouillon d’annonce reste non publié. Opposition indépendante des e-mails marketing.
            </Text>
            <View style={styles.prefsRow}>
              <Text style={styles.prefsLabel}>Recevoir les rappels de brouillon</Text>
              {prefsLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Switch
                  value={draftRemindersAllowed}
                  onValueChange={handleDraftRemindersToggle}
                  disabled={prefsBusy}
                  trackColor={{ false: colors.border, true: colors.primaryLight }}
                  thumbColor={draftRemindersAllowed ? colors.primary : colors.textTertiary}
                  accessibilityLabel="Recevoir les rappels de brouillon"
                />
              )}
            </View>
            {prefsError ? <Text style={styles.prefsError}>{prefsError}</Text> : null}
          </View>

          <Button
            variant="secondary"
            onPress={handleLogout}
            loading={signingOut}
            disabled={signingOut}
            style={styles.logoutBtn}
          >
            Se déconnecter
          </Button>

          <Button
            variant="ghost"
            onPress={() => router.push('/account/delete-account')}
            disabled={signingOut}
            style={styles.deleteBtn}
            textStyle={styles.deleteBtnText}
          >
            Supprimer mon compte
          </Button>
        </View>

        <View style={styles.appInfo}>
          <Text style={styles.appName}>{appName}</Text>
          <Text style={styles.appVersion}>Version {appVersion}</Text>
          {__DEV__ ? (
            <Button
              variant="ghost"
              onPress={captureSentryTestException}
              style={styles.sentryTestBtn}
              textStyle={styles.sentryTestBtnText}
            >
              Tester Sentry (dev)
            </Button>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: spacing.base,
    justifyContent: 'space-between',
  },
  actions: {
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  prefsBlock: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  prefsTitle: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  prefsHint: {
    ...typography.xs,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  prefsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  prefsLabel: {
    ...typography.sm,
    color: colors.text,
    flex: 1,
  },
  prefsError: {
    ...typography.xs,
    color: colors.error,
    marginTop: spacing.xs,
  },
  logoutBtn: {
    alignSelf: 'flex-start',
  },
  deleteBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 0,
  },
  deleteBtnText: {
    color: colors.error,
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  appName: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  appVersion: {
    ...typography.xs,
    color: colors.textTertiary,
  },
  sentryTestBtn: {
    marginTop: spacing.sm,
    alignSelf: 'center',
  },
  sentryTestBtnText: {
    ...typography.xs,
    color: colors.textTertiary,
  },
});
