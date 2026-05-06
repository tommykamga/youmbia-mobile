import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { Screen, AppHeader, Button, Input, Loader, EmptyState } from '@/components';
import {
  getCurrentProfile,
  updateProfile,
  sanitizeProfileDisplayValue,
  normalizePhoneForProfile,
} from '@/services/profile';
import { getSession } from '@/services/auth';
import { useFocusEffect, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import { lightCacheKeys, lightCacheRead, lightCacheWrite } from '@/lib/lightCache';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';
import { resolveSingleAvatarUrl, AVATARS_BUCKET } from '@/lib/avatarImageUrl';
import { Image as ExpoImage } from 'expo-image';

type ProfileCachePayload = {
  userId: string;
  fullName: string;
  phone: string;
  avatarUrl: string;
  incomplete: boolean;
};

function logProfileDev(phase: string, payload?: Record<string, unknown>) {
  if (__DEV__) {
    console.log(`[profile] ${phase}`, payload ?? {});
  }
}

type ProfileState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string }
  | { status: 'success'; incomplete: boolean };

export default function AccountProfileScreen() {
  const [state, setState] = useState<ProfileState>({ status: 'loading' });
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrlRaw, setAvatarUrlRaw] = useState<string>('');
  const [avatarDisplayUrl, setAvatarDisplayUrl] = useState<string>('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    logProfileDev('fetch_start');
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const session = await getSession();
      const sessionEmail = session?.user?.email ?? '';
      setEmail(sessionEmail);
      const userId = session?.user?.id;
      if (!userId) {
        logProfileDev('no_user', { hasSession: !!session });
        setState({ status: 'unauthenticated' });
        logProfileDev('fetch_end', { outcome: 'unauthenticated' });
        return;
      }
      logProfileDev('session_ok', { userId });

      const cacheKey = lightCacheKeys.profile(userId);
      const cached = await lightCacheRead<ProfileCachePayload>(cacheKey);
      if (cached?.payload?.userId === userId) {
        setFullName(cached.payload.fullName);
        setPhone(cached.payload.phone);
        setAvatarUrlRaw(cached.payload.avatarUrl);
        // Lazy resolve (may fail if bucket not available) — safe fallback is initial.
        void resolveSingleAvatarUrl(cached.payload.avatarUrl).then((u) => {
          if (u) setAvatarDisplayUrl(u);
        });
        setState({
          status: 'success',
          incomplete: cached.payload.incomplete,
        });
      } else {
        setState({ status: 'loading' });
      }

      const result = await getCurrentProfile();
      logProfileDev('supabase_profile', {
        hasData: !!result.data,
        error: result.error?.message ?? null,
      });

      if (result.error) {
        const raw = String(result.error.message ?? '').toLowerCase();
        if (raw.includes('not authenticated') || raw.includes('non connecté')) {
          setState({ status: 'unauthenticated' });
          logProfileDev('fetch_end', { outcome: 'unauthenticated' });
          return;
        }
        setState({
          status: 'error',
          message: result.error.message || "Nous n'arrivons pas à charger vos informations.",
        });
        logProfileDev('fetch_end', { outcome: 'error' });
        return;
      }

      const name = sanitizeProfileDisplayValue(result.data?.full_name);
      const phoneVal = sanitizeProfileDisplayValue(result.data?.phone);
      setFullName(name);
      setPhone(phoneVal);
      const rawAvatar = String(result.data?.avatar_url ?? '').trim();
      setAvatarUrlRaw(rawAvatar);
      try {
        const resolved = await resolveSingleAvatarUrl(rawAvatar);
        setAvatarDisplayUrl(resolved);
      } catch {
        setAvatarDisplayUrl('');
      }
      const incomplete = !name.trim() && !phoneVal.trim();
      setState({ status: 'success', incomplete });
      await lightCacheWrite<ProfileCachePayload>(cacheKey, {
        userId,
        fullName: name,
        phone: phoneVal,
        avatarUrl: rawAvatar,
        incomplete,
      });
      logProfileDev('fetch_end', { outcome: 'success', incomplete });
    } catch (e) {
      logProfileDev('fetch_exception', { error: e instanceof Error ? e.message : String(e) });
      setState({
        status: 'error',
        message: "Nous n'arrivons pas à charger vos informations. Réessayez.",
      });
      logProfileDev('fetch_end', { outcome: 'catch' });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
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
    logProfileDev('save_start', {
      full_name: (fullName ?? '').trim() || null,
      phone: phoneNorm.value,
    });
    const result = await updateProfile({
      full_name: fullName.trim() || null,
      phone: phoneNorm.value,
    });
    setSaving(false);
    if (result.error) {
      logProfileDev('save_error', { message: result.error.message });
      setSaveError("Impossible de mettre à jour le profil. Réessayez.");
      return;
    }
    logProfileDev('save_success', { hasData: !!result.data });
    setSaveSuccess("Votre profil a été mis à jour avec succès.");
    const fn = sanitizeProfileDisplayValue(result.data?.full_name);
    const ph = sanitizeProfileDisplayValue(result.data?.phone);
    setFullName(fn);
    setPhone(ph);
    const incompleteAfter = !fn.trim() && !ph.trim();
    setState({ status: 'success', incomplete: incompleteAfter });
    const session = await getSession();
    const uid = session?.user?.id;
    if (uid) {
      await lightCacheWrite<ProfileCachePayload>(lightCacheKeys.profile(uid), {
        userId: uid,
        fullName: fn,
        phone: ph,
        avatarUrl: avatarUrlRaw,
        incomplete: incompleteAfter,
      });
    }
  }, [fullName, phone, avatarUrlRaw]);

  const handlePickAvatar = useCallback(async () => {
    if (avatarUploading || saving) return;
    setSaveError(null);
    setSaveSuccess(null);

    const session = await getSession();
    const userId = session?.user?.id;
    if (!userId) {
      setSaveError('Connexion requise.');
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission requise',
        "Autorisez l'accès aux photos pour choisir une photo de profil."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 1,
      base64: true,
    });

    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0]!;
    const originalBase64 = (asset.base64 ?? '').replace(/^data:image\/\w+;base64,/, '');
    if (!originalBase64) {
      setSaveError("Impossible de préparer l'image. Réessayez.");
      return;
    }

    setAvatarUploading(true);
    try {
      // Resize/compress client-side (safe default): 512px max width, JPEG.
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 512 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const preparedBase64 = (manipulated.base64 ?? originalBase64).replace(
        /^data:image\/\w+;base64,/,
        ''
      );
      if (!preparedBase64) {
        setSaveError("Impossible de préparer l'image. Réessayez.");
        return;
      }

      // Storage path: stable overwrite for "replace avatar" UX.
      const path = `${userId}/avatar.jpg`;
      const uploadOnce = async (bucket: string) => {
        return await supabase.storage.from(bucket).upload(path, decode(preparedBase64), {
          contentType: 'image/jpeg',
          upsert: true,
        });
      };

      // Try configured bucket; if it doesn't exist, fall back to known existing bucket.
      let upload = await uploadOnce(AVATARS_BUCKET);
      if (upload.error) {
        const msg = String(upload.error.message ?? '').toLowerCase();
        const bucketMissing =
          msg.includes('bucket') || msg.includes('not found') || msg.includes('does not exist');
        if (bucketMissing && AVATARS_BUCKET !== 'listing-images') {
          upload = await uploadOnce('listing-images');
        }
      }

      if (upload.error) {
        setSaveError("Impossible d'envoyer la photo. Réessayez.");
        return;
      }

      const updateRes = await updateProfile({ avatar_url: path });
      if (updateRes.error) {
        setSaveError("Photo envoyée, mais impossible d'enregistrer le profil. Réessayez.");
        return;
      }

      setAvatarUrlRaw(path);
      try {
        const resolved = await resolveSingleAvatarUrl(path);
        setAvatarDisplayUrl(resolved);
      } catch {
        setAvatarDisplayUrl('');
      }

      // Update cache so Account tab can refresh without extra fetch.
      await lightCacheWrite<ProfileCachePayload>(lightCacheKeys.profile(userId), {
        userId,
        fullName,
        phone,
        avatarUrl: path,
        incomplete: state.status === 'success' ? state.incomplete : false,
      });

      setSaveSuccess('Photo de profil mise à jour.');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Impossible de mettre à jour la photo.");
    } finally {
      setAvatarUploading(false);
    }
  }, [avatarUploading, saving, fullName, phone, state]);

  if (state.status === 'loading') {
    return (
      <Screen safe={false}>
        <AppHeader title="Mon Profil" showBack noBorder density="compact" />
        <Loader />
      </Screen>
    );
  }

  if (state.status === 'unauthenticated') {
    return <Redirect href={buildAuthGateHref('account', { redirect: '/account/profile' })} />;
  }

  if (state.status === 'error') {
    return (
      <Screen safe={false}>
        <AppHeader title="Mon Profil" showBack noBorder density="compact" />
        <View style={styles.emptyWrapPlain}>
          <EmptyState
            variant="plain"
            icon={<Ionicons name="alert-circle-outline" size={24} color={colors.textSecondary} />}
            title="Erreur de chargement"
            message={state.message}
            action={
              <Button variant="secondary" onPress={load} style={{ minWidth: 220, marginTop: spacing.sm }}>
                Réessayer
              </Button>
            }
          />
        </View>
      </Screen>
    );
  }

  const initial = email?.charAt(0).toUpperCase() || '?';
  const showIncomplete = state.status === 'success' && state.incomplete;

  return (
    <Screen keyboardAvoid scroll={false} noPadding safe={false}>
      <AppHeader title="Modifier profil" showBack noBorder density="compact" />
      
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Changer la photo de profil"
            onPress={handlePickAvatar}
            disabled={avatarUploading || saving}
            style={({ pressed }) => [
              styles.avatarWrap,
              pressed && { opacity: 0.92 },
              (avatarUploading || saving) && { opacity: 0.7 },
            ]}
          >
            <View style={styles.avatar}>
              {avatarDisplayUrl ? (
                <ExpoImage source={{ uri: avatarDisplayUrl }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Text style={styles.avatarText}>{initial}</Text>
              )}
            </View>
            <View style={styles.cameraBadge}>
              <Ionicons name={avatarUploading ? 'cloud-upload' : 'camera'} size={14} color={colors.surface} />
            </View>
          </Pressable>
          <Text style={styles.emailText}>{email}</Text>
          <Text style={styles.avatarHint}>
            {avatarUploading ? 'Mise à jour…' : 'Touchez pour changer la photo'}
          </Text>
        </View>

        <View style={styles.formContainer}>
          {showIncomplete ? (
            <View style={styles.alertInfo}>
              <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
              <Text style={styles.alertInfoText}>
                Profil incomplet — renseignez au moins votre nom ou votre téléphone.
              </Text>
            </View>
          ) : null}

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
  emptyWrapPlain: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  scrollContent: {
    paddingBottom: spacing['3xl'],
    backgroundColor: '#F9FAFB',
    flexGrow: 1,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    marginBottom: spacing.base,
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
    overflow: 'hidden',
  },
  avatarImg: {
    width: 80,
    height: 80,
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
  avatarHint: {
    ...typography.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
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
  alertInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    padding: spacing.base,
    borderRadius: radius.md,
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  alertInfoText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.sm.fontSize,
    fontWeight: fontWeights.medium,
  },
  alertSuccessText: {
    flex: 1,
    color: '#15803D',
    fontSize: typography.sm.fontSize,
    fontWeight: fontWeights.medium,
  },
});
