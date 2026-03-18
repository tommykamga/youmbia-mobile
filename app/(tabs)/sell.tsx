/**
 * Tab entry for "Vendre": navigates imperatively to the stack route /sell on focus.
 * Using useFocusEffect + router.push instead of <Redirect> avoids a tab→stack
 * redirect loop that can crash under Expo Router when Navigation context is ambiguous.
 */

import { useCallback, useRef } from 'react';
import { View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

export default function SellTabScreen() {
  const router = useRouter();
  const hasNavigated = useRef(false);

  useFocusEffect(
    useCallback(() => {
      // Push only once per focus cycle to prevent double navigation.
      if (!hasNavigated.current) {
        hasNavigated.current = true;
        router.push('/sell');
      }
      return () => {
        // Reset on blur so re-tapping the tab works again.
        hasNavigated.current = false;
      };
    }, [router])
  );

  // Render an empty view while navigating – the stack screen takes over immediately.
  return <View />;
}
