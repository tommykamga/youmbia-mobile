/**
 * Get or create a conversation for a listing (buyer = current user, seller = listing owner).
 */

import { supabase } from '@/lib/supabase';

export type GetOrCreateConversationResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { message: string } };

function getConversationErrorMessage(message: string, fallback: string): string {
  const msg = message.toLowerCase();
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('internet')) {
    return 'Réseau indisponible';
  }
  if (msg.includes('jwt') || msg.includes('auth')) {
    return 'Connexion requise';
  }
  return fallback;
}

export async function getOrCreateConversation(listingId: string): Promise<GetOrCreateConversationResult> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { data: null, error: { message: 'Non connecté' } };
    }

    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id, user_id')
      .eq('id', listingId)
      .eq('status', 'active')
      .maybeSingle();

    if (listingError) {
      return {
        data: null,
        error: {
          message: getConversationErrorMessage(
            listingError.message,
            "Impossible de charger l'annonce"
          ),
        },
      };
    }

    if (!listing) {
      return { data: null, error: { message: 'Annonce introuvable' } };
    }

    const sellerId = (listing as { user_id: string }).user_id;
    if (!sellerId || sellerId === user.id) {
      return { data: null, error: { message: 'Impossible de contacter pour cette annonce' } };
    }

    const buyerId = user.id;

    const { data: existing, error: existingError } = await supabase
      .from('conversations')
      .select('id')
      .eq('listing_id', listingId)
      .eq('buyer_id', buyerId)
      .eq('seller_id', sellerId)
      .maybeSingle();

    if (existingError) {
      return {
        data: null,
        error: {
          message: getConversationErrorMessage(
            existingError.message,
            "Impossible d'ouvrir la conversation"
          ),
        },
      };
    }

    if (existing) {
      return { data: { id: (existing as { id: string }).id }, error: null };
    }

    const { data: inserted, error } = await supabase
      .from('conversations')
      .insert({
        listing_id: listingId,
        buyer_id: buyerId,
        seller_id: sellerId,
      } as never)
      .select('id')
      .single();

    if (error) {
      return {
        data: null,
        error: {
          message: getConversationErrorMessage(
            error.message,
            "Impossible d'ouvrir la conversation"
          ),
        },
      };
    }
    return { data: { id: (inserted as { id: string }).id }, error: null };
  } catch {
    return { data: null, error: { message: "Impossible d'ouvrir la conversation" } };
  }
}
