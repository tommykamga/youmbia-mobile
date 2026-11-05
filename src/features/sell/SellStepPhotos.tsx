import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  useWindowDimensions,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import {
  computeSellPhotoGridLayout,
  estimateSellPhotoGridContainerWidth,
  type SellPhotoGridLayout,
} from './sellPhotoGridLayout';

export const MAX_SELL_LISTING_PHOTOS = 4;

export type SellExistingDraftImage = {
  id: string;
  path: string;
  sort_order: number | null;
  displayUrl: string;
};

export type SellPickedImage = { uri: string; base64: string | null; mimeType?: string | null };

type SellStepPhotosProps = {
  totalPhotoCount: number;
  existingDraftImages: SellExistingDraftImage[];
  pickedImages: SellPickedImage[];
  duplicateSourceId: string | null;
  editingDraftId: string | null;
  onPickImages: () => void;
  onRemoveImage: (index: number) => void;
};

function helperLine(
  duplicateSourceId: string | null,
  editingDraftId: string | null,
  totalPhotoCount: number
): string {
  if (duplicateSourceId) {
    return 'Copie : modifiez les photos (1 à 4). La première reste la couverture.';
  }
  if (editingDraftId) {
    return 'Brouillon : conservez ou complétez vos photos (1 à 4). La première photo sera la couverture.';
  }
  if (totalPhotoCount === 0) {
    return 'Jusqu’à 4 photos. La première photo sera la couverture. Au moins 1 photo pour publier.';
  }
  return 'La première photo sera la couverture. Jusqu’à 4 au total.';
}

export function SellStepPhotos({
  totalPhotoCount,
  existingDraftImages,
  pickedImages,
  duplicateSourceId,
  editingDraftId,
  onPickImages,
  onRemoveImage,
}: SellStepPhotosProps) {
  const { width: screenWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);

  const containerWidth = measuredWidth ?? estimateSellPhotoGridContainerWidth(screenWidth, spacing.screenHorizontal);
  const gridLayout: SellPhotoGridLayout = useMemo(
    () => computeSellPhotoGridLayout(containerWidth),
    [containerWidth]
  );

  const onGridLayout = useCallback((event: LayoutChangeEvent) => {
    const w = Math.floor(event.nativeEvent.layout.width);
    if (w > 0) setMeasuredWidth(w);
  }, []);

  const helperText = helperLine(duplicateSourceId, editingDraftId, totalPhotoCount);

  const slotStyle = useMemo(
    () => ({
      width: gridLayout.columns === 2 ? gridLayout.slotSize : Math.min(gridLayout.slotSize, containerWidth),
      height: gridLayout.slotSize,
      flexGrow: 0,
      flexShrink: 0,
    }),
    [gridLayout, containerWidth]
  );

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.counter} accessibilityLabel={`${totalPhotoCount} photos sur ${MAX_SELL_LISTING_PHOTOS}`}>
          {totalPhotoCount} / {MAX_SELL_LISTING_PHOTOS} photos
        </Text>
        {gridLayout.columns === 1 ? (
          <Text style={styles.singleColHint} accessibilityRole="text">
            Affichage une colonne (espace réduit)
          </Text>
        ) : null}
      </View>
      <Text style={styles.helper}>{helperText}</Text>

      <View
        style={[styles.grid, { columnGap: gridLayout.gap, rowGap: gridLayout.gap }]}
        onLayout={onGridLayout}
      >
        {Array.from({ length: MAX_SELL_LISTING_PHOTOS }, (_, index) => {
          const existing = existingDraftImages[index];
          const picked =
            index >= existingDraftImages.length
              ? pickedImages[index - existingDraftImages.length]
              : undefined;
          const displayUri = existing?.displayUrl ?? picked?.uri;

          if (displayUri) {
            return (
              <View
                key={`photo-slot-${index}`}
                style={[styles.slot, slotStyle]}
                accessibilityLabel={
                  index === 0 ? `Photo couverture, position ${index + 1}` : `Photo ${index + 1}`
                }
              >
                <Image source={{ uri: displayUri }} style={styles.slotImage} resizeMode="cover" />
                {index === 0 ? (
                  <View style={styles.coverBadge} pointerEvents="none">
                    <Text style={styles.coverBadgeText}>Couverture</Text>
                  </View>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Supprimer la photo ${index + 1}`}
                  onPress={() => onRemoveImage(index)}
                  style={styles.removeBtn}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={14} color={colors.text} />
                </Pressable>
              </View>
            );
          }

          const isPrimaryAdd = totalPhotoCount === 0 && index === 0;
          const canAdd = totalPhotoCount < MAX_SELL_LISTING_PHOTOS;

          return (
            <Pressable
              key={`photo-slot-${index}`}
              accessibilityRole="button"
              accessibilityLabel={isPrimaryAdd ? 'Ajouter une photo' : 'Ajouter une autre photo'}
              accessibilityState={{ disabled: !canAdd }}
              style={({ pressed }) => [
                styles.slot,
                isPrimaryAdd ? styles.slotPrimaryAdd : styles.slotEmpty,
                slotStyle,
                pressed && canAdd && styles.slotPressed,
                !canAdd && styles.slotDisabled,
              ]}
              onPress={() => {
                if (canAdd) onPickImages();
              }}
              disabled={!canAdd}
            >
              {isPrimaryAdd ? (
                <View style={styles.primaryAddContent}>
                  <View style={styles.primaryAddIconWrap}>
                    <Ionicons name="camera-outline" size={22} color={colors.primary} />
                  </View>
                  <Text style={styles.primaryAddTitle}>Ajouter</Text>
                </View>
              ) : (
                <Ionicons name="add" size={22} color={canAdd ? colors.primary : colors.textMuted} />
              )}
            </Pressable>
          );
        })}
      </View>

      {totalPhotoCount > 0 && totalPhotoCount < MAX_SELL_LISTING_PHOTOS ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ajouter d'autres photos"
          onPress={onPickImages}
          style={({ pressed }) => [styles.addMoreRow, pressed && styles.addMorePressed]}
        >
          <Ionicons name="images-outline" size={16} color={colors.primary} />
          <Text style={styles.addMoreText}>Plus de photos</Text>
        </Pressable>
      ) : null}

      <Text style={styles.tip}>Photos nettes, bonne lumière. Autorisez la galerie si iOS le demande.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  counter: {
    ...typography.sm,
    color: colors.text,
    fontWeight: fontWeights.bold,
    fontVariant: ['tabular-nums'],
  },
  singleColHint: {
    ...typography.xs,
    color: colors.textMuted,
    flexShrink: 1,
  },
  helper: {
    ...typography.sm,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  grid: {
    alignSelf: 'stretch',
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    marginTop: spacing.xs,
  },
  slot: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    position: 'relative',
  },
  slotEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  slotPrimaryAdd: {
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderColor: 'rgba(22, 163, 74, 0.35)',
    backgroundColor: 'rgba(22, 163, 74, 0.06)',
  },
  slotPressed: {
    opacity: 0.92,
  },
  slotDisabled: {
    opacity: 0.45,
  },
  slotImage: {
    width: '100%',
    height: '100%',
  },
  coverBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
  },
  coverBadgeText: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: fontWeights.semibold,
    color: colors.surface,
  },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.text,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  primaryAddContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  primaryAddIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryAddTitle: {
    ...typography.xs,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  addMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '44',
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  addMorePressed: {
    opacity: 0.9,
  },
  addMoreText: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
  tip: {
    ...typography.xs,
    color: colors.textMuted,
    lineHeight: 16,
    marginTop: spacing.xs,
  },
});
