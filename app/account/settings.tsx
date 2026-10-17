/**
 * Paramètres – logout, préférences email marketing (minimal), app info.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Screen, AppHeader, Button } from '@/components';
import { signOut } from '@/services/auth';
import {
  getEmailPreferences,
  setMarketingEmailOptIn,
} from '@/services/emailPreferences';
import { captureSentryTestException } from '@/lib/sentry';
import { colors, spacing, typography, fontWeights } from '@/theme';

export default function AccountSettingsScreen() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
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
      } else {
        setPrefsError(null);
        setMarketingOptIn(result.data.marketing_opt_in);
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
    if (result.error) {
      setMarketingOptIn(!next);
      setPrefsError(result.error.message);
    }
    setPrefsSaving(false);
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
                  disabled={prefsSaving || signingOut}
                  trackColor={{ false: colors.border, true: colors.primaryLight }}
                  thumbColor={marketingOptIn ? colors.primary : colors.textTertiary}
                  accessibilityLabel="Recevoir les e-mails marketing"
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
