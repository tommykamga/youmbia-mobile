/**
 * Formulaire email / mot de passe + lien magique + lien inscription (Auth Gate).
 * Aucune logique métier — callbacks fournis par l’écran parent.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { Button, Input } from '@/components';
import { colors, spacing, typography, fontWeights, radius, shadows } from '@/theme';

export type AuthGateEmailFormProps = {
  email: string;
  password: string;
  onChangeEmail: (t: string) => void;
  onChangePassword: (t: string) => void;
  onSubmitPassword: () => void;
  onMagicLink: () => void;
  signupHref: string;
  /** URL de l’écran reset avec mêmes redirect/contact que le gate + email courant. */
  resetHrefForEmail: (email: string) => string;
  passwordLoading: boolean;
  magicLoading: boolean;
  disabled: boolean;
};

export function AuthGateEmailForm({
  email,
  password,
  onChangeEmail,
  onChangePassword,
  onSubmitPassword,
  onMagicLink,
  signupHref,
  resetHrefForEmail,
  passwordLoading,
  magicLoading,
  disabled,
}: AuthGateEmailFormProps) {
  const busy = disabled || passwordLoading || magicLoading;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionEyebrow} accessibilityRole="header">
        Email & mot de passe
      </Text>
      <View style={styles.card}>
        <View style={styles.fields}>
          <Input
            label="Adresse email"
            placeholder="vous@exemple.com"
            value={email}
            onChangeText={onChangeEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
          <View>
            <Input
              label="Mot de passe"
              placeholder="••••••••"
              value={password}
              onChangeText={onChangePassword}
              secureTextEntry
              editable={!busy}
            />
            <Link href={resetHrefForEmail(email) as never} asChild>
              <Pressable style={styles.forgot} hitSlop={10} accessibilityRole="link">
                <Text style={styles.forgotText}>Mot de passe oublié ?</Text>
              </Pressable>
            </Link>
          </View>

          <Button
            onPress={onSubmitPassword}
            loading={passwordLoading}
            disabled={busy}
            size="lg"
            style={styles.btnPrimary}
          >
            Se connecter
          </Button>
        </View>

        <View style={styles.separator}>
          <View style={styles.line} />
          <Text style={styles.separatorLabel}>ou</Text>
          <View style={styles.line} />
        </View>

        <Button
          variant="outline"
          onPress={onMagicLink}
          loading={magicLoading}
          disabled={busy}
          size="lg"
          style={styles.btnOutline}
        >
          Recevoir un lien par email
        </Button>
      </View>

      <View style={styles.signupRow}>
        <Text style={styles.signupHint}>Pas encore de compte ? </Text>
        <Link href={signupHref as never} asChild>
          <Pressable hitSlop={12} accessibilityRole="link">
            <Text style={styles.signupLink}>S&apos;inscrire</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.lg,
  },
  sectionEyebrow: {
    fontSize: typography.xs.fontSize,
    lineHeight: typography.xs.lineHeight,
    fontWeight: fontWeights.bold,
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius['3xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadows.sm,
  },
  fields: {
    gap: spacing.base,
  },
  btnPrimary: {
    borderRadius: radius.full,
    minHeight: 54,
    marginTop: spacing.xs,
  },
  btnOutline: {
    borderRadius: radius.full,
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  forgot: {
    alignSelf: 'flex-end',
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  forgotText: {
    fontSize: typography.sm.fontSize,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
  },
  separatorLabel: {
    marginHorizontal: spacing.base,
    fontSize: typography.xs.fontSize,
    color: colors.textTertiary,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.8,
    textTransform: 'lowercase',
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingTop: spacing.sm,
  },
  signupHint: {
    fontSize: typography.sm.fontSize,
    color: colors.textMuted,
    fontWeight: fontWeights.medium,
  },
  signupLink: {
    fontSize: typography.sm.fontSize,
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
});
