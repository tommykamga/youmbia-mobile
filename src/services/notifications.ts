import 'expo-sqlite/localStorage/install';

import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import {
  trackPushNotificationReceived,
  trackPushPermissionChecked,
  trackPushPermissionDenied,
  trackPushPermissionGranted,
  trackPushTokenRegistrationFailed,
  trackPushTokenRegistrationStarted,
  trackPushTokenRegistrationSucceeded,
} from '@/lib/analytics';
import { getListingHrefFromUrl } from '@/lib/listingDeepLink';
import { supabase } from '@/lib/supabase';

const PUSH_TOKEN_STORAGE_KEY = 'youmbia.pushToken.v1';
const PUSH_PERMISSION_ASKED_KEY = 'youmbia.pushPermissionAsked.v1';
const PUSH_PROMPT_DISMISSED_KEY = 'youmbia.pushPromptDismissed.v1';
const PUSH_PROMPT_DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const NOTIFICATION_COOLDOWN_STORAGE_KEY = 'youmbia.notificationCooldowns.v1';
const SEARCH_ROUTE_PREFIXES = ['/(tabs)/search', '/search'] as const;

type NotificationData = Record<string, unknown>;
type NotificationCooldownMap = Record<string, number>;
export type NotificationResponseLike = {
  notification?: {
    request?: {
      identifier?: string | null;
      content?: {
        data?: unknown;
      };
    };
  };
};
type NotificationsModule = typeof import('expo-notifications');

export type PushRegistrationErrorCode =
  | 'permission_denied'
  | 'permission_blocked'
  | 'native_unavailable'
  | 'project_id_missing'
  | 'fcm_registration_failed'
  | 'expo_token_failed'
  | 'supabase_persist_failed'
  | 'unknown';

export type PushRegistrationFailure = {
  errorCode: PushRegistrationErrorCode;
  debugCode?: string;
  retryable: boolean;
  message: string;
};

export type PushRegistrationResult =
  | { ok: true; status: 'granted'; token: string }
  | ({
      ok: false;
      status: 'denied' | 'blocked' | 'unavailable' | 'unauthenticated' | 'error';
    } & PushRegistrationFailure);

export type PushTokenSyncResult =
  | { ok: true; status: 'registered'; token: string }
  | { ok: true; status: 'skipped'; reason: string }
  | ({ ok: false; status: 'error' } & PushRegistrationFailure);

type PushTokenPersistenceResult =
  | { ok: true; userId: string }
  | { ok: false; errorCode: string; message: string };

let notificationsInitialized = false;
let notificationsInitializing = false;
let notificationsModulePromise: Promise<NotificationsModule | null> | null = null;
let notificationsModuleError: unknown = null;

function isExpoGoRuntime(): boolean {
  return Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';
}

export function isPushNotificationsAvailable(): boolean {
  return Platform.OS !== 'web' && !isExpoGoRuntime();
}

async function loadNotificationsModule(): Promise<NotificationsModule | null> {
  if (!isPushNotificationsAvailable()) return null;
  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications').catch((error) => {
      notificationsModuleError = error;
      logPushRuntimeFailure('module_load', 'native_unavailable', error);
      notificationsModulePromise = null;
      return null;
    });
  }
  return notificationsModulePromise;
}

function getProjectId(): string | null {
  const easProjectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    null;

  return typeof easProjectId === 'string' && easProjectId.trim() ? easProjectId.trim() : null;
}

function readStorage(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    return true;
  } catch {
    return false;
  }
}

function removeStorage(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {}
}

