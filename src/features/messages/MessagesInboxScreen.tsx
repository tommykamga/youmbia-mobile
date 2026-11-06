import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, EmptyState, Button } from '@/components';
import { getSession } from '@/services/auth';
import { getConversations, hideConversationForMe } from '@/services/conversations';
import type { Conversation } from '@/services/conversations/types';
import { subscribeMessagingEvents, emitConversationRead } from '@/lib/messagingRealtime';
import { spacing, colors } from '@/theme';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import { lightCacheKeys, lightCacheRead, lightCacheRemove, lightCacheWrite } from '@/lib/lightCache';
import { SwipeToDeleteRow } from '@/features/messages/SwipeToDeleteRow';
import { MessagesScreenHeader } from '@/features/messages/MessagesScreenHeader';
import {
  InboxConversationRow,
  InboxConversationRowSkeleton,
} from '@/features/messages/InboxConversationRow';
import { countUnreadConversations, INBOX_ROW_SEPARATOR_MARGIN_LEFT } from '@/features/messages/inboxDisplay';
import {
  patchInboxOnIncoming,
  patchInboxOnRead,
  sortConversationsInbox,
} from '@/features/messages/inboxPatches';
import { useInboxListingThumbs } from '@/features/messages/useInboxListingThumbs';
import { MessagesInboxDemoEntry } from '@/features/messages/MessagesInboxDemoEntry';

type InboxCachePayload = { userId: string; conversations: Conversation[] };

function MessagesInboxSkeleton() {
  return (
    <View style={styles.listContent}>
      {[...Array(6)].map((_, i) => (
        <View key={i}>
          <InboxConversationRowSkeleton />
          {i < 5 ? <View style={styles.separator} /> : null}
        </View>
      ))}
    </View>
  );
}

