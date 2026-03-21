import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { radius, neutral, spacing } from '@/theme';

/**
 * 8 visuels sans doublon de catégorie — petites annonces YOUMBIA (Afrique / Cameroun).
 * R1 : auto en rue · moto · téléphone posé · textiles / mode marché.
 * R2 : terrain-chantier · façade maison locale · frigo · commerce de rue.
 */
const ROW1_IMAGES = [
  'https://images.unsplash.com/photo-1578662996442-48f60103fc96?auto=format&fit=crop&w=800&q=85',
  'https://images.unsplash.com/photo-1558981852-426c6c22a060?auto=format&fit=crop&w=800&q=85',
  'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?auto=format&fit=crop&w=800&q=85',
  'https://images.unsplash.com/photo-1605152276897-4f618f831968?auto=format&fit=crop&w=800&q=85',
];

const ROW_CARD_COUNT = ROW1_IMAGES.length;

const ROW2_IMAGES = [
  'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=800&q=80&crop=entropy',
  'https://images.unsplash.com/photo-1600585154084-4e5fe7c39198?auto=format&fit=crop&w=800&q=80&crop=entropy',
  'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?auto=format&fit=crop&w=800&q=80&crop=entropy',
  'https://images.pexels.com/photos/6311677/pexels-photo-6311677.jpeg?auto=compress&cs=tinysrgb&w=800',
];

const SPACING = 10;
const ROW1_DURATION_MS = 38_000;
const ROW2_DURATION_MS = 48_000;
/** Décalage entre les deux rangées (effet « vivant »). */
const ROW_STAGGER_RATIO = 0.55;

function buildLoopRow(urls: string[]) {
  return [...urls, ...urls];
}

export function HeroMarketplaceGrid() {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [activeDot, setActiveDot] = useState(0);

  const translateX1 = useSharedValue(0);
  const translateX2 = useSharedValue(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setLayout((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height }
    );
  }, []);

  const { cardWidth, cardHeight, segment1, segment2 } = useMemo(() => {
    const h = layout.height;
    const w = layout.width;
    if (h < 8 || w < 8) {
      return {
        cardWidth: 0,
        cardHeight: 0,
        segment1: 1,
        segment2: 1,
      };
    }
    const dotsReserve = 22;
    const rowGap = 8;
    const innerH = Math.max(0, h - dotsReserve - rowGap);
    const rh = innerH / 2;
    /** Ratio 3:4 portrait — largeur : hauteur = 3 : 4 */
    const cw = Math.min((rh * 3) / 4, w * 0.36);
    const ch = (cw * 4) / 3;
    const s1 = (cw + SPACING) * ROW_CARD_COUNT;
    const s2 = (cw + SPACING) * ROW2_IMAGES.length;
    return { cardWidth: cw, cardHeight: ch, segment1: s1, segment2: s2 };
  }, [layout.height, layout.width]);

  const stride = useSharedValue(100);
  const lastDot = useSharedValue(-1);

  useEffect(() => {
    stride.value = cardWidth + SPACING;
  }, [cardWidth, stride]);

  useEffect(() => {
    lastDot.value = -1;
  }, [cardWidth, lastDot]);

  useEffect(() => {
    if (segment1 <= 1 || segment2 <= 1 || cardWidth < 4) return;

    cancelAnimation(translateX1);
    cancelAnimation(translateX2);

    const stagger = ROW_STAGGER_RATIO * (cardWidth + SPACING);
    translateX1.value = 0;
    translateX2.value = -stagger;

    translateX1.value = withRepeat(
      withTiming(-segment1, {
        duration: ROW1_DURATION_MS,
        easing: Easing.linear,
      }),
      -1,
      false
    );

    translateX2.value = withRepeat(
      withTiming(-stagger - segment2, {
        duration: ROW2_DURATION_MS,
        easing: Easing.linear,
      }),
      -1,
      false
    );

    return () => {
      cancelAnimation(translateX1);
      cancelAnimation(translateX2);
    };
  }, [segment1, segment2, cardWidth, translateX1, translateX2]);

  const setDotSafe = useCallback((i: number) => {
    setActiveDot(i);
  }, []);

  useAnimatedReaction(
    () => translateX1.value,
    (x) => {
      const w = stride.value;
      if (w < 4) return;
      const seg = w * ROW_CARD_COUNT;
      const normalized = Math.abs(x) % seg;
      const idx = Math.min(ROW_CARD_COUNT - 1, Math.floor(normalized / w));
      if (idx !== lastDot.value) {
        lastDot.value = idx;
        runOnJS(setDotSafe)(idx);
      }
    }
  );

  const row1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX1.value }],
  }));

  const row2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX2.value }],
  }));

  const data1 = useMemo(() => buildLoopRow(ROW1_IMAGES), []);
  const data2 = useMemo(() => buildLoopRow(ROW2_IMAGES), []);

  if (cardWidth < 4) {
    return <View style={styles.outer} onLayout={onLayout} />;
  }

  return (
    <View style={styles.outer} onLayout={onLayout}>
      <View style={styles.clip}>
        <Animated.View style={[styles.row, row1Style]}>
          {data1.map((uri, index) => (
            <View
              key={`r1-${index}`}
              style={[
                styles.card,
                {
                  width: cardWidth,
                  height: cardHeight,
                  marginRight: SPACING,
                },
              ]}
            >
              <Image
                source={{ uri }}
                style={styles.image}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={120}
              />
            </View>
          ))}
        </Animated.View>
        <Animated.View style={[styles.row, row2Style, styles.rowSecond]}>
          {data2.map((uri, index) => (
            <View
              key={`r2-${index}`}
              style={[
                styles.card,
                {
                  width: cardWidth,
                  height: cardHeight,
                  marginRight: SPACING,
                },
              ]}
            >
              <Image
                source={{ uri }}
                style={styles.image}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={120}
              />
            </View>
          ))}
        </Animated.View>
      </View>
      <View style={styles.dotsRow} pointerEvents="none">
        {ROW1_IMAGES.map((_, i) => (
          <View
            key={`dot-${i}`}
            style={[styles.dot, i === activeDot && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
  clip: {
    flex: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
  },
  rowSecond: {
    marginTop: 8,
  },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: neutral[100],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: neutral[200],
  },
  image: {
    width: '100%',
    height: '100%',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingTop: spacing.sm,
    height: 22,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: neutral[300],
    opacity: 0.55,
  },
  dotActive: {
    backgroundColor: neutral[500],
    opacity: 1,
    transform: [{ scaleX: 1.35 }],
  },
});
