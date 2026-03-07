/**
 * ListingGallery – premium horizontal swipeable image gallery for listing detail.
 * Full width; ~45% viewport height on larger screens for immersive experience; 4:3 on small.
 */

import React, { useCallback, useState } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
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
};

export function ListingGallery({ images }: ListingGalleryProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const slideHeight = getGalleryHeight(width, height);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalIndex, setModalIndex] = useState(0);

  const safeImages = (images ?? []).filter(
    (u): u is string => typeof u === 'string' && u.trim() !== ''
  );
  const hasImages = safeImages.length > 0;
  const total = safeImages.length;

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const index = Math.round(x / width);
      if (index >= 0 && index < total) {
        setCurrentIndex(index);
      }
    },
    [width, total]
  );

  const openFullScreen = useCallback((index: number) => {
    setModalIndex(index);
    setModalVisible(true);
  }, []);

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
          {safeImages.map((uri, index) => (
            <Pressable
              key={`${uri}-${index}`}
              style={[styles.slide, { width, height: slideHeight }]}
              onPress={() => openFullScreen(index)}
            >
              <Image
                source={{ uri }}
                style={styles.image}
                resizeMode="cover"
              />
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.indicator}>
          <Text style={styles.indicatorText}>
            {currentIndex + 1} / {total}
          </Text>
        </View>
      </View>
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
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
            <Image
              source={{ uri: safeImages[modalIndex] }}
              style={{ width, height }}
              resizeMode="contain"
            />
          </ScrollView>
          <Pressable
            style={[styles.modalClose, { top: insets.top + spacing.base }]}
            onPress={() => setModalVisible(false)}
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
