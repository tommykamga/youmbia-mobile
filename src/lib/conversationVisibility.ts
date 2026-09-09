/**
 * Visibilité inbox « Supprimer pour moi » (buyer_deleted_at / seller_deleted_at).
 */

export type ConversationHideFields = {
  buyer_id: string;
  seller_id: string;
  buyer_deleted_at?: string | null;
  seller_deleted_at?: string | null;
};

/** True si la conversation doit apparaître dans l'inbox de userId. */
export function isConversationVisibleForUser(
  conv: ConversationHideFields,
  userId: string
): boolean {
  const uid = String(userId ?? '').trim();
  if (!uid) return false;
  if (conv.buyer_id === uid) return conv.buyer_deleted_at == null || conv.buyer_deleted_at === '';
  if (conv.seller_id === uid) return conv.seller_deleted_at == null || conv.seller_deleted_at === '';
  return false;
}

/**
 * Filtre PostgREST : participant courant ET deleted_at IS NULL pour son rôle.
 */
export function conversationsVisibleForUserOrFilter(userId: string): string {
  const uid = String(userId ?? '').trim();
  return `and(buyer_id.eq.${uid},buyer_deleted_at.is.null),and(seller_id.eq.${uid},seller_deleted_at.is.null)`;
}

/**
 * Miroir pur de `conversations_undelete_on_new_message` :
 * seul le destinataire est « undelete » ; le flag de l'expéditeur reste inchangé.
 */
export function applyConversationUndeleteOnNewMessage(
  conv: ConversationHideFields,
  senderId: string
): Pick<ConversationHideFields, 'buyer_deleted_at' | 'seller_deleted_at'> {
  const sender = String(senderId ?? '').trim();
  let buyer_deleted_at = conv.buyer_deleted_at ?? null;
  let seller_deleted_at = conv.seller_deleted_at ?? null;

  if (sender === conv.buyer_id) {
    seller_deleted_at = null;
  } else if (sender === conv.seller_id) {
    buyer_deleted_at = null;
  }

  return { buyer_deleted_at, seller_deleted_at };
}
