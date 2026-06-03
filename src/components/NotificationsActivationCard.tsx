import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from './Button';
import {
  getDetailedPushPermissionStatus,
  registerForPushNotifications,
  syncPushTokenIfGranted,
  type DetailedPushPermission,
} from '@/services/notifications';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

/**
 * Point d'activation des notifications (écran Compte).
 * - granted      : masquée (resync silencieux du token).
 * - undetermined : carte premium "Activer les notifications".
 * - denied       : carte discrète "Ouvrir les réglages".
 * - unavailable  : masquée (Expo Go / non-device).
 * N'affiche jamais de popup agressive et ne bloque jamais l'écran.
 */
export function NotificationsActivationCard() {
  const [status, setStatus] = useState<DetailedPushPermission | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const next = await getDetailedPushPermissionStatus();
    setStatus(next);
    if (next === 'granted') {
      void syncPushTokenIfGranted();
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const handleActivate = useCallback(async () => {
    setLoading(true);
    try {
      await registerForPushNotifications();
    } finally {
      setLoading(false);
      void refresh();
    }
  }, [refresh]);

  const handleOpenSettings = useCallback(() => {
    void Linking.openSettings().catch(() => {});
  }, []);

  if (status === null || status === 'granted' || status === 'unavailable') {
    return null;
  }

  if (status === 'denied') {
    return (
      <View style={styles.wrapper}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="notifications-off-outline" size={20} color={colors.textSecondary} />
          </View>
          <View style={styles.body}>
            <Text style={styles.title}>Notifications désactivées</Text>
            <Text style={styles.message}>
              Activez-les dans les réglages de votre téléphone pour recevoir vos messages YOUMBIA.
            </Text>
            <View style={styles.actions}>
              <Button variant="ghost" size="sm" onPress={handleOpenSettings}>
                Ouvrir les réglages
              </Button>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // undetermined → carte premium
  return (
    <View style={styles.wrapper}>
      <View style={styles.card}>
        <View style={[styles.iconWrap, styles.iconWrapPrimary]}>
          <Ionicons name="notifications-outline" size={20} color={colors.primary} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>Recevez vos messages instantanément</Text>
          <Text style={styles.message}>
            Activez les notifications pour ne manquer aucune réponse à vos annonces.
          </Text>
          <View style={styles.actions}>
            <Button variant="primary" size="sm" loading={loading} onPress={handleActivate}>
              Activer les notifications
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
