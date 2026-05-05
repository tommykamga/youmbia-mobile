import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, AppHeader } from '@/components';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

export default function NotificationsScreen() {
  const router = useRouter();

  const goToSavedSearches = useCallback(() => {
    router.push('/account/saved-searches' as any);
  }, [router]);

  return (
    <Screen>
      <AppHeader title="Notifications" showBack />
      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.icon}>
            <Ionicons name="notifications-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.body}>
            <Text style={styles.title}>Restez informé</Text>
            <Text style={styles.subtitle}>
              Retrouvez ici vos alertes et informations importantes. Les messages restent accessibles via l’onglet “Messages”.
            </Text>
          </View>
        </View>

        <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={goToSavedSearches}>
          <View style={styles.rowIcon}>
            <Ionicons name="search-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>Alertes de recherches</Text>
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              Gérer vos alertes et notifications liées aux recherches
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.base,
    gap: spacing.base,
  },
  card: {
    flexDirection: 'row',
    gap: spacing.base,
    padding: spacing.base,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '12',
    borderWidth: 1,
    borderColor: colors.primary + '22',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    ...typography.base,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  subtitle: {
    ...typography.sm,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    padding: spacing.base,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  rowPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  rowSubtitle: {
    ...typography.xs,
    color: colors.textMuted,
  },
});

