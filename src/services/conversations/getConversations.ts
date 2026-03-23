/**
 * Fetch conversations for the current user (inbox).
 * Uses Supabase: conversations + listings for title; messages for last message and unread count.
 *
 * En cas d’erreur serveur (RLS, table, etc.), repli : liste vide + error null pour éviter
 * l’écran d’erreur générique (comportement proche « aucune conversation », même EmptyState qu’un vrai vide).
 * Logs de diagnostic uniquement en __DEV__.
 *
 * À vérifier côté Supabase si erreurs persistantes : table `conversations` ; RLS SELECT pour
 * lignes où auth.uid() est buyer_id ou seller_id ; accès `listings`, `profiles`, `messages`.
 */

import { supabase } from '@/lib/supabase';
import type { Conversation } from './types';

export type GetConversationsResult =
  | { data: Conversation[]; error: null }
  | { data: null; error: { message: string } };

function logDev(phase: string, payload: Record<string, unknown>) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console -- diagnostic inbox uniquement en dev
    console.log(`[getConversations] ${phase}`, payload);
  }
}

function logSupabaseErrorDev(context: string, err: unknown) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console -- erreur brute PostgREST / Supabase
    console.warn(`[getConversations] Supabase error (${context})`, err);
  }
}

/** Liste vide sans erreur : l’UI affiche l’état vide existant (pas d’écran erreur serveur). */
function fallbackEmptyList(reason: string): GetConversationsResult {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.warn('[getConversations] fallback → liste vide:', reason);
  }
  return { data: [], error: null };
}

export async function getConversations(): Promise<GetConversationsResult> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      logDev('auth', { ok: false, userError: userError?.message ?? null });
      return { data: null, error: { message: 'Non connecté' } };
    }

    const userId = user.id;
    logDev('request', {
      table: 'conversations',
      userId,
      select: 'id, listing_id, buyer_id, seller_id, created_at',
      filter: `buyer_id.eq.${userId} OR seller_id.eq.${userId}`,
    });

    const { data: rows, error } = await supabase
      .from('conversations')
      .select('id, listing_id, buyer_id, seller_id, created_at')
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) {
      logSupabaseErrorDev('conversations.select', error);
      return fallbackEmptyList(`conversations: ${error.message}`);
    }

    const list = (rows ?? []) as {
      id: string;
      listing_id: string;
      buyer_id: string;
      seller_id: string;
      created_at: string;
    }[];

    if (list.length === 0) return { data: [], error: null };

    const listingIds = [...new Set(list.map((c) => c.listing_id))];
    const { data: listings, error: listingsError } = await supabase
      .from('listings')
      .select('id, title, user_id')
      .in('id', listingIds);
    if (listingsError) {
      logSupabaseErrorDev('listings.select', listingsError);
      return fallbackEmptyList(`listings: ${listingsError.message}`);
    }
    const listingMap = new Map(
      (listings ?? []).map((l: { id: string; title: string; user_id: string | null }) => [l.id, l])
    );

    const otherIds = list.map((c) => (c.buyer_id === userId ? c.seller_id : c.buyer_id));
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', otherIds);
    if (profilesError) {
      logSupabaseErrorDev('profiles.select', profilesError);
      return fallbackEmptyList(`profiles: ${profilesError.message}`);
    }
    const profileMap = new Map(
      (profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? 'Utilisateur'])
    );

    const convIds = list.map((c) => c.id);
    const { data: lastMessages, error: lastMessagesError } = await supabase
      .from('messages')
      .select('conversation_id, body, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false });
    if (lastMessagesError) {
      logSupabaseErrorDev('messages.last', lastMessagesError);
      return fallbackEmptyList(`messages(last): ${lastMessagesError.message}`);
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
      logSupabaseErrorDev('messages.unread', unreadError);
      return fallbackEmptyList(`messages(unread): ${unreadError.message}`);
    }

    const unreadByConv = new Map<string, number>();
    for (const r of unreadRows ?? []) {
      const cid = (r as { conversation_id: string }).conversation_id;
      unreadByConv.set(cid, (unreadByConv.get(cid) ?? 0) + 1);
    }

    const data: Conversation[] = list.map((c) => {
      const listing = listingMap.get(c.listing_id);
      const otherId = c.buyer_id === userId ? c.seller_id : c.buyer_id;
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
        other_party_name: profileMap.get(otherId),
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
      // eslint-disable-next-line no-console
      console.warn('[getConversations] exception', e);
    }
    return fallbackEmptyList(`exception: ${msg}`);
  }
}
