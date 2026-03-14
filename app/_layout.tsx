import { Stack, useGlobalSearchParams, usePathname, useRouter, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef } from 'react';
import 'react-native-reanimated';
import { AppState, Linking } from 'react-native';
import { colors } from '@/theme';
import { onAuthStateChange } from '@/services/auth';
import { getListingHrefFromUrl } from '@/lib/listingDeepLink';
import {
  getComparableRouteKey,
  getComparableTargetKey,
  getNotificationNavigationTarget,
  initializeNotifications,
} from '@/services/notifications';
import { syncNewMessageNotifications } from '@/services/messageNotifications';
import { syncSavedSearchNotifications } from '@/services/savedSearchNotifications';

const MESSAGE_NOTIFICATIONS_POLL_MS = 45000;

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

/**
 * Protected segments: only these require auth.
 * Public: (tabs)/home, (tabs)/search, listing/[id]. Protected: (tabs)/favorites, (tabs)/messages, (tabs)/account, sell, conversation, account/*.
 * Redirect to login with ?redirect=<current path> so user returns to the same screen after auth (Sprint 3.2 continuity).
 */
function isProtectedSegment(segments: string[]): boolean {
  const first = segments[0];
  const second = segments[1];
  if (first === 'sell') return true;
  if (first === 'conversation') return true;
  if (first === '(tabs)' && second && ['favorites', 'messages', 'account'].includes(second)) {
    return true;
  }
  if (first === 'account') return true;
  return false;
}

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams();
  const lastHandledUrlRef = useRef<string | null>(null);
  const lastHandledNotificationRef = useRef<string | null>(null);
  const pathnameRef = useRef(pathname);
  const routeKeyRef = useRef(getComparableRouteKey(pathname, globalParams));

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    routeKeyRef.current = getComparableRouteKey(pathname, globalParams);
  }, [pathname, globalParams]);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    initializeNotifications();
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const runSync = () => {
      void syncNewMessageNotifications(routeKeyRef.current);
      void syncSavedSearchNotifications(routeKeyRef.current);
    };

    const startPolling = () => {
      if (interval) return;
      runSync();
      interval = setInterval(runSync, MESSAGE_NOTIFICATIONS_POLL_MS);
    };

    const stopPolling = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };

    if (AppState.currentState === 'active') {
      startPolling();
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        startPolling();
        return;
      }
      stopPolling();
    });

    return () => {
      stopPolling();
      subscription.remove();
    };
  }, []);

  const handleIncomingUrl = useCallback(
    (url: string | null | undefined) => {
      const raw = String(url ?? '').trim();
      const target = getListingHrefFromUrl(raw);
      if (!target) return;
      if (raw && lastHandledUrlRef.current === raw) return;
      if (getComparableTargetKey(target) === routeKeyRef.current) {
        lastHandledUrlRef.current = raw || target;
        return;
      }
      lastHandledUrlRef.current = raw || target;
      router.replace(target as never);
    },
    [router]
  );

  useEffect(() => {
    let active = true;

    Linking.getInitialURL()
      .then((url) => {
        if (!active) return;
        handleIncomingUrl(url);
      })
      .catch(() => {});

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncomingUrl(url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [handleIncomingUrl]);

  const handleNotificationResponse = useCallback(
    (identifier: string | null | undefined, target: string | null) => {
      if (!target) return;
      const safeIdentifier = String(identifier ?? '').trim();
      if (safeIdentifier && lastHandledNotificationRef.current === safeIdentifier) return;
      if (getComparableTargetKey(target) === routeKeyRef.current) {
        lastHandledNotificationRef.current = safeIdentifier || target;
        return;
      }
      lastHandledNotificationRef.current = safeIdentifier || target;
      router.replace(target as never);
    },
    [router]
  );

  useEffect(() => {
    let active = true;
    let subscription: Notifications.EventSubscription | null = null;

    Notifications.getLastNotificationResponseAsync()
      .then((initialResponse) => {
        if (!active || !initialResponse) return;
        handleNotificationResponse(
          initialResponse.notification.request.identifier,
          getNotificationNavigationTarget(initialResponse)
        );
      })
      .catch(() => {});

    subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationResponse(
        response.notification.request.identifier,
        getNotificationNavigationTarget(response)
      );
    });

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [handleNotificationResponse]);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((_event, session) => {
      if (session != null) return;
      if (!isProtectedSegment(segments)) return;
      // Preserve return context: redirect to login with current path so user lands back after auth.
      const returnPath = segments.length > 0 ? `/${segments.join('/')}` : '/(tabs)/home';
      router.replace(`/(auth)/login?redirect=${encodeURIComponent(returnPath)}`);
    });
    return unsubscribe;
  }, [router, segments]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="listing/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="conversation/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="account" options={{ headerShown: false }} />
        <Stack.Screen name="sell/index" options={{ headerShown: false }} />
        <Stack.Screen name="categories" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
