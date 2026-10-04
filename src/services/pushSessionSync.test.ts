import { describe, expect, it, vi } from 'vitest';
import { startPushTokenSessionSync } from './pushSessionSync';

vi.mock('@/services/auth/session', () => ({
  getSession: vi.fn().mockResolvedValue(null),
  onAuthStateChange: vi.fn(() => vi.fn()),
}));

vi.mock('@/services/notifications', () => ({
  syncPushTokenIfGranted: vi.fn().mockResolvedValue(undefined),
}));

function session(userId: string) {
  return { user: { id: userId } } as never;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('push token session lifecycle', () => {
  it('synchronise une session restaurée au démarrage', async () => {
    const sync = vi.fn().mockResolvedValue(undefined);
    const stop = startPushTokenSessionSync({
      getSession: vi.fn().mockResolvedValue(session('user-a')),
      onAuthStateChange: vi.fn(() => vi.fn()),
      syncPushTokenIfGranted: sync,
    });

    await flushPromises();
    expect(sync).toHaveBeenCalledTimes(1);
    stop();
  });

  it('gère login, logout et re-login sans synchroniser le logout', async () => {
    const sync = vi.fn().mockResolvedValue(undefined);
    const holder: { callback?: (event: string, value: never) => void } = {};
    const unsubscribe = vi.fn();
    const stop = startPushTokenSessionSync({
      getSession: vi.fn().mockResolvedValue(null),
      onAuthStateChange: vi.fn((callback) => {
        holder.callback = callback as typeof holder.callback;
        return unsubscribe;
      }),
      syncPushTokenIfGranted: sync,
    });
    await flushPromises();

    holder.callback?.('SIGNED_IN', session('user-a'));
    holder.callback?.('SIGNED_OUT', null as never);
    holder.callback?.('SIGNED_IN', session('user-b'));
    await flushPromises();

    expect(sync).toHaveBeenCalledTimes(2);
    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('resynchronise au refresh de session', async () => {
    const sync = vi.fn().mockResolvedValue(undefined);
    const holder: { callback?: (event: string, value: never) => void } = {};
    const stop = startPushTokenSessionSync({
      getSession: vi.fn().mockResolvedValue(null),
      onAuthStateChange: vi.fn((callback) => {
        holder.callback = callback as typeof holder.callback;
        return vi.fn();
      }),
      syncPushTokenIfGranted: sync,
    });
    await flushPromises();

    holder.callback?.('TOKEN_REFRESHED', session('user-a'));
    await flushPromises();

    expect(sync).toHaveBeenCalledTimes(1);
    stop();
  });
});
