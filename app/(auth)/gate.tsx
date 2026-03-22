/**
 * Auth Gate premium — ?context= (requis pour le copy), optionnel ?redirect= & ?contact=.
 * redirect validé (getSafeRedirect) prime sur successHref du contexte ; sinon successHref.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Button, AppLogo, AppHeader } from '@/components';
import { AuthGateEmailForm } from '@/features/auth/AuthGateEmailForm';
import { getAuthGateContextConfig } from '@/config/authGateContext';
import { buildSignupHref, getSafeRedirect } from '@/lib/authRedirect';
import { replaceAfterSuccessfulAuth } from '@/lib/authPostNavigation';
import { runGoogleOAuth, formatGoogleSignInUserMessage } from '@/lib/googleSignInMobile';
import { getSession } from '@/services/auth';
import { useAuthGateEmailAuth } from '@/features/auth/useAuthGateEmailAuth';
import { colors, spacing, typography, fontWeights, radius, shadows } from '@/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function AuthGateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ context?: string; redirect?: string; contact?: string }>();

  const gateConfig = useMemo(
    () => getAuthGateContextConfig(params.context),
    [params.context]
  );

  /** Aligné sur login : redirect explicite safe > successHref du contexte ; buildPostAuthHref en aval. */
  const redirectParam = useMemo(() => {
    const raw =
      typeof params.redirect === 'string' && params.redirect.trim()
        ? params.redirect.trim()
        : undefined;
    return getSafeRedirect(raw) ?? gateConfig.successHref;
  }, [params.redirect, gateConfig.successHref]);

  const contactParam =
    typeof params.contact === 'string' && params.contact.trim() ? params.contact.trim() : undefined;

  const signupHref = useMemo(
    () =>
      buildSignupHref(
        redirectParam,
        contactParam
      ),
    [redirectParam, contactParam]
  );

  const [emailExpanded, setEmailExpanded] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [googleLoading, setGoogleLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [magicSuccess, setMagicSuccess] = useState<string | null>(null);

  const anyLoading = googleLoading || passwordLoading || magicLoading;

  useEffect(() => {
    let mounted = true;
    getSession().then((s) => {
      if (!mounted || !s?.user) return;
      replaceAfterSuccessfulAuth(router, redirectParam, contactParam);
    });
    return () => {
      mounted = false;
    };
  }, [router, redirectParam, contactParam]);

  const clearMessages = useCallback(() => {
    setError(null);
    setMagicSuccess(null);
  }, []);

  const handleGoogle = useCallback(async () => {
    clearMessages();
    setGoogleLoading(true);
    try {
      const result = await runGoogleOAuth();
      if (result.ok) {
        replaceAfterSuccessfulAuth(router, redirectParam, contactParam);
      } else {
        setError(formatGoogleSignInUserMessage(undefined, result));
      }
    } catch (e) {
      setError(formatGoogleSignInUserMessage(e));
    } finally {
      setGoogleLoading(false);
    }
  }, [clearMessages, redirectParam, contactParam, router]);

  const { handlePasswordSubmit, handleMagicLink, resetHrefForEmail } = useAuthGateEmailAuth({
    email,
    password,
    redirectParam,
    contactParam,
    clearMessages,
    setError,
    setMagicSuccess,
    setPasswordLoading,
    setMagicLoading,
  });

  const openEmailSection = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEmailExpanded(true);
    clearMessages();
  }, [clearMessages]);

  return (
    <Screen scroll keyboardAvoid safe={false} noPadding>
      <AppHeader title="Connexion" showBack />

      <View style={[styles.inner, { paddingBottom: insets.bottom + spacing['3xl'], paddingHorizontal: spacing.lg }]}>
        <Animated.View entering={FadeIn.duration(420)} style={styles.hero}>
          <AppLogo variant="medium" style={styles.logo} />
          <View style={styles.headline}>
            <Text style={styles.title}>{gateConfig.title}</Text>
            <Text style={styles.subtitle}>{gateConfig.subtitle}</Text>
          </View>
        </Animated.View>

        <View style={styles.reassurance} accessibilityRole="text">
          <Ionicons name="shield-checkmark-outline" size={15} color={colors.textMuted} />
          <Text style={styles.reassuranceText}>Connexion sécurisée · Données protégées</Text>
        </View>

        {error ? (
          <View style={styles.alertError} accessibilityRole="alert">
            <View style={styles.alertIconWrap}>
              <Ionicons name="alert-circle" size={20} color={colors.error} />
            </View>
            <Text style={styles.alertErrorText}>{error}</Text>
          </View>
        ) : null}

        {magicSuccess ? (
          <View style={styles.alertSuccess} accessibilityLiveRegion="polite">
            <View style={styles.alertIconWrap}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primaryDark} />
            </View>
            <Text style={styles.alertSuccessText}>{magicSuccess}</Text>
          </View>
        ) : null}

        <View style={styles.ctaSurface}>
          <Button
            onPress={handleGoogle}
            loading={googleLoading}
            disabled={anyLoading}
            size="lg"
            style={styles.primaryCta}
            leftIcon={<Ionicons name="logo-google" size={22} color={colors.surface} />}
          >
            {gateConfig.primaryCtaLabel}
          </Button>

          <Button
            variant="outline"
            onPress={openEmailSection}
            disabled={anyLoading}
            size="lg"
            style={styles.secondaryCta}
            leftIcon={<Ionicons name="mail-outline" size={20} color={colors.primary} />}
          >
            {gateConfig.secondaryCtaLabel}
          </Button>
        </View>

        {emailExpanded ? (
          <Animated.View
            entering={FadeInDown.duration(420).delay(40).springify().damping(22).stiffness(200)}
            style={styles.emailPanel}
            accessibilityLabel="Connexion par email"
          >
            <AuthGateEmailForm
              email={email}
              password={password}
              onChangeEmail={(t) => {
                setEmail(t);
                clearMessages();
              }}
              onChangePassword={(t) => {
                setPassword(t);
                clearMessages();
              }}
              onSubmitPassword={handlePasswordSubmit}
              onMagicLink={handleMagicLink}
              signupHref={signupHref}
              resetHrefForEmail={resetHrefForEmail}
              passwordLoading={passwordLoading}
              magicLoading={magicLoading}
              disabled={googleLoading}
            />
          </Animated.View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inner: {
    paddingTop: spacing.xl,
    gap: spacing['2xl'],
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  hero: {
    gap: spacing['2xl'],
    alignItems: 'center',
  },
  logo: {
    alignSelf: 'center',
  },
  headline: {
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    maxWidth: 400,
  },
  title: {
    ...typography['2xl'],
    fontWeight: fontWeights.black,
    color: colors.text,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 25,
    paddingHorizontal: spacing.xs,
    fontWeight: fontWeights.medium,
  },
  reassurance: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
  },
  reassuranceText: {
    fontSize: typography.xs.fontSize,
    lineHeight: typography.xs.lineHeight,
    color: colors.textMuted,
    fontWeight: fontWeights.semibold,
    letterSpacing: 0.15,
  },
  ctaSurface: {
    gap: spacing.md,
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius['3xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
    ...shadows.card,
  },
  primaryCta: {
    borderRadius: radius.full,
    minHeight: 56,
  },
  secondaryCta: {
    borderRadius: radius.full,
    minHeight: 54,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  emailPanel: {
    marginTop: spacing.xs,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  alertIconWrap: {
    marginTop: 1,
  },
  alertError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.errorLight,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.lg,
    gap: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
  },
  alertErrorText: {
    flex: 1,
    color: colors.error,
    fontSize: typography.sm.fontSize,
    lineHeight: 21,
    fontWeight: fontWeights.semibold,
  },
  alertSuccess: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.successLight,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.lg,
    gap: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.primaryDark,
  },
  alertSuccessText: {
    flex: 1,
    color: colors.badgeVerifiedText,
    fontSize: typography.sm.fontSize,
    lineHeight: 21,
    fontWeight: fontWeights.semibold,
  },
});
