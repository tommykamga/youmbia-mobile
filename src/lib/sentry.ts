/**
 * Crash reporting (Sentry) for Expo iOS / Android.
 * Disabled when EXPO_PUBLIC_SENTRY_DSN is absent — the app must keep running.
 */

import type { ComponentType } from 'react';
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

export type SentryAppEnvironment = 'development' | 'preview' | 'production';

const SENSITIVE_KEY_PATTERN =
  /pass(word)?|secret|authorization|api[_-]?key|anon[_-]?key|refresh[_-]?token|access[_-]?token|sb-access|sb-refresh|supabase/i;

const SENSITIVE_VALUE_PATTERN =
  /(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)|Bearer\s+\S+/i;

let crashReportingEnabled = false;

export function getSentryDsn(): string {
  return (process.env.EXPO_PUBLIC_SENTRY_DSN ?? '').trim();
}

export function resolveSentryEnvironment(): SentryAppEnvironment {
  const raw = (process.env.EXPO_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'development' || raw === 'preview' || raw === 'production') {
    return raw;
  }
  return typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'production';
}

export function getSentryRelease(): string | undefined {
  const version = Constants.expoConfig?.version?.trim();
  if (!version) return undefined;
  return `youmbia-mobile@${version}`;
}

export function getSentryDist(): string | undefined {
  const androidVersionCode = Constants.expoConfig?.android?.versionCode;
  if (androidVersionCode != null) return String(androidVersionCode);
  const iosBuildNumber = Constants.expoConfig?.ios?.buildNumber?.trim();
  if (iosBuildNumber) return iosBuildNumber;
  const nativeBuild = Constants.nativeBuildVersion?.trim();
  if (nativeBuild) return nativeBuild;
  return undefined;
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function scrubDeep(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[Truncated]';
  if (typeof value === 'string') {
    if (SENSITIVE_VALUE_PATTERN.test(value)) return '[Filtered]';
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubDeep(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? '[Filtered]' : scrubDeep(nested, depth + 1);
    }
    return out;
  }
  return value;
}

type SentryBreadcrumbLike = {
  category?: string;
  type?: string;
  message?: string;
  data?: Record<string, unknown>;
};

export function scrubSentryBreadcrumb(
  breadcrumb: SentryBreadcrumbLike
): SentryBreadcrumbLike | null {
  if (breadcrumb.category === 'console') return null;

  const category = breadcrumb.category ?? '';
  const isHttp =
    breadcrumb.type === 'http' ||
    category === 'http' ||
    category === 'xhr' ||
    category === 'fetch';

  if (isHttp) {
    const data = { ...(breadcrumb.data ?? {}) };
    const url = String(data.url ?? '');
    if (/\/auth\/v1|\/token|supabase\.co\/auth/i.test(url)) {
      data.url = '[Filtered auth url]';
    }
    delete data.body;
    delete data.request_body;
    delete data.response_body;
    return {
      ...breadcrumb,
      data: scrubDeep(data) as Record<string, unknown>,
    };
  }

  return {
    ...breadcrumb,
    message: breadcrumb.message,
    data: breadcrumb.data
      ? (scrubDeep(breadcrumb.data) as Record<string, unknown>)
      : undefined,
  };
}

export function scrubSentryEvent<T extends Record<string, unknown>>(event: T): T {
  const scrubbed = scrubDeep(event) as T;
  const user = scrubbed.user;
  if (user && typeof user === 'object') {
    const id = (user as { id?: unknown }).id;
    (scrubbed as Record<string, unknown>).user =
      typeof id === 'string' && id.trim() ? { id: id.trim() } : undefined;
  }
  return scrubbed;
}

export function initCrashReporting(): void {
  const dsn = getSentryDsn();
  if (!dsn) {
    crashReportingEnabled = false;
    return;
  }

  try {
    Sentry.init({
      dsn,
      enabled: true,
      environment: resolveSentryEnvironment(),
      release: getSentryRelease(),
      dist: getSentryDist(),
      sendDefaultPii: false,
      enableAutoSessionTracking: true,
      enableAutoPerformanceTracing: false,
      tracesSampleRate: 0,
      enableNativeNagger: false,
      enableCaptureFailedRequests: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      beforeSend(event) {
        return scrubSentryEvent(event as unknown as Record<string, unknown>) as unknown as typeof event;
      },
      beforeBreadcrumb(breadcrumb) {
        return scrubSentryBreadcrumb(breadcrumb) as typeof breadcrumb | null;
      },
    });
    crashReportingEnabled = true;
  } catch (error) {
    crashReportingEnabled = false;
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[sentry] init skipped', error);
    }
  }
}

export function isCrashReportingEnabled(): boolean {
  return crashReportingEnabled;
}

export function wrapRootLayout(Component: ComponentType): ComponentType {
  if (!crashReportingEnabled) return Component;
  try {
    return Sentry.wrap(Component as ComponentType<Record<string, unknown>>);
  } catch {
    return Component;
  }
}

export function setCrashReportingUser(userId: string | null): void {
  if (!crashReportingEnabled) return;
  try {
    const trimmed = userId?.trim() ?? '';
    if (!trimmed) {
      Sentry.setUser(null);
      return;
    }
    Sentry.setUser({ id: trimmed });
  } catch {
    // Crash reporting must never break auth.
  }
}

export function captureSentryTestException(): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  if (!crashReportingEnabled) {
    console.warn('[sentry] test error skipped: DSN missing or init failed');
    return;
  }
  Sentry.captureException(new Error('YOUMBIA sentry test error (development only)'));
}
