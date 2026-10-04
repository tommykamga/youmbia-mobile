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
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

/**
 * Point d'activation des notifications (écran Compte).
 * - granted      : masquée (resync silencieux du token).
 * - askable      : carte "Activer les notifications".
 * - blocked      : carte "Ouvrir les réglages".
 * - unavailable  : cause technique explicite, sans faux CTA d'activation.
 * N'affiche jamais de popup agressive et ne bloque jamais l'écran.
 */
export function NotificationsActivationCard() {
  const [visible, setVisible] = useState(false);
  const [permission, setPermission] = useState<PushPermissionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<PushRegistrationFailure | null>(null);

  const refresh = useCallback(async () => {
    const next = await getPushPermissionSnapshot();
    setPermission(next);
    setFailure(next.failure ?? null);
    if (next.status === 'granted') {
      const result = await syncPushTokenIfGranted();
      if (result.ok && result.status === 'registered') {
        setFailure(null);
        setVisible(false);
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
    try {
      const result = await registerForPushNotifications();
      if (result.ok) {
        setPermission({ status: 'granted', canAskAgain: false });
        setFailure(null);
        setVisible(false);
        return;
      }
      setFailure(result);
      setPermission(await getPushPermissionSnapshot());
      setVisible(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpenSettings = useCallback(() => {
    void openPushNotificationSettings();
  }, []);

  const handleDismiss = useCallback(() => {
    markPushPromptDismissed();
    setVisible(false);
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
    <View style={styles.wrapper}>
      <View style={styles.card}>
        <View
          style={[
            styles.iconWrap,
            cardState.kind === 'activate' ? styles.iconWrapPrimary : null,
          ]}
        >
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
              <Button variant="primary" size="sm" loading={loading} onPress={handlePrimaryAction}>
                {primaryLabel}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onPress={handleDismiss} disabled={loading}>
              Plus tard
            </Button>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing.base,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.base,
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
    backgroundColor: colors.surfaceSubtle,
  },
  iconWrapPrimary: {
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
