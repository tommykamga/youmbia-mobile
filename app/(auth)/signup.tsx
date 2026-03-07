import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link, useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { Screen, Button, Input, AppLogo } from '@/components';
import { signUp } from '@/services/auth';
import { colors, spacing, typography, fontWeights } from '@/theme';

/** Safe redirect: only app routes (start with / or () to avoid open redirect. */
function getSafeRedirect(redirect: string | undefined): string | null {
  if (!redirect || typeof redirect !== 'string') return null;
  const t = redirect.trim();
  if (t.startsWith('/') || t.startsWith('(')) return t;
  return null;
}

function getErrorMessage(error: { message: string }): string {
  const msg = error.message.toLowerCase();
  if (msg.includes('already registered') || msg.includes('already in use')) {
    return 'Un compte existe déjà avec cet email.';
  }
  if (msg.includes('password')) {
    return 'Le mot de passe doit faire au moins 6 caractères.';
  }
  if (msg.includes('email')) {
    return 'Vérifiez votre adresse email.';
  }
  return error.message || 'Une erreur est survenue.';
}

export default function SignupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ redirect?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
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
    const result = await signUp(trimmedEmail, password);
    setLoading(false);
    if (result.ok) {
      const redirect = getSafeRedirect(params.redirect);
      router.replace((redirect ?? '/(tabs)/home') as Href);
    } else {
      setError(getErrorMessage(result.error));
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
        setError(result.error.message || 'Connexion Google échouée.');
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
        <Text style={styles.title}>Créer un compte</Text>
        <Text style={styles.subtitle}>
          Rejoignez YOUMBIA pour acheter et vendre en toute confiance.
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
          placeholder="Au moins 6 caractères"
          value={password}
          onChangeText={(t) => { setPassword(t); setError(null); }}
          secureTextEntry
        />
        <Input
          label="Confirmer le mot de passe"
          placeholder="••••••••"
          value={confirmPassword}
          onChangeText={(t) => { setConfirmPassword(t); setError(null); }}
          secureTextEntry
          error={error ?? undefined}
        />

        <View style={styles.actions}>
          <Button onPress={handleSubmit} loading={loading} disabled={loading || googleLoading}>
            S'inscrire
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
            href={params.redirect ? `/(auth)/login?redirect=${encodeURIComponent(params.redirect)}` : '/(auth)/login'}
            asChild
          >
            <Button variant="ghost" style={styles.secondaryBtn} disabled={loading || googleLoading}>
              Déjà un compte ? Se connecter
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
