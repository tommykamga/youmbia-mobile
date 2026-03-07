/**
 * Get or create a conversation for a listing (buyer = current user, seller = listing owner).
 */

import { supabase } from '@/lib/supabase';

export type GetOrCreateConversationResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { message: string } };

export async function getOrCreateConversation(listingId: string): Promise<GetOrCreateConversationResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  const { data: listing } = await supabase
    .from('listings')
    .select('id, user_id')
    .eq('id', listingId)
    .eq('status', 'active')
    .maybeSingle();

  if (!listing) {
    return { data: null, error: { message: 'Annonce introuvable' } };
  }

  const sellerId = (listing as { user_id: string }).user_id;
  if (!sellerId || sellerId === user.id) {
    return { data: null, error: { message: 'Impossible de contacter pour cette annonce' } };
  }

  const buyerId = user.id;

  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('listing_id', listingId)
    .eq('buyer_id', buyerId)
    .eq('seller_id', sellerId)
    .maybeSingle();

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

  if (error) return { data: null, error: { message: error.message } };
  return { data: { id: (inserted as { id: string }).id }, error: null };
}
