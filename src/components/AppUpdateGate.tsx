import React, { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLogo, Button } from '@/components';
import {
  checkAppVersion,
  type AppVersionPolicy,
} from '@/services/appVersion';
import { colors, radius, shadows, spacing, typography, fontWeights } from '@/theme';

type GatePhase = 'checking' | 'ready' | 'force_update' | 'optional_update';

type AppUpdateGateProps = {
  children: React.ReactNode;
};

async function openStoreUrl(url: string | null | undefined) {
  const trimmed = url?.trim();
  if (!trimmed) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[appVersion] store_url absent — ouverture boutique ignorée.');
    }
    return;
  }

  try {
    const canOpen = await Linking.canOpenURL(trimmed);
    if (!canOpen) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[appVersion] URL boutique non ouvrable:', trimmed);
      }
      return;
    }
    await Linking.openURL(trimmed);
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[appVersion] Échec ouverture boutique.', err);
    }
  }
}

function ForceUpdateScreen({
  policy,
  onUpdate,
}: {
  policy: AppVersionPolicy;
  onUpdate: () => void;
}) {
  const insets = useSafeAreaInsets();
  const body =
    policy.message?.trim() ||
    'Cette version de YOUMBIA n’est plus supportée. Mets à jour l’application pour continuer.';

  return (
    <View style={[styles.forceRoot, { paddingTop: insets.top + spacing['3xl'] }]}>
      <View style={styles.forceContent}>
        <AppLogo variant="large" />
        <Text style={styles.forceTitle}>Mise à jour requise</Text>
        <Text style={styles.forceBody}>{body}</Text>
      </View>
      <View style={[styles.forceFooter, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Button variant="primary" size="lg" onPress={onUpdate}>
          Mettre à jour
        </Button>
      </View>
    </View>
  );
}

function OptionalUpdateModal({
  visible,
  onLater,
  onUpdate,
}: {
  visible: boolean;
  onLater: () => void;
  onUpdate: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onLater}>
      <Pressable style={styles.modalOverlay} onPress={onLater}>
        <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.modalTitle}>Mise à jour disponible</Text>
          <Text style={styles.modalBody}>
            Une nouvelle version de YOUMBIA est disponible.
          </Text>
          <View style={styles.modalActions}>
            <Button variant="ghost" onPress={onLater}>
              Plus tard
            </Button>
            <Button variant="primary" onPress={onUpdate}>
              Mettre à jour
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function AppUpdateGate({ children }: AppUpdateGateProps) {
  const [phase, setPhase] = useState<GatePhase>(
    Platform.OS === 'web' ? 'ready' : 'checking'
  );
  const [policy, setPolicy] = useState<AppVersionPolicy | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let cancelled = false;

    void (async () => {
      const result = await checkAppVersion();
      if (cancelled) return;

      if (result.kind === 'skip') {
        setPhase('ready');
        return;
      }

      setPolicy(result.policy);

      if (result.policy.status === 'force_update') {
        setPhase('force_update');
        return;
      }

      if (result.policy.status === 'optional_update') {
        setPhase('optional_update');
        return;
      }

      setPhase('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpdate = useCallback(() => {
    void openStoreUrl(policy?.storeUrl);
  }, [policy?.storeUrl]);

  const handleLater = useCallback(() => {
    setPhase('ready');
  }, []);

  if (phase === 'checking') {
    return <View style={styles.checking} />;
  }

  if (phase === 'force_update' && policy) {
    return <ForceUpdateScreen policy={policy} onUpdate={handleUpdate} />;
  }

  return (
    <>
      {children}
      {policy ? (
        <OptionalUpdateModal
          visible={phase === 'optional_update'}
          onLater={handleLater}
          onUpdate={handleUpdate}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  checking: {
    flex: 1,
    backgroundColor: colors.background,
  },
  forceRoot: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
  },
  forceContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    maxWidth: 360,
    alignSelf: 'center',
  },
  forceTitle: {
    ...typography['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
    textAlign: 'center',
  },
  forceBody: {
    ...typography.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  forceFooter: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    gap: spacing.md,
    ...shadows.md,
  },
  modalTitle: {
    ...typography.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  modalBody: {
    ...typography.base,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
