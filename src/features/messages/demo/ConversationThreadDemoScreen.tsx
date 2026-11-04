import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, KeyboardSafeView } from '@/components';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import type { Conversation, Message } from '@/services/conversations/types';
import { spacing, colors, typography, fontWeights } from '@/theme';
import { ConversationHeader } from '@/features/conversation/ConversationHeader';
import { ConversationListingBanner } from '@/features/conversation/ConversationListingBanner';
import { ConversationMessageBubble } from '@/features/conversation/ConversationMessageBubble';
import { ConversationComposer } from '@/features/conversation/ConversationComposer';
import {
  formatMessageDaySeparator,
  isSameCalendarDay,
} from '@/features/conversation/conversationThreadDisplay';
import {
  createDemoThreadMessages,
  createLocalDemoSentMessage,
  DEMO_THREAD_VIEWER_ID,
} from '@/features/messages/demo/messagesThreadDemoFixtures';

type Props = {
  conversation: Conversation;
  listingThumbUrl?: string | null;
  listingPriceLabel?: string | null;
  onClose: () => void;
};

/**
 * Prévisualisation fil premium UI-MESSAGES-02 — mémoire locale uniquement (__DEV__ / démo inbox).
 */
export function ConversationThreadDemoScreen({
  conversation,
  listingThumbUrl,
  listingPriceLabel,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset(Platform.OS !== 'web');
  const listRef = useRef<FlatList>(null);
  const [messages, setMessages] = useState<Message[]>(() =>
    createDemoThreadMessages(conversation.id)
  );
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  const peerName = conversation.other_party_name?.trim() || 'Utilisateur';
  const listingTitle = conversation.listing_title?.trim() || 'Annonce supprimée';
  const keyboardVerticalOffset = insets.top + 118;

  const lastSentMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].sender_id === DEMO_THREAD_VIEWER_ID) return messages[i].id;
    }
    return null;
  }, [messages]);

  const handleSendLocal = useCallback(() => {
    const trimmed = inputText.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setInputText('');
    const next = createLocalDemoSentMessage(conversation.id, trimmed);
    setMessages((prev) => [...prev, next]);
    setSending(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [conversation.id, inputText, sending]);

  const renderItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isMe = item.sender_id === DEMO_THREAD_VIEWER_ID;
      const prevMsg = messages[index - 1];
      const showExtraSpace = prevMsg && prevMsg.sender_id !== item.sender_id;
      const daySeparatorLabel =
        !prevMsg || !isSameCalendarDay(prevMsg.created_at, item.created_at)
          ? formatMessageDaySeparator(item.created_at)
          : null;
      return (
        <ConversationMessageBubble
          message={item}
          isMe={isMe}
          showReadStatus={isMe && item.id === lastSentMessageId}
          daySeparatorLabel={daySeparatorLabel}
          extraTopMargin={!!showExtraSpace}
        />
      );
    },
    [messages, lastSentMessageId]
  );

  const inputPaddingBottom =
    keyboardInset > 0 ? spacing.sm : insets.bottom > 0 ? insets.bottom : spacing.base;

  return (
    <Screen scroll={false} noPadding safe={false}>
      <ConversationHeader
        peerName={peerName}
        onBackPress={onClose}
        showReport={false}
      />
      <Text style={styles.banner} accessibilityRole="text">
        Prévisualisation fil — aucun envoi Supabase
      </Text>
      <ConversationListingBanner
        listingTitle={listingTitle}
        priceLabel={listingPriceLabel}
        thumbUrl={listingThumbUrl}
        thumbPending={false}
        onPress={() =>
          Alert.alert(
            'Annonce fictive',
            'Navigation vers la fiche désactivée en prévisualisation locale.'
          )
        }
      />
      <KeyboardSafeView style={styles.flex} keyboardVerticalOffset={keyboardVerticalOffset}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            if (messages.length > 0) listRef.current?.scrollToEnd({ animated: false });
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Fil vide (démo)</Text>
              <Text style={styles.emptyBody}>
                Envoyez un message simulé ci-dessous — stockage mémoire uniquement.
              </Text>
            </View>
          }
        />
        <ConversationComposer
          value={inputText}
          onChangeText={setInputText}
          onSend={handleSendLocal}
          sending={sending}
          paddingBottom={inputPaddingBottom}
        />
      </KeyboardSafeView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  banner: {
    backgroundColor: colors.warningLight,
    color: colors.badgeWarningText,
    paddingHorizontal: spacing.screenHorizontal,
    paddingVertical: spacing.xs,
    ...typography.xs,
    fontWeight: fontWeights.semibold,
  },
  listContent: {
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.base,
    paddingBottom: spacing.lg,
    flexGrow: 1,
  },
  empty: {
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  emptyTitle: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyBody: {
    ...typography.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
