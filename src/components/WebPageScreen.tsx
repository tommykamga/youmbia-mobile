/**
 * WebView restreinte aux domaines YOUMBIA (HTTPS uniquement).
 * Navigation hors origine bloquée ; pas d’injection JS par défaut.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Linking,
  type NativeSyntheticEvent,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Screen } from '@/components/Screen';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { colors, spacing } from '@/theme';
import Ionicons from '@expo/vector-icons/Ionicons';

const ALLOWED_HOSTS = new Set(['youmbia.com', 'www.youmbia.com']);

export function isAllowedYoumbiaWebUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

export type WebPageScreenProps = {
  url: string;
  title: string;
};

export function WebPageScreen({ url, title }: WebPageScreenProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const initialValid = useMemo(() => isAllowedYoumbiaWebUrl(url), [url]);

  const onRetry = useCallback(() => {
    setLoadError(null);
    setLoading(true);
    setRetryKey((k) => k + 1);
  }, []);

  const handleShouldStart = useCallback((request: { url: string }) => {
    return isAllowedYoumbiaWebUrl(request.url);
  }, []);

  const onError = useCallback((e: NativeSyntheticEvent<{ description?: string }>) => {
    const desc = e.nativeEvent.description ?? 'Erreur de chargement';
    setLoadError(desc);
    setLoading(false);
  }, []);

  const onHttpError = useCallback((e: NativeSyntheticEvent<{ statusCode: number }>) => {
    const status = e.nativeEvent.statusCode;
    setLoadError(`HTTP ${status}`);
    setLoading(false);
  }, []);

  if (!initialValid) {
    return (
      <Screen noPadding>
        <AppHeader title={title} showBack />
        <EmptyState
          icon={<Ionicons name="shield-outline" size={56} color={colors.error} />}
          title="Lien non autorisé"
          message="Cette page ne peut pas être affichée dans l’application."
          style={styles.center}
        />
      </Screen>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <Screen noPadding>
        <AppHeader title={title} showBack />
        <EmptyState
          icon={<Ionicons name="open-outline" size={56} color={colors.primary} />}
          title={title}
          message="Sur le web, ouvre la page dans un nouvel onglet."
          action={
            <Button variant="primary" onPress={() => Linking.openURL(url)}>
              Ouvrir youmbia.com
            </Button>
          }
          style={styles.center}
        />
      </Screen>
    );
  }

  return (
    <Screen noPadding>
      <AppHeader title={title} showBack />
      <View style={styles.container}>
        {loadError != null ? (
          <EmptyState
            icon={<Ionicons name="cloud-offline-outline" size={56} color={colors.textSecondary} />}
            title="Impossible de charger la page"
            message={loadError}
            action={
              <Button variant="secondary" onPress={onRetry}>
                Réessayer
              </Button>
            }
            style={styles.center}
          />
        ) : (
          <>
            <WebView
              key={retryKey}
              source={{ uri: url }}
              style={styles.webview}
              onLoadStart={() => {
                setLoading(true);
                setLoadError(null);
              }}
              onLoadEnd={() => setLoading(false)}
              onError={onError}
              onHttpError={onHttpError}
              onShouldStartLoadWithRequest={handleShouldStart}
              originWhitelist={['https://youmbia.com', 'https://www.youmbia.com']}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled={false}
              thirdPartyCookiesEnabled={false}
              setSupportMultipleWindows={false}
              allowsInlineMediaPlayback
              startInLoadingState={false}
            />
            {loading ? (
              <View style={styles.loaderOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  webview: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248,250,252,0.85)',
  },
  center: {
    flex: 1,
    paddingTop: spacing.xl,
  },
});
