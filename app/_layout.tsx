import { Stack, useGlobalSearchParams, usePathname, useRouter, useSegments } from 'expo-router';
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
  addNotificationResponseReceivedListenerSafe,
  getComparableRouteKey,
  getComparableTargetKey,
  getLastNotificationResponseAsyncSafe,
  getNotificationOpenMeta,
  initializeNotifications,
  isPushNotificationsAvailable,
  syncPushTokenIfGranted,
} from '@/services/notifications';
import { FavoritesProvider } from '@/context/FavoritesContext';
import { AppUpdateGate } from '@/components/AppUpdateGate';

/**
 * Polling sync notifications messages, actif quand l’app est au premier plan.
 * Les alertes saved-search sont serveur (trigger + Edge Function), pas de scan client.
 */
const MESSAGE_NOTIFICATIONS_POLL_MS = 45000;
/** Délai avant le 1er sync messages pour ne pas concurrencer session + 1er rendu. */
const STARTUP_NOTIFICATION_SYNC_DELAY_MS = 2500;

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
  const [isAppReady, setIsAppReady] = useState(false);
  const [isSplashAnimationComplete, setIsSplashAnimationComplete] = useState(false);
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
    async function prepare() {
      try {
        // Chargement parallèle des ressources critiques (ex: Session Supabase)
        const [{ supabase }] = await Promise.all([
          import('@/lib/supabase'),
          initMixpanel(),
        ]);

        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          await identifyCurrentUser(data.session.user);
          setCrashReportingUser(data.session.user.id);
        }
      } catch (e) {
        console.warn('App preparation error:', e);
      } finally {
        setIsAppReady(true);
      }
    }

    prepare();
  }, []);

  // Auto-réparation profil : un seul listener (INITIAL_SESSION / SIGNED_IN / USER_UPDATED).
  // Fire-and-forget — ne bloque pas le splash ni isAppReady.
  useEffect(() => {
    return startProfileProvisioningOnAuth();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((event, session) => {
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
    let cancelled = false;

    const trySync = async () => {
      const session = await getSession();
      if (cancelled || !session?.user) return;
      void syncPushTokenIfGranted();
    };
    void trySync();

    const unsubscribe = onAuthStateChange((event, session) => {
      if (session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        void syncPushTokenIfGranted();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
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
      identifier: string | null | undefined,
      target: string | null,
      meta?: { type: string | null; listingId: string | null; savedSearchId: string | null }
    ) => {
      if (!target) return;
      const safeIdentifier = String(identifier ?? '').trim();
      if (safeIdentifier && lastHandledNotificationRef.current === safeIdentifier) return;
      if (getComparableTargetKey(target) === routeKeyRef.current) {
        lastHandledNotificationRef.current = safeIdentifier || target;
        return;
      }
      lastHandledNotificationRef.current = safeIdentifier || target;
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

  useEffect(() => {
    let active = true;
    let subscription: { remove: () => void } | null = null;

    getLastNotificationResponseAsyncSafe()
      .then((initialResponse) => {
        if (!active || !initialResponse) return;
        const meta = getNotificationOpenMeta(initialResponse);
        handleNotificationResponse(
          initialResponse.notification?.request?.identifier,
          meta.target,
          meta
        );
      })
      .catch(() => {});

    void addNotificationResponseReceivedListenerSafe((response) => {
      const meta = getNotificationOpenMeta(response);
      handleNotificationResponse(
        response.notification?.request?.identifier,
        meta.target,
        meta
      );
    }).then((listenerSubscription) => {
      if (!active) {
        listenerSubscription?.remove();
        return;
      }
      subscription = listenerSubscription;
    });

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [handleNotificationResponse]);

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

  // Affiche le composant Splash tant que l'animation n'est pas complètement terminée,
  // ce composant va gérer l'attente du préchargement de manière fluide.
  if (!isSplashAnimationComplete) {
    return (
      <SplashScreenCustom
        isAppReady={isAppReady}
        onFinish={() => setIsSplashAnimationComplete(true)}
      />
    );
  }

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
    </SafeAreaProvider>
  );
}

export default wrapRootLayout(RootLayout);
