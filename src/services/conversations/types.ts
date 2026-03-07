/**
 * Conversation and message types.
 * Align with backend: conversations (listing_id, buyer_id, seller_id), messages (conversation_id, sender_id, body, read_at).
 */

export type Conversation = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  created_at: string;
  updated_at: string;
  listing_title?: string;
  other_party_name?: string;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  unread_count?: number;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};
