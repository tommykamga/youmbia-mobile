import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ListingCategoryId } from '@/lib/listingCategories';
import { getSellParentIcon } from '@/lib/marketplaceCategories';
import type { MarketplaceCategory } from '@/services/categories';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import {
  getSellCategoryCardWidth,
  getSellCategoryColumnCount,
  SELL_CATEGORY_CARD_MIN_HEIGHT,
  SELL_CATEGORY_GRID_GAP,
} from './sellStepDetailsLayout';

const SELECTED_BG = 'rgba(22, 163, 74, 0.08)';

type SellCategoryPickerModalProps = {
  visible: boolean;
  onClose: () => void;
  parentCategories: MarketplaceCategory[];
  subcategoryOptions: MarketplaceCategory[];
  selectedParentCategoryId: ListingCategoryId | null;
  selectedChildCategoryId: ListingCategoryId | null;
  onSelectParent: (id: ListingCategoryId) => void;
  onSelectChild: (id: ListingCategoryId) => void;
};

export function SellCategoryPickerModal({
  visible,
  onClose,
  parentCategories,
  subcategoryOptions,
  selectedParentCategoryId,
  selectedChildCategoryId,
  onSelectParent,
  onSelectChild,
}: SellCategoryPickerModalProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const columns = useMemo(() => getSellCategoryColumnCount(screenWidth), [screenWidth]);
  const cardWidth = useMemo(() => getSellCategoryCardWidth(screenWidth, columns), [screenWidth, columns]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
        <View style={[styles.sheet, { paddingBottom: spacing.base + insets.bottom }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} accessibilityRole="header">
              Catégorie
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={styles.sectionLabel}>Famille</Text>
            <View style={styles.categoryGrid}>
              {parentCategories.map((category) => {
                const isSelected = selectedParentCategoryId === category.id;
                return (
                  <Pressable
                    key={category.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={category.name}
                    style={({ pressed }) => [
                      styles.categoryCard,
                      { width: cardWidth, minHeight: SELL_CATEGORY_CARD_MIN_HEIGHT },
                      isSelected && styles.categoryCardSelected,
                      pressed && styles.categoryCardPressed,
                    ]}
                    onPress={() => onSelectParent(category.id)}
                  >
                    {isSelected ? (
                      <View style={styles.categoryCardCheck}>
                        <Ionicons name="checkmark-circle" size={13} color={colors.primary} />
                      </View>
                    ) : null}
                    <Ionicons
                      name={getSellParentIcon(category.slug)}
                      size={16}
                      color={isSelected ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[styles.categoryCardLabel, isSelected && styles.categoryCardLabelSelected]}
                      numberOfLines={2}
                      maxFontSizeMultiplier={1.25}
                    >
                      {category.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {selectedParentCategoryId != null && subcategoryOptions.length > 0 ? (
              <View style={styles.subSection}>
                <Text style={styles.sectionLabel}>Sous-catégorie</Text>
                <View style={styles.subChipRow}>
                  {subcategoryOptions.map((sub) => {
                    const isSelected = selectedChildCategoryId === sub.id;
                    return (
                      <Pressable
                        key={sub.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        style={({ pressed }) => [
                          styles.subChip,
                          isSelected && styles.subChipSelected,
                          pressed && styles.subChipPressed,
                        ]}
                        onPress={() => onSelectChild(sub.id)}
                      >
                        <Text
                          style={[styles.subChipText, isSelected && styles.subChipTextSelected]}
                          numberOfLines={2}
                          maxFontSizeMultiplier={1.3}
                        >
                          {sub.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.doneBtn, pressed && styles.doneBtnPressed]}
          >
            <Text style={styles.doneBtnText}>Terminé</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    maxHeight: '88%',
    paddingTop: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  sheetTitle: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  closeBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPressed: {
    opacity: 0.75,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.base,
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typography.xs,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SELL_CATEGORY_GRID_GAP,
  },
  categoryCard: {
    paddingVertical: 6,
    paddingHorizontal: 3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    position: 'relative',
  },
  categoryCardSelected: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: SELECTED_BG,
  },
  categoryCardPressed: {
    opacity: 0.88,
  },
  categoryCardCheck: {
    position: 'absolute',
    top: 3,
    right: 3,
  },
  categoryCardLabel: {
    fontSize: 10,
    lineHeight: 13,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
  },
  categoryCardLabelSelected: {
    color: colors.text,
    fontWeight: fontWeights.semibold,
  },
  subSection: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  subChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  subChip: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.background,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  subChipSelected: {
    borderColor: colors.primary,
    backgroundColor: SELECTED_BG,
  },
  subChipPressed: {
    opacity: 0.92,
  },
  subChipText: {
    ...typography.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  subChipTextSelected: {
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  doneBtn: {
    marginHorizontal: spacing.base,
    marginTop: spacing.xs,
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  doneBtnPressed: {
    opacity: 0.92,
  },
  doneBtnText: {
    ...typography.base,
    fontWeight: fontWeights.bold,
    color: colors.surface,
  },
});
