import React, { useCallback, useState } from 'react';
import { FlatList, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, EmptyState, Button, AppHeader } from '@/components';
import { getSession } from '@/services/auth';
import { getConversations } from '@/services/conversations';
import type { Conversation } from '@/services/conversations/types';
import { spacing, colors, typography, fontWeights, radius } from '@/theme';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, withSpring } from 'react-native-reanimated';

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

function MessagesSkeleton() {
  return (
    <View style={styles.list}>
      {[...Array(5)].map((_, i) => (
        <View key={i} style={[styles.row, { paddingVertical: spacing.lg }]}>
          <View style={[styles.avatar, { backgroundColor: colors.surfaceSubtle }]} />
          <View style={styles.body}>
            <View style={[styles.header, { marginBottom: 8 }]}>
              <View style={{ height: 16, width: '40%', backgroundColor: colors.surfaceSubtle, borderRadius: radius.sm }} />
              <View style={{ height: 12, width: '15%', backgroundColor: colors.surfaceSubtle, borderRadius: radius.sm }} />
            </View>
            <View style={{ height: 14, width: '60%', backgroundColor: colors.surfaceSubtle, borderRadius: radius.sm, marginBottom: 8 }} />
            <View style={{ height: 14, width: '85%', backgroundColor: colors.surfaceSubtle, borderRadius: radius.sm }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function MessagesScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [status, setStatus] = useState<'loading' | 'error_network' | 'error_generic' | 'success' | 'empty' | 'unauthenticated'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const fetchInbox = useCallback(async () => {
    try {
      const session = await getSession();
      if (!session?.user) {
        setStatus('unauthenticated');
        return;
      }
      const result = await getConversations();
      if (result.error) {
        const msg = String(result.error.message).toLowerCase();
        if (msg.includes('network') || msg.includes('réseau') || msg.includes('fetch')) {
          setStatus('error_network');
        } else {
          setStatus('error_generic');
        }
        return;
      }
      const data = result.data || [];
      // Sort by last message, otherwise created_at
      data.sort((a, b) => {
        const dA = new Date(a.last_message_at || a.created_at).getTime();
        const dB = new Date(b.last_message_at || b.created_at).getTime();
        return dB - dA;
      });
      setConversations(data);
      setStatus(data.length > 0 ? 'success' : 'empty');
    } catch (e: any) {
      const msg = String(e?.message || e).toLowerCase();
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchInbox();
    setRefreshing(false);
  }, [fetchInbox]);

  const MessageItem = ({ item }: { item: Conversation }) => {
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }]
    }));

    const onPressIn = () => {
      scale.value = withTiming(0.98, { duration: 100, easing: Easing.out(Easing.quad) });
    };
    const onPressOut = () => {
      scale.value = withSpring(1);
    };

    return (
      <Animated.View style={animatedStyle}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
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
              <Text style={styles.date}>{formatInboxDate(item.last_message_at || item.created_at)}</Text>
            </View>
            <Text style={styles.listing} numberOfLines={1}>
              {item.listing_title || 'Annonce supprimée'}
            </Text>
            <View style={styles.footer}>
              <Text style={[styles.preview, (item.unread_count ?? 0) > 0 && styles.previewUnread]} numberOfLines={1}>
                {item.last_message_preview || 'Démarrer la conversation'}
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
      </Animated.View>
    );
  };

  const renderItem = ({ item }: { item: Conversation }) => <MessageItem item={item} />;

  if (status === 'unauthenticated') {
    return <Redirect href={buildAuthGateHref('messages')} />;
  }

  return (
    <Screen noPadding>
      <AppHeader title="Boîte de réception" noBorder />
      
      {status === 'loading' && <MessagesSkeleton />}


      {status === 'error_network' && (
        <EmptyState
          icon={<Ionicons name="cloud-offline-outline" size={56} color={colors.error} />}
          title="Internet indisponible"
          message="Vérifiez votre connexion réseau puis rechargez vos messages."
          action={
            <View style={styles.emptyAction}>
              <Button variant="secondary" onPress={() => fetchInbox()}>
                Réessayer
              </Button>
            </View>
          }
          style={styles.center}
        />
      )}

      {status === 'error_generic' && (
        <EmptyState
          icon={<Ionicons name="alert-circle-outline" size={56} color={colors.textSecondary} />}
          title="Oups ! Erreur serveur"
          message="Nous n'arrivons pas à charger vos conversations. Nos équipes sont sur le coup."
          action={
            <View style={styles.emptyAction}>
              <Button variant="secondary" onPress={() => fetchInbox()}>
                Réessayer
              </Button>
            </View>
          }
          style={styles.center}
        />
      )}

      {status === 'empty' && (
        <EmptyState
          icon={<Ionicons name="chatbubbles-outline" size={56} color={colors.primary} />}
          title="Aucun message"
          message="C'est bien calme ici. Vos futurs échanges avec les acheteurs et vendeurs apparaîtront dans cette boîte de réception."
          style={styles.center}
        />
      )}

      {status === 'success' && (
        <FlatList
          data={conversations}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, paddingTop: spacing['3xl'] },
  emptyAction: { minWidth: 220, marginTop: spacing.lg },
  list: {
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  rowPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EEF2FF', // Soft indigo background
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.base,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  avatarText: {
    ...typography.lg,
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
    fontWeight: fontWeights.bold, // Bolder for premium look
    color: colors.text,
    flex: 1,
    marginRight: spacing.xs,
    letterSpacing: -0.2, // Tighter letter spacing
  },
  date: {
    ...typography.xs,
    color: colors.textTertiary,
  },
  listing: {
    ...typography.sm,
    color: colors.textSecondary,
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
    color: colors.textMuted,
    flex: 1,
    marginRight: spacing.sm,
  },
  previewUnread: {
    color: colors.text,
    fontWeight: fontWeights.bold, // Unread messages have bold preview
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
    color: 'white',
    fontSize: 11,
    fontWeight: fontWeights.bold,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginLeft: 56 + spacing.base + spacing.base, // Align with text start
  },
});
