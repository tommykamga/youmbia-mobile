import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  interpolateColor,
  withTiming,
  Easing
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing } from '@/theme';
import { useFavorites } from '@/context/FavoritesContext';

type FavoriteButtonProps = {
  listingId: string;
  size?: number;
  /** Cercle discret type fil d’accueil (ombre légère, 44pt). */
  surface?: 'default' | 'home';
};

const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons);

export function FavoriteButton({ listingId, size = 24, surface = 'default' }: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const favorite = isFavorite(listingId);

  const scale = useSharedValue(1);
  const progress = useSharedValue(favorite ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(favorite ? 1 : 0, {
      duration: 200,
      easing: Easing.out(Easing.quad),
    });
    // progress is a Reanimated shared value — not a React dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorite]);

  const handlePress = () => {
    // Discreet heart pop
    scale.value = withSequence(
      withTiming(1.2, { duration: 100, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 15, stiffness: 300 })
    );
    toggleFavorite(listingId);
  };

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const iconStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      progress.value,
      [0, 1],
      [colors.textSecondary, colors.error]
    );
    return {
      color,
    };
  });

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        surface === 'home' ? styles.heartWrapHome : styles.heartWrap,
        pressed && styles.heartWrapPressed,
      ]}
      hitSlop={12}
    >
      <Animated.View style={animatedStyle}>
        <AnimatedIonicons
          name={favorite ? 'heart' : 'heart-outline'}
          size={size}
          style={iconStyle}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heartWrap: {
    padding: spacing.xs,
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  heartWrapPressed: {
    opacity: 0.9,
  },
  heartWrapHome: {
    width: 44,
    height: 44,
    borderRadius: 22,
    padding: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
});
