import { Stack, useGlobalSearchParams, usePathname, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import SplashScreenCustom from '@/features/splash/SplashScreen';
import 'react-native-reanimated';
import { Alert, AppState, Linking } from 'react-native';
import { colors } from '@/theme';
import { getSession, onAuthStateChange } from '@/services/auth';
import { handleSupabaseAuthDeepLink } from '@/services/auth/handleSupabaseAuthDeepLink';
import { getListingHrefFromUrl } from '@/lib/listingDeepLink';
import {
  addNotificationResponseReceivedListenerSafe,
  getComparableRouteKey,
  getComparableTargetKey,
  getLastNotificationResponseAsyncSafe,
  getNotificationNavigationTarget,
  initializeNotifications,
  isPushNotificationsAvailable,
} from '@/services/notifications';
import { FavoritesProvider } from '@/context/FavoritesContext';

/**
 * Polling sync notifications (messages + recherches enregistrées), actif quand l’app est au premier plan.
 * 45s ≥ 30s recommandé pour limiter la charge ; augmenter (ex. 90s) si besoin côté serveur — à valider produit.
 */
const MESSAGE_NOTIFICATIONS_POLL_MS = 45000;
/** Délai avant le 1er sync messages / recherches sauvegardées pour ne pas concurrencer session + 1er rendu. */
const STARTUP_NOTIFICATION_SYNC_DELAY_MS = 2500;

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

export default function RootLayout() {
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
          // Ajouter d'autres préchargements ici si besoin
        ]);

        await supabase.auth.getSession();
      } catch (e) {
        console.warn('App preparation error:', e);
      } finally {
        setIsAppReady(true);
      }
    }

    prepare();
  }, []);

  useEffect(() => {
    if (!isPushNotificationsAvailable()) return;
    initializeNotifications();
  }, []);

  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let startupDelayTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const runSync = async () => {
      if (cancelled) return;
      try {
        const session = await getSession();
        if (!session?.user) return;
        const [{ syncNewMessageNotifications }, { syncSavedSearchNotifications }] = await Promise.all([
          import('@/services/messageNotifications'),
          import('@/services/savedSearchNotifications'),
        ]);
        if (cancelled) return;
        void syncNewMessageNotifications(routeKeyRef.current);
        void syncSavedSearchNotifications(routeKeyRef.current);
      } catch {
        // Prochain intervalle ou prochain focus actif retentera le chargement des modules.
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
    let subscription: { remove: () => void } | null = null;

    getLastNotificationResponseAsyncSafe()
      .then((initialResponse) => {
        if (!active || !initialResponse) return;
        handleNotificationResponse(
          initialResponse.notification?.request?.identifier,
          getNotificationNavigationTarget(initialResponse)
        );
      })
      .catch(() => {});

    void addNotificationResponseReceivedListenerSafe((response) => {
      handleNotificationResponse(
        response.notification?.request?.identifier,
        getNotificationNavigationTarget(response)
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
    <FavoritesProvider>
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
        <Stack.Screen name="help" options={{ headerShown: false }} />
        <Stack.Screen name="terms" options={{ headerShown: false }} />
        <Stack.Screen name="privacy" options={{ headerShown: false }} />
      </Stack>
    </FavoritesProvider>
  );
}
