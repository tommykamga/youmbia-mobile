import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentryMocks = vi.hoisted(() => ({
  init: vi.fn(),
  wrap: vi.fn((component: unknown) => component),
  setUser: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@sentry/react-native', () => ({
  init: sentryMocks.init,
  wrap: sentryMocks.wrap,
  setUser: sentryMocks.setUser,
  captureException: sentryMocks.captureException,
}));

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      version: '4.4.1',
      android: { versionCode: 34 },
      ios: { buildNumber: '12' },
    },
    nativeBuildVersion: '34',
  },
}));

async function loadSentry() {
  vi.resetModules();
  sentryMocks.init.mockClear();
  sentryMocks.wrap.mockClear();
  sentryMocks.setUser.mockClear();
  sentryMocks.captureException.mockClear();
  return import('./sentry');
}

describe('crash reporting helpers', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubGlobal('__DEV__', false);
  });

  it('ne s’initialise pas sans DSN et laisse l’app fonctionner', async () => {
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', '');
    const sentry = await loadSentry();
    const Root = () => null;

    sentry.initCrashReporting();

    expect(sentry.getSentryDsn()).toBe('');
    expect(sentry.isCrashReportingEnabled()).toBe(false);
    expect(sentryMocks.init).not.toHaveBeenCalled();
    expect(sentry.wrapRootLayout(Root)).toBe(Root);
    sentry.setCrashReportingUser('user-1');
    expect(sentryMocks.setUser).not.toHaveBeenCalled();
  });

  it('identifie development / preview / production et attache version + build', async () => {
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', 'https://examplePublic@o0.ingest.sentry.io/0');
    vi.stubEnv('EXPO_PUBLIC_APP_ENV', 'preview');
    const sentry = await loadSentry();

    sentry.initCrashReporting();

    expect(sentry.resolveSentryEnvironment()).toBe('preview');
    expect(sentry.getSentryRelease()).toBe('youmbia-mobile@4.4.1');
    expect(sentry.getSentryDist()).toBe('34');
    expect(sentryMocks.init).toHaveBeenCalledTimes(1);
    expect(sentryMocks.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://examplePublic@o0.ingest.sentry.io/0',
        enabled: true,
        environment: 'preview',
        release: 'youmbia-mobile@4.4.1',
        dist: '34',
        sendDefaultPii: false,
        tracesSampleRate: 0,
        enableNativeNagger: false,
        enableCaptureFailedRequests: false,
      })
    );
  });

  it('filtre tokens, mots de passe et ne conserve que l’id utilisateur', () => {
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', '');
    return loadSentry().then((sentry) => {
      const scrubbed = sentry.scrubSentryEvent({
        extra: {
          password: 'secret-pass',
          access_token: 'sb-access-token',
          listing_id: 'abc',
        },
        user: {
          id: 'user-1',
          email: 'a@b.c',
        },
        request: {
          headers: {
            Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb',
          },
        },
      });

      expect(scrubbed.extra).toEqual({
        password: '[Filtered]',
        access_token: '[Filtered]',
        listing_id: 'abc',
      });
      expect(scrubbed.user).toEqual({ id: 'user-1' });
      expect(scrubbed.request).toEqual({
        headers: { Authorization: '[Filtered]' },
      });
    });
  });

  it('supprime les breadcrumbs console et les corps HTTP auth', async () => {
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', '');
    const sentry = await loadSentry();

    expect(
      sentry.scrubSentryBreadcrumb({
        category: 'console',
        message: 'user typed hello',
      })
    ).toBeNull();

    const http = sentry.scrubSentryBreadcrumb({
      category: 'http',
      data: {
        url: 'https://example.supabase.co/auth/v1/token',
        body: 'refresh_token=abc',
        request_body: 'password=x',
      },
    });

    expect(http?.data?.url).toBe('[Filtered auth url]');
    expect(http?.data?.body).toBeUndefined();
    expect(http?.data?.request_body).toBeUndefined();
  });

  it('n’expose pas l’erreur de test hors développement', async () => {
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', 'https://examplePublic@o0.ingest.sentry.io/0');
    vi.stubGlobal('__DEV__', false);
    const sentry = await loadSentry();
    sentry.initCrashReporting();
    sentry.captureSentryTestException();
    expect(sentryMocks.captureException).not.toHaveBeenCalled();
  });

  it('envoie une erreur de test uniquement en développement si Sentry est actif', async () => {
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', 'https://examplePublic@o0.ingest.sentry.io/0');
    vi.stubGlobal('__DEV__', true);
    const sentry = await loadSentry();
    sentry.initCrashReporting();
    sentry.captureSentryTestException();
    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
  });

  it('n’envoie pas l’email à Sentry lors de l’identification', async () => {
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', 'https://examplePublic@o0.ingest.sentry.io/0');
    const sentry = await loadSentry();
    sentry.initCrashReporting();
    sentry.setCrashReportingUser('user-42');
    expect(sentryMocks.setUser).toHaveBeenCalledWith({ id: 'user-42' });
    sentry.setCrashReportingUser(null);
    expect(sentryMocks.setUser).toHaveBeenCalledWith(null);
  });
});
