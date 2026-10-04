import {
  Stack,
  useGlobalSearchParams,
  usePathname,
  useRootNavigationState,
  useRouter,
  useSegments,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import SplashScreenCustom from '@/features/splash/SplashScreen';
import 'react-native-reanimated';
import { Alert, AppState, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { getSession, onAuthStateChange } from '@/services/auth';
import {
  identifyCurrentUser,
  initMixpanel,
  resetAnalytics,
  trackPushNotificationOpened,
  trackSavedSearchNotificationOpened,
} from '@/lib/analytics';
import {
  initCrashReporting,
  setCrashReportingUser,
  wrapRootLayout,
} from '@/lib/sentry';
import { startProfileProvisioningOnAuth } from '@/services/profile';
import { handleSupabaseAuthDeepLink } from '@/services/auth/handleSupabaseAuthDeepLink';
import { getListingHrefFromUrl } from '@/lib/listingDeepLink';
import {
  addNotificationReceivedListenerSafe,
  addNotificationResponseReceivedListenerSafe,
  clearLastNotificationResponseAsyncSafe,
  getComparableRouteKey,
  getComparableTargetKey,
  getLastNotificationResponseAsyncSafe,
  getNotificationOpenMeta,
  initializeNotifications,
  isPushNotificationsAvailable,
  syncPushTokenIfGranted,
  type NotificationOpenMeta,
  type NotificationResponseLike,
} from '@/services/notifications';
import { FavoritesProvider } from '@/context/FavoritesContext';
import { AppUpdateGate } from '@/components/AppUpdateGate';
import { startPushTokenSessionSync } from '@/services/pushSessionSync';
import {
  createDeferredNotificationOpenCoordinator,
  type DeferredNotificationOpenCoordinator,
} from '@/services/deferredNotificationOpen';

/**
 * Polling sync notifications messages, actif quand l’app est au premier plan.
 * Les alertes saved-search sont serveur (trigger + Edge Function), pas de scan client.
 */
const MESSAGE_NOTIFICATIONS_POLL_MS = 45000;
/** Délai avant le 1er sync messages pour ne pas concurrencer session + 1er rendu. */
const STARTUP_NOTIFICATION_SYNC_DELAY_MS = 2500;

type PendingNotificationOpen = {
  identifier: string;
  meta: NotificationOpenMeta;
  source: 'cold_start' | 'listener';
};

export { ErrorBoundary } from 'expo-router';

initCrashReporting();

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

  // Onglets (favorites, messages, sell, account) : pas de redirection login ici — interception
  // dans (tabs)/_layout + Redirect /(auth)/gate si l’utilisateur atteint l’écran sans session.
  const tabsWithContextualGate = ['favorites', 'messages', 'sell', 'account'];

  if (first === '(tabs)' && second && tabsWithContextualGate.includes(second)) {
    return false;
  }

  // Segment "sell" à la racine (si accédé directement) : on protège toujours.
  if (first === 'sell') return true;
  if (first === 'conversation') return true;
  if (first === 'account') return true;
  
  return false;
}

function RootLayout() {
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [isSplashAnimationComplete, setIsSplashAnimationComplete] = useState(false);
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const segments = useSegments();
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams();
  const lastHandledUrlRef = useRef<string | null>(null);
  const pathnameRef = useRef(pathname);
  const routeKeyRef = useRef(getComparableRouteKey(pathname, globalParams));
  const consumeNotificationRef = useRef<(notification: PendingNotificationOpen) => void>(() => {});
  const notificationCoordinatorRef = useRef<
    DeferredNotificationOpenCoordinator<PendingNotificationOpen> | null
  >(null);
  const isNavigationReady = Boolean(rootNavigationState?.key);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    routeKeyRef.current = getComparableRouteKey(pathname, globalParams);
  }, [pathname, globalParams]);

  useEffect(() => {
    let active = true;

    // Analytics is intentionally best-effort and never gates the first render.
    void initMixpanel();

    async function restoreSession() {
      try {
        const session = await getSession();
        if (!active) return;
        if (session?.user) {
          setCrashReportingUser(session.user.id);
          void identifyCurrentUser(session.user);
        }
      } catch (e) {
        console.warn('App preparation error:', e);
      } finally {
        if (active) setIsSessionReady(true);
      }
    }

    void restoreSession();
    return () => {
      active = false;
    };
  }, []);

  // Auto-réparation profil : un seul listener (INITIAL_SESSION / SIGNED_IN / USER_UPDATED).
  // Fire-and-forget — ne bloque pas le splash ni isAppReady.
  useEffect(() => {
    return startProfileProvisioningOnAuth();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((event, session) => {
      if (
        event === 'INITIAL_SESSION' ||
        event === 'SIGNED_IN' ||
        event === 'SIGNED_OUT' ||
        event === 'USER_UPDATED' ||
        event === 'TOKEN_REFRESHED'
      ) {
        setIsSessionReady(true);
      }
      if (session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        void identifyCurrentUser(session.user);
        setCrashReportingUser(session.user.id);
      }
      if (event === 'SIGNED_OUT') {
        void resetAnalytics();
        setCrashReportingUser(null);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isPushNotificationsAvailable()) return;
    initializeNotifications();
  }, []);

  // Persiste côté serveur le token push d'un utilisateur ayant DÉJÀ accordé la
  // permission (au démarrage + à chaque connexion), sans jamais redemander la
  // permission ni afficher de prompt. Best-effort, non bloquant.
  useEffect(() => {
    if (!isPushNotificationsAvailable()) return;
    return startPushTokenSessionSync();
  }, []);

  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let startupDelayTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let previousAppState = AppState.currentState;

    const runSync = async () => {
      if (cancelled) return;
      try {
        const session = await getSession();
        if (!session?.user) return;
        const { syncNewMessageNotifications } = await import('@/services/messageNotifications');
        if (cancelled) return;
        void syncNewMessageNotifications(routeKeyRef.current);
      } catch {
        // Prochain intervalle ou prochain focus actif retentera le chargement des modules.
      }
    };

    const runForegroundSnapshotResync = async () => {
      if (cancelled) return;
      try {
        const session = await getSession();
        if (!session?.user) return;
        const { refreshMessageNotificationSnapshotSilently } = await import(
          '@/services/messageNotifications'
        );
        if (cancelled) return;
        await refreshMessageNotificationSnapshotSilently();
      } catch {
        // Le prochain poll message reprendra avec un snapshot à jour si possible.
      }
    };

    const startPolling = () => {
      if (pollInterval || startupDelayTimer) return;
      startupDelayTimer = setTimeout(() => {
        startupDelayTimer = null;
        void runSync();
        pollInterval = setInterval(() => void runSync(), MESSAGE_NOTIFICATIONS_POLL_MS);
      }, STARTUP_NOTIFICATION_SYNC_DELAY_MS);
    };

    const stopPolling = () => {
      if (startupDelayTimer) {
        clearTimeout(startupDelayTimer);
        startupDelayTimer = null;
      }
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    const handleAppStateChange = (nextState: typeof AppState.currentState) => {
      if (nextState === 'active') {
        const resumingFromBackground = previousAppState !== 'active';
        previousAppState = nextState;
        if (resumingFromBackground) {
          void (async () => {
            await runForegroundSnapshotResync();
            await syncPushTokenIfGranted();
            if (!cancelled) startPolling();
          })();
        } else {
          startPolling();
        }
        return;
      }
      previousAppState = nextState;
      stopPolling();
    };

    if (AppState.currentState === 'active') {
      startPolling();
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      cancelled = true;
      stopPolling();
      subscription.remove();
    };
  }, []);

  const handleIncomingUrl = useCallback(
    async (url: string | null | undefined) => {
      const raw = String(url ?? '').trim();
      if (!raw) return;

      const authResult = await handleSupabaseAuthDeepLink(raw);
      if (authResult.consumed) {
        if (authResult.errorMessage) {
          Alert.alert('Connexion', authResult.errorMessage);
        }
        if (authResult.navigateTo !== null) {
          router.replace(authResult.navigateTo as never);
        }
        return;
      }

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
        void handleIncomingUrl(url);
      })
      .catch(() => {});

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleIncomingUrl(url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [handleIncomingUrl]);

  const handleNotificationResponse = useCallback(
    (
      target: string | null,
      meta?: { type: string | null; listingId: string | null; savedSearchId: string | null }
    ) => {
      trackPushNotificationOpened(meta?.type);
      if (!target) return;
      if (getComparableTargetKey(target) === routeKeyRef.current) return;
      if (meta?.type === 'saved_search_match') {
        trackSavedSearchNotificationOpened({
          listing_id: meta.listingId,
          saved_search_id: meta.savedSearchId,
        });
      }
      router.replace(target as never);
    },
    [router]
  );

  const handleSplashFinished = useCallback(() => {
    setIsSplashAnimationComplete(true);
  }, []);

  consumeNotificationRef.current = (notification) => {
    handleNotificationResponse(notification.meta.target, notification.meta);
  };

  if (!notificationCoordinatorRef.current) {
    notificationCoordinatorRef.current = createDeferredNotificationOpenCoordinator({
      getKey: (notification: PendingNotificationOpen) =>
        notification.identifier ||
        `${notification.meta.type ?? 'unknown'}:${notification.meta.target ?? 'no-target'}`,
      consume: (notification: PendingNotificationOpen) => {
        consumeNotificationRef.current(notification);
      },
      onConsumed: (notification: PendingNotificationOpen) => {
        if (notification.source === 'cold_start') {
          void clearLastNotificationResponseAsyncSafe();
        }
      },
      onDuplicate: (notification: PendingNotificationOpen) => {
        if (notification.source === 'cold_start') {
          void clearLastNotificationResponseAsyncSafe();
        }
      },
      onError: (error) => {
        console.error('[notifications] notification_open_failed', error);
      },
    });
  }

  useEffect(() => {
    notificationCoordinatorRef.current?.setNavigationReady(isNavigationReady);
  }, [isNavigationReady]);

  useEffect(() => {
    notificationCoordinatorRef.current?.setSessionReady(isSessionReady);
  }, [isSessionReady]);

  useEffect(() => {
    let active = true;
    let subscription: { remove: () => void } | null = null;
    let receivedSubscription: { remove: () => void } | null = null;

    const toPendingNotification = (
      response: NotificationResponseLike,
      source: PendingNotificationOpen['source']
    ): PendingNotificationOpen => ({
      identifier: String(response.notification?.request?.identifier ?? '').trim(),
      meta: getNotificationOpenMeta(response),
      source,
    });

    void notificationCoordinatorRef.current?.readColdStartOnce(async () => {
      const initialResponse = await getLastNotificationResponseAsyncSafe();
      if (!active || !initialResponse) return null;
      try {
        return toPendingNotification(initialResponse, 'cold_start');
      } catch (error) {
        // A malformed native response must not replay on every subsequent launch.
        void clearLastNotificationResponseAsyncSafe();
        throw error;
      }
    });

    void addNotificationResponseReceivedListenerSafe((response) => {
      if (!active) return;
      try {
        notificationCoordinatorRef.current?.enqueue(
          toPendingNotification(response, 'listener')
        );
      } catch (error) {
        console.error('[notifications] notification_response_invalid', error);
      }
    }).then((listenerSubscription) => {
      if (!active) {
        listenerSubscription?.remove();
        return;
      }
      subscription = listenerSubscription;
    });

    void addNotificationReceivedListenerSafe().then((listenerSubscription) => {
      if (!active) {
        listenerSubscription?.remove();
        return;
      }
      receivedSubscription = listenerSubscription;
    });

    return () => {
      active = false;
      subscription?.remove();
      receivedSubscription?.remove();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((_event, session) => {
      // Ne pas forcer Home depuis (auth) après connexion : les écrans login/signup
      // font router.replace vers redirect (ex. fiche annonce + contact) — sinon la course
      // avec onAuthStateChange écrase le retour contextuel.

      if (session != null) {
        return;
      }

      // Si l'utilisateur n'est PAS connecté et tente d'aller sur une page protégée
      if (!isProtectedSegment(segments)) return;

      // Preserve return context: redirect to login with current path so user lands back after auth.
      const returnPath = segments.length > 0 ? `/${segments.join('/')}` : '/(tabs)/home';
      router.replace(`/(auth)/login?redirect=${encodeURIComponent(returnPath)}`);
    });
    return unsubscribe;
  }, [router, segments]);

  return (
    <SafeAreaProvider>
      <AppUpdateGate>
        <FavoritesProvider>
        <StatusBar style="dark" translucent />
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
          <Stack.Screen name="shop/[slug]" options={{ headerShown: false }} />
          <Stack.Screen name="conversation/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="account" options={{ headerShown: false }} />
          <Stack.Screen name="sell/index" options={{ headerShown: false }} />
          <Stack.Screen name="categories" options={{ headerShown: false }} />
          <Stack.Screen name="help" options={{ headerShown: false }} />
          <Stack.Screen name="terms" options={{ headerShown: false }} />
          <Stack.Screen name="privacy" options={{ headerShown: false }} />
        </Stack>
        </FavoritesProvider>
      </AppUpdateGate>
      {!isSplashAnimationComplete ? (
        <SplashScreenCustom
          isAppReady={isNavigationReady}
          onFinish={handleSplashFinished}
        />
      ) : null}
    </SafeAreaProvider>
  );
}

export default wrapRootLayout(RootLayout);
