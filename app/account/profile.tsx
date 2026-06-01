import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform, Modal, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Screen, AppHeader, Button, Input, Loader, EmptyState } from '@/components';
import {
  getCurrentProfile,
  updateProfile,
  sanitizeProfileDisplayValue,
  normalizePhoneForProfile,
  getAvatarVersion,
} from '@/services/profile';
import { getSession } from '@/services/auth';
import { useFocusEffect, Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import { lightCacheKeys, lightCacheRead, lightCacheWrite } from '@/lib/lightCache';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';
import {
  resolveSingleAvatarUrl,
  resolveFreshAvatarUrl,
  invalidateAvatarCache,
  AVATARS_BUCKET,
} from '@/lib/avatarImageUrl';
import { getProfileReturnNext, replaceAfterProfileSave } from '@/lib/profileReturnNavigation';
import { Image as ExpoImage } from 'expo-image';

type ProfileCachePayload = {
  userId: string;
  fullName: string;
  phone: string;
  avatarUrl: string;
  avatarVersion: string;
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
  const router = useRouter();
  const { next: nextParam } = useLocalSearchParams<{ next?: string }>();
  const returnNext = getProfileReturnNext(nextParam);
  const [state, setState] = useState<ProfileState>({ status: 'loading' });
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrlRaw, setAvatarUrlRaw] = useState<string>('');
  const [avatarVersion, setAvatarVersion] = useState<string>('');
  const [avatarDisplayUrl, setAvatarDisplayUrl] = useState<string>('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarBusyLabel, setAvatarBusyLabel] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  // iOS ne peut pas présenter le sélecteur tant que l'action sheet (Modal) se ferme.
  // On diffère l'action jusqu'à `onDismiss` (iOS) ; sur Android on l'exécute directement.
  const pendingSheetActionRef = useRef<null | (() => void)>(null);
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
        setAvatarVersion(cached.payload.avatarVersion ?? '');
        // Lazy resolve (may fail if bucket not available) — safe fallback is initial.
        void resolveSingleAvatarUrl(cached.payload.avatarUrl, cached.payload.avatarVersion).then((u) => {
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
      const version = getAvatarVersion(result.data);
      setAvatarUrlRaw(rawAvatar);
      setAvatarVersion(version);
      try {
        const resolved = await resolveSingleAvatarUrl(rawAvatar, version);
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
        avatarVersion: version,
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
    const refreshed = await getCurrentProfile();
    const profileRow = refreshed.data ?? result.data;
    const fn = sanitizeProfileDisplayValue(profileRow?.full_name);
    const ph = sanitizeProfileDisplayValue(profileRow?.phone);
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
        avatarVersion,
        incomplete: incompleteAfter,
      });
    }

    if (returnNext) {
      const refresh = (router as unknown as { refresh?: () => void }).refresh;
      if (Platform.OS === 'web' && typeof refresh === 'function') {
        refresh();
      }
      replaceAfterProfileSave(router, returnNext);
      return;
    }

    setSaveSuccess("Votre profil a été mis à jour avec succès.");
  }, [fullName, phone, avatarUrlRaw, avatarVersion, returnNext, router]);

  const hasAvatar = !!avatarUrlRaw.trim();
  const avatarBusy = avatarUploading;

  const openAvatarSheet = useCallback(() => {
    if (avatarBusy || saving) return;
    setSaveError(null);
    setSaveSuccess(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSheetVisible(true);
  }, [avatarBusy, saving]);

  /**
   * Ferme l'action sheet puis lance l'action.
   * iOS : on attend `onDismiss` (sinon le sélecteur ne se présente jamais).
   * Android : pas de conflit de présentation → on exécute directement.
   */
  const runAfterSheet = useCallback((action: () => void) => {
    if (Platform.OS === 'ios') {
      pendingSheetActionRef.current = action;
      setSheetVisible(false);
    } else {
      setSheetVisible(false);
      action();
    }
  }, []);

  /** Resize + compress to a square-friendly avatar, enforce ~1 Mo max, then upload + persist. */
  const processAndUpload = useCallback(
    async (uri: string) => {
      const session = await getSession();
      const userId = session?.user?.id;
      if (!userId) {
        setSaveError('Connexion requise.');
        return;
      }

      setAvatarBusyLabel('Mise à jour…');
      setAvatarUploading(true);
      try {
        // Target ~512px JPEG. Loop down quality if the result is still above ~1 Mo.
        const MAX_BYTES = 1_000_000;
        let compress = 0.82;
        let manipulated = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 512 } }],
          { compress, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        let preparedBase64 = (manipulated.base64 ?? '').replace(/^data:image\/\w+;base64,/, '');
        const approxBytes = (b64: string) => Math.floor((b64.length * 3) / 4);
        while (preparedBase64 && approxBytes(preparedBase64) > MAX_BYTES && compress > 0.4) {
          compress = Math.max(0.4, compress - 0.2);
          manipulated = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 512 } }],
            { compress, format: ImageManipulator.SaveFormat.JPEG, base64: true }
          );
          preparedBase64 = (manipulated.base64 ?? '').replace(/^data:image\/\w+;base64,/, '');
        }

        if (!preparedBase64) {
          setSaveError("Impossible de préparer l'image. Réessayez.");
          return;
        }

        // Unique filename per change: avatar_url itself changes on every replacement,
        // which makes the new photo propagate to all devices (DB = source of truth) and
        // busts the image cache without relying on any timestamp column.
        const previousPath = avatarUrlRaw.trim();
        const path = `${userId}/avatar_${Date.now()}.jpg`;
        const uploadOnce = async (bucket: string) => {
          return await supabase.storage.from(bucket).upload(path, decode(preparedBase64), {
            contentType: 'image/jpeg',
            upsert: true,
          });
        };

        // Try configured bucket; if it doesn't exist, fall back to known existing bucket.
        let usedBucket = AVATARS_BUCKET;
        let upload = await uploadOnce(AVATARS_BUCKET);
        if (upload.error) {
          const msg = String(upload.error.message ?? '').toLowerCase();
          const bucketMissing =
            msg.includes('bucket') || msg.includes('not found') || msg.includes('does not exist');
          if (bucketMissing && AVATARS_BUCKET !== 'listing-images') {
            usedBucket = 'listing-images';
            upload = await uploadOnce('listing-images');
          }
        }

        if (upload.error) {
          logProfileDev('avatar_upload_error', { message: upload.error.message });
          setSaveError("Impossible de mettre à jour la photo.");
          return;
        }

        const updateRes = await updateProfile({ avatar_url: path });
        if (updateRes.error) {
          logProfileDev('avatar_db_error', { message: updateRes.error.message });
          setSaveError("Impossible de mettre à jour la photo.");
          return;
        }

        // Best-effort cleanup of the previous file (never block on failure).
        const prevIsPath = previousPath !== '' && previousPath !== path && !/^https?:\/\//i.test(previousPath);
        if (prevIsPath) {
          try {
            await supabase.storage.from(usedBucket).remove([previousPath]);
          } catch (e) {
            logProfileDev('avatar_prev_remove_failed', {
              error: e instanceof Error ? e.message : String(e),
            });
          }
          invalidateAvatarCache(previousPath);
        }

        // Version derived from avatar_url → consistent cache-bust across devices.
        const version = getAvatarVersion(updateRes.data);
        setAvatarUrlRaw(path);
        setAvatarVersion(version);
        try {
          // Fresh URL (cache-busted) so the new bytes replace the previously cached image.
          const resolved = await resolveFreshAvatarUrl(path, version);
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
          avatarVersion: version,
          incomplete: state.status === 'success' ? state.incomplete : false,
        });

        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSaveSuccess('Photo de profil mise à jour');
      } catch (e) {
        logProfileDev('avatar_exception', { error: e instanceof Error ? e.message : String(e) });
        setSaveError("Impossible de mettre à jour la photo.");
      } finally {
        setAvatarUploading(false);
        setAvatarBusyLabel(null);
      }
    },
    [fullName, phone, state, avatarUrlRaw]
  );

  const handlePickFromLibrary = useCallback(async () => {
    if (avatarBusy || saving) return;
    setSaveError(null);
    setSaveSuccess(null);

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
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0]!;
    const mime = String(asset.mimeType ?? '').toLowerCase();
    if (mime && !mime.startsWith('image/')) {
      setSaveError("Format non pris en charge. Choisissez une image.");
      return;
    }
    if (!asset.uri) {
      setSaveError("Impossible de préparer l'image. Réessayez.");
      return;
    }
    await processAndUpload(asset.uri);
  }, [avatarBusy, saving, processAndUpload]);

  const handleTakePhoto = useCallback(async () => {
    if (avatarBusy || saving) return;
    setSaveError(null);
    setSaveSuccess(null);

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission requise',
        "Autorisez l'accès à la caméra pour prendre une photo de profil."
      );
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0]!;
      if (!asset.uri) {
        setSaveError("Impossible de préparer l'image. Réessayez.");
        return;
      }
      await processAndUpload(asset.uri);
    } catch (e) {
      logProfileDev('camera_error', { error: e instanceof Error ? e.message : String(e) });
      setSaveError("Caméra indisponible. Réessayez.");
    }
  }, [avatarBusy, saving, processAndUpload]);

  const handleRemoveAvatar = useCallback(async () => {
    if (avatarBusy || saving) return;
    setSaveError(null);
    setSaveSuccess(null);

    const session = await getSession();
    const userId = session?.user?.id;
    if (!userId) {
      setSaveError('Connexion requise.');
      return;
    }

    const currentRaw = avatarUrlRaw.trim();
    setAvatarBusyLabel('Suppression…');
    setAvatarUploading(true);
    try {
      // 1) Persist removal first — this is the source of truth.
      const updateRes = await updateProfile({ avatar_url: null });
      if (updateRes.error) {
        logProfileDev('avatar_remove_db_error', { message: updateRes.error.message });
        setSaveError("Impossible de mettre à jour la photo.");
        return;
      }

      // 2) Best-effort Storage cleanup (path only; never block on failure).
      const isPath = currentRaw !== '' && !/^https?:\/\//i.test(currentRaw);
      if (isPath) {
        try {
          let rm = await supabase.storage.from(AVATARS_BUCKET).remove([currentRaw]);
          if (rm.error && AVATARS_BUCKET !== 'listing-images') {
            rm = await supabase.storage.from('listing-images').remove([currentRaw]);
          }
          if (rm.error) logProfileDev('avatar_storage_remove_failed', { message: rm.error.message });
        } catch (e) {
          logProfileDev('avatar_storage_remove_exception', {
            error: e instanceof Error ? e.message : String(e),
          });
        }
        invalidateAvatarCache(currentRaw);
      }

      const version = getAvatarVersion(updateRes.data);
      setAvatarUrlRaw('');
      setAvatarVersion(version);
      setAvatarDisplayUrl('');
      await lightCacheWrite<ProfileCachePayload>(lightCacheKeys.profile(userId), {
        userId,
        fullName,
        phone,
        avatarUrl: '',
        avatarVersion: version,
        incomplete: state.status === 'success' ? state.incomplete : false,
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaveSuccess('Photo de profil supprimée');
    } catch (e) {
      logProfileDev('avatar_remove_exception', { error: e instanceof Error ? e.message : String(e) });
      setSaveError("Impossible de mettre à jour la photo.");
    } finally {
      setAvatarUploading(false);
      setAvatarBusyLabel(null);
    }
  }, [avatarBusy, saving, avatarUrlRaw, fullName, phone, state]);

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
            onPress={openAvatarSheet}
            disabled={avatarBusy || saving}
            style={({ pressed }) => [
              styles.avatarWrap,
              pressed && { opacity: 0.92 },
              (avatarBusy || saving) && { opacity: 0.7 },
            ]}
          >
            <View style={styles.avatar}>
              {avatarDisplayUrl ? (
                <ExpoImage source={{ uri: avatarDisplayUrl }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Text style={styles.avatarText}>{initial}</Text>
              )}
              {avatarBusy ? (
                <View style={styles.avatarBusyOverlay}>
                  <ActivityIndicator size="small" color={colors.surface} />
                </View>
              ) : null}
            </View>
            <View style={styles.cameraBadge}>
              <Ionicons name={avatarBusy ? 'cloud-upload' : 'camera'} size={14} color={colors.surface} />
            </View>
          </Pressable>
          <Text style={styles.emailText}>{email}</Text>
          <Text style={styles.avatarHint}>
            {avatarBusy ? (avatarBusyLabel ?? 'Mise à jour…') : 'Touchez pour changer la photo'}
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

      <Modal
        visible={sheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSheetVisible(false)}
        onDismiss={() => {
          const fn = pendingSheetActionRef.current;
          pendingSheetActionRef.current = null;
          fn?.();
        }}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setSheetVisible(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Photo de profil</Text>

            <Pressable
              style={({ pressed }) => [styles.sheetRow, pressed && styles.sheetRowPressed]}
              onPress={() => runAfterSheet(() => void handlePickFromLibrary())}
            >
              <Ionicons name="image-outline" size={22} color={colors.primary} />
              <Text style={styles.sheetRowLabel}>Choisir une photo</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.sheetRow, pressed && styles.sheetRowPressed]}
              onPress={() => runAfterSheet(() => void handleTakePhoto())}
            >
              <Ionicons name="camera-outline" size={22} color={colors.primary} />
              <Text style={styles.sheetRowLabel}>Prendre une photo</Text>
            </Pressable>

            {hasAvatar ? (
              <Pressable
                style={({ pressed }) => [styles.sheetRow, pressed && styles.sheetRowPressed]}
                onPress={() => runAfterSheet(() => void handleRemoveAvatar())}
              >
                <Ionicons name="trash-outline" size={22} color={colors.error} />
                <Text style={[styles.sheetRowLabel, { color: colors.error }]}>Supprimer la photo</Text>
              </Pressable>
            ) : null}

            <Pressable
              style={({ pressed }) => [styles.sheetCancel, pressed && styles.sheetRowPressed]}
              onPress={() => setSheetVisible(false)}
            >
              <Text style={styles.sheetCancelLabel}>Annuler</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  avatarBusyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
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
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderLight,
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    ...typography.sm,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.5,
    marginLeft: spacing.xs,
    marginBottom: spacing.xs,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.xs,
  },
  sheetRowPressed: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
  },
  sheetRowLabel: {
    ...typography.base,
    color: colors.text,
    fontWeight: fontWeights.semibold,
  },
  sheetCancel: {
    marginTop: spacing.sm,
    paddingVertical: spacing.base,
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
  },
  sheetCancelLabel: {
    ...typography.base,
    color: colors.textSecondary,
    fontWeight: fontWeights.bold,
  },
});
