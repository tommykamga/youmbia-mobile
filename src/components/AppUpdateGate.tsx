import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLogo, Button } from '@/components';
import { AppUpdateBanner } from '@/components/AppUpdateBanner';
import { AppUpdateBannerInsetContext } from '@/context/AppUpdateBannerInsetContext';
import { useAppUpdateStatus } from '@/hooks/useAppUpdateStatus';
import { openAppStoreUpdateUrl } from '@/services/appVersion/openAppStoreUpdateUrl';
import { colors, fontWeights, spacing, typography } from '@/theme';

const CRITICAL_DEFAULT_MESSAGE =
  'Cette version de YOUMBIA n’est plus compatible. Veuillez mettre à jour l’application pour continuer.';

type AppUpdateGateProps = {
  children: React.ReactNode;
};

function CriticalUpdateScreen({
  message,
  onUpdate,
}: {
  message: string;
  onUpdate: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.criticalRoot, { paddingTop: insets.top + spacing['3xl'] }]}>
      <View style={styles.criticalContent}>
        <AppLogo variant="large" />
        <Text style={styles.criticalTitle}>Mise à jour requise</Text>
        <Text style={styles.criticalBody}>{message}</Text>
      </View>
      <View style={[styles.criticalFooter, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Button variant="primary" size="lg" onPress={onUpdate}>
          Mettre à jour
        </Button>
      </View>
    </View>
  );
}

export function AppUpdateGate({ children }: AppUpdateGateProps) {
  const {
    status,
    shouldShowOptionalBanner,
    shouldShowCriticalBlock,
    dismissOptionalUpdate,
  } = useAppUpdateStatus();
  const [bannerInset, setBannerInset] = useState(0);

  const handleUpdate = useCallback(() => {
    void openAppStoreUpdateUrl(status?.updateUrl ?? null, status?.platform ?? null);
  }, [status?.updateUrl, status?.platform]);

  const handleLater = useCallback(() => {
    dismissOptionalUpdate();
    setBannerInset(0);
  }, [dismissOptionalUpdate]);

  const handleBannerLayout = useCallback((height: number) => {
    setBannerInset(height);
  }, []);

  if (shouldShowCriticalBlock && status) {
    const body = status.releaseNotes?.trim() || CRITICAL_DEFAULT_MESSAGE;

    return <CriticalUpdateScreen message={body} onUpdate={handleUpdate} />;
  }

  return (
    <AppUpdateBannerInsetContext.Provider
      value={shouldShowOptionalBanner ? bannerInset : 0}
    >
      <View style={styles.root}>
        {shouldShowOptionalBanner ? (
          <AppUpdateBanner
            onUpdate={handleUpdate}
            onLater={handleLater}
            onLayoutHeight={handleBannerLayout}
          />
        ) : null}
        <View style={styles.content}>{children}</View>
      </View>
    </AppUpdateBannerInsetContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  criticalRoot: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
  },
  criticalContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    maxWidth: 360,
    alignSelf: 'center',
  },
  criticalTitle: {
    ...typography['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
    textAlign: 'center',
  },
  criticalBody: {
    ...typography.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  criticalFooter: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
});