function readCooldownMap(): NotificationCooldownMap {
  try {
    const raw = readStorage(NOTIFICATION_COOLDOWN_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as NotificationCooldownMap) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCooldownMap(map: NotificationCooldownMap): void {
  writeStorage(NOTIFICATION_COOLDOWN_STORAGE_KEY, JSON.stringify(map));
}

function getSearchQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();
  const keys = ['q', 'priceMin', 'priceMax', 'category', 'categoryId', 'city'] as const;
  keys.forEach((key) => {
    const value = params[key];
    if (typeof value === 'string' && value.trim()) {
      searchParams.set(key, value.trim());
    }
  });
  return searchParams.toString();
}

export function getComparableRouteKey(
  pathname: string | null | undefined,
  params?: Record<string, unknown>
): string {
  const safePath = String(pathname ?? '').trim();
  if (!safePath) return '';

  if (SEARCH_ROUTE_PREFIXES.some((prefix) => safePath.startsWith(prefix))) {
    const query = getSearchQueryString(params ?? {});
    return query ? `/search?${query}` : '/search';
  }

  return safePath.replace('/(tabs)', '');
}

export function getComparableTargetKey(target: string | null | undefined): string {
  const safeTarget = String(target ?? '').trim();
  if (!safeTarget) return '';

  if (SEARCH_ROUTE_PREFIXES.some((prefix) => safeTarget.startsWith(prefix))) {
    try {
      const parsed = new URL(safeTarget, 'https://app.youmbia.local');
      const query = getSearchQueryString(Object.fromEntries(parsed.searchParams.entries()));
      return query ? `/search?${query}` : '/search';
    } catch {
      return '/search';
    }
  }

  return safeTarget.replace('/(tabs)', '');
}

export function reserveNotificationDispatch(notificationKey: string, cooldownMs: number): boolean {
  const key = notificationKey.trim();
  if (!key) return false;

  const now = Date.now();
  const cooldownMap = readCooldownMap();
  const previousTs = cooldownMap[key] ?? 0;
  if (previousTs > 0 && now - previousTs < cooldownMs) {
    return false;
  }

  cooldownMap[key] = now;
  writeCooldownMap(cooldownMap);
  return true;
}

function getSafeNotificationData(data: unknown): NotificationData {
  return data && typeof data === 'object' ? (data as NotificationData) : {};
}

export function initializeNotifications(): void {
  if (!isPushNotificationsAvailable()) return;
  if (notificationsInitialized || notificationsInitializing) return;
  notificationsInitializing = true;

  void loadNotificationsModule()
    .then((Notifications) => {
      if (!Notifications || notificationsInitialized) return;

      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      void ensureAndroidNotificationChannel(Notifications).catch((error) => {
        logPushRuntimeFailure('channel_setup', 'native_unavailable', error);
      });

      notificationsInitialized = true;
    })
    .finally(() => {
      notificationsInitializing = false;
  });
}

async function ensureAndroidNotificationChannel(
  Notifications: NotificationsModule
): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Notifications YOUMBIA',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

export function getStoredPushToken(): string | null {
  const token = readStorage(PUSH_TOKEN_STORAGE_KEY);
  return token?.trim() ? token.trim() : null;
}

export function hasAskedForPushPermission(): boolean {
  return readStorage(PUSH_PERMISSION_ASKED_KEY) === 'true';
}

export function markPushPromptDismissed(): void {
  writeStorage(PUSH_PROMPT_DISMISSED_KEY, String(Date.now()));
}

export function clearPushPromptDismissed(): void {
  removeStorage(PUSH_PROMPT_DISMISSED_KEY);
}

export function shouldShowPushPrompt(): boolean {
  if (!isPushNotificationsAvailable()) return false;
  const dismissedAt = Number.parseInt(readStorage(PUSH_PROMPT_DISMISSED_KEY) ?? '', 10);
  if (!Number.isFinite(dismissedAt)) return true;
  return Date.now() - dismissedAt >= PUSH_PROMPT_DISMISS_COOLDOWN_MS;
}

export type DetailedPushPermission =
  | 'granted'
  | 'denied'
  | 'blocked'
  | 'undetermined'
  | 'unavailable';

export type PushPermissionSnapshot = {
  status: DetailedPushPermission;
  canAskAgain: boolean;
  failure?: PushRegistrationFailure;
};

export type PushActivationCardState =
  | { kind: 'hidden' }
  | {
      kind: 'activate' | 'settings' | 'unavailable' | 'error';
      title: string;
      message: string;
      primaryAction: 'activate' | 'settings' | 'retry' | null;
    };

export function getPushActivationCardState(
  permission: PushPermissionSnapshot | null,
  failure: PushRegistrationFailure | null = null
): PushActivationCardState {
  if (!permission) return { kind: 'hidden' };

  if (permission.status === 'blocked' || (!permission.canAskAgain && permission.status === 'denied')) {
    return {
      kind: 'settings',
      title: 'Notifications désactivées',
      message: 'Autorisez les notifications dans les réglages de votre téléphone.',
      primaryAction: 'settings',
    };
  }

  const technicalFailure = failure ?? permission.failure ?? null;
  const hasTechnicalFailure =
    technicalFailure !== null &&
    technicalFailure.errorCode !== 'permission_denied' &&
    technicalFailure.errorCode !== 'permission_blocked';
  if (permission.status === 'unavailable' || hasTechnicalFailure) {
    const unavailable =
      permission.status === 'unavailable' ||
      technicalFailure?.errorCode === 'native_unavailable' ||
      technicalFailure?.errorCode === 'project_id_missing';
    return {
      kind: unavailable ? 'unavailable' : 'error',
      title: unavailable ? 'Notifications indisponibles' : 'Activation impossible',
      message: unavailable
        ? 'Le service de notifications est indisponible sur cet appareil pour le moment.'
        : "Impossible d'enregistrer les notifications. Réessayez.",
      primaryAction: technicalFailure?.retryable ? 'retry' : null,
    };
  }

  if (
    permission.status === 'undetermined' ||
    (permission.status === 'denied' && permission.canAskAgain)
  ) {
    return {
      kind: 'activate',
      title: 'Activez les notifications',
      message: 'Activez les notifications pour ne manquer aucun message important.',
      primaryAction: 'activate',
    };
  }

  if (permission.status === 'granted') return { kind: 'hidden' };
  return { kind: 'hidden' };
}

export async function getPushPermissionSnapshot(): Promise<PushPermissionSnapshot> {
  if (!isPushNotificationsAvailable()) {
    return {
      status: 'unavailable',
      canAskAgain: false,
      failure: createPushFailure(
        'native_unavailable',
        'Les notifications ne sont pas disponibles dans cet environnement.',
        false,
        isExpoGoRuntime() ? 'expo_go' : 'unsupported_platform'
      ),
    };
  }

  try {
    const Notifications = await loadNotificationsModule();
    if (!Notifications) {
      return {
        status: 'unavailable',
        canAskAgain: false,
        failure: createPushFailure(
          'native_unavailable',
          'Le module natif de notifications est indisponible.',
          false,
          getErrorCode(notificationsModuleError) ?? 'module_unavailable'
        ),
      };
    }
    const settings = await Notifications.getPermissionsAsync();
    if (settings.status === 'granted') return { status: 'granted', canAskAgain: false };
    if (settings.status === 'undetermined') {
      return { status: 'undetermined', canAskAgain: settings.canAskAgain !== false };
    }
    return settings.canAskAgain === false
      ? { status: 'blocked', canAskAgain: false }
      : { status: 'denied', canAskAgain: true };
  } catch (error) {
    logPushRuntimeFailure('permission_check', 'native_unavailable', error);
    return {
      status: 'unavailable',
      canAskAgain: false,
      failure: createPushFailure(
        'native_unavailable',
        'Impossible de vérifier les notifications sur cet appareil.',
        true,
        getErrorCode(error) ?? 'permission_check_failed'
      ),
    };
  }
}

/**
 * Statut détaillé, nécessaire pour l'UI d'activation :
 * - 'granted'      : permission accordée
 * - 'denied'       : refusée mais encore redemandable dans l'app
 * - 'blocked'      : refusée et non redemandable dans l'app
 * - 'undetermined' : jamais demandée (proposer le bouton d'activation)
 * - 'unavailable'  : environnement ou module natif indisponible
 */
export async function getDetailedPushPermissionStatus(): Promise<DetailedPushPermission> {
  return (await getPushPermissionSnapshot()).status;
}

export async function getPushPermissionStatus(): Promise<'granted' | 'denied'> {
  return (await getPushPermissionSnapshot()).status === 'granted' ? 'granted' : 'denied';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return String(error ?? 'unknown_error');
}

function getErrorField(error: unknown, field: string): string | null {
  if (!error || typeof error !== 'object') return null;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getErrorCode(error: unknown): string | null {
  return getErrorField(error, 'code');
}

function redactPushSecrets(value: string): string {
  return value
    .replace(/(?:Exponent|Expo)PushToken\[[^\]]+\]/g, '[redacted-expo-push-token]')
    .replace(/[A-Za-z0-9_-]{80,}/g, '[redacted-long-token-value]');
}

function logPushRuntimeFailure(
  stage: string,
  errorCode: PushRegistrationErrorCode,
  error: unknown
): void {
  console.error('[notifications] push_registration_runtime_failure', {
    stage,
    errorCode,
    nativeCode: getErrorCode(error),
    name: getErrorField(error, 'name'),
    message: redactPushSecrets(getErrorMessage(error)),
    details: redactPushSecrets(getErrorField(error, 'details') ?? ''),
    hint: redactPushSecrets(getErrorField(error, 'hint') ?? ''),
  });
}

function createPushFailure(
  errorCode: PushRegistrationErrorCode,
  message: string,
  retryable: boolean,
  debugCode?: string | null
): PushRegistrationFailure {
  return {
    errorCode,
    retryable,
    message,
    ...(debugCode ? { debugCode } : {}),
  };
}

function classifyTokenRegistrationError(error: unknown): PushRegistrationErrorCode {
  const code = getErrorCode(error);
  const message = getErrorMessage(error);
  if (code === 'ERR_UNAVAILABLE') return 'native_unavailable';
  if (
    Platform.OS === 'android' &&
    (code === 'E_REGISTRATION_FAILED' || /firebase|\bfcm\b|messaging/i.test(message))
  ) {
    return 'fcm_registration_failed';
  }
  return 'expo_token_failed';
}

export async function openPushNotificationSettings(): Promise<boolean> {
  try {
    await Linking.openSettings();
    return true;
  } catch (error) {
    logPushRuntimeFailure('open_settings', 'unknown', error);
    return false;
  }
}

/** Persiste le token pour l'utilisateur de la session Supabase réelle. */
export async function persistPushTokenToServer(
  token: string,
  previousToken: string | null = getStoredPushToken()
): Promise<PushTokenPersistenceResult> {
  const safeToken = token.trim();
  if (!safeToken) {
    return { ok: false, errorCode: 'token_missing', message: 'Token push manquant' };
  }

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError) {
      return { ok: false, errorCode: 'session_lookup_failed', message: sessionError.message };
    }
    const user = session?.user;
    if (!user) {
      return { ok: false, errorCode: 'user_missing', message: 'Utilisateur non connecté' };
    }

    const { error } = await supabase.rpc('claim_my_push_token', {
      p_expo_push_token: safeToken,
      p_platform: Platform.OS,
      p_previous_expo_push_token: previousToken?.trim() || null,
    });

    if (error) {
      logPushRuntimeFailure('supabase_rpc', 'supabase_persist_failed', error);
      return {
        ok: false,
        errorCode: error.code || 'token_claim_failed',
        message: error.message,
      };
    }

    return { ok: true, userId: user.id };
  } catch (error) {
    const message = getErrorMessage(error);
    logPushRuntimeFailure('supabase_persist', 'supabase_persist_failed', error);
    return { ok: false, errorCode: 'token_persistence_exception', message };
  }
}

