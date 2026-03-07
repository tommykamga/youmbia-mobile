/**
 * Fetch conversations for the current user (inbox).
 * Uses Supabase: conversations + listings for title; messages for last message and unread count.
 */

import { supabase } from '@/lib/supabase';
import type { Conversation } from './types';

export type GetConversationsResult =
  | { data: Conversation[]; error: null }
  | { data: null; error: { message: string } };

export async function getConversations(): Promise<GetConversationsResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  const userId = user.id;

  const { data: rows, error } = await supabase
    .from('conversations')
    .select('id, listing_id, buyer_id, seller_id, created_at, updated_at')
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('updated_at', { ascending: false });

  if (error) return { data: null, error: { message: error.message } };

  const list = (rows ?? []) as Array<{
    id: string;
    listing_id: string;
    buyer_id: string;
    seller_id: string;
    created_at: string;
    updated_at: string;
  }>;

  if (list.length === 0) return { data: [], error: null };

  const listingIds = [...new Set(list.map((c) => c.listing_id))];
  const { data: listings } = await supabase
    .from('listings')
    .select('id, title, user_id')
    .in('id', listingIds);
  const listingMap = new Map(
    (listings ?? []).map((l: { id: string; title: string; user_id: string }) => [l.id, l])
  );

  const otherIds = list.map((c) => (c.buyer_id === userId ? c.seller_id : c.buyer_id));
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', otherIds);
  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? 'Utilisateur'])
  );

  const convIds = list.map((c) => c.id);
  const { data: lastMessages } = await supabase
    .from('messages')
    .select('conversation_id, body, created_at')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: false });

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

  const { data: unreadRows } = await supabase
    .from('messages')
    .select('conversation_id')
    .in('conversation_id', convIds)
    .neq('sender_id', userId)
    .is('read_at', null);

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
      updated_at: c.updated_at,
      listing_title: listing?.title,
      other_party_name: profileMap.get(otherId),
      last_message_at: last?.created_at ?? null,
      last_message_preview: preview ?? null,
      unread_count: unreadByConv.get(c.id) ?? 0,
    };
  });

  return { data, error: null };
}
