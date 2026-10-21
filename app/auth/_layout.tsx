import { Stack } from 'expo-router';
import { colors } from '@/theme';

/**
 * Routes HTTPS App Links / Universal Links : `/auth/confirm`, `/auth/callback`.
 * Distinct du groupe `(auth)` (login/signup) dont les URLs n’ont pas le préfixe `/auth`.
 */
export default function AuthDeepLinkLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'none',
      }}
    >
      <Stack.Screen name="confirm" />
      <Stack.Screen name="callback" />
    </Stack>
  );
}
