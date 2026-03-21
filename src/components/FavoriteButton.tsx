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
};

const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons);

export function FavoriteButton({ listingId, size = 24 }: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const favorite = isFavorite(listingId);
  
  const scale = useSharedValue(1);
  const progress = useSharedValue(favorite ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(favorite ? 1 : 0, { 
      duration: 200, 
      easing: Easing.out(Easing.quad) 
    });
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
      [colors.surface, colors.error]
    );
    return {
      color,
    };
  });

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.heartWrap, 
        pressed && styles.heartWrapPressed
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
    backgroundColor: 'rgba(15,23,42,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartWrapPressed: {
    opacity: 0.85,
  },
});
