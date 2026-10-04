import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from './Button';
import {
  getPushActivationCardState,
  getPushPermissionSnapshot,
  markPushPromptDismissed,
  openPushNotificationSettings,
  registerForPushNotifications,
  shouldShowPushPrompt,
  syncPushTokenIfGranted,
  type PushPermissionSnapshot,
  type PushRegistrationFailure,
} from '@/services/notifications';
import { getSession } from '@/services/auth';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

export function NotificationsPromptCard() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<PushPermissionSnapshot | null>(null);
  const [failure, setFailure] = useState<PushRegistrationFailure | null>(null);

  const refresh = useCallback(async () => {
    const session = await getSession();
    if (!session?.user) {
      setVisible(false);
      setPermission(null);
      setFailure(null);
      return;
    }

    const nextPermission = await getPushPermissionSnapshot();
    setPermission(nextPermission);
    setFailure(nextPermission.failure ?? null);
    if (nextPermission.status === 'granted') {
      const result = await syncPushTokenIfGranted();
      if (result.ok && result.status === 'registered') {
        setVisible(false);
        setFailure(null);
      } else if (!result.ok) {
        setFailure(result);
        setVisible(shouldShowPushPrompt());
      } else {
        setVisible(false);
      }
      return;
    }

    setVisible(shouldShowPushPrompt());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const handleActivate = useCallback(async () => {
    setLoading(true);
    const result = await registerForPushNotifications();
    setLoading(false);

    if (result.ok) {
      setVisible(false);
      setFailure(null);
      setPermission({ status: 'granted', canAskAgain: false });
      return;
    }

    setFailure(result);
    setPermission(await getPushPermissionSnapshot());
    setVisible(true);
  }, []);

  const handleDismiss = useCallback(() => {
    markPushPromptDismissed();
    setVisible(false);
  }, []);

  const handleOpenSettings = useCallback(() => {
    void openPushNotificationSettings();
  }, []);

  if (!visible) return null;

  const cardState = getPushActivationCardState(permission, failure);
  if (cardState.kind === 'hidden') return null;

  const handlePrimaryAction =
    cardState.primaryAction === 'settings' ? handleOpenSettings : handleActivate;
  const primaryLabel =
    cardState.primaryAction === 'settings'
      ? 'Ouvrir les réglages'
      : cardState.primaryAction === 'retry'
        ? 'Réessayer'
        : 'Activer';

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons
          name={cardState.kind === 'activate' ? 'notifications-outline' : 'notifications-off-outline'}
          size={20}
          color={cardState.kind === 'activate' ? colors.primary : colors.textSecondary}
        />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{cardState.title}</Text>
        <Text style={styles.message}>{cardState.message}</Text>
        <View style={styles.actions}>
          {cardState.primaryAction ? (
            <Button
              variant="primary"
              size="sm"
              loading={loading}
              onPress={handlePrimaryAction}
            >
              {primaryLabel}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onPress={handleDismiss} disabled={loading}>
            Plus tard
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.base,
    marginBottom: spacing.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '14',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typography.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  message: {
    ...typography.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.base,
  },
});
