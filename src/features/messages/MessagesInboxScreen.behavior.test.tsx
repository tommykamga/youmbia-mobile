/* eslint-disable import/first -- vi.mock must precede importing the SUT */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockGetSession = vi.fn();
const mockGetConversations = vi.fn();
const mockLightCacheRead = vi.fn();
const mockLightCacheWrite = vi.fn();

vi.mock('@/services/auth', () => ({
  getSession: () => mockGetSession(),
}));

vi.mock('@/services/conversations', () => ({
  getConversations: () => mockGetConversations(),
  hideConversationForMe: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/lightCache', () => ({
  lightCacheKeys: { conversations: (uid: string) => `inbox.${uid}` },
  lightCacheRead: (...args: unknown[]) => mockLightCacheRead(...args),
  lightCacheWrite: (...args: unknown[]) => mockLightCacheWrite(...args),
}));

vi.mock('expo-router', async () => {
  const R = await import('react');
  return {
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    /** Comportement proche navigation : une exécution au focus (simulé par mount), pas à chaque render. */
    useFocusEffect: (cb: () => void | (() => void)) => {
      R.useEffect(() => {
        const cleanup = cb();
        return typeof cleanup === 'function' ? cleanup : undefined;
      }, [cb]);
    },
    Redirect: () => null,
  };
});

vi.mock('@/lib/messagingRealtime', () => ({
  subscribeMessagingEvents: () => () => {},
  emitConversationRead: vi.fn(),
}));

vi.mock('@/components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => React.createElement('Screen', {}, children),
}));
vi.mock('@/components', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => React.createElement('Screen', {}, children),
  EmptyState: () => React.createElement('EmptyState'),
  Button: ({ children }: { children: React.ReactNode }) => React.createElement('Button', {}, children),
}));

vi.mock('@/features/messages/MessagesScreenHeader', () => ({
  MessagesScreenHeader: () => React.createElement('MessagesScreenHeader'),
}));

vi.mock('@/features/messages/SwipeToDeleteRow', () => ({
  SwipeToDeleteRow: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/features/messages/InboxConversationRow', () => ({
  InboxConversationRow: () => React.createElement('InboxConversationRow'),
  InboxConversationRowSkeleton: () => React.createElement('InboxConversationRowSkeleton'),
}));

vi.mock('@/features/messages/useInboxListingThumbs', () => ({
  useInboxListingThumbs: () => ({ thumbByListingId: {}, thumbsFetchSettled: true }),
}));

vi.mock('react-native', async () => {
  const R = await import('react');
  return {
    Platform: { OS: 'ios', select: (s: { ios?: unknown }) => s.ios },
    FlatList: ({
      data,
      ListHeaderComponent,
      ListFooterComponent,
    }: {
      data: { id: string }[];
      ListHeaderComponent?: React.ReactElement | null;
      ListFooterComponent?: React.ReactElement | null;
    }) =>
      R.createElement(
        'FlatList',
        { testID: 'inbox-flatlist', 'data-count': data?.length ?? 0 },
        ListHeaderComponent ?? null,
        ListFooterComponent ?? null
      ),
    View: 'View',
    Text: 'Text',
    Pressable: ({
      children,
      testID,
      onPress,
    }: {
      children: React.ReactNode;
      testID?: string;
      onPress?: () => void;
    }) => R.createElement('Pressable', { testID, onPress }, children),
    StyleSheet: { create: (s: unknown) => s },
    useWindowDimensions: () => ({ width: 400, height: 800 }),
    Alert: { alert: vi.fn() },
    RefreshControl: () => null,
  };
});

vi.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

import { MessagesInboxScreen } from './MessagesInboxScreen';
import { INBOX_LIGHT_CACHE_SCHEMA } from './inboxLightCache';

const baseConv = {
  id: 'c1',
  listing_id: 'l1',
  buyer_id: 'buy',
  seller_id: 'sell',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('MessagesInboxScreen — cache et erreurs (comportement)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { id: 'user-a' } });
  });

  it('affiche stale + retry sans filtrer le cache ambigu (legacy sans schema) puis enlève stale au succès', async () => {
    mockLightCacheRead.mockResolvedValue({
      payload: {
        userId: 'user-a',
        conversations: [{ ...baseConv, last_message_at: null, unread_count: 0 }],
      },
      savedAt: 1,
      ageMs: 0,
    });
    mockGetConversations.mockResolvedValue({
      data: [{ ...baseConv, last_message_at: '2026-02-01T00:00:00.000Z' }],
      error: null,
    });

    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<MessagesInboxScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(tree.root.findAll((n) => n.props?.testID === 'inbox-stale-retry').length).toBe(0);
    expect(mockGetConversations).toHaveBeenCalledTimes(1);
    expect(mockLightCacheWrite).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ userId: 'user-a', inboxSchema: INBOX_LIGHT_CACHE_SCHEMA })
    );
  });

  it('avec cache fiable et échec serveur : garde les lignes, bandeau retry et statut erreur', async () => {
    mockLightCacheRead.mockResolvedValue({
      payload: {
        userId: 'user-a',
        conversations: [{ ...baseConv, last_message_at: '2026-02-01T00:00:00.000Z' }],
        inboxSchema: INBOX_LIGHT_CACHE_SCHEMA,
      },
      savedAt: 1,
      ageMs: 0,
    });
    mockGetConversations.mockResolvedValue({ data: null, error: { message: 'RLS denied' } });

    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<MessagesInboxScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const list = tree.root.findByProps({ testID: 'inbox-flatlist' });
    expect(list.props['data-count']).toBe(1);
    expect(tree.root.findByProps({ testID: 'inbox-stale-retry' })).toBeTruthy();
    expect(mockLightCacheWrite).not.toHaveBeenCalled();
  });

  it('sépare les utilisateurs : clé cache inbox par userId', async () => {
    mockLightCacheRead.mockResolvedValue(null);
    mockGetConversations.mockResolvedValue({
      data: [{ ...baseConv, id: 'c-a' }],
      error: null,
    });

    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<MessagesInboxScreen />);
      await Promise.resolve();
    });

    expect(mockLightCacheRead).toHaveBeenCalledWith('inbox.user-a');

    await act(async () => {
      tree.unmount();
    });

    mockGetSession.mockResolvedValue({ user: { id: 'user-b' } });
    mockGetConversations.mockResolvedValue({
      data: [{ ...baseConv, id: 'c-b', buyer_id: 'user-b' }],
      error: null,
    });

    await act(async () => {
      tree = create(<MessagesInboxScreen />);
      await Promise.resolve();
    });

    expect(mockLightCacheRead).toHaveBeenCalledWith('inbox.user-b');
  });
});
