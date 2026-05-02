import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Link, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, AppButton, Input, AppLogo } from '@/components';
import { signIn, signInWithOtp, getSession } from '@/services/auth';
import { makeRedirectUri } from 'expo-auth-session';
import { colors, spacing, ui } from '@/theme';
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
  const isContactContext =
    (typeof params.contact === 'string' && params.contact.trim().length > 0) ||
    (typeof params.redirect === 'string' && params.redirect.trim().startsWith('/listing/'));

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
        <AppLogo variant="auth" style={styles.logo} />

        <View style={styles.headerText}>
          <Text style={styles.title}>Bon retour 👋</Text>
          <Text style={styles.subtitle}>
            {
              "Connecte-toi pour retrouver tes annonces et tes favoris en un clin d’œil."
            }
          </Text>
        </View>

        {isContactContext ? (
          <View style={styles.contextCard}>
            <View style={styles.contextRow}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={ui.colors.primary} />
              <Text style={styles.contextTitle}>Connecte-toi pour contacter le vendeur</Text>
            </View>
            <Text style={styles.contextBody}>
              Après connexion, tu reviendras automatiquement sur l’annonce.
            </Text>
          </View>
        ) : null}

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
          <AppButton
            onPress={handleGoogleSignIn}
            loading={googleLoading}
            disabled={isAnyLoading}
            layout="pill52"
            leftIcon={<Ionicons name="logo-google" size={22} color={ui.colors.surface} />}
          >
            Continuer avec Google
          </AppButton>

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>ou par email</Text>
            <View style={styles.line} />
          </View>

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

          <AppButton
            onPress={handleSubmit}
            loading={loading}
            disabled={isAnyLoading}
            layout="pill52"
            style={styles.btnPrimaryMargin}
          >
            Se connecter
          </AppButton>
        </View>

        <View style={styles.socialActions}>
          <AppButton
            variant="outline"
            onPress={handleMagicLink}
            loading={magicLoading}
            disabled={isAnyLoading}
            layout="pillMutedOutline52"
          >
            Lien magique par email
          </AppButton>
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
    paddingTop: ui.spacing.md,
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
    marginBottom: 0,
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
    paddingHorizontal: ui.spacing.xs,
    lineHeight: 24,
    fontWeight: '500',
  },
  contextCard: {
    backgroundColor: ui.colors.primarySoft,
    borderRadius: ui.radius.lg,
    paddingVertical: ui.spacing.md,
    paddingHorizontal: ui.spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.colors.primary + '33',
    gap: ui.spacing.xs,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ui.spacing.sm,
  },
  contextTitle: {
    flex: 1,
    ...ui.typography.bodySmall,
    color: ui.colors.textPrimary,
    fontWeight: '700',
  },
  contextBody: {
    ...ui.typography.caption,
    color: ui.colors.textSecondary,
    fontWeight: '600',
  },
  form: {
    gap: ui.spacing.lg,
  },
  btnPrimaryMargin: {
    marginTop: ui.spacing.xs,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    paddingVertical: ui.spacing.xs,
  },
  forgotPasswordText: {
    ...ui.typography.bodySmall,
    color: ui.colors.primary,
    fontWeight: '600',
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
    letterSpacing: 0.2,
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
