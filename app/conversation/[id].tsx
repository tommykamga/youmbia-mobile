/**
 * Thread screen – messages for a conversation, send input, mark as read on focus.
 */

import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, AppHeader, Loader, EmptyState } from '@/components';
import {
  getMessages,
  sendMessage,
  markConversationRead,
  getConversations,
} from '@/services/conversations';
import { getSession } from '@/services/auth';
import { markConversationNotificationAsRead, syncMessageNotificationSnapshot } from '@/services/messageNotifications';
import type { Message } from '@/services/conversations';
import { spacing, colors, typography, fontWeights, radius } from '@/theme';

function formatMessageTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return `Hier ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' +
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function getThreadErrorMessage(message: string, fallback: string): string {
  const msg = message.toLowerCase();
  if (msg.includes('non connecté') || msg.includes('jwt') || msg.includes('auth')) {
    return 'Connexion requise';
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('internet')) {
    return 'Réseau indisponible';
  }
  return fallback;
}

export default function ConversationThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [title, setTitle] = useState<string>('Conversation');
  const [status, setStatus] = useState<'loading' | 'error' | 'success'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      if (!id) {
        setStatus('error');
        setErrorMessage('Conversation introuvable');
        return;
      }
      const session = await getSession();
      if (!session?.user) {
        router.replace(`/(auth)/login?redirect=${encodeURIComponent(`/conversation/${id}`)}`);
        return;
      }
      setUserId(session.user.id);
      const [convResult, messagesResult] = await Promise.all([
        getConversations(),
        getMessages(id),
      ]);
      if (convResult.error) {
        setStatus('error');
        setErrorMessage(
          getThreadErrorMessage(convResult.error.message, 'Impossible de charger la conversation.')
        );
        return;
      }
      if (messagesResult.error) {
        setStatus('error');
        setErrorMessage(
          getThreadErrorMessage(messagesResult.error.message, 'Impossible de charger la conversation.')
        );
        return;
      }
      const conv = convResult.data?.find((c) => c.id === id);
      setTitle(conv?.listing_title ?? conv?.other_party_name ?? 'Conversation');
      setMessages(messagesResult.data ?? []);
      void syncMessageNotificationSnapshot(convResult.data ?? []);
      setStatus('success');
    } catch {
      setStatus('error');
      setErrorMessage('Impossible de charger la conversation.');
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (id && status === 'success') {
        void markConversationRead(id)
          .then(() => markConversationNotificationAsRead(id))
          .catch(() => {});
      }
    }, [id, status])
  );

  const handleSend = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!id || sending || !trimmed) return;
    setSending(true);
    setInputText('');
    try {
      const result = await sendMessage(id, trimmed);
      if (result.error) {
        setInputText(trimmed);
        Alert.alert(
          'Erreur',
          getThreadErrorMessage(result.error.message, "Impossible d'envoyer le message.")
        );
        return;
      }
      if (result.data) {
        setMessages((prev) => [...prev, result.data!]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch {
      setInputText(trimmed);
      Alert.alert('Erreur', 'Impossible d\'envoyer le message.');
    } finally {
      setSending(false);
    }
  }, [id, inputText, sending]);

  const keyExtractor = useCallback((item: Message) => item.id, []);
  const itemSeparator = useCallback(() => <View style={styles.separator} />, []);

  const listEmptyComponent = useCallback(
    () => (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>Aucun message. Envoyez le premier message.</Text>
      </View>
    ),
    []
  );

  const renderItemWithUser = useCallback(
    ({ item }: { item: Message }) => {
      const isMe = item.sender_id === userId;
      return (
        <View style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapThem]}>
          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
            <Text style={isMe ? styles.bubbleTextMe : styles.bubbleText}>{item.body}</Text>
            <Text style={[styles.bubbleTime, isMe && { color: 'rgba(255,255,255,0.8)' }]}>
              {formatMessageTime(item.created_at)}
            </Text>
          </View>
        </View>
      );
    },
    [userId]
  );

  if (status === 'loading') {
    return (
      <Screen>
        <Loader />
      </Screen>
    );
  }

  if (status === 'error') {
    return (
      <Screen>
        <AppHeader title="Conversation" showBack />
        <EmptyState title="Erreur" message={errorMessage} style={styles.center} />
      </Screen>
    );
  }

  const inputPaddingBottom = insets.bottom > 0 ? insets.bottom : spacing.base;

  return (
    <Screen scroll={false} noPadding>
      <AppHeader title={title} showBack />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={keyExtractor}
          renderItem={renderItemWithUser}
          ItemSeparatorComponent={itemSeparator}
          ListEmptyComponent={listEmptyComponent}
          contentContainerStyle={[styles.listContent, { paddingBottom: spacing.base }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
        <View style={[styles.inputRow, { paddingBottom: inputPaddingBottom }]}>
          <TextInput
            style={styles.input}
            placeholder="Votre message…"
            placeholderTextColor={colors.textMuted}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={2000}
            editable={!sending}
          />
          <Pressable
            style={({ pressed }) => [
              styles.sendBtn,
              pressed && styles.sendBtnPressed,
              (!inputText.trim() || sending) && styles.sendBtnDisabled,
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            <Text style={styles.sendLabel}>Envoyer</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1 },
  keyboard: { flex: 1 },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    flexGrow: 1,
  },
  emptyWrap: {
    paddingVertical: spacing['2xl'],
    alignItems: 'center',
  },
  emptyText: {
    ...typography.sm,
    color: colors.textMuted,
  },
  separator: {
    height: spacing.sm,
  },
  bubbleWrap: {
    flexDirection: 'row',
  },
  bubbleWrapMe: {
    justifyContent: 'flex-end',
  },
  bubbleWrapThem: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.xl,
  },
  bubbleMe: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: radius.sm,
  },
  bubbleThem: {
    backgroundColor: colors.surfaceSubtle,
    borderBottomLeftRadius: radius.sm,
  },
  bubbleText: {
    ...typography.base,
    color: colors.text,
  },
  bubbleTextMe: {
    ...typography.base,
    color: colors.surface,
  },
  bubbleTime: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    ...typography.base,
    color: colors.text,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.lg,
    justifyContent: 'center',
    minHeight: 44,
  },
  sendBtnPressed: {
    opacity: 0.9,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendLabel: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.surface,
  },
});
