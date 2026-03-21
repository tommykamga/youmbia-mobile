import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';

type AnimatedSplashProps = {
  isAppReady: boolean;
  onFinish: () => void;
};

export default function AnimatedSplash({ isAppReady, onFinish }: AnimatedSplashProps) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.85);

  const [entranceFinished, setEntranceFinished] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // 1. GESTION DU SPLASH NATIF EXPO :
    // On cache le splash natif le plus vite possible dès que notre vue est montée. 
    // Cela permet de révéler cette animation d'entrée fluide sans effet de "double écran".
    SplashScreen.hideAsync().catch(() => {});

    // 2. Animation d'entrée : délais décalés pour un effet premium type Uber
    opacity.value = withTiming(1, {
      duration: 700,
      easing: Easing.out(Easing.exp),
    });

    scale.value = withTiming(
      1,
      {
        duration: 900,
        easing: Easing.out(Easing.exp),
      },
      (finished) => {
        if (finished && isMounted) {
          runOnJS(setEntranceFinished)(true);
        }
      }
    );

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let isMounted = true;

    // 3. TRANSITION FLUIDE ET PRÉCHARGEMENT
    // On lance la sortie uniquement quand l'animation est finie ET que les données sont prêtes
    if (entranceFinished && isAppReady) {
      opacity.value = withTiming(
        0,
        {
          duration: 300, // Disparition propre avant onFinish()
          easing: Easing.inOut(Easing.ease),
        },
        (finished) => {
          if (finished && isMounted) {
            runOnJS(onFinish)();
          }
        }
      );
    }

    return () => {
      isMounted = false;
    };
  }, [entranceFinished, isAppReady, onFinish, opacity]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <View style={styles.container}>
      <Animated.Image
        source={require('../../assets/images/android-icon-foreground.png')}
        style={[styles.logo, animatedStyle]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F9D58',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999, // S'assurer que le splash est au-dessus de tout
  },
  logo: {
    width: 200,
    height: 200,
    // Effet glow / shadow premium
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
});
