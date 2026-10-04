import 'expo-sqlite/localStorage/install';

import Constants from 'expo-constants';
import { Platform } from 'react-native';
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
type NotificationResponseLike = {
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

export type PushRegistrationResult =
  | { ok: true; status: 'granted'; token: string }
  | {
      ok: false;
      status: 'denied' | 'blocked' | 'unavailable' | 'unauthenticated' | 'error';
      message: string;
      errorCode?: string;
    };

export type PushTokenSyncResult =
  | { ok: true; status: 'registered'; token: string }
  | { ok: true; status: 'skipped'; reason: string }
  | { ok: false; status: 'error'; errorCode: string; message: string };

type PushTokenPersistenceResult =
  | { ok: true; userId: string }
  | { ok: false; errorCode: string; message: string };

let notificationsInitialized = false;
let notificationsInitializing = false;
let notificationsModulePromise: Promise<NotificationsModule | null> | null = null;

function isExpoGoRuntime(): boolean {
  return Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';
}

export function isPushNotificationsAvailable(): boolean {
  return !isExpoGoRuntime();
}

async function loadNotificationsModule(): Promise<NotificationsModule | null> {
  if (!isPushNotificationsAvailable()) return null;
  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications').catch((error) => {
      console.error('[notifications] module_load_failed', error);
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

function isRunningOnPhysicalDevice(): boolean {
  return Constants.isDevice === true;
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

      if (Platform.OS === 'android') {
        Notifications.setNotificationChannelAsync('default', {
          name: 'Notifications YOUMBIA',
          importance: Notifications.AndroidImportance.HIGH,
        }).catch((error) => {
          console.error('[notifications] channel_setup_failed', error);
        });
      }

      notificationsInitialized = true;
    })
    .finally(() => {
      notificationsInitializing = false;
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

type PushPermissionSnapshot = {
  status: DetailedPushPermission;
  canAskAgain: boolean;
};

async function getPushPermissionSnapshot(): Promise<PushPermissionSnapshot> {
  if (!isPushNotificationsAvailable()) {
    return { status: 'unavailable', canAskAgain: false };
  }

  try {
    const Notifications = await loadNotificationsModule();
    if (!Notifications) return { status: 'unavailable', canAskAgain: false };
    const settings = await Notifications.getPermissionsAsync();
    if (settings.status === 'granted') return { status: 'granted', canAskAgain: false };
    if (settings.status === 'undetermined') {
      return { status: 'undetermined', canAskAgain: settings.canAskAgain !== false };
    }
    return settings.canAskAgain === false
      ? { status: 'blocked', canAskAgain: false }
      : { status: 'denied', canAskAgain: true };
  } catch (error) {
    console.error('[notifications] permission_check_failed', error);
    return { status: 'unavailable', canAskAgain: false };
  }
}

/**
 * Statut détaillé, nécessaire pour l'UI d'activation :
 * - 'granted'      : permission accordée
 * - 'denied'       : refusée (proposer l'ouverture des réglages système)
 * - 'blocked'      : refusée et non redemandable dans l'app
 * - 'undetermined' : jamais demandée (proposer le bouton d'activation)
 * - 'unavailable'  : Expo Go / non disponible (ne rien afficher)
 */
export async function getDetailedPushPermissionStatus(): Promise<DetailedPushPermission> {
  return (await getPushPermissionSnapshot()).status;
}

export async function getPushPermissionStatus(): Promise<'granted' | 'denied'> {
  return (await getPushPermissionSnapshot()).status === 'granted' ? 'granted' : 'denied';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'unknown_error');
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
      console.error('[notifications] token_claim_failed', error.message);
      return { ok: false, errorCode: 'token_claim_failed', message: error.message };
    }

    return { ok: true, userId: user.id };
  } catch (error) {
    const message = getErrorMessage(error);
    console.error('[notifications] token_persistence_exception', message);
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
      console.error('[notifications] token_unregister_failed', error.message);
      return { ok: false, errorCode: 'token_unregister_failed', message: error.message };
    }

    removeStorage(PUSH_TOKEN_STORAGE_KEY);
    return { ok: true };
  } catch (error) {
    const message = getErrorMessage(error);
    console.error('[notifications] token_unregister_exception', message);
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
    if (!isRunningOnPhysicalDevice()) {
      return { ok: true, status: 'skipped', reason: 'not_physical_device' };
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
      trackPushTokenRegistrationFailed(source, 'module_unavailable');
      return { ok: false, status: 'error', errorCode: 'module_unavailable', message: 'Notifications indisponibles' };
    }

    const projectId = getProjectId();
    if (!projectId) {
      trackPushTokenRegistrationFailed(source, 'project_id_missing');
      return { ok: false, status: 'error', errorCode: 'project_id_missing', message: 'Projet Expo non configuré' };
    }

    const previousToken = getStoredPushToken();
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = String(tokenResponse.data ?? '').trim();
    if (!token) {
      trackPushTokenRegistrationFailed(source, 'token_missing');
      return { ok: false, status: 'error', errorCode: 'token_missing', message: 'Token push manquant' };
    }

    const persisted = await persistPushTokenToServer(token, previousToken);
    if (!persisted.ok) {
      trackPushTokenRegistrationFailed(source, persisted.errorCode);
      return {
        ok: false,
        status: 'error',
        errorCode: persisted.errorCode,
        message: persisted.message,
      };
    }

    writeStorage(PUSH_TOKEN_STORAGE_KEY, token);
    clearPushPromptDismissed();
    trackPushTokenRegistrationSucceeded(source);
    return { ok: true, status: 'registered', token };
  } catch (error) {
    const message = getErrorMessage(error);
    console.error('[notifications] token_sync_failed', message);
    trackPushTokenRegistrationFailed(source, 'token_sync_failed');
    return { ok: false, status: 'error', errorCode: 'token_sync_failed', message };
  }
}

