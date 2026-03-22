import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Link, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Button, Input, AppLogo } from '@/components';
import { signIn, signInWithOtp, getSession } from '@/services/auth';
import { makeRedirectUri } from 'expo-auth-session';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import { buildSignupHref, buildResetHref } from '@/lib/authRedirect';
import { replaceAfterSuccessfulAuth } from '@/lib/authPostNavigation';
import { buildMagicLinkOtpPath } from '@/lib/authOtpRedirectPath';
import { mapAuthErrorMessage } from '@/lib/mapAuthErrorMessage';
import { runGoogleOAuth, formatGoogleSignInUserMessage } from '@/lib/googleSignInMobile';

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ redirect?: string; contact?: string }>();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isAnyLoading = loading || googleLoading || magicLoading;

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
    setSuccess(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Renseignez l\'email et le mot de passe.');
      return;
    }
    setLoading(true);
    try {
      const result = await signIn(trimmedEmail, password);
      if (result.ok) {
        replaceAfterSuccessfulAuth(router, params.redirect, params.contact);
      } else {
        setError(mapAuthErrorMessage(result.error));
      }
    } catch {
      setError('Connexion impossible. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async () => {
    setError(null);
    setSuccess(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Veuillez saisir votre email pour recevoir le lien magique.');
      return;
    }
    setMagicLoading(true);
    try {
      // makeRedirectUri handles exp:// (dev) or youmbiamobile:// (prod)
      const redirectTo = makeRedirectUri({
        path: buildMagicLinkOtpPath(
          typeof params.redirect === 'string' ? params.redirect : undefined,
          typeof params.contact === 'string' ? params.contact : undefined
        ),
      });
      const result = await signInWithOtp(trimmedEmail, redirectTo);
      if (result.ok) {
        setSuccess('Lien magique envoyé ! Vérifiez votre boîte mail pour vous connecter.');
      } else {
        setError(mapAuthErrorMessage(result.error));
      }
    } catch {
      setError('Erreur lors de l\'envoi du lien magique. Réessayez plus tard.');
    } finally {
      setMagicLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccess(null);
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
        <AppLogo variant="large" style={styles.logo} />

        <View style={styles.headerText}>
          <Text style={styles.title}>Bon retour 👋</Text>
          <Text style={styles.subtitle}>
            {
              "Connectez-vous pour retrouver vos annonces et favoris en un clin d'œil."
            }
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
            editable={!isAnyLoading}
          />

          <View>
            <Input
              label="Mot de passe"
              placeholder="••••••••"
              value={password}
              onChangeText={(t) => { setPassword(t); setError(null); setSuccess(null); }}
              secureTextEntry
              editable={!isAnyLoading}
            />
            <Link
              href={buildResetHref({
                redirect: typeof params.redirect === 'string' ? params.redirect : undefined,
                contact: typeof params.contact === 'string' ? params.contact : undefined,
                email: email.trim() || undefined,
              })}
              asChild
            >
              <Pressable style={styles.forgotPassword}>
                <Text style={styles.forgotPasswordText}>Mot de passe oublié ?</Text>
              </Pressable>
            </Link>
          </View>

          <Button onPress={handleSubmit} loading={loading} disabled={isAnyLoading}>
            Se connecter
          </Button>
        </View>

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>ou utiliser</Text>
          <View style={styles.line} />
        </View>

        <View style={styles.socialActions}>
          <Button
            variant="outline"
            onPress={handleMagicLink}
            loading={magicLoading}
            disabled={isAnyLoading}
          >
            Lien Magique par Email
          </Button>

          <Button
            variant="outline"
            onPress={handleGoogleSignIn}
            loading={googleLoading}
            disabled={isAnyLoading}
          >
            Google Auth
          </Button>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Pas encore de compte ?</Text>
          <Link
            href={buildSignupHref(
              typeof params.redirect === 'string' ? params.redirect : undefined,
              typeof params.contact === 'string' ? params.contact : undefined
            )}
            asChild
          >
            <Pressable hitSlop={15}>
              <Text style={styles.footerLink}>{"S'inscrire"}</Text>
            </Pressable>
          </Link>
        </View>

      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.xl,
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
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    paddingVertical: spacing.xs,
  },
  forgotPasswordText: {
    fontSize: typography.sm.fontSize,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  socialActions: {
    gap: spacing.base,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderLight,
  },
  dividerText: {
    marginHorizontal: spacing.base,
    fontSize: typography.sm.fontSize,
    color: colors.textTertiary,
    fontWeight: fontWeights.medium,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
  footerText: {
    fontSize: typography.base.fontSize,
    color: colors.textSecondary,
  },
  footerLink: {
    fontSize: typography.base.fontSize,
    color: colors.primary,
    fontWeight: fontWeights.bold,
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
    color: '#15803D', // darker green for readability
    fontSize: typography.sm.fontSize,
    fontWeight: fontWeights.medium,
  },
});
