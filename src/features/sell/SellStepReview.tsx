import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ListingQualityResult } from '@/lib/listingQualityScore';
import { DRAFT_REMINDERS_NOTICE } from '@/lib/listingStatus';
import { SellQualityCard } from '@/features/sell/SellQualityCard';
import type { SellExistingDraftImage, SellPickedImage } from '@/features/sell/SellStepPhotos';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import type { SellFlowStepId } from './sellFlowSteps';
import {
  buildSellReviewDynamicAttributeLines,
  buildSellReviewPhotoUris,
  computeSellReviewPreviewImageHeight,
  formatSellReviewPriceDisplay,
  type SellReviewAttributeLine,
} from './sellReviewDisplay';
import type {
  CategoryAttributeOption,
  EffectiveCategoryAttributeDefinitionResolved,
} from '@/lib/categoryAttributesTypes';

type SellStepReviewProps = {
  totalPhotoCount: number;
  existingDraftImages: SellExistingDraftImage[];
  pickedImages: SellPickedImage[];
  title: string;
  description: string;
  priceStr: string;
  city: string;
  categoryLabel: string;
  listingQuality: ListingQualityResult;
  submitError: string | null;
  slowPublishHint: boolean;
  onEditStep: (stepId: SellFlowStepId) => void;
  dynamicAttributesPilotActive?: boolean;
  dynamicDefs?: EffectiveCategoryAttributeDefinitionResolved[];
  dynamicValues?: Record<string, string>;
  dynamicOptionsByDef?: Map<string, CategoryAttributeOption[]>;
};

function ReviewSectionHeader({
  title,
  editLabel,
  onEdit,
}: {
  title: string;
  editLabel: string;
  onEdit: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderTitle} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
        {title}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={editLabel}
        onPress={onEdit}
        hitSlop={8}
        style={({ pressed }) => [styles.editLinkBtn, pressed && styles.editLinkBtnPressed]}
      >
        <Text style={styles.editLinkText} maxFontSizeMultiplier={1.3}>
          Modifier
        </Text>
      </Pressable>
    </View>
  );
}

function InfoLine({
  label,
  value,
  lines,
}: {
  label: string;
  value: string;
  lines?: number;
}) {
  const display = value.trim() || '—';
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      <Text
        style={styles.infoValue}
        maxFontSizeMultiplier={1.35}
        {...(typeof lines === 'number' ? { numberOfLines: lines } : null)}
      >
        {display}
      </Text>
    </View>
  );
}