export async function unregisterCurrentPushToken(): Promise<
  { ok: true } | { ok: false; errorCode: string; message: string }
> {
  const token = getStoredPushToken();
  if (!token) return { ok: true };

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError) {
      return { ok: false, errorCode: 'session_lookup_failed', message: sessionError.message };
    }
    if (!session?.user) {
      removeStorage(PUSH_TOKEN_STORAGE_KEY);
      return { ok: true };
    }

    const { error } = await supabase
      .from('user_push_tokens')
      .delete()
      .eq('user_id', session.user.id)
      .eq('expo_push_token', token);
    if (error) {
      logPushRuntimeFailure('supabase_unregister', 'supabase_persist_failed', error);
      return { ok: false, errorCode: 'token_unregister_failed', message: error.message };
    }

    removeStorage(PUSH_TOKEN_STORAGE_KEY);
    return { ok: true };
  } catch (error) {
    const message = getErrorMessage(error);
    logPushRuntimeFailure('supabase_unregister', 'supabase_persist_failed', error);
    return { ok: false, errorCode: 'token_unregister_exception', message };
  }
}

/**
 * Sync silencieux au démarrage/login : si la permission notifications est DÉJÀ
 * accordée, récupère le token Expo et le réclame atomiquement côté serveur. Ne demande
 * jamais la permission et n'affiche aucun prompt. Les erreurs sont retournées,
 * journalisées et instrumentées sans bloquer l'app.
 */
