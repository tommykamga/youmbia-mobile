import React, { useEffect, useLayoutEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import * as SplashScreenLib from 'expo-splash-screen';
import { BrandSymbol } from '@/components/BrandSymbol';

/** Symbole seul, aligné sur l’icône app (calque adaptive, fond transparent attendu sur le PNG). */
const SYMBOL_SIZE = 168;

/** Temps d’affichage minimum du branding avant fondu vers l’app (après isAppReady). */
const MIN_VISIBLE_MS = 550;

type SplashScreenProps = {
  isAppReady: boolean;
  onFinish: () => void;
};

export default function SplashScreen({ isAppReady, onFinish }: SplashScreenProps) {
  // Aligné sur le splash natif Expo (#0B6B3A + même PNG) : pas de fondu d’entrée pour éviter flash / double écran.
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useLayoutEffect(() => {
    let cancelled = false;
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        if (!cancelled) {
          SplashScreenLib.hideAsync().catch(() => {});
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outerFrame);
      if (innerFrame) cancelAnimationFrame(innerFrame);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const timer = setTimeout(() => {
      if (isAppReady && isMounted) {
        opacity.value = withTiming(
          0,
          {
            duration: 200,
            easing: Easing.inOut(Easing.ease),
          },
          (finished) => {
            if (finished && isMounted) {
              runOnJS(onFinish)();
            }
          }
        );
      }
    }, MIN_VISIBLE_MS);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isAppReady, onFinish, opacity]);

  const wrapStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={wrapStyle}>
        <BrandSymbol size={SYMBOL_SIZE} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0B6B3A',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
  },
});
