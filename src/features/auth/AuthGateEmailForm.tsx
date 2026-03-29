/**
 * Formulaire email / mot de passe + lien magique + lien inscription (Auth Gate).
 * Aucune logique métier — callbacks fournis par l’écran parent.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { AppButton, AppCard, Input } from '@/components';
import { colors, ui } from '@/theme';

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
  /** Focus champ email à l’ouverture (écran gate uniquement). */
  autoFocusEmail?: boolean;
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
  autoFocusEmail = false,
}: AuthGateEmailFormProps) {
  const busy = disabled || passwordLoading || magicLoading;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        Connexion avec email
      </Text>
      <AppCard padded>
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
            autoFocus={autoFocusEmail}
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

          <AppButton
            onPress={onSubmitPassword}
            loading={passwordLoading}
            disabled={busy}
            layout="pill52"
            style={styles.btnPrimaryMargin}
          >
            Se connecter
          </AppButton>
        </View>

        <View style={styles.separator}>
          <View style={styles.line} />
          <Text style={styles.separatorLabel}>ou</Text>
          <View style={styles.line} />
        </View>

        <AppButton
          variant="outline"
          onPress={onMagicLink}
          loading={magicLoading}
          disabled={busy}
          layout="pillMutedOutline52"
        >
          Recevoir un lien par email
        </AppButton>
      </AppCard>

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
    gap: ui.spacing.sm,
  },
  sectionTitle: {
    ...ui.typography.bodySmall,
    fontWeight: '700',
    color: ui.colors.textPrimary,
    letterSpacing: -0.15,
  },
  fields: {
    gap: ui.spacing.lg,
  },
  btnPrimaryMargin: {
    marginTop: ui.spacing.xs,
  },
  forgot: {
    alignSelf: 'flex-end',
    paddingVertical: ui.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  forgotText: {
    ...ui.typography.bodySmall,
    color: ui.colors.primary,
    fontWeight: '600',
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: ui.spacing.xs,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: ui.colors.borderLight,
  },
  separatorLabel: {
    marginHorizontal: ui.spacing.lg,
    ...ui.typography.caption,
    color: colors.textTertiary,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'lowercase',
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingTop: ui.spacing.sm,
  },
  signupHint: {
    ...ui.typography.bodySmall,
    color: ui.colors.textMuted,
    fontWeight: '500',
  },
  signupLink: {
    ...ui.typography.bodySmall,
    color: ui.colors.primary,
    fontWeight: '700',
  },
});
