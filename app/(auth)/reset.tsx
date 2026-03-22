import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Button, Input, AppLogo } from '@/components';
import { resetPasswordForEmail } from '@/services/auth';
import { makeRedirectUri } from 'expo-auth-session';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
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
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
        </Link>
      </View>

      <View style={styles.content}>
        <AppLogo variant="large" style={styles.logo} />
        
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

          <Button onPress={handleSubmit} loading={loading} disabled={loading}>
            Envoyer les instructions
          </Button>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
  },
  content: {
    paddingBottom: spacing['3xl'],
    gap: spacing.lg,
  },
  logo: {
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  headerText: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography['3xl'].fontSize,
    lineHeight: typography['3xl'].lineHeight,
    fontWeight: fontWeights.black,
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: typography.base.fontSize,
    lineHeight: typography.base.lineHeight,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  form: {
    gap: spacing.base,
    marginTop: spacing.sm,
  },
  alertError: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2', 
    padding: spacing.base,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  alertErrorText: {
    flex: 1,
    color: colors.error,
    fontSize: typography.sm.fontSize,
    fontWeight: fontWeights.medium,
  },
  alertSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7', 
    padding: spacing.base,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  alertSuccessText: {
    flex: 1,
    color: '#15803D',
    fontSize: typography.sm.fontSize,
    fontWeight: fontWeights.medium,
  },
});