export async function syncPushTokenIfGranted(): Promise<PushTokenSyncResult> {
  const source = 'sync' as const;
  try {
    if (!isPushNotificationsAvailable()) {
      return { ok: true, status: 'skipped', reason: 'unavailable' };
    }

    // Ne pas redemander : on n'agit que si la permission est déjà 'granted'.
    const permission = await getPushPermissionSnapshot();
    trackPushPermissionChecked(permission.status);
    if (permission.status !== 'granted') {
      return { ok: true, status: 'skipped', reason: `permission_${permission.status}` };
    }

    trackPushTokenRegistrationStarted(source);

    initializeNotifications();
    const Notifications = await loadNotificationsModule();
    if (!Notifications) {
      const failure = createPushFailure(
        'native_unavailable',
        'Le module natif de notifications est indisponible.',
        false,
        getErrorCode(notificationsModuleError) ?? 'module_unavailable'
      );
      trackPushTokenRegistrationFailed(source, failure.errorCode);
      return { ok: false, status: 'error', ...failure };
    }

    try {
      await ensureAndroidNotificationChannel(Notifications);
    } catch (error) {
      const failure = createPushFailure(
        'native_unavailable',
        'Impossible de configurer les notifications sur cet appareil.',
        true,
        getErrorCode(error) ?? 'channel_setup_failed'
      );
      logPushRuntimeFailure('channel_setup', failure.errorCode, error);
      trackPushTokenRegistrationFailed(source, failure.errorCode);
      return { ok: false, status: 'error', ...failure };
    }

    const projectId = getProjectId();
    if (!projectId) {
      const failure = createPushFailure(
        'project_id_missing',
        'Le projet de notifications est incomplet.',
        false
      );
      trackPushTokenRegistrationFailed(source, failure.errorCode);
      return { ok: false, status: 'error', ...failure };
    }

    const previousToken = getStoredPushToken();
    let token: string;
    try {
      const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
      token = String(tokenResponse.data ?? '').trim();
      if (!token) throw new Error('empty_expo_push_token');
    } catch (error) {
      const errorCode = classifyTokenRegistrationError(error);
      const failure = createPushFailure(
        errorCode,
        "Impossible d'obtenir le jeton de notifications.",
        errorCode !== 'native_unavailable',
        getErrorCode(error) ?? 'get_expo_push_token_failed'
      );
      logPushRuntimeFailure('expo_token', failure.errorCode, error);
      trackPushTokenRegistrationFailed(source, failure.errorCode);
      return { ok: false, status: 'error', ...failure };
    }

    const persisted = await persistPushTokenToServer(token, previousToken);
    if (!persisted.ok) {
      const failure = createPushFailure(
        'supabase_persist_failed',
        "Impossible d'enregistrer les notifications. Réessayez.",
        true,
        persisted.errorCode
      );
      trackPushTokenRegistrationFailed(source, failure.errorCode);
      return {
        ok: false,
        status: 'error',
        ...failure,
      };
    }

    writeStorage(PUSH_TOKEN_STORAGE_KEY, token);
    clearPushPromptDismissed();
    trackPushTokenRegistrationSucceeded(source);
    return { ok: true, status: 'registered', token };
  } catch (error) {
    const failure = createPushFailure(
      'unknown',
      "Impossible d'enregistrer les notifications. Réessayez.",
      true,
      getErrorCode(error) ?? 'token_sync_failed'
    );
    logPushRuntimeFailure('sync', failure.errorCode, error);
    trackPushTokenRegistrationFailed(source, failure.errorCode);
    return { ok: false, status: 'error', ...failure };
  }
}

