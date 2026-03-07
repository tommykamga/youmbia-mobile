import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { colors } from '@/theme';
import { onAuthStateChange } from '@/services/auth';

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

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

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
