import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreenLib from 'expo-splash-screen';

const { width } = Dimensions.get('window');
const LOGO_SIZE = width * 0.35;

type SplashScreenProps = {
  isAppReady: boolean;
  onFinish: () => void;
};

export default function SplashScreen({ isAppReady, onFinish }: SplashScreenProps) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.95);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    let isMounted = true;

    // Masquer le splash natif immédiatement pour laisser place à l'animation custom
    SplashScreenLib.hideAsync().catch(() => {});

    // Animation d'entrée : Logo et Glow (plus rapide pour plus de réactivité)
    opacity.value = withTiming(1, {
      duration: 300,
      easing: Easing.out(Easing.quad),
    });

    scale.value = withTiming(1, {
      duration: 500,
      easing: Easing.out(Easing.back(1.2)),
    });

    glowOpacity.value = withDelay(
      150,
      withTiming(0.4, {
        duration: 600,
        easing: Easing.inOut(Easing.ease),
      })
    );

    // Attente minimale de 800ms pour garantir l'effet premium tout en étant réactif
    const timer = setTimeout(() => {
      if (isAppReady && isMounted) {
        // Animation de sortie
        opacity.value = withTiming(
          0,
          {
            duration: 250,
            easing: Easing.inOut(Easing.ease),
          },
          (finished) => {
            if (finished && isMounted) {
              runOnJS(onFinish)();
            }
          }
        );
      }
    }, 800);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isAppReady, onFinish, opacity, scale, glowOpacity]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: scale.value * 1.2 }],
  }));

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0B6B3A', '#1DBF73']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      
      {/* Halo lumineux subtil derrière le logo */}
      <Animated.View style={[styles.glow, glowStyle]} />

      <Animated.Image
        source={require('../../../assets/images/android-icon-foreground.png')}
        style={[styles.logo, logoStyle]}
        resizeMode="contain"
      />
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
  glow: {
    position: 'absolute',
    width: LOGO_SIZE * 2,
    height: LOGO_SIZE * 2,
    borderRadius: LOGO_SIZE,
    backgroundColor: '#ffffff',
    opacity: 0.15,
    ...Platform.select({
      ios: {
        shadowColor: '#ffffff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 40,
      },
      android: {
        elevation: 0,
      },
    }),
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
});
