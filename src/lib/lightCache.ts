/**
 * Cache local léger (AsyncStorage) : stale-while-revalidate.
 * - Lecture : afficher le payload si présent (validation schéma / userId côté appelant).
 * - Écriture : après succès réseau (ou mutation confirmée).
 * Les TTL ci-dessous documentent l’âge « attendu » avant refresh ; aucune expiration
 * automatique côté lecture dans cette passe (toujours afficher puis rafraîchir).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'youmbia.lc.v1.';
const SCHEMA_VERSION = 1 as const;

export type LightCacheEnvelope<T> = {
  v: typeof SCHEMA_VERSION;
  savedAt: number;
  payload: T;
};

/** TTL indicatifs (ms) — utilisés pour documentation / futur invalidation ; pas de blocage lecture. */
export const LIGHT_CACHE_TTL_MS = {
  favorites: 5 * 60 * 1000,
  accountProfile: 15 * 60 * 1000,
  conversations: 3 * 60 * 1000,
  homeFeedPublic: 5 * 60 * 1000,
} as const;

export const lightCacheKeys = {
  favorites: 'favorites',
  profile: (userId: string) => `profile.${userId}`,
  conversations: (userId: string) => `inbox.${userId}`,
  /** Feed public premier écran — pas lié à un utilisateur. */
  homeFeedPublic: 'homeFeed.public',
} as const;

export async function lightCacheRead<T>(key: string): Promise<{ payload: T; savedAt: number; ageMs: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LightCacheEnvelope<T>;
    if (parsed.v !== SCHEMA_VERSION || parsed.payload === undefined) return null;
    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
    return { payload: parsed.payload, savedAt, ageMs: Date.now() - savedAt };
  } catch {
    return null;
  }
}

export async function lightCacheWrite<T>(key: string, payload: T): Promise<void> {
  const env: LightCacheEnvelope<T> = {
    v: SCHEMA_VERSION,
    savedAt: Date.now(),
    payload,
  };
  await AsyncStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(env));
}

export async function lightCacheRemove(key: string): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_PREFIX + key);
}
