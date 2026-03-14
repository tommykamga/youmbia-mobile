/**
 * Inbox screen – list of conversations with unread state.
 * Auth-gated (tab is protected); redirect to login when not authenticated.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, Loader, EmptyState, Button } from '@/components';
import { getConversations } from '@/services/conversations';
import { getSession } from '@/services/auth';
import type { Conversation } from '@/services/conversations';
import { formatListingDate } from '@/lib/format';
import { spacing, colors, typography, fontWeights } from '@/theme';

type InboxState =
  | { status: 'loading' }
  | { status: 'redirect' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: Conversation[] };

export default function MessagesScreen() {
  const router = useRouter();
  const [state, setState] = useState<InboxState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const session = await getSession();
    if (!session?.user) {
      setState({ status: 'redirect' });
      return;
    }
    const result = await getConversations();
    if (result.error) {
      setState({ status: 'error', message: result.error.message });
      return;
    }
    const list = result.data ?? [];
    setState(
      list.length === 0
        ? { status: 'empty' }
        : { status: 'success', data: list }
    );
  }, []);

  useEffect(() => {
    load().then(() => setRefreshing(false));
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (state.status === 'success' || state.status === 'empty') {
        load();
      }
    }, [load, state.status])
  );

  useEffect(() => {
    if (state.status === 'redirect') {
      router.replace(`/(auth)/login?redirect=${encodeURIComponent('/(tabs)/messages')}`);
    }
  }, [state.status, router]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const handleConversationPress = useCallback(
    (conv: Conversation) => {
      router.push(`/conversation/${conv.id}` as const);
    },
    [router]
  );

  const keyExtractor = useCallback((item: Conversation) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => handleConversationPress(item)}
      >
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {item.other_party_name ?? 'Utilisateur'}
          </Text>
          <Text style={styles.listing} numberOfLines={1}>
            {item.listing_title ?? 'Annonce'}
          </Text>
          {item.last_message_preview ? (
            <Text style={styles.preview} numberOfLines={1}>
              {item.last_message_preview}
            </Text>
          ) : null}
        </View>
        <View style={styles.meta}>
          {item.last_message_at ? (
            <Text style={styles.date}>
              {formatListingDate(item.last_message_at)}
            </Text>
          ) : null}
          {(item.unread_count ?? 0) > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {item.unread_count! > 99 ? '99+' : item.unread_count}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    ),
    [handleConversationPress]
  );
  const itemSeparator = useCallback(() => <View style={styles.separator} />, []);

  if (state.status === 'loading' || state.status === 'redirect') {
    return (
      <Screen>
        <Loader />
      </Screen>
    );
  }

  if (state.status === 'error') {
    return (
      <Screen>
        <EmptyState title="Erreur" message={state.message} style={styles.center} />
      </Screen>
    );
  }

  if (state.status === 'empty') {
    return (
      <Screen>
        <EmptyState
          icon={<Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.primary} />}
          title="Aucune conversation"
          message="Contactez un vendeur pour demarrer une discussion."
          action={
            <View style={styles.emptyAction}>
              <Button variant="secondary" onPress={() => router.replace('/(tabs)/home')}>
                Explorer les annonces
              </Button>
            </View>
          }
          style={styles.center}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={state.data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={itemSeparator}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={6}
        windowSize={6}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1 },
  listContent: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderLight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.base,
    paddingHorizontal: 0,
  },
  rowPressed: {
    opacity: 0.9,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...typography.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  listing: {
    ...typography.sm,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  preview: {
    ...typography.sm,
    color: colors.textMuted,
  },
  meta: {
    alignItems: 'flex-end',
    marginLeft: spacing.base,
  },
  date: {
    ...typography.xs,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  badge: {
    backgroundColor: colors.primary,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    ...typography.xs,
    fontWeight: fontWeights.bold,
    color: colors.surface,
  },
  emptyAction: {
    minWidth: 220,
  },
});
