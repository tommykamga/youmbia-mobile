import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Screen, AppHeader, Button, Input, Loader, EmptyState } from '@/components';
import {
  getCurrentProfile,
  updateProfile,
  sanitizeProfileDisplayValue,
  normalizePhoneForProfile,
} from '@/services/profile';
import { getSession } from '@/services/auth';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

type ProfileState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success' };

export default function AccountProfileScreen() {
  const [state, setState] = useState<ProfileState>({ status: 'loading' });
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    setSaveError(null);
    setSaveSuccess(null);
    
    // Also fetch email from session for the visual avatar
    const session = await getSession();
    setEmail(session?.user?.email ?? '');

    const result = await getCurrentProfile();
    if (result.error) {
      setState({ status: 'error', message: "Nous n'arrivons pas à charger vos informations." });
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
    setSaveSuccess(null);
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
      setSaveError("Impossible de mettre à jour le profil. Réessayez.");
      return;
    }
    setSaveSuccess("Votre profil a été mis à jour avec succès.");
    setFullName(sanitizeProfileDisplayValue(result.data?.full_name));
    setPhone(sanitizeProfileDisplayValue(result.data?.phone));
  }, [fullName, phone]);

  if (state.status === 'loading') {
    return (
      <Screen>
        <AppHeader title="Mon Profil" showBack noBorder />
        <Loader />
      </Screen>
    );
  }

  if (state.status === 'error') {
    return (
      <Screen>
        <AppHeader title="Mon Profil" showBack noBorder />
        <EmptyState
          icon={<Ionicons name="alert-circle-outline" size={56} color={colors.textSecondary} />}
          title="Erreur de chargement"
          message={state.message}
          action={
            <Button variant="secondary" onPress={load} style={{ minWidth: 200, marginTop: spacing.lg }}>
              Réessayer
            </Button>
          }
          style={styles.center}
        />
      </Screen>
    );
  }

  const initial = email?.charAt(0).toUpperCase() || '?';

  return (
    <Screen keyboardAvoid scroll={false} noPadding>
      <AppHeader title="Modifier profil" showBack noBorder />
      
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color={colors.surface} />
            </View>
          </View>
          <Text style={styles.emailText}>{email}</Text>
        </View>

        <View style={styles.formContainer}>
          {saveError ? (
            <View style={styles.alertError}>
              <Ionicons name="alert-circle" size={20} color={colors.error} />
              <Text style={styles.alertErrorText}>{saveError}</Text>
            </View>
          ) : null}

          {saveSuccess ? (
            <View style={styles.alertSuccess}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              <Text style={styles.alertSuccessText}>{saveSuccess}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Input
              label="Nom affiché"
              placeholder="e.g. Jean Dupont"
              value={fullName}
              onChangeText={(t) => { setFullName(t); setSaveError(null); setSaveSuccess(null); }}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!saving}
            />
            
            <View style={styles.spacer} />

            <Input
              label="Numéro de téléphone"
              placeholder="+237 6 12 34 56 78"
              value={phone}
              onChangeText={(t) => { setPhone(t); setSaveError(null); setSaveSuccess(null); }}
              keyboardType="phone-pad"
              autoCapitalize="none"
              editable={!saving}
            />
          </View>

          <Button
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            style={styles.saveBtn}
          >
            Enregistrer les modifications
          </Button>

        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, paddingTop: spacing['3xl'] },
  scrollContent: {
    paddingBottom: spacing['3xl'],
    backgroundColor: '#F9FAFB',
    flexGrow: 1,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    marginBottom: spacing.lg,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  avatarText: {
    ...typography['3xl'],
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  emailText: {
    ...typography.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  formContainer: {
    paddingHorizontal: spacing.base,
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  spacer: {
    height: spacing.lg,
  },
  saveBtn: {
    marginTop: spacing.xl,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  alertError: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2', 
    padding: spacing.base,
    borderRadius: radius.md,
    gap: spacing.sm,
    marginBottom: spacing.base,
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
    marginBottom: spacing.base,
  },
  alertSuccessText: {
    flex: 1,
    color: '#15803D',
    fontSize: typography.sm.fontSize,
    fontWeight: fontWeights.medium,
  },
});
