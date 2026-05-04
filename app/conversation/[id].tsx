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
import { Screen, AppHeader, EmptyState } from '@/components';
import {
  getMessages,
  sendMessage,
  markConversationRead,
  getConversations,
} from '@/services/conversations';
import { getSession } from '@/services/auth';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
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
      const [convResult, messagesResult] = await Promise.all([
        getConversations(),
        getMessages(id),
      ]);
      if (convResult.error || messagesResult.error) {
        const error = convResult.error || messagesResult.error;
        setStatus('error');
        setErrorMessage(getThreadErrorMessage(error!.message, 'Nous n\'arrivons pas à charger cette discussion.'));
        return;
      }
      const conv = convResult.data?.find((c) => c.id === id);
      setTitle(conv?.listing_title ?? conv?.other_party_name ?? 'Conversation');
      setMessages(messagesResult.data ?? []);
      void syncMessageNotificationSnapshot(convResult.data ?? []);
      setStatus('success');
    } catch {
      setStatus('error');
      setErrorMessage('Une erreur inattendue est survenue.');
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
        Alert.alert('Erreur', getThreadErrorMessage(result.error.message, "Impossible d'envoyer le message."));
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

  const renderItemWithUser = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isMe = item.sender_id === userId;
      // Show spacing if previous message was from a different sender
      const prevMsg = messages[index - 1];
      const showExtraSpace = prevMsg && prevMsg.sender_id !== item.sender_id;
      
      return (
        <View style={[
          styles.bubbleWrap, 
          isMe ? styles.bubbleWrapMe : styles.bubbleWrapThem,
          { marginTop: showExtraSpace ? spacing.md : spacing.xs }
        ]}>
          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
            <Text style={isMe ? styles.bubbleTextMe : styles.bubbleText}>{item.body}</Text>
            <Text style={[styles.bubbleTime, isMe && { color: 'rgba(255,255,255,0.7)' }]}>
              {formatMessageTime(item.created_at)}
            </Text>
          </View>
        </View>
      );
    },
    [userId, messages]
  );

  if (status === 'error') {
    return (
      <Screen>
        <AppHeader title="Conversation" showBack noBorder />
        <EmptyState 
          icon={<Ionicons name="alert-circle-outline" size={56} color={colors.textSecondary} />}
          title="Erreur de chargement" 
          message={errorMessage} 
          style={styles.center} 
        />
      </Screen>
    );
  }

  const inputPaddingBottom = insets.bottom > 0 ? insets.bottom : spacing.base;

  return (
    <Screen scroll={false} noPadding>
      <AppHeader title={title} showBack noBorder />
      
      {status === 'loading' && <MessagesSkeleton />}

      {status === 'success' && (
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
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, paddingTop: spacing['3xl'] },
  keyboard: { flex: 1, backgroundColor: colors.background },
  listContent: {
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    flexGrow: 1,
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
  bubble: {
    maxWidth: '85%',
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
