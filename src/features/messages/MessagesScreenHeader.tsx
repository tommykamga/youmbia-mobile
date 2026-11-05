import React from 'react';
import { MarketplaceTabHeader, MARKETPLACE_TAB_SURFACE } from '@/components/MarketplaceTabHeader';

/** @deprecated Préférer `MARKETPLACE_TAB_SURFACE` — alias Messages. */
export const MESSAGES_MARKETPLACE_SURFACE = MARKETPLACE_TAB_SURFACE;

type MessagesScreenHeaderProps = {
  /** Conversations avec au moins un message non lu (dérivé des lignes inbox, pas du badge onglet). */
  unreadConversationsCount: number;
};

function messagesSubtitle(unreadConversationsCount: number): string {
  if (unreadConversationsCount === 0) return 'Aucune conversation non lue';
  return `${unreadConversationsCount} ${
    unreadConversationsCount === 1 ? 'conversation non lue' : 'conversations non lues'
  }`;
}

export function MessagesScreenHeader({ unreadConversationsCount }: MessagesScreenHeaderProps) {
  const subtitle = messagesSubtitle(unreadConversationsCount);
  const subtitleA11y =
    unreadConversationsCount === 0
      ? 'Aucune conversation non lue'
      : `${unreadConversationsCount} conversation${unreadConversationsCount === 1 ? '' : 's'} non lue${unreadConversationsCount === 1 ? '' : 's'}`;

  return (
    <MarketplaceTabHeader
      title="Messages"
      subtitle={subtitle}
      subtitleAccessibilityLabel={subtitleA11y}
    />
  );
}

export { messagesSubtitle };
