/**
 * Paramètres – logout and app info/version. Minimal and premium.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Screen, AppHeader, Button } from '@/components';
import { signOut } from '@/services/auth';
import { colors, spacing, typography, fontWeights } from '@/theme';

export default function AccountSettingsScreen() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

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
        <Button
          variant="secondary"
          onPress={handleLogout}
          loading={signingOut}
          disabled={signingOut}
          style={styles.logoutBtn}
        >
          Se déconnecter
        </Button>

        <View style={styles.appInfo}>
          <Text style={styles.appName}>{appName}</Text>
          <Text style={styles.appVersion}>Version {appVersion}</Text>
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
  logoutBtn: {
    alignSelf: 'flex-start',
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
});
