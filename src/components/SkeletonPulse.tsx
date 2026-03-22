/**
 * Pulse léger pour placeholders skeleton — micro-interaction sans logique métier.
 */

import React, { useEffect } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

type SkeletonPulseProps = {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SkeletonPulse({ children, style }: SkeletonPulseProps) {
  const opacity = useSharedValue(0.52);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.92, { duration: 950, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.wrap, style, animatedStyle]}>{children}</Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
});
