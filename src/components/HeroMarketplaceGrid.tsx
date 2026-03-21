import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, FlatList, Dimensions, Animated, Easing } from 'react-native';
import { Image } from 'expo-image';
import { radius, neutral, spacing } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CARD_WIDTH = 130;
const CARD_HEIGHT = 170;
const SPACING = 12;

const ROW1_IMAGES = [
  'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?q=80&w=400&auto=format&fit=crop', // Car
  'https://images.unsplash.com/photo-1595815771614-ade9d652a65d?q=80&w=400&auto=format&fit=crop', // House
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=400&auto=format&fit=crop', // Sneakers
  'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=400&auto=format&fit=crop', // Phone
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=400&auto=format&fit=crop', // Watch
  'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=400&auto=format&fit=crop', // Furniture
];

const ROW2_IMAGES = [
  'https://images.unsplash.com/photo-1520031441872-265e4ff70366?q=80&w=400&auto=format&fit=crop', // Another Car
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=400&auto=format&fit=crop', // Modern Villa
  'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop', // Fashion
  'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?q=80&w=400&auto=format&fit=crop', // Laptop
  'https://images.unsplash.com/photo-1526948531399-320e7e40f0ca?q=80&w=400&auto=format&fit=crop', // Smartphone scene
  'https://images.unsplash.com/photo-1511743335525-4ebf8695029a?q=80&w=400&auto=format&fit=crop', // Services atmosphere
];

// Double images for infinite scroll effect
const DATA1 = [...ROW1_IMAGES, ...ROW1_IMAGES];
const DATA2 = [...ROW2_IMAGES, ...ROW2_IMAGES];

export function HeroMarketplaceGrid() {
  const scrollX1 = useRef(new Animated.Value(0)).current;
  const scrollX2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animation Ligne 1 (défilement vers la gauche)
    const startRow1 = () => {
      scrollX1.setValue(0);
      Animated.timing(scrollX1, {
        toValue: -(CARD_WIDTH + SPACING) * ROW1_IMAGES.length,
        duration: 35000,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => startRow1());
    };

    // Animation Ligne 2 (défilement vers la gauche, vitesse légèrement différente)
    const startRow2 = () => {
      scrollX2.setValue(0);
      Animated.timing(scrollX2, {
        toValue: -(CARD_WIDTH + SPACING) * ROW2_IMAGES.length,
        duration: 45000,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => startRow2());
    };

    startRow1();
    startRow2();
  }, []);

  const renderItem = (item: string) => (
    <View style={styles.card}>
      <Image source={{ uri: item }} style={styles.image} contentFit="cover" />
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Row 1 */}
      <Animated.View style={[styles.row, { transform: [{ translateX: scrollX1 }] }]}>
        {DATA1.map((item, index) => (
          <View key={`row1-${index}`} style={styles.card}>
            <Image source={{ uri: item }} style={styles.image} contentFit="cover" />
          </View>
        ))}
      </Animated.View>

      {/* Row 2 */}
      <Animated.View style={[styles.row, { transform: [{ translateX: scrollX2 }], marginTop: SPACING }]}>
        {DATA2.map((item, index) => (
          <View key={`row2-${index}`} style={styles.card}>
            <Image source={{ uri: item }} style={styles.image} contentFit="cover" />
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: (CARD_HEIGHT * 2) + SPACING + spacing.xl,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 18,
    marginRight: SPACING,
    overflow: 'hidden',
    backgroundColor: neutral[100],
    borderWidth: 1,
    borderColor: neutral[200],
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
