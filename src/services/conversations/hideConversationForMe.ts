/**
 * Masque une conversation pour l'utilisateur courant (« Supprimer pour moi »).
 * RPC SECURITY DEFINER : ne touche que buyer_deleted_at OU seller_deleted_at de l'appelant.
 */

import { supabase } from '@/lib/supabase';

export type HideConversationForMeResult =
  | { success: true; error: null }
  | { success: false; error: { message: string } };

export async function hideConversationForMe(
  conversationId: string
): Promise<HideConversationForMeResult> {
  const id = String(conversationId ?? '').trim();
  if (!id) {
    return { success: false, error: { message: 'Conversation introuvable.' } };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: { message: 'Non connecté' } };
  }

  const { error } = await supabase.rpc('hide_conversation_for_me', {
    p_conversation_id: id,
  });

  if (error) {
    if (__DEV__) {
      console.warn('[hideConversationForMe]', error.message);
    }
    const msg = String(error.message ?? '').toLowerCase();
    if (msg.includes('not a participant')) {
      return { success: false, error: { message: 'Action non autorisée.' } };
    }
    if (msg.includes('network') || msg.includes('fetch')) {
      return { success: false, error: { message: 'Réseau indisponible' } };
    }
    return {
      success: false,
      error: { message: "Impossible de supprimer la conversation de votre messagerie." },
    };
  }

  return { success: true, error: null };
}
