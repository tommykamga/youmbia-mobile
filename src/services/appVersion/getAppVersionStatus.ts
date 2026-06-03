import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase, supabaseRuntime } from '@/lib/supabase';
import { compareVersions } from './compareVersions';

export type AppVersionPlatform = 'android' | 'ios';

export type AppVersionStatus = {
  currentVersion: string;
  latestVersion: string | null;
  minimumSupportedVersion: string | null;
  updateUrl: string | null;
  releaseNotes: string | null;
  isUpdateAvailable: boolean;
  isCriticalUpdate: boolean;
  platform: AppVersionPlatform | null;
};

const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

const ALLOWED_STORE_HOST_FRAGMENTS: Record<AppVersionPlatform, string[]> = {
  ios: ['apps.apple.com', 'itunes.apple.com'],
  android: ['play.google.com', 'market://', 'galaxystore.samsung.com', 'appgallery'],
};

function devLog(message: string, detail?: unknown) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    if (detail !== undefined) {
      console.warn(`[appVersion] ${message}`, detail);
    } else {
      console.warn(`[appVersion] ${message}`);
    }
  }
}

export function getInstalledAppVersion(): string {
  return (
    Constants.expoConfig?.version ??
    Constants.nativeAppVersion ??
    '0.0.0'
  ).trim();
}

export function getAppVersionPlatform(): AppVersionPlatform | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null;
}

function sanitizeUpdateUrl(
  platform: AppVersionPlatform,
  rawUrl: string | null | undefined
): string | null {
  const url = rawUrl?.trim();
  if (!url) return null;
  const lower = url.toLowerCase();
  const isAllowed = ALLOWED_STORE_HOST_FRAGMENTS[platform].some((fragment) =>
    lower.includes(fragment)
  );
  if (!isAllowed) {
    devLog(
      `store_url ignorée car incohérente avec la plateforme "${platform}": ${url}`
    );
    return null;
  }
  return url;
}

function idleStatus(platform: AppVersionPlatform | null): AppVersionStatus {
  const currentVersion = getInstalledAppVersion();
  return {
    currentVersion,
    latestVersion: null,
    minimumSupportedVersion: null,
    updateUrl: null,
    releaseNotes: null,
    isUpdateAvailable: false,
    isCriticalUpdate: false,
    platform,
  };
}

function buildStatus(
  platform: AppVersionPlatform,
  currentVersion: string,
  latestVersion: string,
  minimumSupportedVersion: string,
  updateUrl: string | null,
  releaseNotes: string | null
): AppVersionStatus {
  const isCriticalUpdate =
    compareVersions(currentVersion, minimumSupportedVersion) < 0;
  const isBehindLatest = compareVersions(currentVersion, latestVersion) < 0;
  const isUpdateAvailable = isCriticalUpdate || isBehindLatest;

  return {
    currentVersion,
    latestVersion,
    minimumSupportedVersion,
    updateUrl,
    releaseNotes,
    isUpdateAvailable,
    isCriticalUpdate,
    platform,
  };
}

async function fetchRemotePolicy(
  platform: AppVersionPlatform
): Promise<AppVersionStatus | null> {
  const { data, error } = await supabase
    .from('app_versions')
    .select('latest_version, min_supported_version, store_url, message')
    .eq('platform', platform)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    devLog('Échec lecture app_versions.', error);
    return null;
  }

  if (!data) {
    devLog(`Aucune politique active pour ${platform}.`);
    return null;
  }

  const latestVersion = data.latest_version.trim();
  const minimumSupportedVersion = data.min_supported_version.trim();

  if (!latestVersion || !minimumSupportedVersion) {
    devLog('Versions serveur invalides.');
    return null;
  }

  const currentVersion = getInstalledAppVersion();

  return buildStatus(
    platform,
    currentVersion,
    latestVersion,
    minimumSupportedVersion,
    sanitizeUpdateUrl(platform, data.store_url),
    data.message?.trim() || null
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | 'timeout'> {
  return Promise.race([
    promise,
    new Promise<'timeout'>((resolve) => {
      setTimeout(() => resolve('timeout'), timeoutMs);
    }),
  ]);
}

/**
 * Politique de version distante (Supabase `app_versions`).
 * Fail-open : web, Supabase indisponible, timeout ou ligne absente → pas de MAJ signalée.
 */
export async function getAppVersionStatus(options?: {
  timeoutMs?: number;
}): Promise<AppVersionStatus> {
  const platform = getAppVersionPlatform();
  if (!platform) {
    return idleStatus(null);
  }

  if (!supabaseRuntime.isConfigured) {
    devLog('Supabase non configuré — contrôle de version ignoré.');
    return idleStatus(platform);
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

  try {
    const result = await withTimeout(fetchRemotePolicy(platform), timeoutMs);
    if (result === 'timeout') {
      devLog(`Timeout lecture app_versions (${timeoutMs}ms).`);
      return idleStatus(platform);
    }
    if (!result) {
      return idleStatus(platform);
    }
    return result;
  } catch (err) {
    devLog('Exception contrôle de version.', err);
    return idleStatus(platform);
  }
}
