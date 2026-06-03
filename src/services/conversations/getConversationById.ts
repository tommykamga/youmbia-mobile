/**
 * Fetch a single conversation by id for the current user (must be participant).
 *
 * Aligns the mobile thread on the web behaviour (`conversationsData.getConversationById`):
 * la simple absence de messages n'est pas une erreur. Cette fonction établit uniquement
 * le contexte de la conversation (existence + autorisation) :
 *  - { data: row, error: null }   → conversation accessible
 *  - { data: null, error: null }  → introuvable ou non autorisée (RLS masque la ligne)
 *  - { data: null, error: {...} } → utilisateur non connecté ou vraie erreur Supabase
 */

import { supabase } from '@/lib/supabase';
import { getUserDisplayName, getAvatarVersion } from '@/services/profile';
import { resolveSingleAvatarUrl } from '@/lib/avatarImageUrl';
import type { Conversation } from './types';

export type GetConversationByIdResult =
  | { data: Conversation | null; error: null }
  | { data: null; error: { message: string } };

export async function getConversationById(conversationId: string): Promise<GetConversationByIdResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  const { data: row, error } = await supabase
    .from('conversations')
    .select('id, listing_id, buyer_id, seller_id, created_at')
    .eq('id', conversationId)
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .maybeSingle();

  if (error) return { data: null, error: { message: error.message } };
  if (!row) return { data: null, error: null };

  const conv = row as {
    id: string;
    listing_id: string;
    buyer_id: string;
    seller_id: string;
    created_at: string;
  };

  const { data: listing } = await supabase
    .from('listings')
    .select('id, title')
    .eq('id', conv.listing_id)
    .maybeSingle();

  const otherId = conv.buyer_id === user.id ? conv.seller_id : conv.buyer_id;
  const { data: otherProfile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', otherId)
    .maybeSingle();

  const otherRow = otherProfile as { full_name?: string | null; avatar_url?: string | null } | null;
  const avatarPath = String(otherRow?.avatar_url ?? '').trim() || null;
  const avatarVersion = getAvatarVersion(otherRow);
  const avatarDisplayUrl = avatarPath
    ? await resolveSingleAvatarUrl(avatarPath, avatarVersion)
    : null;

  const conversation: Conversation = {
    id: conv.id,
    listing_id: conv.listing_id,
    buyer_id: conv.buyer_id,
    seller_id: conv.seller_id,
    created_at: conv.created_at,
    updated_at: conv.created_at,
    listing_title: (listing as { title?: string } | null)?.title,
    other_party_id: otherId,
    other_party_name: getUserDisplayName(
      { full_name: otherRow?.full_name },
      'Utilisateur'
    ),
    other_party_avatar_url: avatarPath,
    other_party_avatar_version: avatarVersion,
    other_party_avatar_display_url: avatarDisplayUrl,
    last_message_at: null,
    last_message_preview: null,
    unread_count: 0,
  };

  return { data: conversation, error: null };
}
