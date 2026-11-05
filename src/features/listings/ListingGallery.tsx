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
  Platform,
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
/** Hauteur compacte lorsqu’aucune photo n’est disponible (évite un grand vide). */
export const LISTING_GALLERY_PLACEHOLDER_HEIGHT = 168;
/** Viewport height above this uses percentage-based gallery height (~45%). */
const LARGE_SCREEN_HEIGHT = 600;

function getGalleryHeight(width: number, height: number, hasPhotos: boolean): number {
  if (!hasPhotos) return LISTING_GALLERY_PLACEHOLDER_HEIGHT;
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
  /** Retour flottant. Absent des tests et des réutilisations qui n’en ont pas besoin. */
  onBackPress?: () => void;
  isFavorite?: boolean;
  onFavoritePress?: () => void;
  /** Décalage haut (encoche, bannière). Sinon la safe area de la galerie. */
  overlayTopInset?: number;
  onSharePress?: () => void;
  shareLoading?: boolean;
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

function GalleryOverlay({
  top,
  onBackPress,
  isFavorite,
  onFavoritePress,
  onSharePress,
  shareLoading,
}: {
  top: number;
  onBackPress?: () => void;
  isFavorite?: boolean;
  onFavoritePress?: () => void;
  onSharePress?: () => void;
  shareLoading?: boolean;
}) {
  if (!onBackPress && !onFavoritePress && !onSharePress) return null;
  return (
    <View style={[styles.overlay, { top }]} pointerEvents="box-none">
      {onBackPress ? (
        <Pressable
          onPress={onBackPress}
          style={({ pressed }) => [styles.overlayBtn, pressed && styles.overlayBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={8}
        >
          <Ionicons
            name={Platform.OS === 'android' ? 'arrow-back' : 'chevron-back'}
            size={26}
            color={colors.text}
          />
        </Pressable>
      ) : (
        <View style={styles.overlaySpacer} />
      )}
      <View style={styles.overlayRight} pointerEvents="box-none">
        {onSharePress ? (
          <Pressable
            onPress={onSharePress}
            disabled={shareLoading}
            style={({ pressed }) => [styles.overlayBtn, pressed && styles.overlayBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Partager l'annonce"
            hitSlop={8}
          >
            {shareLoading ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <Ionicons name="share-outline" size={22} color={colors.text} />
            )}
          </Pressable>
        ) : null}
        {onFavoritePress ? (
          <Pressable
            onPress={onFavoritePress}
            style={({ pressed }) => [styles.overlayBtn, pressed && styles.overlayBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            accessibilityState={{ selected: isFavorite === true }}
            hitSlop={8}
          >
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={24}
              color={isFavorite ? colors.error : colors.text}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ListingGalleryContent({
  images,
  listingId,
  lazySourcePaths,
  onBackPress,
  isFavorite,
  onFavoritePress,
  overlayTopInset,
  onSharePress,
  shareLoading = false,
}: ListingGalleryProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const eagerImages = useMemo(() => (images ?? []).filter((u): u is string => typeof u === 'string' && u.trim() !== ''), [images]);
  const lazyLen = lazySourcePaths?.length ?? 0;
  const useLazyTail = lazyLen > 0;
  const totalSlidesPreview = useLazyTail ? eagerImages.length + lazyLen : eagerImages.length;
  const hasImages = totalSlidesPreview > 0;
  const slideHeight = getGalleryHeight(width, height, hasImages);
  const chromeTop = overlayTopInset ?? insets.top + spacing.sm;
  const [failedSlides, setFailedSlides] = useState<Set<number>>(() => new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const galleryRef = useRef<ScrollView>(null);
  const currentIndexRef = useRef(0);

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

  if (totalSlides === 0) {
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
        <GalleryOverlay
          top={chromeTop}
          onBackPress={onBackPress}
          isFavorite={isFavorite}
          onFavoritePress={onFavoritePress}
          onSharePress={onSharePress}
          shareLoading={shareLoading}
        />
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
                {uri && !failedSlides.has(index) ? (
                  <Image
                    source={{ uri }}
                    style={styles.image}
                    resizeMode="contain"
                    accessibilityLabel={`Photo ${index + 1} sur ${totalSlides}`}
                    onError={() => {
                      setFailedSlides((prev) => {
                        if (prev.has(index)) return prev;
                        const next = new Set(prev);
                        next.add(index);
                        return next;
                      });
                    }}
                  />
                ) : uri && failedSlides.has(index) ? (
                  <View style={styles.lazyPlaceholder}>
                    <Ionicons name="image-outline" size={36} color={colors.textTertiary} />
                    <Text style={styles.missingPhotoText}>Photo indisponible</Text>
                  </View>
                ) : (
                  <View style={styles.lazyPlaceholder}>
                    <ActivityIndicator color={colors.textMuted} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
        {totalSlides > 1 ? (
          <View style={styles.indicator} pointerEvents="none">
            <Text style={styles.indicatorText} accessibilityLiveRegion="polite">
              {currentIndex + 1} / {totalSlides}
            </Text>
          </View>
        ) : null}
        <GalleryOverlay
          top={chromeTop}
          onBackPress={onBackPress}
          isFavorite={isFavorite}
          onFavoritePress={onFavoritePress}
          onSharePress={onSharePress}
          shareLoading={shareLoading}
        />
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
  missingPhotoText: {
    ...typography.sm,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  overlay: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
  },
  overlayBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayBtnPressed: {
    opacity: 0.88,
  },
  overlaySpacer: {
    width: 44,
    height: 44,
  },
  overlayRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