export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  const source = 'manual' as const;
  try {
    if (!isPushNotificationsAvailable()) {
      return {
        ok: false,
        status: 'unavailable',
        message: 'Notifications push indisponibles dans Expo Go. Utilisez un build de développement.',
      };
    }

    if (!isRunningOnPhysicalDevice()) {
      return { ok: false, status: 'unavailable', message: 'Notifications indisponibles' };
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      trackPushTokenRegistrationFailed(source, 'user_missing');
      return {
        ok: false,
        status: 'unauthenticated',
        errorCode: 'user_missing',
        message: 'Connectez-vous pour activer les notifications',
      };
    }

    initializeNotifications();
    const Notifications = await loadNotificationsModule();
    if (!Notifications) {
      return { ok: false, status: 'error', message: "Impossible d'activer les notifications" };
    }

    let permission = await getPushPermissionSnapshot();
    trackPushPermissionChecked(permission.status);
    if (permission.status !== 'granted' && permission.canAskAgain) {
      writeStorage(PUSH_PERMISSION_ASKED_KEY, 'true');
      const requested = await Notifications.requestPermissionsAsync();
      permission = requested.status === 'granted'
        ? { status: 'granted', canAskAgain: false }
        : requested.canAskAgain === false
          ? { status: 'blocked', canAskAgain: false }
          : { status: 'denied', canAskAgain: true };
    }

    if (permission.status !== 'granted') {
      const deniedStatus = permission.status === 'blocked' ? 'blocked' : 'denied';
      trackPushPermissionDenied(deniedStatus);
      return {
        ok: false,
        status: deniedStatus,
        errorCode: `permission_${deniedStatus}`,
        message: deniedStatus === 'blocked'
          ? 'Autorisez les notifications dans les réglages du téléphone'
          : 'Notifications refusées',
      };
    }
    trackPushPermissionGranted();
    trackPushTokenRegistrationStarted(source);

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Notifications YOUMBIA',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const projectId = getProjectId();
    if (!projectId) {
      trackPushTokenRegistrationFailed(source, 'project_id_missing');
      return {
        ok: false,
        status: 'error',
        errorCode: 'project_id_missing',
        message: "Impossible d'activer les notifications",
      };
    }

    const previousToken = getStoredPushToken();
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = String(tokenResponse.data ?? '').trim();
    if (!token) {
      trackPushTokenRegistrationFailed(source, 'token_missing');
      return {
        ok: false,
        status: 'error',
        errorCode: 'token_missing',
        message: "Impossible d'activer les notifications",
      };
    }

    const persisted = await persistPushTokenToServer(token, previousToken);
    if (!persisted.ok) {
      trackPushTokenRegistrationFailed(source, persisted.errorCode);
      return {
        ok: false,
        status: 'error',
        errorCode: persisted.errorCode,
        message: "Impossible d'enregistrer les notifications. Réessayez.",
      };
    }

    writeStorage(PUSH_TOKEN_STORAGE_KEY, token);
    clearPushPromptDismissed();
    trackPushTokenRegistrationSucceeded(source);
    return { ok: true, status: 'granted', token };
  } catch (error) {
    const message = getErrorMessage(error);
    console.error('[notifications] registration_failed', message);
    trackPushTokenRegistrationFailed(source, 'registration_failed');
    return {
      ok: false,
      status: 'error',
      errorCode: 'registration_failed',
      message: "Impossible d'activer les notifications",
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
