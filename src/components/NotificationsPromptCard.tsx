import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from './Button';
import {
  getPushPermissionStatus,
  getStoredPushToken,
  markPushPromptDismissed,
  registerForPushNotifications,
  shouldShowPushPrompt,
} from '@/services/notifications';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

export function NotificationsPromptCard() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = getStoredPushToken();
    if (token) {
      setVisible(false);
      setFeedback(null);
      return;
    }

    const permissionStatus = await getPushPermissionStatus();
    if (permissionStatus === 'granted') {
      setVisible(false);
      setFeedback(null);
      return;
    }

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
      return;
    }

    if (result.status === 'denied' || result.status === 'unavailable') {
      markPushPromptDismissed();
    }
    setFeedback(result.message);
    setVisible(true);
  }, []);

  const handleDismiss = useCallback(() => {
    markPushPromptDismissed();
    setVisible(false);
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
          <Button variant="primary" size="sm" loading={loading} onPress={handleActivate}>
            Activer
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