export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  const source = 'manual' as const;
  try {
    if (!isPushNotificationsAvailable()) {
      const failure = createPushFailure(
        'native_unavailable',
        'Les notifications ne sont pas disponibles dans cet environnement.',
        false,
        isExpoGoRuntime() ? 'expo_go' : 'unsupported_platform'
      );
      trackPushTokenRegistrationFailed(source, failure.errorCode);
      return {
        ok: false,
        status: 'unavailable',
        ...failure,
      };
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      const failure = createPushFailure(
        'unknown',
        'Connectez-vous pour activer les notifications.',
        false,
        sessionError?.code ?? 'user_missing'
      );
      if (sessionError) logPushRuntimeFailure('session_lookup', failure.errorCode, sessionError);
      trackPushTokenRegistrationFailed(source, failure.errorCode);
      return {
        ok: false,
        status: 'unauthenticated',
        ...failure,
      };
    }

    initializeNotifications();
    const Notifications = await loadNotificationsModule();
    if (!Notifications) {
      const failure = createPushFailure(
        'native_unavailable',
        'Le module natif de notifications est indisponible.',
        false,
        getErrorCode(notificationsModuleError) ?? 'module_unavailable'
      );
      trackPushTokenRegistrationFailed(source, failure.errorCode);
      return { ok: false, status: 'unavailable', ...failure };
    }

    // Android 13+ n'affiche la permission qu'après la création d'un canal.
    // Sur Android < 13, cette opération reste compatible et idempotente.
    try {
      await ensureAndroidNotificationChannel(Notifications);
    } catch (error) {
      const failure = createPushFailure(
        'native_unavailable',
        'Impossible de configurer les notifications sur cet appareil.',
        true,
        getErrorCode(error) ?? 'channel_setup_failed'
      );
      logPushRuntimeFailure('channel_setup', failure.errorCode, error);
      trackPushTokenRegistrationFailed(source, failure.errorCode);
      return { ok: false, status: 'unavailable', ...failure };
    }

    let permission = await getPushPermissionSnapshot();
    trackPushPermissionChecked(permission.status);
    if (permission.status === 'unavailable') {
      const failure =
        permission.failure ??
        createPushFailure(
          'native_unavailable',
          'Impossible de vérifier les notifications sur cet appareil.',
          true,
          'permission_check_failed'
        );
      trackPushTokenRegistrationFailed(source, failure.errorCode);
      return { ok: false, status: 'unavailable', ...failure };
    }
    if (permission.status !== 'granted' && permission.canAskAgain) {
      writeStorage(PUSH_PERMISSION_ASKED_KEY, 'true');
      let requested;
      try {
        requested = await Notifications.requestPermissionsAsync();
      } catch (error) {
        const failure = createPushFailure(
          'native_unavailable',
          'Impossible de demander la permission de notifications.',
          true,
          getErrorCode(error) ?? 'permission_request_failed'
        );
        logPushRuntimeFailure('permission_request', failure.errorCode, error);
        trackPushTokenRegistrationFailed(source, failure.errorCode);
        return { ok: false, status: 'unavailable', ...failure };
      }
      permission = requested.status === 'granted'
        ? { status: 'granted', canAskAgain: false }
        : requested.canAskAgain === false
          ? { status: 'blocked', canAskAgain: false }
          : { status: 'denied', canAskAgain: true };
    }

    if (permission.status !== 'granted') {
      const deniedStatus = permission.status === 'blocked' ? 'blocked' : 'denied';
      trackPushPermissionDenied(deniedStatus);
      const failure = createPushFailure(
        deniedStatus === 'blocked' ? 'permission_blocked' : 'permission_denied',
        deniedStatus === 'blocked'
          ? 'Autorisez les notifications dans les réglages de votre téléphone.'
          : "Les notifications n'ont pas été autorisées.",
        deniedStatus !== 'blocked'
      );
      return {
        ok: false,
        status: deniedStatus,
        ...failure,
      };
    }
    trackPushPermissionGranted();
    trackPushTokenRegistrationStarted(source);

    const projectId = getProjectId();
    if (!projectId) {
      const failure = createPushFailure(
        'project_id_missing',
        'Le projet de notifications est incomplet.',
        false
      );
      trackPushTokenRegistrationFailed(source, failure.errorCode);
      return {
        ok: false,
        status: 'error',
        ...failure,
      };
    }

    const previousToken = getStoredPushToken();
    let token: string;
    try {
      const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
      token = String(tokenResponse.data ?? '').trim();
      if (!token) throw new Error('empty_expo_push_token');
    } catch (error) {
      const errorCode = classifyTokenRegistrationError(error);
      const failure = createPushFailure(
        errorCode,
        "Impossible d'obtenir le jeton de notifications. Réessayez.",
        errorCode !== 'native_unavailable',
        getErrorCode(error) ?? 'get_expo_push_token_failed'
      );
      logPushRuntimeFailure('expo_token', failure.errorCode, error);
      trackPushTokenRegistrationFailed(source, failure.errorCode);
      return {
        ok: false,
        status: 'error',
        ...failure,
      };
    }

    const persisted = await persistPushTokenToServer(token, previousToken);
    if (!persisted.ok) {
      const failure = createPushFailure(
        'supabase_persist_failed',
        "Impossible d'enregistrer les notifications. Réessayez.",
        true,
        persisted.errorCode
      );
      trackPushTokenRegistrationFailed(source, failure.errorCode);
      return {
        ok: false,
        status: 'error',
        ...failure,
      };
    }

    writeStorage(PUSH_TOKEN_STORAGE_KEY, token);
    clearPushPromptDismissed();
    trackPushTokenRegistrationSucceeded(source);
    return { ok: true, status: 'granted', token };
  } catch (error) {
    const failure = createPushFailure(
      'unknown',
      "Impossible d'activer les notifications. Réessayez.",
      true,
      getErrorCode(error) ?? 'registration_failed'
    );
    logPushRuntimeFailure('registration', failure.errorCode, error);
    trackPushTokenRegistrationFailed(source, failure.errorCode);
    return {
      ok: false,
      status: 'error',
      ...failure,
    };
  }
}

