import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase, supabaseRuntime } from '@/lib/supabase';
import { compareVersions } from './compareVersions';

export type AppVersionPlatform = 'android' | 'ios';

export type AppVersionCheckStatus = 'ok' | 'optional_update' | 'force_update';

export type AppVersionPolicy = {
  status: AppVersionCheckStatus;
  currentVersion: string;
  latestVersion: string;
  minSupportedVersion: string;
  storeUrl: string | null;
  message: string | null;
};

export type AppVersionCheckResult =
  | { kind: 'skip' }
  | { kind: 'policy'; policy: AppVersionPolicy };

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

function resolveStatus(
  currentVersion: string,
  minSupportedVersion: string,
  latestVersion: string
): AppVersionCheckStatus {
  if (compareVersions(currentVersion, minSupportedVersion) < 0) {
    return 'force_update';
  }
  if (compareVersions(currentVersion, latestVersion) < 0) {
    return 'optional_update';
  }
  return 'ok';
}

/**
 * Vérifie la politique de version Supabase pour la plateforme mobile courante.
 * Fail-open : web, Supabase indisponible ou ligne absente → pas de blocage.
 */
export async function checkAppVersion(): Promise<AppVersionCheckResult> {
  const platform = getAppVersionPlatform();
  if (!platform) {
    return { kind: 'skip' };
  }

  const currentVersion = getInstalledAppVersion();

  if (!supabaseRuntime.isConfigured) {
    devLog('Supabase non configuré — contrôle de version ignoré.');
    return { kind: 'skip' };
  }

  try {
    const { data, error } = await supabase
      .from('app_versions')
      .select('latest_version, min_supported_version, store_url, message')
      .eq('platform', platform)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      devLog('Échec lecture app_versions — accès non bloqué.', error);
      return { kind: 'skip' };
    }

    if (!data) {
      devLog(`Aucune politique active pour ${platform} — accès non bloqué.`);
      return { kind: 'skip' };
    }

    const latestVersion = data.latest_version.trim();
    const minSupportedVersion = data.min_supported_version.trim();

    if (!latestVersion || !minSupportedVersion) {
      devLog('Versions serveur invalides — accès non bloqué.');
      return { kind: 'skip' };
    }

    const status = resolveStatus(currentVersion, minSupportedVersion, latestVersion);

    if (status === 'ok') {
      return { kind: 'skip' };
    }

    return {
      kind: 'policy',
      policy: {
        status,
        currentVersion,
        latestVersion,
        minSupportedVersion,
        storeUrl: data.store_url?.trim() || null,
        message: data.message?.trim() || null,
      },
    };
  } catch (err) {
    devLog('Exception contrôle de version — accès non bloqué.', err);
    return { kind: 'skip' };
  }
}
