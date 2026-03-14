import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link, useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { Screen, Button, Input, AppLogo } from '@/components';
import { signIn } from '@/services/auth';
import { colors, spacing, typography, fontWeights } from '@/theme';

/** Safe redirect: only app routes (start with / or () to avoid open redirect. Used for post-login/signup return context (Sprint 3.2). */
function getSafeRedirect(redirect: string | undefined): string | null {
  if (!redirect || typeof redirect !== 'string') return null;
  const t = redirect.trim();
  if (t.startsWith('/') || t.startsWith('(')) return t;
  return null;
}

function getErrorMessage(error: { message: string }): string {
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login')) {
    return 'Email ou mot de passe incorrect.';
  }
  if (msg.includes('network') || msg.includes('réseau') || msg.includes('fetch')) {
    return 'Réseau indisponible. Réessayez.';
  }
  if (msg.includes('email')) {
    return 'Vérifiez votre adresse email.';
  }
  return error.message || 'Connexion impossible. Réessayez.';
}

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ redirect?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Renseignez l\'email et le mot de passe.');
      return;
    }
    setLoading(true);
    try {
      const result = await signIn(trimmedEmail, password);
      if (result.ok) {
        const redirect = getSafeRedirect(params.redirect);
        router.replace((redirect ?? '/(tabs)/home') as Href);
      } else {
        setError(getErrorMessage(result.error));
      }
    } catch {
      setError('Connexion impossible. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const { signInWithGoogle } = await import('@/services/auth/signInWithGoogle');
      const result = await signInWithGoogle();
      if (result.ok) {
        const redirect = getSafeRedirect(params.redirect);
        router.replace((redirect ?? '/(tabs)/home') as Href);
      } else {
        setError(getErrorMessage({ message: result.error.message || 'Connexion Google échouée.' }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('ExpoCryptoAES') || msg.includes('native module')) {
        setError(
          'La connexion Google nécessite un build de développement (expo run:ios ou expo run:android). Elle n’est pas disponible dans Expo Go.'
        );
      } else {
        setError(msg || 'Connexion Google échouée.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <Screen scroll keyboardAvoid>
      <View style={styles.content}>
        <AppLogo variant="large" style={styles.logo} />
        <Text style={styles.title}>Connexion</Text>
        <Text style={styles.subtitle}>
          Connectez-vous pour accéder à votre compte YOUMBIA.
        </Text>

        <Input
          label="Email"
          placeholder="vous@exemple.com"
          value={email}
          onChangeText={(t) => { setEmail(t); setError(null); }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Input
          label="Mot de passe"
          placeholder="••••••••"
          value={password}
          onChangeText={(t) => { setPassword(t); setError(null); }}
          secureTextEntry
          error={error ?? undefined}
        />

        <View style={styles.actions}>
          <Button onPress={handleSubmit} loading={loading} disabled={loading || googleLoading}>
            Se connecter
          </Button>
          <Button
            variant="outline"
            onPress={handleGoogleSignIn}
            loading={googleLoading}
            disabled={loading || googleLoading}
          >
            Continuer avec Google
          </Button>
          <Link
            href={params.redirect ? `/(auth)/signup?redirect=${encodeURIComponent(params.redirect)}` : '/(auth)/signup'}
            asChild
          >
            <Button variant="outline" style={styles.secondaryBtn} disabled={loading || googleLoading}>
              Créer un compte
            </Button>
          </Link>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing['3xl'],
    gap: spacing.lg,
  },
  logo: {
    alignSelf: 'center',
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
    marginBottom: spacing.xl,
  },
  actions: {
    gap: spacing.base,
    marginTop: spacing.lg,
  },
  secondaryBtn: {
    marginTop: spacing.sm,
  },
});
