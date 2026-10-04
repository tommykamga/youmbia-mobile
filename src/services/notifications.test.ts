import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLastNotificationResponseAsyncSafe,
  getPushActivationCardState,
  getPushPermissionSnapshot,
  getStoredPushToken,
  markPushPromptDismissed,
  openPushNotificationSettings,
  persistPushTokenToServer,
  registerForPushNotifications,
  shouldShowPushPrompt,
  unregisterCurrentPushToken,
} from './notifications';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  addNotificationResponseReceivedListener: vi.fn(),
  addNotificationReceivedListener: vi.fn(),
  clearLastNotificationResponseAsync: vi.fn(),
  trackPushPermissionChecked: vi.fn(),
  trackPushPermissionGranted: vi.fn(),
  trackPushPermissionDenied: vi.fn(),
  trackPushTokenRegistrationStarted: vi.fn(),
  trackPushTokenRegistrationSucceeded: vi.fn(),
  trackPushTokenRegistrationFailed: vi.fn(),
  trackPushNotificationReceived: vi.fn(),
  openSettings: vi.fn(),
  platform: { OS: 'ios' },
  constants: {
    executionEnvironment: 'standalone',
    appOwnership: null,
    expoConfig: { extra: { eas: { projectId: 'test-project-id' as string | null } } },
    easConfig: null,
  },
}));

vi.mock('expo-sqlite/localStorage/install', () => ({}));

vi.mock('expo-constants', () => ({
  default: mocks.constants,
}));

vi.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  getPermissionsAsync: mocks.getPermissionsAsync,
  requestPermissionsAsync: mocks.requestPermissionsAsync,
  getExpoPushTokenAsync: mocks.getExpoPushTokenAsync,
  setNotificationHandler: mocks.setNotificationHandler,
  setNotificationChannelAsync: mocks.setNotificationChannelAsync,
  addNotificationResponseReceivedListener: mocks.addNotificationResponseReceivedListener,
  addNotificationReceivedListener: mocks.addNotificationReceivedListener,
  clearLastNotificationResponseAsync: mocks.clearLastNotificationResponseAsync,
}));

vi.mock('react-native', () => ({
  Linking: { openSettings: mocks.openSettings },
  Platform: mocks.platform,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    rpc: mocks.rpc,
    from: mocks.from,
  },
}));

vi.mock('@/lib/analytics', () => ({
  trackPushPermissionChecked: mocks.trackPushPermissionChecked,
  trackPushPermissionGranted: mocks.trackPushPermissionGranted,
  trackPushPermissionDenied: mocks.trackPushPermissionDenied,
  trackPushTokenRegistrationStarted: mocks.trackPushTokenRegistrationStarted,
  trackPushTokenRegistrationSucceeded: mocks.trackPushTokenRegistrationSucceeded,
  trackPushTokenRegistrationFailed: mocks.trackPushTokenRegistrationFailed,
  trackPushNotificationReceived: mocks.trackPushNotificationReceived,
}));

const USER_ID = '11111111-1111-1111-1111-111111111111';
const TOKEN_A = 'ExponentPushToken[token-a]';
const TOKEN_B = 'ExponentPushToken[token-b]';

function authenticatedSession() {
  return { user: { id: USER_ID } };
}

