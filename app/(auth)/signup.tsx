import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Link, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, AppButton, Input, AppLogo } from '@/components';
import { signUp, getSession } from '@/services/auth';
import { colors, spacing, ui } from '@/theme';
import { buildLoginHref } from '@/lib/authRedirect';
import { replaceAfterSuccessfulAuth } from '@/lib/authPostNavigation';
import { runGoogleOAuth, formatGoogleSignInUserMessage } from '@/lib/googleSignInMobile';

function getErrorMessage(error: { message: string }): string {
  const msg = error.message.toLowerCase();
  if (msg.includes('already registered') || msg.includes('already in use')) return 'Un compte existe déjà avec cet email.';
  if (msg.includes('network') || msg.includes('réseau') || msg.includes('fetch')) return 'Réseau indisponible. Réessayez.';
  if (msg.includes('password')) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (msg.includes('email')) return 'Vérifiez votre adresse email.';
  return error.message || 'Inscription impossible. Réessayez.';
}

export default function SignupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ redirect?: string; contact?: string }>();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isAnyLoading = loading || googleLoading;

  useEffect(() => {
    let mounted = true;
    getSession().then((s) => {
      if (!mounted || !s?.user) return;
      replaceAfterSuccessfulAuth(router, params.redirect, params.contact);
    });
    return () => {
      mounted = false;
    };
  }, [router, params.redirect, params.contact]);

  const handleSubmit = async () => {
    setError(null);
    setSuccessMessage(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password || !confirmPassword) {
      setError('Renseignez tous les champs.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    if (password.length < 6) {
      setError('Le mot de passe doit faire au moins 6 caractères.');
      return;
    }
    setLoading(true);
    try {
      const result = await signUp(trimmedEmail, password);
      if (result.ok) {
        if (result.requiresEmailConfirmation) {
          setSuccessMessage('Compte créé avec succès ! Vérifiez votre boîte mail pour confirmer votre inscription avant de vous connecter.');
          return;
        }
        replaceAfterSuccessfulAuth(router, params.redirect, params.contact);
      } else {
        setError(getErrorMessage(result.error));
      }
    } catch {
      setError('Inscription impossible. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccessMessage(null);
    setGoogleLoading(true);
    try {
      const result = await runGoogleOAuth();
      if (result.ok) {
        replaceAfterSuccessfulAuth(router, params.redirect, params.contact);
      } else {
        setError(formatGoogleSignInUserMessage(undefined, result));
      }
    } catch (e) {
      setError(formatGoogleSignInUserMessage(e));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <Screen scroll keyboardAvoid>
      <View style={styles.content}>
        <AppLogo variant="auth" style={styles.logo} />
        
        <View style={styles.headerText}>
          <Text style={styles.title}>Créer un compte</Text>
          <Text style={styles.subtitle}>
            Rejoignez YOUMBIA pour acheter et vendre en toute confiance.
          </Text>
        </View>

        {error ? (
          <View style={styles.alertError}>
            <Ionicons name="alert-circle" size={20} color={colors.error} />
            <Text style={styles.alertErrorText}>{error}</Text>
          </View>
        ) : null}

        {successMessage ? (
          <View style={styles.alertSuccess}>
            <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
            <Text style={styles.alertSuccessText}>{successMessage}</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          <Input
            label="Adresse email"
            placeholder="vous@exemple.com"
            value={email}
            onChangeText={(t) => { setEmail(t); setError(null); setSuccessMessage(null); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isAnyLoading}
          />
          
          <Input
            label="Mot de passe"
            placeholder="Au moins 6 caractères"
            value={password}
            onChangeText={(t) => { setPassword(t); setError(null); setSuccessMessage(null); }}
            secureTextEntry
            editable={!isAnyLoading}
          />

          <Input
            label="Confirmer le mot de passe"
            placeholder="••••••••"
            value={confirmPassword}
            onChangeText={(t) => { setConfirmPassword(t); setError(null); setSuccessMessage(null); }}
            secureTextEntry
            editable={!isAnyLoading}
          />

          <AppButton
            onPress={handleSubmit}
            loading={loading}
            disabled={isAnyLoading}
            layout="pill52"
            style={styles.btnPrimaryMargin}
          >
            {"S'inscrire"}
          </AppButton>
        </View>

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>{"ou s'inscrire avec"}</Text>
          <View style={styles.line} />
        </View>

        <View style={styles.socialActions}>
          <AppButton
            variant="outline"
            onPress={handleGoogleSignIn}
            loading={googleLoading}
            disabled={isAnyLoading}
            layout="pillMutedOutline52"
          >
            Google Auth
          </AppButton>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Déjà un compte ?</Text>
          <Link
            href={buildLoginHref(
              typeof params.redirect === 'string' ? params.redirect : undefined,
              typeof params.contact === 'string' ? params.contact : undefined
            )}
            asChild
          >
            <Pressable hitSlop={15}>
              <Text style={styles.footerLink}>Se connecter</Text>
            </Pressable>
          </Link>
        </View>

      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: ui.spacing.lg,
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
    ...ui.typography.hero,
    textAlign: 'center',
    letterSpacing: -0.45,
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
  },
  btnPrimaryMargin: {
    marginTop: ui.spacing.xs,
  },
  socialActions: {
    gap: ui.spacing.sm,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: ui.spacing.xs,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: ui.colors.borderLight,
  },
  dividerText: {
    marginHorizontal: ui.spacing.md,
    ...ui.typography.caption,
    color: colors.textTertiary,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: ui.spacing.lg,
    gap: ui.spacing.xs,
  },
  footerText: {
    ...ui.typography.bodySmall,
    color: ui.colors.textSecondary,
  },
  footerLink: {
    ...ui.typography.bodySmall,
    color: ui.colors.primary,
    fontWeight: '700',
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
