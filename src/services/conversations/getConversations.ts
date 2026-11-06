/**
 * Fetch conversations for the current user (inbox).
 * Uses Supabase: conversations + listings for title; messages for last message and unread count.
 *
 * Toute erreur requête renvoie `{ data: null, error }` pour que l’UI distingue vide réel et défaillance.
 * Logs de diagnostic uniquement en __DEV__.
 *
 * À vérifier côté Supabase si erreurs persistantes : table `conversations` ; RLS SELECT pour
 * lignes où auth.uid() est buyer_id ou seller_id ; accès `listings`, `profiles`, `messages`.
 */

import { supabase } from '@/lib/supabase';
import { getUserDisplayName, getAvatarVersion } from '@/services/profile';
import { resolveAvatarDisplayUrls } from '@/lib/avatarImageUrl';
import { conversationsVisibleForUserOrFilter } from '@/lib/conversationVisibility';
import { fetchConversationIdsWithAtLeastOneMessage } from '@/services/conversations/getConversationsMessagePresence';
import type { Conversation } from './types';

export type GetConversationsResult =
  | { data: Conversation[]; error: null }
  | { data: null; error: { message: string } };

function logDev(phase: string, payload: Record<string, unknown>) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
     
    console.log(`[getConversations] ${phase}`, payload);
  }
}

function logSupabaseErrorDev(context: string, err: unknown) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
     
    console.warn(`[getConversations] Supabase error (${context})`, err);
  }
}

function failureFromSupabase(context: string, err: unknown): GetConversationsResult {
  logSupabaseErrorDev(context, err);
  const detail =
    err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
      ? (err as { message: string }).message
      : String(err);
  return { data: null, error: { message: `${context}: ${detail}` } };
}

function classifyAuthErrorMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('jwt') || m.includes('auth') || m.includes('session')) {
    return 'Session expirée ou invalide';
  }
  return raw;
}

export async function getConversations(): Promise<GetConversationsResult> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      logDev('auth', { ok: false, userError: userError?.message ?? null });
      const msg = userError?.message
        ? classifyAuthErrorMessage(userError.message)
        : 'Non connecté';
      return { data: null, error: { message: msg } };
    }

    const userId = user.id;
    logDev('request', {
      table: 'conversations',
      userId,
      select: 'id, listing_id, buyer_id, seller_id, created_at, buyer_deleted_at, seller_deleted_at',
      filter: conversationsVisibleForUserOrFilter(userId),
    });

    const { data: rows, error } = await supabase
      .from('conversations')
      .select('id, listing_id, buyer_id, seller_id, created_at, buyer_deleted_at, seller_deleted_at')
      .or(conversationsVisibleForUserOrFilter(userId))
      .order('created_at', { ascending: false });

    if (error) {
      return failureFromSupabase('conversations', error);
    }

    const list = (rows ?? []) as {
      id: string;
      listing_id: string;
      buyer_id: string;
      seller_id: string;
      created_at: string;
    }[];

    if (list.length === 0) return { data: [], error: null };

    const convIdsAll = list.map((c) => c.id);
    const presence = await fetchConversationIdsWithAtLeastOneMessage(convIdsAll);
    if (!presence.ok) {
      return failureFromSupabase('messages.presence', presence.errorMessage);
    }

    const listWithMessages = list.filter((c) => presence.conversationIds.has(c.id));

    if (listWithMessages.length === 0) return { data: [], error: null };

    const listingIds = [...new Set(listWithMessages.map((c) => c.listing_id))];
    const { data: listings, error: listingsError } = await supabase
      .from('listings')
      .select('id, title, user_id')
      .in('id', listingIds);
    if (listingsError) {
      return failureFromSupabase('listings', listingsError);
    }
    const listingMap = new Map(
      (listings ?? []).map((l: { id: string; title: string; user_id: string | null }) => [l.id, l])
    );

    const otherIds = listWithMessages.map((c) => (c.buyer_id === userId ? c.seller_id : c.buyer_id));
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', otherIds);
    if (profilesError) {
      return failureFromSupabase('profiles', profilesError);
    }
    type ProfileRow = { id: string; full_name: string | null; avatar_url: string | null };
    const profileRows = (profiles ?? []) as ProfileRow[];
    const profileMap = new Map(
      profileRows.map((p) => [
        p.id,
        {
          name: getUserDisplayName({ full_name: p.full_name }, 'Utilisateur'),
          avatarUrl: String(p.avatar_url ?? '').trim() || null,
          avatarVersion: getAvatarVersion(p),
        },
      ])
    );

    const avatarEntries = profileRows
      .filter((p) => String(p.avatar_url ?? '').trim())
      .map((p) => ({
        path: String(p.avatar_url ?? '').trim(),
        version: getAvatarVersion(p),
      }));
    const avatarDisplayMap = await resolveAvatarDisplayUrls(avatarEntries);

    const convIds = listWithMessages.map((c) => c.id);
    const { data: lastMessages, error: lastMessagesError } = await supabase
      .from('messages')
      .select('conversation_id, body, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false });
    if (lastMessagesError) {
      return failureFromSupabase('messages.last', lastMessagesError);
    }

    const lastByConv = new Map<string, { body: string; created_at: string }>();
    for (const m of lastMessages ?? []) {
      const key = (m as { conversation_id: string }).conversation_id;
      if (!lastByConv.has(key)) {
        lastByConv.set(key, {
          body: (m as { body: string }).body,
          created_at: (m as { created_at: string }).created_at,
        });
      }
    }

    const { data: unreadRows, error: unreadError } = await supabase
      .from('messages')
      .select('conversation_id')
      .in('conversation_id', convIds)
      .neq('sender_id', userId)
      .is('read_at', null);
    if (unreadError) {
      return failureFromSupabase('messages.unread', unreadError);
    }

    const unreadByConv = new Map<string, number>();
    for (const r of unreadRows ?? []) {
      const cid = (r as { conversation_id: string }).conversation_id;
      unreadByConv.set(cid, (unreadByConv.get(cid) ?? 0) + 1);
    }

    const data: Conversation[] = listWithMessages.map((c) => {
      const listing = listingMap.get(c.listing_id);
      const otherId = c.buyer_id === userId ? c.seller_id : c.buyer_id;
      const peer = profileMap.get(otherId);
      const avatarPath = peer?.avatarUrl ?? null;
      const last = lastByConv.get(c.id);
      const preview =
        last?.body != null
          ? last.body.length > 60
            ? last.body.slice(0, 60) + '…'
            : last.body
          : null;
      return {
        id: c.id,
        listing_id: c.listing_id,
        buyer_id: c.buyer_id,
        seller_id: c.seller_id,
        created_at: c.created_at,
        updated_at: c.created_at, // Fallback to created_at
        listing_title: listing?.title,
        other_party_id: otherId,
        other_party_name: peer?.name,
        other_party_avatar_url: avatarPath,
        other_party_avatar_version: peer?.avatarVersion,
        other_party_avatar_display_url: avatarPath
          ? avatarDisplayMap.get(avatarPath) ?? null
          : null,
        last_message_at: last?.created_at ?? null,
        last_message_preview: preview ?? null,
        unread_count: unreadByConv.get(c.id) ?? 0,
      };
    });

    logDev('success', { count: data.length });
    return { data, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
       
      console.warn('[getConversations] exception', e);
    }
    return { data: null, error: { message: `exception: ${msg}` } };
  }
}
