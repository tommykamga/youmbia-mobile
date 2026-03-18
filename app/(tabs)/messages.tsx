import React, { useCallback, useState } from 'react';
import { FlatList, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Loader, EmptyState } from '@/components';
import { getConversations } from '@/services/conversations';
import type { Conversation } from '@/services/conversations/types';
import { spacing, colors, typography, fontWeights, radius } from '@/theme';

function formatInboxDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    if (days === 1) return 'Hier';
    if (days < 7) {
      const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
      return dayNames[d.getDay()];
    }
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

export default function MessagesScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'success' | 'empty'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const fetchInbox = useCallback(async () => {
    try {
      const result = await getConversations();
      if (result.error) {
        setStatus('error');
        return;
      }
      const data = result.data || [];
      setConversations(data);
      setStatus(data.length > 0 ? 'success' : 'empty');
    } catch {
      setStatus('error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchInbox();
    }, [fetchInbox])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchInbox();
    setRefreshing(false);
  }, [fetchInbox]);

  const renderItem = ({ item }: { item: Conversation }) => (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => router.push(`/conversation/${item.id}`)}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {item.other_party_name?.charAt(0).toUpperCase() || '?'}
        </Text>
      </View>
      <View style={styles.body}>
        <View style={styles.header}>
          <Text style={styles.participant} numberOfLines={1}>
            {item.other_party_name || 'Utilisateur'}
          </Text>
          <Text style={styles.date}>{formatInboxDate(item.last_message_at)}</Text>
        </View>
        <Text style={styles.listing} numberOfLines={1}>
          {item.listing_title || 'Annonce'}
        </Text>
        <View style={styles.footer}>
          <Text style={styles.preview} numberOfLines={1}>
            {item.last_message_preview || 'Aucun message'}
          </Text>
          {(item.unread_count ?? 0) > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {item.unread_count! > 9 ? '9+' : item.unread_count}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
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
        <EmptyState
          title="Oups !"
          message="Impossible de charger vos messages pour le moment."
          style={styles.center}
        />
      </Screen>
    );
  }

  if (status === 'empty') {
    return (
      <Screen>
        <EmptyState
          icon={<Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.primary} />}
          title="Aucune conversation"
          message="Contactez un vendeur depuis une annonce pour démarrer une discussion."
          style={styles.center}
        />
      </Screen>
    );
  }

  return (
    <Screen noPadding>
      <FlatList
        data={conversations}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1 },
  list: {
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    padding: spacing.base,
    backgroundColor: colors.surface,
  },
  rowPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    ...typography.base,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  participant: {
    ...typography.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    flex: 1,
    marginRight: spacing.xs,
  },
  date: {
    ...typography.xs,
    color: colors.textMuted,
  },
  listing: {
    ...typography.sm,
    color: colors.primary,
    fontWeight: fontWeights.medium,
    marginBottom: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  preview: {
    ...typography.sm,
    color: colors.textSecondary,
    flex: 1,
    marginRight: spacing.sm,
  },
  badge: {
    backgroundColor: colors.primary,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginLeft: 50 + spacing.sm + spacing.base, // Align with text start
  },
});
