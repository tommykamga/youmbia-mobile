/**
 * ListingGallery – premium horizontal swipeable image gallery for listing detail.
 * Full width; ~45% viewport height on larger screens for immersive experience; 4:3 on small.
 * Les URLs après la première peuvent être résolues en lazy (`lazySourcePaths`) pour limiter l’egress Storage.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  Image,
  StyleSheet,
  useWindowDimensions,
  Text,
  Pressable,
  Modal,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { resolveSingleListingImageUrl } from '@/lib/listingImageUrl';
import { colors, spacing, radius, typography, fontWeights } from '@/theme';

const ZOOM_MAX = 3;
const ZOOM_MIN = 1;
const ASPECT_RATIO = 4 / 3;
/** Viewport height above this uses percentage-based gallery height (~45%). */
const LARGE_SCREEN_HEIGHT = 600;

function getGalleryHeight(width: number, height: number): number {
  const aspectHeight = width / ASPECT_RATIO;
  if (height >= LARGE_SCREEN_HEIGHT) {
    return Math.max(aspectHeight, height * 0.45);
  }
  return aspectHeight;
}

type ListingGalleryProps = {
  images: string[];
  /** Chemins Storage / URLs à signer au swipe (photos après la première). */
  lazySourcePaths?: string[];
};

export function ListingGallery({ images, lazySourcePaths }: ListingGalleryProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const slideHeight = getGalleryHeight(width, height);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalUri, setModalUri] = useState<string | null>(null);

  const lazyLen = lazySourcePaths?.length ?? 0;
  const useLazyTail = lazyLen > 0;
  const eagerImages = (images ?? []).filter((u): u is string => typeof u === 'string' && u.trim() !== '');
  const [tailResolved, setTailResolved] = useState<string[]>(() => Array(lazyLen).fill(''));
  const tailResolvedRef = useRef<string[]>(tailResolved);
  tailResolvedRef.current = tailResolved;
  const inflightLazyRef = useRef<Set<number>>(new Set());

  const totalSlides = useLazyTail ? eagerImages.length + lazyLen : eagerImages.length;

  const getSlideUri = useCallback(
    (index: number): string | null => {
      if (index < eagerImages.length) return eagerImages[index] ?? null;
      const li = index - eagerImages.length;
      if (li < 0 || li >= lazyLen || !lazySourcePaths) return null;
      const r = tailResolved[li];
      return r && r.trim() !== '' ? r : null;
    },
    [eagerImages, lazyLen, lazySourcePaths, tailResolved]
  );

  useEffect(() => {
    if (!lazySourcePaths?.length) return;
    const start = currentIndex - eagerImages.length;
    for (const offset of [0, 1]) {
      const li = start + offset;
      if (li < 0 || li >= lazySourcePaths.length) continue;
      const path = lazySourcePaths[li];
      if (!path) continue;
      if (tailResolvedRef.current[li] || inflightLazyRef.current.has(li)) continue;
      inflightLazyRef.current.add(li);
      void resolveSingleListingImageUrl(path).then((url) => {
        inflightLazyRef.current.delete(li);
        if (!url) return;
        setTailResolved((prev) => {
          if (prev[li]) return prev;
          const next = [...prev];
          next[li] = url;
          return next;
        });
      });
    }
  }, [currentIndex, eagerImages.length, lazySourcePaths]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const index = Math.round(x / width);
      if (index >= 0 && index < totalSlides) {
        setCurrentIndex(index);
      }
    },
    [width, totalSlides]
  );

  const openFullScreen = useCallback(
    async (index: number) => {
      let uri = getSlideUri(index);
      if (!uri && lazySourcePaths && index >= eagerImages.length) {
        const li = index - eagerImages.length;
        const path = lazySourcePaths[li];
        if (path) {
          uri = await resolveSingleListingImageUrl(path);
          if (uri) {
            setTailResolved((prev) => {
              if (prev[li]) return prev;
              const next = [...prev];
              next[li] = uri!;
              return next;
            });
          }
        }
      }
      if (!uri) return;
      setModalUri(uri);
      setModalVisible(true);
    },
    [getSlideUri, lazySourcePaths, eagerImages.length]
  );

  const hasImages = totalSlides > 0;

  if (!hasImages) {
    return (
      <View style={[styles.container, { width, height: slideHeight }]}>
        <View style={styles.placeholderInner}>
          <Ionicons
            name="image-outline"
            size={48}
            color={colors.textTertiary}
            style={styles.placeholderIcon}
          />
          <Text style={styles.placeholderText}>Aucune photo</Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.container, { width, height: slideHeight }]}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scrollContent}
          decelerationRate="fast"
        >
          {Array.from({ length: totalSlides }, (_, index) => {
            const uri = getSlideUri(index);
            return (
              <Pressable
                key={`slide-${index}`}
                style={[styles.slide, { width, height: slideHeight }]}
                onPress={() => void openFullScreen(index)}
              >
                {uri ? (
                  <Image source={{ uri }} style={styles.image} resizeMode="cover" />
                ) : (
                  <View style={styles.lazyPlaceholder}>
                    <ActivityIndicator color={colors.textMuted} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.indicator}>
          <Text style={styles.indicatorText}>
            {currentIndex + 1} / {totalSlides}
          </Text>
        </View>
      </View>
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setModalVisible(false);
          setModalUri(null);
        }}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <ScrollView
            style={StyleSheet.absoluteFill}
            contentContainerStyle={[
              styles.modalScrollContent,
              { minWidth: width, minHeight: height },
            ]}
            maximumZoomScale={ZOOM_MAX}
            minimumZoomScale={ZOOM_MIN}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            centerContent
          >
            {modalUri ? (
              <Image source={{ uri: modalUri }} style={{ width, height }} resizeMode="contain" />
            ) : null}
          </ScrollView>
          <Pressable
            style={[styles.modalClose, { top: insets.top + spacing.base }]}
            onPress={() => {
              setModalVisible(false);
              setModalUri(null);
            }}
            hitSlop={16}
          >
            <Ionicons name="close" size={28} color={colors.surface} />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceMuted,
    position: 'relative',
  },
  scrollContent: {
    flexGrow: 0,
  },
  slide: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  lazyPlaceholder: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  indicator: {
    position: 'absolute',
    bottom: spacing.base,
    right: spacing.base,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 9999,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  indicatorText: {
    ...typography.xs,
    fontWeight: fontWeights.semibold,
    color: colors.surface,
    letterSpacing: 0.3,
  },
  placeholderInner: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  placeholderIcon: {
    marginBottom: spacing.sm,
  },
  placeholderText: {
    ...typography.sm,
    color: colors.textTertiary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScrollContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    right: spacing.base,
    padding: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
});
