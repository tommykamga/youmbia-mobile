/**
 * Bouton « Se connecter avec Apple » — affiché UNIQUEMENT sur iOS.
 *
 * Construit sur `AppButton` (même composant que Google) pour une cohérence
 * visuelle parfaite : même hauteur (pill52 / 52pt), même radius, même padding.
 * Fond noir, texte + icône Apple blancs.
 *
 * Garde UX :
 * - Android / Web : retourne `null` (jamais affiché).
 * - Expo Go iOS : bouton affiché POUR RÉASSURANCE mais **désactivé** (opacité
 *   légère, aucun loading, aucun appel réseau). Dans Expo Go le bundle id est
 *   `host.exp.Exponent`, donc l'`id_token` Apple a une audience refusée par
 *   Supabase. On bloque donc tout appel à `signInWithApple()` et on affiche un
 *   message discret + un log dev.
 * - Build natif iOS : bouton **actif** si `AppleAuthentication.isAvailableAsync()`
 *   renvoie `true` (iOS 13+ avec capability activée), sinon non affiché.
 *
 * N'altère en rien le flux Supabase (`signInWithIdToken`) : ce composant ne
 * décide que de l'affichage et de l'activation du bouton.
 */

import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import { AppButton } from '@/components';
import { ui } from '@/theme';

/** Expo Go : bundle id `host.exp.Exponent` → audience id_token refusée par Supabase. */
const IS_EXPO_GO = (Constants.appOwnership as string | null) === 'expo';
const EXPO_GO_MESSAGE = 'Apple Sign-In indisponible dans Expo Go. Tester via EAS build.';

type AppleSignInButtonProps = {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppleSignInButton({
  onPress,
  disabled = false,
  loading = false,
  style,
}: AppleSignInButtonProps) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }
    if (IS_EXPO_GO) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(`[AppleSignIn] ${EXPO_GO_MESSAGE}`);
      }
      return;
    }

    let mounted = true;
    AppleAuthentication.isAvailableAsync()
      .then((isAvailable) => {
        if (mounted) setAvailable(isAvailable);
      })
      .catch(() => {
        if (mounted) setAvailable(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (Platform.OS !== 'ios') {
    return null;
  }

  // Build natif : n'afficher que si l'API Apple est disponible (iOS 13+).
  // Expo Go : on affiche toujours (désactivé) pour la réassurance visuelle.
  if (!IS_EXPO_GO && !available) {
    return null;
  }

  const button = (
    <AppButton
      variant="primary"
      onPress={onPress}
      loading={IS_EXPO_GO ? false : loading}
      disabled={IS_EXPO_GO || disabled}
      layout="pill52"
      style={[styles.appleButton, style]}
      leftIcon={<Ionicons name="logo-apple" size={22} color={ui.colors.surface} />}
    >
      Se connecter avec Apple
    </AppButton>
  );

  if (IS_EXPO_GO) {
    return (
      <View style={styles.wrapper}>
        {button}
        <Text style={styles.expoGoNote}>{EXPO_GO_MESSAGE}</Text>
      </View>
    );
  }

  return button;
}

const styles = StyleSheet.create({
  wrapper: {
    gap: ui.spacing.xs,
  },
  appleButton: {
    backgroundColor: '#000000',
  },
  expoGoNote: {
    ...ui.typography.caption,
    color: ui.colors.textMuted,
    textAlign: 'center',
    fontWeight: '600',
  },
});
