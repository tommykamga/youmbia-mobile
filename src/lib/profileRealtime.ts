/**
 * Bus léger + canal Realtime pour synchroniser l'avatar du profil connecté
 * sur tous les appareils / onglets sans déconnexion.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getAvatarVersion } from '@/services/profile/profile';

export type ProfileRealtimeEvent = {
  type: 'avatar_updated';
  avatarUrl: string | null;
  avatarVersion: string;
};

type ProfileListener = (event: ProfileRealtimeEvent) => void;

const listeners = new Set<ProfileListener>();

let activeChannel: RealtimeChannel | null = null;
let activeUserId: string | null = null;

export function subscribeProfileEvents(listener: ProfileListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitProfileEvent(event: ProfileRealtimeEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // Ne jamais casser le canal Realtime à cause d'un listener UI.
    }
  });
}

/** Émis localement après upload/suppression réussie (même appareil, autres onglets). */
export function emitLocalAvatarUpdated(avatarUrl: string | null, avatarVersion: string): void {
  emitProfileEvent({ type: 'avatar_updated', avatarUrl, avatarVersion });
}

function parseProfileAvatarRow(row: unknown): { avatar_url: string | null } | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const avatar_url =
    r.avatar_url === null || r.avatar_url === undefined
      ? null
      : typeof r.avatar_url === 'string'
        ? r.avatar_url
        : null;
  return { avatar_url };
}

export function startProfileRealtime(userId: string): void {
  if (!userId) return;
  if (activeChannel && activeUserId === userId) return;

  stopProfileRealtime();
  activeUserId = userId;

  const channel = supabase
    .channel(`profiles:avatar:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`,
      },
      (payload) => {
        const prev = parseProfileAvatarRow(payload.old);
        const next = parseProfileAvatarRow(payload.new);
        if (!next) return;
        const prevUrl = String(prev?.avatar_url ?? '').trim();
        const nextUrl = String(next.avatar_url ?? '').trim();
        if (prevUrl === nextUrl) return;

        const version = getAvatarVersion(payload.new as { avatar_url?: string | null });
        emitProfileEvent({
          type: 'avatar_updated',
          avatarUrl: nextUrl || null,
          avatarVersion: version,
        });
      }
    )
    .subscribe((status) => {
      if (__DEV__ && status === 'CHANNEL_ERROR') {
        console.warn(
          '[profileRealtime] channel error — vérifier publication supabase_realtime sur profiles'
        );
      }
    });

  activeChannel = channel;
}

export function stopProfileRealtime(): void {
  if (activeChannel) {
    void supabase.removeChannel(activeChannel);
    activeChannel = null;
  }
  activeUserId = null;
}

export function isProfileRealtimeActive(): boolean {
  return activeChannel !== null;
}