describe('push token registration', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    mocks.getSession.mockResolvedValue({ data: { session: authenticatedSession() }, error: null });
    mocks.getPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: false });
    mocks.requestPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: false });
    mocks.getExpoPushTokenAsync.mockResolvedValue({ data: TOKEN_A });
    mocks.setNotificationChannelAsync.mockResolvedValue(null);
    mocks.clearLastNotificationResponseAsync.mockResolvedValue(undefined);
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.openSettings.mockResolvedValue(undefined);
    mocks.platform.OS = 'ios';
    mocks.constants.expoConfig.extra.eas.projectId = 'test-project-id';
  });

  it('permission accordée et token enregistré: produit un état de carte masqué', async () => {
    const result = await registerForPushNotifications();

    expect(result.ok).toBe(true);
    expect(
      getPushActivationCardState({ status: 'granted', canAskAgain: false }, null)
    ).toEqual({ kind: 'hidden' });
  });

  it('permission refusée mais redemandable: conserve le CTA Activer', async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });

    const permission = await getPushPermissionSnapshot();

    expect(permission).toEqual({ status: 'denied', canAskAgain: true });
    expect(getPushActivationCardState(permission)).toMatchObject({
      kind: 'activate',
      primaryAction: 'activate',
    });
    expect(
      getPushActivationCardState(permission, {
        errorCode: 'permission_denied',
        retryable: true,
        message: "Les notifications n'ont pas été autorisées.",
      })
    ).toMatchObject({ kind: 'activate', primaryAction: 'activate' });
  });

  it('permission bloquée: expose uniquement le CTA Ouvrir les réglages', async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });

    const permission = await getPushPermissionSnapshot();
    const card = getPushActivationCardState(permission);

    expect(permission).toEqual({ status: 'blocked', canAskAgain: false });
    expect(card).toMatchObject({ kind: 'settings', primaryAction: 'settings' });
  });

  it('erreur native: ne retombe jamais sur un faux CTA Activer', () => {
    const card = getPushActivationCardState(
      { status: 'denied', canAskAgain: true },
      {
        errorCode: 'native_unavailable',
        retryable: true,
        message: 'native failure',
      }
    );

    expect(card).toMatchObject({ kind: 'unavailable', primaryAction: 'retry' });
  });

  it('ouvre les réglages système pour une permission bloquée', async () => {
    await expect(openPushNotificationSettings()).resolves.toBe(true);
    expect(mocks.openSettings).toHaveBeenCalledTimes(1);
  });

  it('efface la dernière réponse native après consommation cold start', async () => {
    await clearLastNotificationResponseAsyncSafe();

    expect(mocks.clearLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
  });

  it('permission refusée: ne récupère ni ne persiste de token', async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });

    const result = await registerForPushNotifications();

    expect(result).toMatchObject({ ok: false, status: 'blocked' });
    expect(mocks.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('permission accordée: récupère le token et attend sa persistance', async () => {
    const result = await registerForPushNotifications();

    expect(result).toEqual({ ok: true, status: 'granted', token: TOKEN_A });
    expect(mocks.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'test-project-id' });
    expect(mocks.rpc).toHaveBeenCalledWith('claim_my_push_token', {
      p_expo_push_token: TOKEN_A,
      p_platform: 'ios',
      p_previous_expo_push_token: null,
    });
    expect(getStoredPushToken()).toBe(TOKEN_A);
  });

  it('Android crée le canal HIGH avant de demander la permission', async () => {
    mocks.platform.OS = 'android';
    mocks.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });

    const result = await registerForPushNotifications();

    expect(result.ok).toBe(true);
    expect(mocks.setNotificationChannelAsync).toHaveBeenCalledWith('default', {
      name: 'Notifications YOUMBIA',
      importance: 4,
    });
    expect(mocks.setNotificationChannelAsync.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.requestPermissionsAsync.mock.invocationCallOrder[0]
    );
  });

  it('token absent: retourne une erreur contrôlée sans persistance', async () => {
    mocks.getExpoPushTokenAsync.mockResolvedValue({ data: '' });

    const result = await registerForPushNotifications();

    expect(result).toMatchObject({ ok: false, status: 'error', errorCode: 'expo_token_failed' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('projectId absent: expose une indisponibilité non retryable', async () => {
    mocks.constants.expoConfig.extra.eas.projectId = null;

    const result = await registerForPushNotifications();

    expect(result).toMatchObject({
      ok: false,
      status: 'error',
      errorCode: 'project_id_missing',
      retryable: false,
    });
    expect(mocks.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('échec FCM Android: retourne un diagnostic retryable dédié', async () => {
    mocks.platform.OS = 'android';
    mocks.getExpoPushTokenAsync.mockRejectedValue(
      Object.assign(new Error('Firebase registration failed'), { code: 'E_REGISTRATION_FAILED' })
    );

    const result = await registerForPushNotifications();

    expect(result).toMatchObject({
      ok: false,
      status: 'error',
      errorCode: 'fcm_registration_failed',
      retryable: true,
    });
    expect(mocks.trackPushTokenRegistrationFailed).toHaveBeenCalledWith(
      'manual',
      'fcm_registration_failed'
    );
  });

  it('utilisateur absent: ne demande pas la permission et ne persiste rien', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });

    const result = await registerForPushNotifications();

    expect(result).toMatchObject({ ok: false, status: 'unauthenticated' });
    expect(mocks.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('même token: l’appel RPC reste idempotent', async () => {
    await persistPushTokenToServer(TOKEN_A, TOKEN_A);
    await persistPushTokenToServer(TOKEN_A, TOKEN_A);

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      'claim_my_push_token',
      expect.objectContaining({
        p_expo_push_token: TOKEN_A,
        p_previous_expo_push_token: TOKEN_A,
      })
    );
  });

  it('changement de token: transmet l’ancien token pour remplacement atomique', async () => {
    const result = await persistPushTokenToServer(TOKEN_B, TOKEN_A);

    expect(result).toEqual({ ok: true, userId: USER_ID });
    expect(mocks.rpc).toHaveBeenCalledWith('claim_my_push_token', {
      p_expo_push_token: TOKEN_B,
      p_platform: 'ios',
      p_previous_expo_push_token: TOKEN_A,
    });
  });

  it('échec Supabase: retourne une erreur observable et ne stocke pas le token', async () => {
    mocks.rpc.mockResolvedValue({ error: { code: '08006', message: 'database unavailable' } });

    const result = await registerForPushNotifications();

    expect(result).toMatchObject({
      ok: false,
      status: 'error',
      errorCode: 'supabase_persist_failed',
      debugCode: '08006',
    });
    expect(getStoredPushToken()).toBeNull();
    expect(mocks.trackPushTokenRegistrationFailed).toHaveBeenCalledWith(
      'manual',
      'supabase_persist_failed'
    );
  });

  it('Plus tard masque la carte pendant 24 h puis la rend de nouveau éligible', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T08:00:00Z'));

    markPushPromptDismissed();
    expect(shouldShowPushPrompt()).toBe(false);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(shouldShowPushPrompt()).toBe(true);
    vi.useRealTimers();
  });

  it('un refus redemandable ne déclenche qu’une seule demande par action', async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });
    mocks.requestPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });

    const result = await registerForPushNotifications();

    expect(result).toMatchObject({ ok: false, errorCode: 'permission_denied' });
    expect(mocks.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mocks.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('ne journalise ni n’envoie jamais le token complet en cas d’échec', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getExpoPushTokenAsync.mockRejectedValue(
      Object.assign(new Error(`failed for ${TOKEN_A}`), { code: 'ERR_NOTIFICATIONS_SERVER_ERROR' })
    );

    await registerForPushNotifications();

    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(TOKEN_A);
    expect(JSON.stringify(mocks.trackPushTokenRegistrationFailed.mock.calls)).not.toContain(TOKEN_A);
    consoleError.mockRestore();
  });

  it('logout: supprime uniquement le token courant du compte avant de vider le stockage', async () => {
    const finalEq = vi.fn().mockResolvedValue({ error: null });
    const firstEq = vi.fn(() => ({ eq: finalEq }));
    mocks.from.mockReturnValue({ delete: () => ({ eq: firstEq }) });
    await registerForPushNotifications();

    const result = await unregisterCurrentPushToken();

    expect(result).toEqual({ ok: true });
    expect(mocks.from).toHaveBeenCalledWith('user_push_tokens');
    expect(firstEq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(finalEq).toHaveBeenCalledWith('expo_push_token', TOKEN_A);
    expect(getStoredPushToken()).toBeNull();
  });
});

describe('claim_my_push_token migration', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20261003230000_claim_my_push_token.sql'),
    'utf8'
  );

  it('reste liée à auth.uid et atomique sur le token global', () => {
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
    expect(sql).toMatch(/v_user_id uuid := auth\.uid\(\)/);
    expect(sql).toMatch(/ON CONFLICT \(expo_push_token\) DO UPDATE/);
    expect(sql).toMatch(/SET user_id = EXCLUDED\.user_id/);
    expect(sql).toMatch(/REVOKE ALL .* FROM PUBLIC/);
    expect(sql).toMatch(/GRANT EXECUTE .* TO authenticated/);
    expect(sql).not.toMatch(/TO anon/);
  });
});
