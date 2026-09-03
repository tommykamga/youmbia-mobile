/**
 * Mixpanel client for Expo (iOS / Android / web).
 * JavaScript mode (`useNative: false`) — no native module / Expo Go compatible.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Mixpanel } from 'mixpanel-react-native';

export const MIXPANEL_PROJECT_TOKEN =
  (process.env.EXPO_PUBLIC_MIXPANEL_TOKEN ?? '').trim();

/** Mixpanel EU data residency — required so /track/ hits api-eu, not api.mixpanel.com. */
const MIXPANEL_EU_SERVER_URL = 'https://api-eu.mixpanel.com';

const SESSION_STARTED_AT_KEY = 'mixpanel_session_started_at';

export type AnalyticsPlatform = 'ios' | 'android' | 'web';

type MixpanelPrimitive = string | number | boolean;
export type AnalyticsProperties = Record<string, MixpanelPrimitive | null | undefined>;

let client: Mixpanel | null = null;
let initPromise: Promise<Mixpanel | null> | null = null;
let sessionStartedAt: number | null = null;

export function getAnalyticsPlatform(): AnalyticsPlatform {
  if (Platform.OS === 'ios' || Platform.OS === 'android') return Platform.OS;
  return 'web';
}

function compactProperties(
  properties: AnalyticsProperties | undefined
): Record<string, MixpanelPrimitive> {
  const out: Record<string, MixpanelPrimitive> = {};
  if (!properties) return out;
  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined || value === '') continue;
    out[key] = value;
  }
  return out;
}

async function readPersistedSessionStart(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_STARTED_AT_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

async function persistSessionStart(timestamp: number): Promise<void> {
  sessionStartedAt = timestamp;
  try {
    await AsyncStorage.setItem(SESSION_STARTED_AT_KEY, String(timestamp));
  } catch {
    // Persistence is best-effort.
  }
}

async function clearPersistedSessionStart(): Promise<void> {
  sessionStartedAt = null;
  try {
    await AsyncStorage.removeItem(SESSION_STARTED_AT_KEY);
  } catch {
    // Persistence is best-effort.
  }
}

export async function markAnalyticsSessionStart(): Promise<void> {
  if (sessionStartedAt != null) return;
  const persisted = await readPersistedSessionStart();
  if (persisted != null) {
    sessionStartedAt = persisted;
    return;
  }
  await persistSessionStart(Date.now());
}

export async function consumeAnalyticsSessionDurationSeconds(): Promise<number> {
  const started = sessionStartedAt ?? (await readPersistedSessionStart());
  await clearPersistedSessionStart();
  if (started == null) return 0;
  return Math.max(0, Math.round((Date.now() - started) / 1000));
}

export async function initMixpanel(): Promise<Mixpanel | null> {
  if (client) return client;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (!MIXPANEL_PROJECT_TOKEN) {
        if (__DEV__) {
          console.warn(
            '[mixpanel] EXPO_PUBLIC_MIXPANEL_TOKEN is missing. Mixpanel will not initialize.'
          );
        }
        return null;
      }

      const mixpanel = new Mixpanel(MIXPANEL_PROJECT_TOKEN, false, false, AsyncStorage);
      // JS mode starts the flush queue in the constructor (default US URL).
      // Set EU residency immediately, then pass the same URL to init.
      mixpanel.setServerURL(MIXPANEL_EU_SERVER_URL);
      await mixpanel.init(
        false,
        {
          platform: getAnalyticsPlatform(),
          app_version: Constants.expoConfig?.version ?? 'unknown',
        },
        MIXPANEL_EU_SERVER_URL
      );
      if (__DEV__) {
        mixpanel.setLoggingEnabled(true);
      }
      mixpanel.registerSuperProperties({
        platform: getAnalyticsPlatform(),
        app_version: Constants.expoConfig?.version ?? 'unknown',
      });
      client = mixpanel;
      return mixpanel;
    } catch (error) {
      if (__DEV__) {
        console.warn('[mixpanel] init failed', error);
      }
      return null;
    }
  })();

  return initPromise;
}

async function getClient(): Promise<Mixpanel | null> {
  if (client) return client;
  return initMixpanel();
}

export function trackEvent(eventName: string, properties?: AnalyticsProperties): void {
  const payload = compactProperties({
    platform: getAnalyticsPlatform(),
    ...properties,
  });
  void getClient().then((mixpanel) => {
    mixpanel?.track(eventName, payload);
  });
}

export async function identifyAnalyticsUser(
  userId: string,
  profile?: { email?: string | null; name?: string | null }
): Promise<void> {
  const mixpanel = await getClient();
  if (!mixpanel || !userId.trim()) return;
  await mixpanel.identify(userId.trim());
  const people: Record<string, MixpanelPrimitive> = {};
  const email = profile?.email?.trim();
  const name = profile?.name?.trim();
  if (email) people.$email = email;
  if (name) people.$name = name;
  if (Object.keys(people).length > 0) {
    mixpanel.getPeople().set(people);
  }
  await markAnalyticsSessionStart();
}

export async function resetAnalytics(): Promise<void> {
  const mixpanel = await getClient();
  mixpanel?.reset();
  await clearPersistedSessionStart();
}