export function MessagesInboxScreen({ onRequestDemo }: { onRequestDemo?: () => void }) {
  useWindowDimensions();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [status, setStatus] = useState<'loading' | 'error_network' | 'error_generic' | 'success' | 'empty' | 'unauthenticated'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const shownFromCacheRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const swipeGuardRef = useRef<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [staleFromCache, setStaleFromCache] = useState(false);
  const { thumbByListingId: listingThumbById, thumbsFetchSettled } = useInboxListingThumbs(
    conversations,
    sessionUserId
  );
  const thumbsPending = !thumbsFetchSettled && conversations.length > 0;

  const tabsBottomPad = 72;
  const headerUnreadCount =
    status === 'success' ||
    status === 'empty' ||
    (staleFromCache && (status === 'error_network' || status === 'error_generic'))
      ? countUnreadConversations(conversations)
      : 0;

  const StaleCacheBanner = (
    <View style={styles.staleBanner} accessibilityRole="text">
      <Ionicons name="time-outline" size={16} color={colors.warning} style={styles.staleIcon} />
      <Text style={styles.staleText}>Liste non actualisée (hors ligne ou serveur)</Text>
    </View>
  );

  const fetchInbox = useCallback(async () => {
    let cacheRowCountShown = 0;
    try {
      const session = await getSession();
      if (!session?.user) {
        setStatus('unauthenticated');
        setSessionUserId(null);
        setStaleFromCache(false);
        return;
      }
      const uid = session.user.id;
      userIdRef.current = uid;
      setSessionUserId(uid);
      shownFromCacheRef.current = false;
      setStaleFromCache(false);
      const cacheKey = lightCacheKeys.conversations(uid);
      const cached = await lightCacheRead<InboxCachePayload>(cacheKey);
      if (cached?.payload?.userId === uid && Array.isArray(cached.payload.conversations)) {
        let data = [...cached.payload.conversations];
        /** Cache pré-A2 : fils sans message avec aperçu/compteur vides ; invalider plutôt que réafficher un fantôme. */
        const stripped = data.filter(
          (c) => c.last_message_at != null || (c.unread_count ?? 0) > 0
        );
        if (stripped.length !== data.length) {
          await lightCacheRemove(cacheKey);
          data = stripped;
          shownFromCacheRef.current = false;
        } else {
          sortConversationsInbox(data);
          setConversations(data);
          setStatus(data.length > 0 ? 'success' : 'empty');
          shownFromCacheRef.current = true;
          cacheRowCountShown = data.length;
          setStaleFromCache(false);
        }
      }

      const result = await getConversations();
      if (__DEV__) {
        console.log('[messages/inbox]', {
          userId: session.user.id,
          request: 'getConversations',
          error: result.error?.message ?? null,
          rowCount: result.data?.length ?? 0,
        });
      }
      if (result.error) {
        const raw = String(result.error.message);
        const msg = raw.toLowerCase();
        if (
          msg.includes('non connecté') ||
          msg.includes('not authenticated') ||
          msg.includes('session expirée')
        ) {
          setStatus('unauthenticated');
          setSessionUserId(null);
          setStaleFromCache(false);
          return;
        }
        if (shownFromCacheRef.current && cacheRowCountShown > 0) {
          setStaleFromCache(true);
          setStatus('success');
          return;
        }
        if (msg.includes('network') || msg.includes('réseau') || msg.includes('fetch')) {
          setStatus('error_network');
        } else {
          setStatus('error_generic');
        }
        return;
      }
      const data = Array.isArray(result.data) ? result.data : [];
      sortConversationsInbox(data);
      setConversations(data);
      setStatus(data.length > 0 ? 'success' : 'empty');
      setStaleFromCache(false);
      await lightCacheWrite<InboxCachePayload>(cacheKey, { userId: uid, conversations: data });
    } catch (e: unknown) {
      if (__DEV__) {
        console.warn('[messages/inbox] fetchInbox exception', e);
      }
      if (shownFromCacheRef.current && cacheRowCountShown > 0) {
        setStaleFromCache(true);
        setStatus('success');
        return;
      }
      const msg = String(e instanceof Error ? e.message : e).toLowerCase();
      if (msg.includes('network') || msg.includes('réseau') || msg.includes('fetch')) {
        setStatus('error_network');
      } else {
        setStatus('error_generic');
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchInbox();
    }, [fetchInbox])
  );

  useEffect(() => {
    return subscribeMessagingEvents((event) => {
      const userId = userIdRef.current;
      if (!userId) return;

      if (event.type === 'conversation_read') {
        setConversations((prev) => patchInboxOnRead(prev, event.conversationId));
        return;
      }

      if (event.type === 'message_inserted') {
        setConversations((prev) => {
          const patched = patchInboxOnIncoming(prev, event.message, userId);
          if (patched === 'refetch') {
            void fetchInbox();
            return prev;
          }
          return patched;
        });
      }
    });
  }, [fetchInbox]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchInbox();
    setRefreshing(false);
  }, [fetchInbox]);

  const persistInboxCache = useCallback(async (uid: string, data: Conversation[]) => {
    await lightCacheWrite<InboxCachePayload>(lightCacheKeys.conversations(uid), {
      userId: uid,
      conversations: data,
    });
  }, []);

  const confirmHideConversation = useCallback(
    (item: Conversation) => {
      Alert.alert(
        'Supprimer cette conversation de votre messagerie ?',
        'Elle restera visible pour l’autre participant.',
        [
          { text: 'Annuler', style: 'cancel', onPress: () => setOpenRowId(null) },
          {
            text: 'Supprimer',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                const uid = userIdRef.current;
                setConversations((prev) => {
                  const next = prev.filter((c) => c.id !== item.id);
                  setStatus(next.length > 0 ? 'success' : 'empty');
                  if (uid) void persistInboxCache(uid, next);
                  return next;
                });
                setOpenRowId(null);
                emitConversationRead(item.id);

                const result = await hideConversationForMe(item.id);
                if (!result.success) {
                  Alert.alert(
                    'Suppression impossible',
                    result.error?.message ?? "Impossible de supprimer la conversation."
                  );
                  void fetchInbox();
                }
              })();
            },
          },
        ]
      );
    },
    [fetchInbox, persistInboxCache]
  );

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <SwipeToDeleteRow
        rowId={item.id}
        openRowId={openRowId}
        onOpenRowIdChange={setOpenRowId}
        onDeletePress={() => confirmHideConversation(item)}
        onHorizontalGesture={() => {
          swipeGuardRef.current = item.id;
        }}
      >
        <InboxConversationRow
          item={item}
          listingThumbUrl={listingThumbById[item.listing_id] ?? null}
          listingThumbPending={thumbsPending && !listingThumbById[item.listing_id]}
          onPress={() => {
            if (openRowId === item.id) {
              setOpenRowId(null);
              return;
            }
            if (swipeGuardRef.current === item.id) {
              swipeGuardRef.current = null;
              return;
            }
            router.push(`/conversation/${item.id}`);
          }}
        />
      </SwipeToDeleteRow>
    ),
    [confirmHideConversation, listingThumbById, openRowId, router, thumbsPending]
  );

  if (status === 'unauthenticated') {
    return <Redirect href={buildAuthGateHref('messages')} />;
  }

  if (status === 'loading') {
    return (
      <Screen noPadding safe={false}>
        <MessagesScreenHeader unreadConversationsCount={0} />
        <MessagesInboxSkeleton />
      </Screen>
    );
  }

  if (status === 'error_network') {
    return (
      <Screen noPadding safe={false}>
        {staleFromCache ? (
          <FlatList
            data={conversations}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListHeaderComponent={
              <View>
                <MessagesScreenHeader unreadConversationsCount={headerUnreadCount} />
                {StaleCacheBanner}
              </View>
            }
            ListFooterComponent={
              <View style={[styles.errorFooter, { paddingBottom: tabsBottomPad }]}>
                <EmptyState
                  variant="plain"
                  icon={<Ionicons name="cloud-offline-outline" size={24} color={colors.error} />}
                  title="Synchronisation impossible"
                  message="Vérifiez votre connexion puis réessayez. La liste affichée peut être incomplète."
                  action={
                    <View style={styles.emptyAction}>
                      <Button variant="secondary" onPress={() => fetchInbox()} style={styles.emptyCta}>
                        Réessayer
                      </Button>
                    </View>
                  }
                />
              </View>
            }
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            }
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <>
            <MessagesScreenHeader unreadConversationsCount={0} />
            <View style={[styles.contentArea, { paddingBottom: tabsBottomPad }]}>
              <EmptyState
                variant="plain"
                icon={<Ionicons name="cloud-offline-outline" size={24} color={colors.error} />}
                title="Internet indisponible"
                message="Vérifiez votre connexion réseau puis rechargez vos messages."
                action={
                  <View style={styles.emptyAction}>
                    <Button variant="secondary" onPress={() => fetchInbox()} style={styles.emptyCta}>
                      Réessayer
                    </Button>
                  </View>
                }
              />
            </View>
          </>
        )}
      </Screen>
    );
  }

  if (status === 'error_generic') {
    return (
      <Screen noPadding safe={false}>
        {staleFromCache ? (
          <FlatList
            data={conversations}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListHeaderComponent={
              <View>
                <MessagesScreenHeader unreadConversationsCount={headerUnreadCount} />
                {StaleCacheBanner}
              </View>
            }
            ListFooterComponent={
              <View style={[styles.errorFooter, { paddingBottom: tabsBottomPad }]}>
                <EmptyState
                  variant="plain"
                  icon={<Ionicons name="alert-circle-outline" size={24} color={colors.textSecondary} />}
                  title="Synchronisation impossible"
                  message="Le serveur ne répond pas correctement. Réessayez : la liste affichée peut être incomplète."
                  action={
                    <View style={styles.emptyAction}>
                      <Button variant="secondary" onPress={() => fetchInbox()} style={styles.emptyCta}>
                        Réessayer
                      </Button>
                    </View>
                  }
                />
              </View>
            }
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            }
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <>
            <MessagesScreenHeader unreadConversationsCount={0} />
            <View style={[styles.contentArea, { paddingBottom: tabsBottomPad }]}>
              <EmptyState
                variant="plain"
                icon={<Ionicons name="alert-circle-outline" size={24} color={colors.textSecondary} />}
                title="Oups ! Erreur serveur"
                message="Nous n'arrivons pas à charger vos conversations. Nos équipes sont sur le coup."
                action={
                  <View style={styles.emptyAction}>
                    <Button variant="secondary" onPress={() => fetchInbox()} style={styles.emptyCta}>
                      Réessayer
                    </Button>
                  </View>
                }
              />
            </View>
          </>
        )}
      </Screen>
    );
  }

  if (status === 'empty') {
    return (
      <Screen noPadding safe={false}>
        <MessagesScreenHeader unreadConversationsCount={0} />
        <View style={[styles.contentArea, { paddingBottom: tabsBottomPad }]}>
          <EmptyState
            variant="plain"
            icon={<Ionicons name="chatbubbles-outline" size={24} color={colors.primary} />}
            title="Aucun message"
            message="Vos échanges avec les vendeurs apparaîtront ici."
            action={
              <View style={styles.emptyAction}>
                <Button
                  variant="secondary"
                  onPress={() => router.replace('/(tabs)/home')}
                  style={styles.emptyCta}
                >
                  Découvrir les annonces
                </Button>
                {onRequestDemo ? <MessagesInboxDemoEntry onPress={onRequestDemo} /> : null}
              </View>
            }
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen noPadding safe={false}>
      <FlatList
        data={conversations}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View>
            <MessagesScreenHeader unreadConversationsCount={headerUnreadCount} />
            {staleFromCache ? StaleCacheBanner : null}
            {onRequestDemo ? <MessagesInboxDemoEntry onPress={onRequestDemo} /> : null}
          </View>
        }
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}


const styles = StyleSheet.create({
  contentArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    transform: [{ translateY: -32 }],
  },
  emptyAction: { width: '100%', alignItems: 'center' },
  emptyCta: { width: '78%', minHeight: 52 },
  listContent: {
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: spacing['3xl'],
    flexGrow: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
    marginLeft: INBOX_ROW_SEPARATOR_MARGIN_LEFT,
  },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.warningLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  staleIcon: { marginRight: spacing.xs },
  staleText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    color: colors.badgeWarningText,
  },
  errorFooter: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.base,
  },
});
