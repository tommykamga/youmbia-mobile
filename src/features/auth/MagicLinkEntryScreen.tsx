/**
 * Écran d’entrée Magic Link / callback HTTPS (`/auth/confirm`, `/auth/callback`).
 * Évite le flash `+not-found` pendant que le root layout consomme l’URL
 * (verify OTP uniquement dans le service auth deep-link, jamais ici).
 */
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AppLogo } from '@/components';
import { colors, fontWeights, spacing, typography } from '@/theme';

export function MagicLinkEntryScreen() {
  return (
    <View style={styles.root} accessibilityLabel="Connexion en cours">
      <AppLogo variant="auth" style={styles.logo} />
      <Text style={styles.title}>YOUMBIA</Text>
      <Text style={styles.subtitle}>Connexion en cours…</Text>
      <ActivityIndicator
        color={colors.primary}
        style={styles.spinner}
        accessibilityRole="progressbar"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
    backgroundColor: colors.background,
  },
  logo: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography['2xl'].fontSize,
    lineHeight: typography['2xl'].lineHeight,
    fontWeight: fontWeights.bold,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.base.fontSize,
    lineHeight: typography.base.lineHeight,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  spinner: {
    marginTop: spacing.xl,
  },
});