export function SellStepReview({
  totalPhotoCount,
  existingDraftImages,
  pickedImages,
  title,
  description,
  priceStr,
  city,
  categoryLabel,
  listingQuality,
  submitError,
  slowPublishHint,
  onEditStep,
  dynamicAttributesPilotActive = false,
  dynamicDefs = [],
  dynamicValues = {},
  dynamicOptionsByDef = new Map(),
}: SellStepReviewProps) {
  const { width: screenWidth } = useWindowDimensions();
  const previewImageHeight = useMemo(() => {
    const inner = Math.min(screenWidth, 520) - spacing.screenHorizontal * 2;
    return computeSellReviewPreviewImageHeight(inner);
  }, [screenWidth]);

  const photos = useMemo(
    () => buildSellReviewPhotoUris(totalPhotoCount, existingDraftImages, pickedImages),
    [totalPhotoCount, existingDraftImages, pickedImages]
  );
  const coverUri = photos[0]?.uri ?? null;
  const priceDisplay = useMemo(() => formatSellReviewPriceDisplay(priceStr), [priceStr]);

  const attributeLines: SellReviewAttributeLine[] = useMemo(() => {
    if (!dynamicAttributesPilotActive || dynamicDefs.length === 0) return [];
    return buildSellReviewDynamicAttributeLines(dynamicDefs, dynamicValues, dynamicOptionsByDef);
  }, [
    dynamicAttributesPilotActive,
    dynamicDefs,
    dynamicValues,
    dynamicOptionsByDef,
  ]);

  return (
    <View style={styles.root}>
      <View style={styles.previewCard} accessibilityRole="summary">
        {coverUri ? (
          <Image
            source={{ uri: coverUri }}
            style={[styles.previewImage, { height: previewImageHeight }]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.previewImagePlaceholder, { height: previewImageHeight }]}>
            <Ionicons name="image-outline" size={32} color={colors.textMuted} />
            <Text style={styles.previewPlaceholderText} maxFontSizeMultiplier={1.3}>
              Aucune photo
            </Text>
          </View>
        )}
        <View style={styles.previewBody}>
          <Text style={styles.previewTitle} numberOfLines={2} maxFontSizeMultiplier={1.35}>
            {title.trim() || "Titre de l'annonce"}
          </Text>
          <Text style={styles.previewPrice} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {priceDisplay}
          </Text>
          <View style={styles.previewMetaRow}>
            <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.previewMetaText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {city.trim() || 'Ville'}
            </Text>
            <Text style={styles.previewMetaDot} accessibilityElementsHidden>
              ·
            </Text>
            <Text style={styles.previewCategoryInline} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {categoryLabel.trim() || 'Catégorie'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.groupCard}>
        <ReviewSectionHeader
          title={`Photos (${totalPhotoCount})`}
          editLabel="Modifier les photos"
          onEdit={() => onEditStep('photos')}
        />
        {photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
            {photos.map((photo, index) => (
              <View key={`${photo.uri}-${index}`} style={styles.thumbWrap}>
                <Image source={{ uri: photo.uri }} style={styles.thumb} resizeMode="cover" />
                {photo.isCover ? (
                  <View style={styles.thumbCoverBadge}>
                    <Text style={styles.thumbCoverText}>Couverture</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.emptyPhotos} maxFontSizeMultiplier={1.3}>
            Ajoutez au moins une photo pour publier.
          </Text>
        )}
      </View>

      <View style={styles.groupCard}>
        <ReviewSectionHeader
          title="Informations de l&apos;annonce"
          editLabel="Modifier les informations"
          onEdit={() => onEditStep('details')}
        />
        <InfoLine label="Description" value={description} />
        {attributeLines.length > 0 ? (
          <View style={styles.attributesBlock}>
            <Text style={styles.attributesHeading} maxFontSizeMultiplier={1.3}>
              Caractéristiques
            </Text>
            {attributeLines.map((line) => (
              <InfoLine key={line.label} label={line.label} value={line.value} lines={3} />
            ))}
          </View>
        ) : null}
      </View>

      <SellQualityCard
        quality={listingQuality}
        compact
        onImprovePress={() => onEditStep('details')}
      />

      {submitError ? (
        <Text style={styles.submitError} accessibilityRole="alert" maxFontSizeMultiplier={1.35}>
          {submitError}
        </Text>
      ) : null}
      {slowPublishHint ? (
        <Text style={styles.slowHint} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.35}>
          Connexion lente. Vos informations restent enregistrées, sans republication automatique.
        </Text>
      ) : null}

      <Text style={styles.draftLegalNotice} maxFontSizeMultiplier={1.3}>
        {DRAFT_REMINDERS_NOTICE}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  previewCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  previewImage: {
    width: '100%',
    backgroundColor: colors.borderLight,
  },
  previewImagePlaceholder: {
    width: '100%',
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  previewPlaceholderText: {
    ...typography.sm,
    color: colors.textMuted,
  },
  previewBody: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  previewTitle: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  previewPrice: {
    ...typography.base,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  previewMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  previewMetaText: {
    ...typography.xs,
    color: colors.textSecondary,
    flexShrink: 1,
    maxWidth: '45%',
  },
  previewMetaDot: {
    ...typography.xs,
    color: colors.textMuted,
  },
  previewCategoryInline: {
    ...typography.xs,
    color: colors.textMuted,
    fontWeight: fontWeights.medium,
    flex: 1,
    minWidth: 0,
  },
  groupCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 44,
  },
  sectionHeaderTitle: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
    flex: 1,
  },
  editLinkBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  editLinkBtnPressed: {
    opacity: 0.75,
  },
  editLinkText: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
  thumbRow: {
    gap: spacing.xs,
    paddingVertical: 2,
  },
  thumbWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbCoverBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
  },
  thumbCoverText: {
    fontSize: 9,
    color: colors.surface,
    fontWeight: fontWeights.semibold,
  },
  emptyPhotos: {
    ...typography.sm,
    color: colors.warning,
  },
  infoLine: {
    gap: 2,
    paddingVertical: 1,
  },
  infoLabel: {
    ...typography.xs,
    fontWeight: fontWeights.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.25,
  },
  infoValue: {
    ...typography.sm,
    color: colors.text,
    lineHeight: 20,
  },
  submitError: {
    ...typography.sm,
    color: colors.error,
    lineHeight: 20,
  },
  slowHint: {
    ...typography.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  draftLegalNotice: {
    ...typography.xs,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: 2,
    paddingBottom: spacing.xs,
  },
  attributesBlock: {
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  attributesHeading: {
    ...typography.xs,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.25,
  },
});
