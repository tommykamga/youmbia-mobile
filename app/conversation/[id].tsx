import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  Platform,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, AppHeader, EmptyState, KeyboardSafeView } from '@/components';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import {
  getMessages,
  sendMessage,
  markConversationRead,
  getConversations,
  getConversationById,
} from '@/services/conversations';
import { getSession } from '@/services/auth';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
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
  if (msg.includes('non connecté') || msg.includes('jwt') || msg.includes('auth')) return 'Connexion requise';
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('internet')) return 'Réseau indisponible';
  return fallback;
}

function MessagesSkeleton() {
  return (
    <View style={{ flex: 1, paddingHorizontal: spacing.base, paddingTop: spacing.base }}>
      <View style={[styles.bubbleWrap, styles.bubbleWrapThem, { opacity: 0.6 }]}>
        <View style={[styles.bubble, styles.bubbleThem, { height: 60, width: '60%' }]} />
      </View>
      <View style={[styles.bubbleWrap, styles.bubbleWrapMe, { marginTop: spacing.md, opacity: 0.6 }]}>
        <View style={[styles.bubble, styles.bubbleMe, { height: 40, width: '40%' }]} />
      </View>
      <View style={[styles.bubbleWrap, styles.bubbleWrapThem, { marginTop: spacing.md, opacity: 0.4 }]}>
        <View style={[styles.bubble, styles.bubbleThem, { height: 80, width: '70%' }]} />
      </View>
    </View>
  );
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
  const keyboardInset = useKeyboardInset(Platform.OS !== 'web');

  const load = useCallback(async () => {
    try {
      if (!id) {
        setStatus('error');
        setErrorMessage('Cette conversation est introuvable.');
        return;
      }
      const session = await getSession();
      if (!session?.user) {
        router.replace(
          buildAuthGateHref('messages', { redirect: `/conversation/${id}` })
        );
        return;
      }
      setUserId(session.user.id);
      const [convResult, convListResult, messagesResult] = await Promise.all([
        getConversationById(id),
        getConversations(),
        getMessages(id),
      ]);
      // Vraie erreur Supabase / session invalide lors de l'accès à la conversation.
      if (convResult.error) {
        setStatus('error');
        setErrorMessage(getThreadErrorMessage(convResult.error.message, 'Nous n\'arrivons pas à charger cette discussion.'));
        return;
      }
      // Conversation absente ou non autorisée (RLS masque la ligne) → introuvable.
      if (!convResult.data) {
        setStatus('error');
        setErrorMessage('Cette conversation est introuvable.');
        return;
      }
      const conv = convResult.data;
      setTitle(conv.listing_title ?? conv.other_party_name ?? 'Conversation');
      // Une conversation valide sans message n'est PAS une erreur : on affiche le fil
      // (état vide + champ de saisie actif). Un échec non bloquant du chargement des
      // messages dégrade comme le web : fil vide plutôt qu'écran d'erreur.
      setMessages(messagesResult.data ?? []);
      void syncMessageNotificationSnapshot(convListResult.data ?? []);
      setStatus('success');
    } catch {
      setStatus('error');
      setErrorMessage('Une erreur inattendue est survenue.');
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  // Refetch silencieux : capte l'évolution de read_at (ex. l'autre partie a lu nos
  // messages) sans repasser par l'état de chargement, donc sans flicker.
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

  // Canal Realtime global (INSERT/UPDATE) — fil ouvert + accusés de lecture.
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
        Alert.alert('Erreur', 'Votre message n\'a pas pu être envoyé. Veuillez réessayer.');
        return;
      }
      if (result.data) {
        setMessages((prev) => appendMessageDeduped(prev, result.data!));
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (error) {
      setInputText(trimmed);
      if (__DEV__) console.error('[MESSAGING ERROR]', error);
      Alert.alert('Erreur', 'Votre message n\'a pas pu être envoyé. Veuillez réessayer.');
    } finally {
      setSending(false);
    }
  }, [id, inputText, sending]);

  const keyExtractor = useCallback((item: Message) => item.id, []);
  
  const listEmptyComponent = useCallback(
    () => (
      <View style={styles.emptyWrap}>
        <Ionicons name="chatbubbles-outline" size={48} color={colors.primaryLight} style={{ marginBottom: spacing.sm }} />
        <Text style={styles.emptyTextTitle}>Aucun message</Text>
        <Text style={styles.emptyText}>Lancez la discussion en envoyant votre premier message ci-dessous.</Text>
      </View>
    ),
    []
  );

  // Confirmation de lecture affichée uniquement sous le DERNIER message envoyé par
  // l'utilisateur connecté (évite de surcharger l'interface).
  const lastSentMessageId = useMemo(() => {
    if (!userId) return null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].sender_id === userId) return messages[i].id;
    }
    return null;
  }, [messages, userId]);

  const renderItemWithUser = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isMe = item.sender_id === userId;
      // Show spacing if previous message was from a different sender
      const prevMsg = messages[index - 1];
      const showExtraSpace = prevMsg && prevMsg.sender_id !== item.sender_id;
      const showReadStatus = isMe && item.id === lastSentMessageId;

      return (
        <View style={[
          styles.bubbleWrap, 
          isMe ? styles.bubbleWrapMe : styles.bubbleWrapThem,
          { marginTop: showExtraSpace ? spacing.md : spacing.xs }
        ]}>
          <View style={[styles.bubbleColumn, { alignItems: isMe ? 'flex-end' : 'flex-start' }]}>
            <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
              <Text style={isMe ? styles.bubbleTextMe : styles.bubbleText}>{item.body}</Text>
              <Text style={[styles.bubbleTime, isMe && { color: 'rgba(255,255,255,0.7)' }]}>
                {formatMessageTime(item.created_at)}
              </Text>
            </View>
            {showReadStatus && (
              <Text style={styles.readStatus}>{item.read_at ? 'Lu' : 'Envoyé'}</Text>
            )}
          </View>
        </View>
      );
    },
    [userId, messages, lastSentMessageId]
  );

  if (status === 'error') {
    return (
      <Screen safe={false}>
        <AppHeader title="Conversation" showBack noBorder density="compact" />
        <View style={styles.contentArea}>
          <EmptyState
            variant="plain"
            icon={<Ionicons name="alert-circle-outline" size={24} color={colors.textSecondary} />}
            title="Erreur de chargement"
            message={errorMessage}
          />
        </View>
      </Screen>
    );
  }

  const inputPaddingBottom =
    keyboardInset > 0 ? 0 : insets.bottom > 0 ? insets.bottom : spacing.base;

  return (
    <Screen scroll={false} noPadding safe={false}>
      <AppHeader title={title} showBack noBorder density="compact" />
      
      {status === 'loading' && <MessagesSkeleton />}

      {status === 'success' && (
        <KeyboardSafeView style={styles.keyboard}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={keyExtractor}
            renderItem={renderItemWithUser}
            ListEmptyComponent={listEmptyComponent}
            contentContainerStyle={[styles.listContent, { paddingBottom: spacing.lg }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              if (messages.length > 0) listRef.current?.scrollToEnd({ animated: true });
            }}
          />
          <View style={[styles.inputContainer, { paddingBottom: inputPaddingBottom }]}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Écrivez un message…"
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
                <Ionicons name="paper-plane" size={20} color={colors.surface} />
              </Pressable>
            </View>
          </View>
        </KeyboardSafeView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1, backgroundColor: colors.background },
  listContent: {
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    flexGrow: 1,
  },
  contentArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl, // ~24
    paddingBottom: spacing.xl,
    transform: [{ translateY: -24 }],
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
  bubbleWrap: {
    flexDirection: 'row',
  },
  bubbleWrapMe: {
    justifyContent: 'flex-end',
  },
  bubbleWrapThem: {
    justifyContent: 'flex-start',
  },
  bubbleColumn: {
    maxWidth: '85%',
  },
  bubble: {
    maxWidth: '100%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleMe: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  bubbleText: {
    ...typography.base,
    color: colors.text,
    lineHeight: 22,
  },
  bubbleTextMe: {
    ...typography.base,
    color: colors.surface,
    lineHeight: 22,
  },
  bubbleTime: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  readStatus: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: 2,
    marginRight: 4,
  },
  inputContainer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 22,
    paddingHorizontal: spacing.lg,
    paddingTop: 12, // Needs explicit padding for multiline to center align visually
    paddingBottom: 12,
    ...typography.base,
    color: colors.text,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  sendBtnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
  sendBtnDisabled: {
    opacity: 0.5,
    backgroundColor: colors.textMuted,
    shadowOpacity: 0,
    elevation: 0,
  },
});
