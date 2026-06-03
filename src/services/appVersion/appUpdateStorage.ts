import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppVersionStatus } from './getAppVersionStatus';

const STORAGE_PREFIX = 'youmbia.appUpdate.v1.';
const DISMISS_KEY = STORAGE_PREFIX + 'dismiss';
const LAST_CHECK_KEY = STORAGE_PREFIX + 'lastCheck';
const SCHEMA_VERSION = 1 as const;

export const APP_UPDATE_DISMISS_MS = 24 * 60 * 60 * 1000;
export const APP_UPDATE_FOREGROUND_CHECK_MS = 6 * 60 * 60 * 1000;

export type AppUpdateDismissRecord = {
  v: typeof SCHEMA_VERSION;
  latestVersion: string;
  dismissedAt: number;
};

export type AppUpdateLastCheckRecord = {
  v: typeof SCHEMA_VERSION;
  checkedAt: number;
  status: AppVersionStatus;
};

export async function readAppUpdateDismiss(): Promise<AppUpdateDismissRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(DISMISS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppUpdateDismissRecord;
    if (parsed.v !== SCHEMA_VERSION || !parsed.latestVersion || !parsed.dismissedAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeAppUpdateDismiss(latestVersion: string): Promise<void> {
  const record: AppUpdateDismissRecord = {
    v: SCHEMA_VERSION,
    latestVersion: latestVersion.trim(),
    dismissedAt: Date.now(),
  };
  await AsyncStorage.setItem(DISMISS_KEY, JSON.stringify(record));
}

export async function readAppUpdateLastCheck(): Promise<AppUpdateLastCheckRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_CHECK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppUpdateLastCheckRecord;
    if (parsed.v !== SCHEMA_VERSION || !parsed.checkedAt || !parsed.status) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeAppUpdateLastCheck(status: AppVersionStatus): Promise<void> {
  const record: AppUpdateLastCheckRecord = {
    v: SCHEMA_VERSION,
    checkedAt: Date.now(),
    status,
  };
  await AsyncStorage.setItem(LAST_CHECK_KEY, JSON.stringify(record));
}

export function isOptionalUpdateDismissed(
  dismiss: AppUpdateDismissRecord | null,
  latestVersion: string | null
): boolean {
  if (!dismiss || !latestVersion?.trim()) return false;
  if (dismiss.latestVersion.trim() !== latestVersion.trim()) return false;
  return Date.now() - dismiss.dismissedAt < APP_UPDATE_DISMISS_MS;
}
