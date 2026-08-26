/**
 * Point unique d'auto-réparation profil : un listener Auth, fire-and-forget.
 * Ne bloque pas le bootstrap. Ne crée pas de retry en boucle.
 */

import type { Session } from '@supabase/supabase-js';
import { onAuthStateChange } from '@/services/auth';
import { supabaseRuntime } from '@/lib/supabase';
import { ensureProfile } from './profile';

const PROVISION_EVENTS = new Set([
  'INITIAL_SESSION',
  'SIGNED_IN',
  'USER_UPDATED',
  'TOKEN_REFRESHED',
]);

let lastEnsuredUserId: string | null = null;
let subscriberCount = 0;
let unsubscribeAuth: (() => void) | null = null;

function logProvisioningAuthDev(phase: string, err: unknown): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[profileProvisioningAuth] ${phase}`, err);
  }
}

/** Reset état de gating — tests uniquement. */
export function resetProfileProvisioningAuthForTests(): void {
  lastEnsuredUserId = null;
  subscriberCount = 0;
  if (unsubscribeAuth) {
    unsubscribeAuth();
    unsubscribeAuth = null;
  }
}

function shouldProvision(event: string, userId: string): boolean {
  if (!PROVISION_EVENTS.has(event)) return false;
  if (event === 'USER_UPDATED') return true;
  if (lastEnsuredUserId === userId && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
    return false;
  }
  if (event === 'TOKEN_REFRESHED' && lastEnsuredUserId === userId) {
    return false;
  }
  return true;
}

/**
 * Auto-répare le profil pour une session Auth déjà validée.
 * N'envoie jamais d'erreur au caller (bootstrap non bloquant).
 */
export async function provisionProfileOnAuthEvent(
  event: string,
  session: Session | null
): Promise<void> {
  try {
    const userId = session?.user?.id ?? null;
    if (event === 'SIGNED_OUT' || !userId) {
      lastEnsuredUserId = null;
      return;
    }
    if (!shouldProvision(event, userId)) return;

    const result = await ensureProfile();
    if (event === 'USER_UPDATED') {
      const again = await ensureProfile();
      if (again.data?.id === userId) lastEnsuredUserId = userId;
      return;
    }
    if (result.data?.id === userId) {
      lastEnsuredUserId = userId;
    }
  } catch (err) {
    logProvisioningAuthDev(event, err);
  }
}

/**
 * Enregistre un seul listener Auth (refcount pour StrictMode).
 * INITIAL_SESSION / SIGNED_IN / USER_UPDATED / TOKEN_REFRESHED (retry si échec).
 */
export function startProfileProvisioningOnAuth(): () => void {
  if (!supabaseRuntime.isConfigured) {
    return () => {};
  }

  subscriberCount += 1;
  if (!unsubscribeAuth) {
    unsubscribeAuth = onAuthStateChange((event, session) => {
      void provisionProfileOnAuthEvent(event, session);
    });
  }

  return () => {
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0 && unsubscribeAuth) {
      unsubscribeAuth();
      unsubscribeAuth = null;
      lastEnsuredUserId = null;
    }
  };
}
