import type { Session } from '@supabase/supabase-js';
import { getSession, onAuthStateChange } from '@/services/auth/session';
import { syncPushTokenIfGranted } from '@/services/notifications';

type PushSessionSyncDependencies = {
  getSession: () => Promise<Session | null>;
  onAuthStateChange: (
    callback: (event: string, session: Session | null) => void
  ) => () => void;
  syncPushTokenIfGranted: () => Promise<unknown>;
};

const defaultDependencies: PushSessionSyncDependencies = {
  getSession,
  onAuthStateChange,
  syncPushTokenIfGranted,
};

const AUTH_EVENTS_REQUIRING_SYNC = new Set([
  'INITIAL_SESSION',
  'SIGNED_IN',
  'TOKEN_REFRESHED',
  'USER_UPDATED',
]);

export function startPushTokenSessionSync(
  dependencies: PushSessionSyncDependencies = defaultDependencies
): () => void {
  let active = true;

  void dependencies.getSession().then((session) => {
    if (active && session?.user) {
      void dependencies.syncPushTokenIfGranted();
    }
  }).catch((error) => {
    console.error('[notifications] initial_session_sync_failed', error);
  });

  const unsubscribe = dependencies.onAuthStateChange((event, session) => {
    if (!active || !session?.user || !AUTH_EVENTS_REQUIRING_SYNC.has(event)) return;
    void dependencies.syncPushTokenIfGranted();
  });

  return () => {
    active = false;
    unsubscribe();
  };
}
