import type { Conversation } from '@/services/conversations/types';

/** Bump quand le format cache inbox devient incompatible ou nécessite revalidation serveur stricte. */
export const INBOX_LIGHT_CACHE_SCHEMA = 2;

export type InboxCachePayload = {
  userId: string;
  conversations: Conversation[];
  /** Absent = cache antérieur à ce schéma (non fiable pour masquer des fantômes sans preuve serveur). */
  inboxSchema?: number;
};

export function isInboxLightCacheTrusted(payload: InboxCachePayload | null | undefined): boolean {
  return payload?.inboxSchema === INBOX_LIGHT_CACHE_SCHEMA;
}
