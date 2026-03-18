import { supabase } from '@/lib/supabase';

/**
 * Totals unread messages for a given user across all their conversations.
 * Counts buyer_unread_count if user is the buyer, seller_unread_count if user is the seller.
 */
export async function getUnreadMessagesCount(userId: string): Promise<{ count: number; error: any }> {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('buyer_id, seller_id, buyer_unread_count, seller_unread_count')
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

    if (error) return { count: 0, error };

    const total = (data || []).reduce((acc, conv) => {
      let count = 0;
      if (conv.buyer_id === userId) {
        count = conv.buyer_unread_count || 0;
      } else if (conv.seller_id === userId) {
        count = conv.seller_unread_count || 0;
      }
      return acc + count;
    }, 0);

    return { count: total, error: null };
  } catch (err) {
    return { count: 0, error: err };
  }
}
