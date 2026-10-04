import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getStoredPushToken,
  persistPushTokenToServer,
  registerForPushNotifications,
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
  trackPushPermissionChecked: vi.fn(),
  trackPushPermissionGranted: vi.fn(),
  trackPushPermissionDenied: vi.fn(),
  trackPushTokenRegistrationStarted: vi.fn(),
  trackPushTokenRegistrationSucceeded: vi.fn(),
  trackPushTokenRegistrationFailed: vi.fn(),
  trackPushNotificationReceived: vi.fn(),
}));

vi.mock('expo-sqlite/localStorage/install', () => ({}));

vi.mock('expo-constants', () => ({
  default: {
    executionEnvironment: 'standalone',
    appOwnership: null,
    isDevice: true,
    expoConfig: { extra: { eas: { projectId: 'test-project-id' } } },
    easConfig: null,
  },
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
    mocks.rpc.mockResolvedValue({ error: null });
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

  it('token absent: retourne une erreur contrôlée sans persistance', async () => {
    mocks.getExpoPushTokenAsync.mockResolvedValue({ data: '' });

    const result = await registerForPushNotifications();

    expect(result).toMatchObject({ ok: false, status: 'error', errorCode: 'token_missing' });
    expect(mocks.rpc).not.toHaveBeenCalled();
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
    mocks.rpc.mockResolvedValue({ error: { message: 'database unavailable' } });

    const result = await registerForPushNotifications();

    expect(result).toMatchObject({ ok: false, status: 'error', errorCode: 'token_claim_failed' });
    expect(getStoredPushToken()).toBeNull();
    expect(mocks.trackPushTokenRegistrationFailed).toHaveBeenCalledWith(
      'manual',
      'token_claim_failed'
    );
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
