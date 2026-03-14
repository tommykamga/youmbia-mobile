import 'expo-sqlite/localStorage/install';

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getListingHrefFromUrl } from '@/lib/listingDeepLink';

const PUSH_TOKEN_STORAGE_KEY = 'youmbia.pushToken.v1';
const PUSH_PERMISSION_ASKED_KEY = 'youmbia.pushPermissionAsked.v1';
const PUSH_PROMPT_DISMISSED_KEY = 'youmbia.pushPromptDismissed.v1';
const NOTIFICATION_COOLDOWN_STORAGE_KEY = 'youmbia.notificationCooldowns.v1';
const SEARCH_ROUTE_PREFIXES = ['/(tabs)/search', '/search'] as const;

type NotificationData = Record<string, unknown>;
type NotificationCooldownMap = Record<string, number>;

export type PushRegistrationResult =
  | { ok: true; status: 'granted'; token: string }
  | { ok: false; status: 'denied' | 'unavailable' | 'error'; message: string };

let notificationsInitialized = false;

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
  const keys = ['q', 'priceMin', 'priceMax', 'category', 'city'] as const;
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
  if (notificationsInitialized) return;

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
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => {});
  }

  notificationsInitialized = true;
}

export function getStoredPushToken(): string | null {
  const token = readStorage(PUSH_TOKEN_STORAGE_KEY);
  return token?.trim() ? token.trim() : null;
}

export function hasAskedForPushPermission(): boolean {
  return readStorage(PUSH_PERMISSION_ASKED_KEY) === 'true';
}

export function markPushPromptDismissed(): void {
  writeStorage(PUSH_PROMPT_DISMISSED_KEY, 'true');
}

export function clearPushPromptDismissed(): void {
  removeStorage(PUSH_PROMPT_DISMISSED_KEY);
}

export function shouldShowPushPrompt(): boolean {
  if (getStoredPushToken()) return false;
  return readStorage(PUSH_PROMPT_DISMISSED_KEY) !== 'true';
}

export async function getPushPermissionStatus(): Promise<'granted' | 'denied'> {
  try {
    const settings = await Notifications.getPermissionsAsync();
    return settings.status === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  try {
    if (!isRunningOnPhysicalDevice()) {
      return { ok: false, status: 'unavailable', message: 'Notifications indisponibles' };
    }

    initializeNotifications();

    let permissionStatus = await getPushPermissionStatus();
    if (permissionStatus !== 'granted') {
      writeStorage(PUSH_PERMISSION_ASKED_KEY, 'true');
      const requested = await Notifications.requestPermissionsAsync();
      permissionStatus = requested.status === 'granted' ? 'granted' : 'denied';
    }

    if (permissionStatus !== 'granted') {
      return { ok: false, status: 'denied', message: 'Notifications indisponibles' };
    }

    const projectId = getProjectId();
    if (!projectId) {
      return { ok: false, status: 'error', message: "Impossible d'activer les notifications" };
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = String(tokenResponse.data ?? '').trim();
    if (!token) {
      return { ok: false, status: 'error', message: "Impossible d'activer les notifications" };
    }

    writeStorage(PUSH_TOKEN_STORAGE_KEY, token);
    clearPushPromptDismissed();

    return { ok: true, status: 'granted', token };
  } catch {
    return { ok: false, status: 'error', message: "Impossible d'activer les notifications" };
  }
}

export function getNotificationNavigationTarget(
  response: Notifications.NotificationResponse | null | undefined
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
