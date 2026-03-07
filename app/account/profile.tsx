/**
 * Profil – fetch current profile, edit full_name and phone, save with loading/success/error states.
 * Sprint 5.1: persistance fiable, pas de valeurs fictives, normalisation téléphone.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, AppHeader, Button, Input, Loader, EmptyState } from '@/components';
import {
  getCurrentProfile,
  updateProfile,
  sanitizeProfileDisplayValue,
  normalizePhoneForProfile,
} from '@/services/profile';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, typography } from '@/theme';

type ProfileState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success' };

export default function AccountProfileScreen() {
  const [state, setState] = useState<ProfileState>({ status: 'loading' });
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    setSaveError(null);
    const result = await getCurrentProfile();
    if (result.error) {
      setState({ status: 'error', message: result.error.message });
      return;
    }
    const name = sanitizeProfileDisplayValue(result.data?.full_name);
    const phoneVal = sanitizeProfileDisplayValue(result.data?.phone);
    setFullName(name);
    setPhone(phoneVal);
    setState({ status: 'success' });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (state.status === 'success') {
        load();
      }
    }, [load, state.status])
  );

  const handleSave = useCallback(async () => {
    setSaveError(null);
    const phoneNorm = normalizePhoneForProfile(phone);
    if (phoneNorm.error) {
      setSaveError(phoneNorm.error);
      return;
    }
    setSaving(true);
    const result = await updateProfile({
      full_name: fullName.trim() || null,
      phone: phoneNorm.value,
    });
    setSaving(false);
    if (result.error) {
      setSaveError(result.error.message);
      return;
    }
    setSavedOnce(true);
    setFullName(sanitizeProfileDisplayValue(result.data?.full_name));
    setPhone(sanitizeProfileDisplayValue(result.data?.phone));
  }, [fullName, phone]);

  if (state.status === 'loading') {
    return (
      <Screen>
        <AppHeader title="Profil" showBack />
        <Loader />
      </Screen>
    );
  }

  if (state.status === 'error') {
    return (
      <Screen>
        <AppHeader title="Profil" showBack />
        <EmptyState
          title="Erreur"
          message={state.message}
          action={
            <Button variant="secondary" onPress={load}>
              Réessayer
            </Button>
          }
          style={styles.center}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll keyboardAvoid>
      <AppHeader title="Profil" showBack />
      <View style={styles.form}>
        <Input
          label="Nom affiché"
          placeholder="Votre nom"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          autoCorrect={false}
        />
        <Input
          label="Téléphone"
          placeholder="Ex. +237 6 12 34 56 78"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoCapitalize="none"
        />
        {saveError ? (
          <Text style={styles.saveError}>{saveError}</Text>
        ) : null}
        {savedOnce ? (
          <Text style={styles.savedHint}>Enregistré</Text>
        ) : null}
        <Button
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          style={styles.saveBtn}
        >
          Enregistrer
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1 },
  form: {
    padding: spacing.base,
  },
  saveError: {
    ...typography.sm,
    color: colors.error,
    marginBottom: spacing.sm,
  },
  savedHint: {
    ...typography.sm,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  saveBtn: {
    marginTop: spacing.sm,
  },
});