export async function getLastNotificationResponseAsyncSafe(): Promise<NotificationResponseLike | null> {
  if (!isPushNotificationsAvailable()) return null;
  try {
    const Notifications = await loadNotificationsModule();
    if (!Notifications) return null;
    return (await Notifications.getLastNotificationResponseAsync()) as NotificationResponseLike | null;
  } catch {
    return null;
  }
}

export async function clearLastNotificationResponseAsyncSafe(): Promise<void> {
  if (!isPushNotificationsAvailable()) return;
  try {
    const Notifications = await loadNotificationsModule();
    if (!Notifications) return;
    await Notifications.clearLastNotificationResponseAsync();
  } catch {
    // Clearing is best-effort; the in-memory coordinator still prevents replay.
  }
}

export async function addNotificationResponseReceivedListenerSafe(
  listener: (response: NotificationResponseLike) => void
) : Promise<{ remove: () => void } | null> {
  if (!isPushNotificationsAvailable()) return null;
  try {
    const Notifications = await loadNotificationsModule();
    if (!Notifications) return null;
    return Notifications.addNotificationResponseReceivedListener((response) => {
      listener(response as NotificationResponseLike);
    });
  } catch {
    return null;
  }
}

export async function addNotificationReceivedListenerSafe(): Promise<{
  remove: () => void;
} | null> {
  if (!isPushNotificationsAvailable()) return null;
  try {
    const Notifications = await loadNotificationsModule();
    if (!Notifications) return null;
    return Notifications.addNotificationReceivedListener((notification) => {
      const data = getSafeNotificationData(notification.request.content.data);
      const type = typeof data.type === 'string' ? data.type.trim() : null;
      trackPushNotificationReceived(type || null);
    });
  } catch (error) {
    console.error('[notifications] received_listener_setup_failed', error);
    return null;
  }
}

