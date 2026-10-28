/**
 * ListingGallery – premium horizontal swipeable image gallery for listing detail.
 * Full width; ~45% viewport height on larger screens for immersive experience; 4:3 on small.
 * Les URLs après la première peuvent être résolues en lazy (`lazySourcePaths`) pour limiter l’egress Storage.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  FlatList,
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
import { trackListingGallerySwiped } from '@/lib/analytics';
import { colors, spacing, radius, typography, fontWeights } from '@/theme';

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
  listingId?: string;
  /** Chemins Storage / URLs à signer au swipe (photos après la première). */
  lazySourcePaths?: string[];
};

export function ListingGallery(props: ListingGalleryProps) {
  // A new listing/photo set must not inherit resolved URLs or indices from the previous one.
  return <ListingGalleryContent key={JSON.stringify([props.listingId, props.images, props.lazySourcePaths])} {...props} />;
}

function FullScreenPhoto({ uri, unavailable, width, height, onZoomChange }: { uri: string | null; unavailable: boolean; width: number; height: number; onZoomChange: (zoomed: boolean) => void }) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  return (
    <ScrollView style={{ width, height }}
      contentContainerStyle={{ width, height, justifyContent: 'center', alignItems: 'center' }}
      maximumZoomScale={3} minimumZoomScale={1} bounces={false} centerContent directionalLockEnabled
      showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}
      onScroll={(event) => onZoomChange((event.nativeEvent.zoomScale ?? 1) > 1)} scrollEventThrottle={16}>
      {uri && !failed ? <Image source={{ uri }} style={StyleSheet.absoluteFill}
        resizeMode="contain" onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true); }}
        accessibilityLabel="Photo de l’annonce" /> : null}
      {failed || unavailable ? <Text style={styles.indicatorText}>Photo indisponible</Text>
        : loading || !uri ? <ActivityIndicator color={colors.surface} accessibilityLabel="Chargement de la photo" /> : null}
    </ScrollView>
  );
}

function ListingGalleryContent({ images, listingId, lazySourcePaths }: ListingGalleryProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const slideHeight = getGalleryHeight(width, height);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const galleryRef = useRef<ScrollView>(null);
  const currentIndexRef = useRef(0);

  const lazyLen = lazySourcePaths?.length ?? 0;
  const useLazyTail = lazyLen > 0;
  const eagerImages = useMemo(() => (images ?? []).filter((u): u is string => typeof u === 'string' && u.trim() !== ''), [images]);
  const [tailFailed, setTailFailed] = useState<Set<number>>(() => new Set());
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
      if (tailFailed.has(li)) continue;
      if (!path) { setTailFailed(prev => new Set(prev).add(li)); continue; }
      if (tailResolvedRef.current[li] || inflightLazyRef.current.has(li)) continue;
      inflightLazyRef.current.add(li);
      void resolveSingleListingImageUrl(path).then((url) => {
        inflightLazyRef.current.delete(li);
        if (!url) { setTailFailed(prev => new Set(prev).add(li)); return; }
        setTailResolved((prev) => {
          if (prev[li]) return prev;
          const next = [...prev];
          next[li] = url;
          return next;
        });
      }).catch(() => { inflightLazyRef.current.delete(li); setTailFailed(prev => new Set(prev).add(li)); });
    }
  }, [currentIndex, eagerImages.length, lazySourcePaths, tailFailed]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const index = Math.max(0, Math.min(totalSlides - 1, Math.round(x / width)));
      if (index >= 0 && index < totalSlides && index !== currentIndexRef.current) {
        if (listingId) {
          trackListingGallerySwiped({
            listing_id: listingId,
            gallery_image_index: index,
            gallery_direction: index > currentIndexRef.current ? 'next' : 'previous',
          });
        }
        currentIndexRef.current = index;
        setCurrentIndex(index);
      }
    },
    [width, totalSlides, listingId]
  );

  const openFullScreen = useCallback((index: number) => {
    currentIndexRef.current = index;
    setCurrentIndex(index);
    setModalVisible(true);
  }, []);

  const closeFullScreen = useCallback(() => {
    setModalVisible(false);
    setZoomed(false);
    galleryRef.current?.scrollTo({ x: currentIndexRef.current * width, animated: false });
  }, [width]);

  useEffect(() => {
    setZoomed(false);
    galleryRef.current?.scrollTo({ x: currentIndexRef.current * width, animated: false });
  }, [width]);

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
          ref={galleryRef}
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
                onPress={() => openFullScreen(index)}
                accessibilityRole="button"
                accessibilityLabel={`Ouvrir la photo ${index + 1} sur ${totalSlides}`}
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
        onRequestClose={closeFullScreen}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          {modalVisible ? <FlatList
            key={`fullscreen-${width}`}
            testID="listing-photo-viewer"
            style={StyleSheet.absoluteFill}
            data={Array.from({ length: totalSlides }, (_, index) => index)}
            horizontal
            pagingEnabled
            scrollEnabled={!zoomed}
            bounces={false}
            overScrollMode="never"
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={currentIndex}
            getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            keyExtractor={(index) => String(index)}
            renderItem={({ item: index }) => <FullScreenPhoto key={getSlideUri(index) ?? 'missing'} uri={getSlideUri(index)} unavailable={tailFailed.has(index - eagerImages.length)} width={width} height={height} onZoomChange={setZoomed} />}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            initialNumToRender={1}
            maxToRenderPerBatch={3}
            windowSize={3}
            extraData={tailResolved}
          /> : null}
          {totalSlides > 1 ? <View style={[styles.indicator, { bottom: insets.bottom + spacing.base }]} pointerEvents="none">
            <Text style={styles.indicatorText} accessibilityLiveRegion="polite">{currentIndex + 1} / {totalSlides}</Text>
          </View> : null}
          <Pressable
            style={[styles.modalClose, { top: insets.top + spacing.base }]}
            onPress={closeFullScreen}
            accessibilityRole="button"
            accessibilityLabel="Fermer les photos"
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
  modalClose: {
    position: 'absolute',
    right: spacing.base,
    padding: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
});
