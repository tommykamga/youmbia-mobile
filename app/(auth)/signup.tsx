import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Link, useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Button, Input, AppLogo } from '@/components';
import { signUp } from '@/services/auth';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

function getSafeRedirect(redirect: string | undefined): string | null {
  if (!redirect || typeof redirect !== 'string') return null;
  const t = redirect.trim();
  if (t.startsWith('/') || t.startsWith('(')) return t;
  return null;
}

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
  const params = useLocalSearchParams<{ redirect?: string }>();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isAnyLoading = loading || googleLoading;

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
        const redirect = getSafeRedirect(params.redirect);
        router.replace((redirect ?? '/(tabs)/home') as Href);
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
        setError('Google Auth nécessite un build natif sécurisé (indisponible via Expo Go seul).');
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

          <Button onPress={handleSubmit} loading={loading} disabled={isAnyLoading}>
            S'inscrire
          </Button>
        </View>

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>ou s'inscrire avec</Text>
          <View style={styles.line} />
        </View>

        <View style={styles.socialActions}>
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
          <Text style={styles.footerText}>Déjà un compte ?</Text>
          <Link
            href={params.redirect ? `/(auth)/login?redirect=${encodeURIComponent(params.redirect)}` : '/(auth)/login'}
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
    color: '#15803D',
    fontSize: typography.sm.fontSize,
    fontWeight: fontWeights.medium,
  },
});