export type NotificationOpenMeta = {
  target: string | null;
  type: string | null;
  listingId: string | null;
  savedSearchId: string | null;
};

export function getNotificationOpenMeta(
  response: NotificationResponseLike | null | undefined
): NotificationOpenMeta {
  const data = getSafeNotificationData(response?.notification?.request?.content?.data);
  const type = typeof data.type === 'string' ? data.type.trim() : null;
  const listingId = typeof data.listingId === 'string' ? data.listingId.trim() : '';
  const savedSearchId = typeof data.savedSearchId === 'string' ? data.savedSearchId.trim() : '';
  return {
    target: getNotificationNavigationTarget(response),
    type: type || null,
    listingId: listingId || null,
    savedSearchId: savedSearchId || null,
  };
}

export function getNotificationNavigationTarget(
  response: NotificationResponseLike | null | undefined
): string | null {
  const data = getSafeNotificationData(response?.notification?.request?.content?.data);

  const href = typeof data.href === 'string' ? data.href.trim() : '';
  if (href.startsWith('/(tabs)/search')) return href;
  if (href.startsWith('/search')) return href;
  if (href.startsWith('/conversation/')) return href;
  if (href.startsWith('/listing/')) return href;

  const conversationId = typeof data.conversationId === 'string' ? data.conversationId.trim() : '';
  if (conversationId) return `/conversation/${conversationId}`;

  const listingId = typeof data.listingId === 'string' ? data.listingId.trim() : '';
  if (listingId) return `/listing/${listingId}`;

  const url = typeof data.url === 'string' ? data.url.trim() : '';
  return getListingHrefFromUrl(url);
}
