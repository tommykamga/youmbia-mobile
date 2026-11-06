import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  Platform,
} from 'react-native';
import {
  getMessages,
  sendMessage,
  markConversationRead,
  getConversations,
  getConversationById,
} from '@/services/conversations';
import { getSession } from '@/services/auth';
import { submitReport } from '@/services/reports';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import { REPORT_SUCCESS_MESSAGE } from '@/constants/reportMessages';
import type { ReportReasonCode } from '@/constants/reportReasons';
import { ReportComposerModal } from '@/features/reports';
import {
  appendMessageDeduped,
  emitConversationRead,
  setOpenConversationId,
  subscribeMessagingEvents,
} from '@/lib/messagingRealtime';
import { markConversationNotificationAsRead, syncMessageNotificationSnapshot } from '@/services/messageNotifications';
import type { Message } from '@/services/conversations';
import { spacing, colors, typography, fontWeights } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { trackConversationViewed } from '@/lib/analytics';
import { formatPrice } from '@/lib/format';
import { ConversationHeader } from '@/features/conversation/ConversationHeader';
import { ConversationListingBanner } from '@/features/conversation/ConversationListingBanner';
import { ConversationMessageBubble } from '@/features/conversation/ConversationMessageBubble';
import { ConversationComposer } from '@/features/conversation/ConversationComposer';
import {
  formatMessageDaySeparator,
  getThreadErrorMessage,
  isSameCalendarDay,
} from '@/features/conversation/conversationThreadDisplay';
import { useConversationListingPresentation } from '@/features/conversation/useConversationListingPresentation';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, EmptyState, KeyboardSafeView, Button } from '@/components';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';

function MessagesSkeleton() {
  return (
    <View style={{ flex: 1, paddingHorizontal: spacing.base, paddingTop: spacing.base }}>
      <View style={[threadStyles.bubbleWrap, threadStyles.bubbleWrapThem, { opacity: 0.6 }]}>
        <View style={[threadStyles.skeletonBubble, { height: 60, width: '60%' }]} />
      </View>
      <View style={[threadStyles.bubbleWrap, threadStyles.bubbleWrapMe, { marginTop: spacing.md, opacity: 0.6 }]}>
        <View style={[threadStyles.skeletonBubble, { height: 40, width: '40%' }]} />
      </View>
    </View>
  );
}

