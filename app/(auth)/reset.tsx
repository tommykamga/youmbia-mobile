import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, AppButton, Input, AppLogo } from '@/components';
import { resetPasswordForEmail } from '@/services/auth';
import { makeRedirectUri } from 'expo-auth-session';
import { colors, spacing, ui } from '@/theme';
import { buildLoginHref } from '@/lib/authRedirect';
import { mapAuthErrorMessage } from '@/lib/mapAuthErrorMessage';
import { isPlausibleEmail } from '@/lib/authEmailValidation';

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string; redirect?: string; contact?: string }>();
  
  const [email, setEmail] = useState(params.email ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Veuillez saisir votre adresse email.');
      return;
    }
    if (!isPlausibleEmail(trimmedEmail)) {
      setError('Indiquez une adresse email valide.');
      return;
    }
    setLoading(true);
    try {
      const redirectTo = makeRedirectUri();
      const result = await resetPasswordForEmail(trimmedEmail, redirectTo);
      if (result.ok) {
        setSuccess('Un email contenant les instructions de réinitialisation vous a été envoyé.');
      } else {
        setError(mapAuthErrorMessage(result.error));
      }
    } catch {
      setError('Erreur inattendue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll keyboardAvoid>
      <View style={styles.headerRow}>
        <Link
          href={buildLoginHref(
            typeof params.redirect === 'string' ? params.redirect : undefined,
            typeof params.contact === 'string' ? params.contact : undefined
          )}
          asChild
        >
          <Pressable hitSlop={15} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={ui.colors.textPrimary} />
          </Pressable>
        </Link>
      </View>

      <View style={styles.content}>
        <AppLogo variant="auth" style={styles.logo} />
        
        <View style={styles.headerText}>
          <Text style={styles.title}>Mot de passe oublié</Text>
          <Text style={styles.subtitle}>
            Saisissez votre email. Nous vous enverrons un lien pour créer votre nouveau mot de passe.
          </Text>
        </View>

        {error ? (
          <View style={styles.alertError}>
            <Ionicons name="alert-circle" size={20} color={colors.error} />
            <Text style={styles.alertErrorText}>{error}</Text>
          </View>
        ) : null}

        {success ? (
          <View style={styles.alertSuccess}>
            <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
            <Text style={styles.alertSuccessText}>{success}</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          <Input
            label="Adresse email"
            placeholder="vous@exemple.com"
            value={email}
            onChangeText={(t) => { setEmail(t); setError(null); setSuccess(null); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />

          <AppButton
            onPress={handleSubmit}
            loading={loading}
            disabled={loading}
            layout="pill52"
            style={styles.btnPrimaryMargin}
          >
            Envoyer les instructions
          </AppButton>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    paddingTop: ui.spacing.md,
    paddingBottom: ui.spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: ui.radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: ui.colors.surfaceSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.colors.borderLight,
  },
  content: {
    paddingBottom: spacing['3xl'],
    gap: ui.spacing.md,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  logo: {
    alignSelf: 'center',
    marginBottom: 0,
  },
  headerText: {
    alignItems: 'center',
    marginBottom: ui.spacing.xs,
    gap: ui.spacing.xs,
  },
  title: {
    ...ui.typography.h1,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subtitle: {
    ...ui.typography.body,
    color: ui.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: ui.spacing.sm,
    lineHeight: 24,
    fontWeight: '500',
  },
  form: {
    gap: ui.spacing.lg,
    marginTop: ui.spacing.xs,
  },
  btnPrimaryMargin: {
    marginTop: ui.spacing.xs,
  },
  alertError: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorLight,
    paddingVertical: ui.spacing.md,
    paddingHorizontal: ui.spacing.lg,
    borderRadius: ui.radius.lg,
    gap: ui.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.error + '33',
  },
  alertErrorText: {
    flex: 1,
    color: colors.error,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  alertSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successLight,
    paddingVertical: ui.spacing.md,
    paddingHorizontal: ui.spacing.lg,
    borderRadius: ui.radius.lg,
    gap: ui.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.colors.primary + '22',
  },
  alertSuccessText: {
    flex: 1,
    color: colors.badgeVerifiedText,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
});
