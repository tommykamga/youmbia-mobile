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
import Animated, { Easing, FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, AppLogo, AppHeader, AppCard, AppButton } from '@/components';
import { AuthGateEmailForm } from '@/features/auth/AuthGateEmailForm';
import {
  AUTH_GATE_CONTEXT_CONFIG,
  getAuthGateContextConfig,
  type AuthGateContextId,
} from '@/config/authGateContext';
import { buildSignupHref, getSafeRedirect } from '@/lib/authRedirect';
import { replaceAfterSuccessfulAuth } from '@/lib/authPostNavigation';
import { runGoogleOAuth, formatGoogleSignInUserMessage } from '@/lib/googleSignInMobile';
import { getSession } from '@/services/auth';
import { useAuthGateEmailAuth } from '@/features/auth/useAuthGateEmailAuth';
import { colors, spacing, ui } from '@/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Titre barre de navigation — court et contextuel (le hero garde le copy détaillé). */
const GATE_NAV_TITLES: Record<AuthGateContextId, string> = {
  favorites: 'Retrouvez vos coups de cœur',
  messages: 'Accédez à vos conversations',
  sell: 'Publiez votre annonce',
  account: 'Bienvenue sur votre espace',
  listings: 'Gérez vos annonces',
};

export default function AuthGateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ context?: string; redirect?: string; contact?: string }>();

  const gateConfig = useMemo(
    () => getAuthGateContextConfig(params.context),
    [params.context]
  );

  const navTitle = useMemo(() => {
    const raw = typeof params.context === 'string' ? params.context.trim() : '';
    const key = (raw && raw in AUTH_GATE_CONTEXT_CONFIG ? raw : 'account') as AuthGateContextId;
    return GATE_NAV_TITLES[key];
  }, [params.context]);

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
      <AppHeader title={navTitle} showBack noBorder titleStyle={styles.headerNavTitle} />

      <View
        style={[
          styles.inner,
          { paddingBottom: insets.bottom + spacing['3xl'], paddingHorizontal: spacing.lg },
        ]}
      >
        <Animated.View entering={FadeIn.duration(380)} style={styles.hero}>
          <View style={styles.logoHalo}>
            <AppLogo variant="auth" style={styles.logo} />
          </View>
          <View style={styles.headline}>
            <Text style={styles.title}>{gateConfig.title}</Text>
            <Text style={styles.subtitle}>{gateConfig.subtitle}</Text>
          </View>
        </Animated.View>

        <View style={styles.reassurance} accessibilityRole="text">
          <Ionicons name="shield-checkmark-outline" size={16} color={ui.colors.textMuted} />
          <Text style={styles.reassuranceText}>
            Connexion sécurisée • Aucun spam • Accès instantané
          </Text>
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

        <AppCard
          padded
          style={emailExpanded ? styles.ctaSurfaceWhenEmailOpen : undefined}
        >
          <AppButton
            onPress={handleGoogle}
            loading={googleLoading}
            disabled={anyLoading}
            layout="pill52"
            leftIcon={<Ionicons name="logo-google" size={22} color={ui.colors.surface} />}
          >
            {gateConfig.primaryCtaLabel}
          </AppButton>

          <AppButton
            variant="outline"
            onPress={openEmailSection}
            disabled={anyLoading}
            layout="pillMutedOutline52"
            leftIcon={<Ionicons name="mail-outline" size={20} color={ui.colors.primary} />}
          >
            {gateConfig.secondaryCtaLabel}
          </AppButton>
        </AppCard>

        {emailExpanded ? (
          <Animated.View
            entering={FadeInDown.duration(280)
              .delay(20)
              .easing(Easing.out(Easing.cubic))}
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
              autoFocusEmail
            />
          </Animated.View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerNavTitle: {
    ...ui.typography.bodySmall,
    fontWeight: '600',
    color: ui.colors.textSecondary,
    letterSpacing: 0.12,
  },
  inner: {
    paddingTop: ui.spacing.md,
    gap: ui.spacing.md,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  hero: {
    gap: ui.spacing.md,
    alignItems: 'center',
  },
  /** Même teinte que la home (#DCFCE7), plus légère qu’en hero (opacité ~0.10). */
  logoHalo: {
    backgroundColor: 'rgba(220, 252, 231, 0.10)',
    paddingVertical: 6,
    paddingHorizontal: ui.spacing.sm,
    borderRadius: ui.radius.xl,
    borderWidth: 1,
    borderColor: ui.colors.borderLight,
  },
  logo: {
    alignSelf: 'center',
    marginBottom: 0,
    marginTop: 0,
  },
  headline: {
    gap: ui.spacing.xs,
    marginTop: 0,
    paddingHorizontal: ui.spacing.sm,
    maxWidth: 400,
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
    lineHeight: 24,
    paddingHorizontal: ui.spacing.xs,
    fontWeight: '500',
  },
  reassurance: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: ui.spacing.sm,
    paddingVertical: ui.spacing.sm,
    paddingHorizontal: ui.spacing.md,
    backgroundColor: ui.colors.surfaceSubtle,
    borderRadius: ui.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.colors.borderLight,
  },
  reassuranceText: {
    ...ui.typography.caption,
    fontWeight: '600',
    letterSpacing: 0.12,
    flexShrink: 1,
  },
  ctaSurfaceWhenEmailOpen: {
    opacity: 0.94,
  },
  emailPanel: {
    marginTop: ui.spacing.xs,
    paddingTop: ui.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.colors.borderLight,
  },
  alertIconWrap: {
    marginTop: 1,
  },
  alertError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.errorLight,
    paddingVertical: ui.spacing.md,
    paddingHorizontal: ui.spacing.lg,
    borderRadius: ui.radius.lg,
    gap: ui.spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
  },
  alertErrorText: {
    flex: 1,
    color: colors.error,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  alertSuccess: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.successLight,
    paddingVertical: ui.spacing.md,
    paddingHorizontal: ui.spacing.lg,
    borderRadius: ui.radius.lg,
    gap: ui.spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.primaryDark,
  },
  alertSuccessText: {
    flex: 1,
    color: colors.badgeVerifiedText,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
});
