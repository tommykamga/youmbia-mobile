import React, { useCallback, useState } from 'react';
import { Linking, View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from './Button';
import {
  getDetailedPushPermissionStatus,
  markPushPromptDismissed,
  registerForPushNotifications,
  shouldShowPushPrompt,
  syncPushTokenIfGranted,
} from '@/services/notifications';
import { getSession } from '@/services/auth';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

export function NotificationsPromptCard() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [needsSettings, setNeedsSettings] = useState(false);

  const refresh = useCallback(async () => {
    const session = await getSession();
    if (!session?.user) {
      setVisible(false);
      setFeedback(null);
      setNeedsSettings(false);
      return;
    }

    const permissionStatus = await getDetailedPushPermissionStatus();
    if (permissionStatus === 'granted') {
      const result = await syncPushTokenIfGranted();
      if (result.ok && result.status === 'registered') {
        setVisible(false);
        setFeedback(null);
        setNeedsSettings(false);
      } else if (!result.ok) {
        setFeedback("Impossible d'enregistrer les notifications. Réessayez.");
        setVisible(true);
      }
      return;
    }

    setNeedsSettings(permissionStatus === 'blocked');
    setVisible(shouldShowPushPrompt());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleActivate = useCallback(async () => {
    setLoading(true);
    const result = await registerForPushNotifications();
    setLoading(false);

    if (result.ok) {
      setVisible(false);
      setFeedback(null);
      setNeedsSettings(false);
      return;
    }

    setNeedsSettings(result.status === 'blocked');

    if (
      result.status === 'denied' ||
      result.status === 'blocked' ||
      result.status === 'unavailable'
    ) {
      markPushPromptDismissed();
    }
    setFeedback(result.message);
    setVisible(true);
  }, []);

  const handleDismiss = useCallback(() => {
    markPushPromptDismissed();
    setVisible(false);
  }, []);

  const handleOpenSettings = useCallback(() => {
    void Linking.openSettings().catch((error) => {
      console.error('[notifications] open_settings_failed', error);
    });
  }, []);

  if (!visible) return null;

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name="notifications-outline" size={20} color={colors.primary} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>Activez les notifications</Text>
        <Text style={styles.message}>
          Activez les notifications pour etre alerte des nouveaux messages et annonces.
        </Text>
        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
        <View style={styles.actions}>
          <Button
            variant="primary"
            size="sm"
            loading={loading}
            onPress={needsSettings ? handleOpenSettings : handleActivate}
          >
            {needsSettings ? 'Ouvrir les réglages' : 'Activer'}
          </Button>
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
  feedback: {
    ...typography.xs,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.base,
  },
});