export default function ConversationThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [listingId, setListingId] = useState<string | null>(null);
  const [listingTitle, setListingTitle] = useState<string>('Conversation');
  const [peerName, setPeerName] = useState<string>('Conversation');
  const [peerAvatarUrl, setPeerAvatarUrl] = useState<string | null>(null);
  const [peerAvatarVersion, setPeerAvatarVersion] = useState<string>('');
  const [peerAvatarDisplayUrl, setPeerAvatarDisplayUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'success'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const keyboardInset = useKeyboardInset(Platform.OS !== 'web');
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReasonCode | null>(null);
  const [reportComment, setReportComment] = useState('');
  const [reportedConversationId, setReportedConversationId] = useState<string | null>(null);

  const { thumbUrl, price, thumbPending } = useConversationListingPresentation(
    listingId,
    status === 'success'
  );
  const priceLabel = price != null ? formatPrice(price) : null;

  const keyboardVerticalOffset = insets.top + 118;

  const load = useCallback(async () => {
    try {
      if (!id) {
        setStatus('error');
        setErrorMessage('Cette conversation est introuvable.');
        return;
      }
      const session = await getSession();
      if (!session?.user) {
        router.replace(buildAuthGateHref('messages', { redirect: `/conversation/${id}` }));
        return;
      }
      setUserId(session.user.id);
      const [convResult, convListResult, messagesResult] = await Promise.all([
        getConversationById(id),
        getConversations(),
        getMessages(id),
      ]);
      if (convResult.error) {
        setStatus('error');
        setErrorMessage(
          getThreadErrorMessage(convResult.error.message, "Nous n'arrivons pas à charger cette discussion.")
        );
        return;
      }
      if (!convResult.data) {
        setStatus('error');
        setErrorMessage('Cette conversation est introuvable.');
        return;
      }
      const conv = convResult.data;
      setListingId(conv.listing_id);
      setListingTitle(conv.listing_title?.trim() || 'Annonce supprimée');
      setPeerName(conv.other_party_name ?? 'Utilisateur');
      setPeerAvatarUrl(conv.other_party_avatar_url ?? null);
      setPeerAvatarVersion(conv.other_party_avatar_version ?? '');
      setPeerAvatarDisplayUrl(conv.other_party_avatar_display_url ?? null);
      setMessages(messagesResult.data ?? []);
      void syncMessageNotificationSnapshot(convListResult.data ?? []);
      setStatus('success');
      const unreadFromInbox = convListResult.data?.find((item) => item.id === id)?.unread_count;
      const unreadFromMessages = (messagesResult.data ?? []).filter(
        (message) => message.sender_id !== session.user.id && message.read_at == null
      ).length;
      trackConversationViewed({
        conversation_id: id,
        unread_messages_count:
          typeof unreadFromInbox === 'number' ? unreadFromInbox : unreadFromMessages,
      });
    } catch {
      setStatus('error');
      setErrorMessage('Une erreur inattendue est survenue.');
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshMessages = useCallback(async () => {
    if (!id) return;
    const res = await getMessages(id);
    if (res.data) setMessages(res.data);
  }, [id]);

  const applyReadOptimistic = useCallback(() => {
    if (!id) return;
    const readAt = new Date().toISOString();
    setMessages((prev) =>
      prev.map((m) =>
        m.sender_id !== userId && m.read_at == null ? { ...m, read_at: readAt } : m
      )
    );
    emitConversationRead(id);
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      setOpenConversationId(id ?? null);
      return () => setOpenConversationId(null);
    }, [id])
  );

  useFocusEffect(
    useCallback(() => {
      if (!id || status !== 'success') return;
      applyReadOptimistic();
      void markConversationRead(id)
        .then(() => markConversationNotificationAsRead(id))
        .catch(() => {
          void refreshMessages();
        });
      void refreshMessages();
    }, [id, status, refreshMessages, applyReadOptimistic])
  );

  useEffect(() => {
    if (!id || status !== 'success') return;

    return subscribeMessagingEvents((event) => {
      if (event.type === 'message_inserted' && event.message.conversation_id === id) {
        setMessages((prev) => appendMessageDeduped(prev, event.message));
        if (event.message.sender_id !== userId) {
          applyReadOptimistic();
          void markConversationRead(id).catch(() => {});
        }
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        return;
      }

      if (event.type === 'message_updated' && event.message.conversation_id === id) {
        const updated = event.message;
        setMessages((prev) =>
          prev.map((m) => (m.id === updated.id ? { ...m, read_at: updated.read_at } : m))
        );
      }
    });
  }, [id, status, userId, applyReadOptimistic]);

  const handleSend = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!id || sending || !trimmed) return;
    setSending(true);
    setInputText('');
    try {
      const result = await sendMessage(id, trimmed);
      if (result.error) {
        setInputText(trimmed);
        if (__DEV__) console.error('[MESSAGING ERROR] sendMessage result.error', result.error);
        const network = getThreadErrorMessage(result.error.message, '') === 'Réseau indisponible';
        Alert.alert(
          network ? 'Connexion instable' : 'Message non envoyé',
          network
            ? 'Votre texte a été conservé. Réessayez quand la connexion est rétablie.'
            : "Votre message n'a pas pu être envoyé. Le texte a été conservé."
        );
        return;
      }
      if (result.data) {
        setMessages((prev) => appendMessageDeduped(prev, result.data!));
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (error) {
      setInputText(trimmed);
      if (__DEV__) console.error('[MESSAGING ERROR]', error);
      const network =
        getThreadErrorMessage(error instanceof Error ? error.message : String(error), '') ===
        'Réseau indisponible';
      Alert.alert(
        network ? 'Connexion instable' : 'Message non envoyé',
        network
          ? 'Votre texte a été conservé. Réessayez quand la connexion est rétablie.'
          : "Votre message n'a pas pu être envoyé. Le texte a été conservé."
      );
    } finally {
      setSending(false);
    }
  }, [id, inputText, sending]);

  const handleReportPress = useCallback(() => {
    if (!id || status !== 'success') return;
    if (reportedConversationId === id) {
      Alert.alert('Déjà signalé', 'Vous avez déjà signalé cette conversation.');
      return;
    }
    setReportReason(null);
    setReportComment('');
    setReportModalVisible(true);
  }, [id, status, reportedConversationId]);

  const handleReportSubmit = useCallback(() => {
    if (!id || !reportReason || reportLoading) return;
    Alert.alert('Confirmer le signalement', 'Votre signalement sera envoyé pour modération.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Envoyer',
        onPress: async () => {
          if (reportLoading) return;
          setReportLoading(true);
          const result = await submitReport({
            targetType: 'conversation',
            targetId: id,
            reason: reportReason,
            comment: reportComment,
          });
          setReportLoading(false);
          if (result.error) {
            Alert.alert('Erreur', result.error.message);
            return;
          }
          setReportModalVisible(false);
          setReportedConversationId(id);
          Alert.alert('Merci', REPORT_SUCCESS_MESSAGE);
        },
      },
    ]);
  }, [id, reportReason, reportComment, reportLoading]);

  const keyExtractor = useCallback((item: Message) => item.id, []);

  const lastSentMessageId = useMemo(() => {
    if (!userId) return null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].sender_id === userId) return messages[i].id;
    }
    return null;
  }, [messages, userId]);

  const renderItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isMe = item.sender_id === userId;
      const prevMsg = messages[index - 1];
      const showExtraSpace = prevMsg && prevMsg.sender_id !== item.sender_id;
      const showReadStatus = isMe && item.id === lastSentMessageId;
      const daySeparatorLabel =
        !prevMsg || !isSameCalendarDay(prevMsg.created_at, item.created_at)
          ? formatMessageDaySeparator(item.created_at)
          : null;

      return (
        <ConversationMessageBubble
          message={item}
          isMe={!!isMe}
          showReadStatus={!!showReadStatus}
          daySeparatorLabel={daySeparatorLabel}
          extraTopMargin={!!showExtraSpace}
        />
      );
    },
    [userId, messages, lastSentMessageId]
  );

  const listEmptyComponent = useCallback(
    () => (
      <View style={threadStyles.emptyWrap}>
        <Ionicons name="chatbubbles-outline" size={48} color={colors.primaryLight} style={{ marginBottom: spacing.sm }} />
        <Text style={threadStyles.emptyTextTitle}>Aucun message</Text>
        <Text style={threadStyles.emptyText}>
          Lancez la discussion en envoyant votre premier message ci-dessous.
        </Text>
      </View>
    ),
    []
  );

  const openListing = useCallback(() => {
    if (!listingId) return;
    router.push(`/listing/${listingId}` as const);
  }, [listingId, router]);

  if (status === 'error') {
    return (
      <Screen safe={false}>
        <ConversationHeader peerName="Conversation" showReport={false} />
        <View style={threadStyles.contentArea}>
          <EmptyState
            variant="plain"
            icon={<Ionicons name="alert-circle-outline" size={24} color={colors.textSecondary} />}
            title="Impossible de charger la conversation"
            message={errorMessage}
            action={
              <View style={threadStyles.threadErrorAction}>
                <Button variant="secondary" onPress={() => void load()}>
                  Réessayer
                </Button>
              </View>
            }
          />
        </View>
      </Screen>
    );
  }

  /** Android : quand le clavier est ouvert, combiner inset bas (nav gestuelle / 3 boutons) + marge ; iOS inchangé (KeyboardAvoidingView). */
  const inputPaddingBottom =
    Platform.OS === 'android' && keyboardInset > 0
      ? Math.max(insets.bottom, spacing.sm)
      : keyboardInset > 0
        ? spacing.sm
        : insets.bottom > 0
          ? insets.bottom
          : spacing.base;

  return (
    <Screen scroll={false} noPadding safe={false}>
      <ConversationHeader
        peerName={peerName}
        peerAvatarUrl={peerAvatarUrl}
        peerAvatarVersion={peerAvatarVersion}
        peerAvatarDisplayUrl={peerAvatarDisplayUrl}
        showReport={status === 'success'}
        onReportPress={handleReportPress}
      />
      {status === 'success' && listingId ? (
        <ConversationListingBanner
          listingTitle={listingTitle}
          priceLabel={priceLabel}
          thumbUrl={thumbUrl}
          thumbPending={thumbPending}
          onPress={openListing}
        />
      ) : null}

      {status === 'loading' && <MessagesSkeleton />}

      {status === 'success' && (
        <KeyboardSafeView style={threadStyles.keyboard} keyboardVerticalOffset={keyboardVerticalOffset}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            ListEmptyComponent={listEmptyComponent}
            contentContainerStyle={[threadStyles.listContent, { paddingBottom: spacing.lg }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              if (messages.length > 0) listRef.current?.scrollToEnd({ animated: true });
            }}
          />
          <ConversationComposer
            value={inputText}
            onChangeText={setInputText}
            onSend={() => void handleSend()}
            sending={sending}
            paddingBottom={inputPaddingBottom}
          />
        </KeyboardSafeView>
      )}
      <ReportComposerModal
        visible={reportModalVisible}
        targetType="conversation"
        title="Signaler"
        loading={reportLoading}
        reason={reportReason}
        comment={reportComment}
        onChangeReason={setReportReason}
        onChangeComment={setReportComment}
        onCancel={() => !reportLoading && setReportModalVisible(false)}
        onSubmit={handleReportSubmit}
      />
    </Screen>
  );
}

const threadStyles = StyleSheet.create({
  keyboard: { flex: 1, backgroundColor: colors.background },
  listContent: {
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.base,
    flexGrow: 1,
  },
  contentArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    transform: [{ translateY: -24 }],
  },
  threadErrorAction: {
    width: '100%',
    alignItems: 'center',
    minWidth: 200,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.xl,
  },
  emptyTextTitle: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyText: {
    ...typography.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  bubbleWrap: { flexDirection: 'row' },
  bubbleWrapMe: { justifyContent: 'flex-end' },
  bubbleWrapThem: { justifyContent: 'flex-start' },
  skeletonBubble: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 18,
  },
});
