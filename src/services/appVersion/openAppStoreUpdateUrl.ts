import { Linking, Platform } from 'react-native';
import type { AppVersionPlatform } from './getAppVersionStatus';

function devLog(message: string, detail?: unknown) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    if (detail !== undefined) {
      console.warn(`[appVersion] ${message}`, detail);
    } else {
      console.warn(`[appVersion] ${message}`);
    }
  }
}

function toHttpsWebFallback(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('market://')) {
    const idMatch = trimmed.match(/[?&]id=([^&]+)/);
    if (idMatch?.[1]) {
      return `https://play.google.com/store/apps/details?id=${encodeURIComponent(idMatch[1])}`;
    }
    return null;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return null;
}

async function tryOpenUrl(url: string): Promise<boolean> {
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ouvre l’URL boutique distante (iOS App Store / Android Play Store).
 * Fail-safe : essaie l’URL native puis un fallback web si disponible.
 */
export async function openAppStoreUpdateUrl(
  updateUrl: string | null | undefined,
  _platform?: AppVersionPlatform | null
): Promise<void> {
  const primary = updateUrl?.trim();
  if (!primary) {
    devLog('update_url absent — ouverture boutique ignorée.');
    return;
  }

  if (await tryOpenUrl(primary)) return;

  const webFallback = toHttpsWebFallback(primary);
  if (webFallback && webFallback !== primary) {
    if (await tryOpenUrl(webFallback)) return;
  }

  if (Platform.OS === 'web') {
    devLog('Ouverture boutique non supportée sur web.');
    return;
  }

  devLog('Impossible d’ouvrir l’URL boutique.', primary);
}
