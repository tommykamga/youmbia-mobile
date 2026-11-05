import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Input, Loader } from '@/components';
import { DynamicCategoryAttributesFields } from '@/features/sell/DynamicCategoryAttributesFields';
import { SellCategoryPickerModal } from '@/features/sell/SellCategoryPickerModal';
import type { ListingCategoryId } from '@/lib/listingCategories';
import { getSellParentIcon } from '@/lib/marketplaceCategories';
import type { MarketplaceCategory } from '@/services/categories';
import type { SellCategoryGuidance } from '@/lib/sellCategoryGuidance';
import {
  LISTING_DESCRIPTION_MAX,
  LISTING_TITLE_MAX,
} from '@/lib/listingPublishFormValidation';
import { DRAFT_REMINDERS_NOTICE } from '@/lib/listingStatus';
import type {
  CategoryAttributeOption,
  EffectiveCategoryAttributeDefinitionResolved,
} from '@/lib/categoryAttributesTypes';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import { getSellCitySuggestions } from './sellCitySuggestions';

const SELECTED_BG = 'rgba(22, 163, 74, 0.08)';

function SellFieldCounter({ counter, max }: { counter: number; max: number }) {
  const atLimit = counter >= max;
  return (
    <Text
      style={[styles.charCounter, atLimit ? styles.charCounterAtLimit : null]}
      accessibilityLabel={`${counter} caractères sur ${max}`}
      maxFontSizeMultiplier={1.2}
    >
      {counter} / {max}
    </Text>
  );
}

function SellDetailFormGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.formGroup}>
      <Text style={styles.formGroupTitle} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
        {title}
      </Text>
      <View style={styles.formGroupBody}>{children}</View>
    </View>
  );
}

type SellStepDetailsProps = {
  title: string;
  description: string;
  priceStr: string;
  city: string;
  cityRecognizedLabel: string | null;
  sellGuidance: SellCategoryGuidance;
  showTitleError: boolean;
  titleError: string | null;
  showDescriptionError: boolean;
  descriptionError: string | null;
  showPriceError: boolean;
  priceError: string | null;
  showCityError: boolean;
  cityError: string | null;
  onTitleChange: (text: string) => void;
  onDescriptionChange: (text: string) => void;
  onPriceChange: (text: string) => void;
  onCityChange: (text: string) => void;
  onCityChipPress: (label: string) => void;
  parentCategories: MarketplaceCategory[];
  subcategoryOptions: MarketplaceCategory[];
  selectedParentCategoryId: ListingCategoryId | null;
  selectedChildCategoryId: ListingCategoryId | null;
  onSelectParent: (id: ListingCategoryId) => void;
  onSelectChild: (id: ListingCategoryId) => void;
  categoriesLoading: boolean;
  categoriesError: string | null;
  dynamicAttributesPilotActive: boolean;
  dynamicDefs: EffectiveCategoryAttributeDefinitionResolved[];
  dynamicOptionsByDef: Map<string, CategoryAttributeOption[]>;
  dynamicLoading: boolean;
  dynamicValues: Record<string, string>;
  onDynamicChange: (key: string, value: string) => void;
};

export function SellStepDetails({
  title,
  description,
  priceStr,
  city,
  cityRecognizedLabel,
  sellGuidance,
  showTitleError,
  titleError,
  showDescriptionError,
  descriptionError,
  showPriceError,
  priceError,
  showCityError,
  cityError,
  onTitleChange,
  onDescriptionChange,
  onPriceChange,
  onCityChange,
  onCityChipPress,
  parentCategories,
  subcategoryOptions,
  selectedParentCategoryId,
  selectedChildCategoryId,
  onSelectParent,
  onSelectChild,
  categoriesLoading,
  categoriesError,
  dynamicAttributesPilotActive,
  dynamicDefs,
  dynamicOptionsByDef,
  dynamicLoading,
  dynamicValues,
  onDynamicChange,
}: SellStepDetailsProps) {
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [cityFieldFocused, setCityFieldFocused] = useState(false);

  const selectedParent = useMemo(
    () => parentCategories.find((c) => c.id === selectedParentCategoryId) ?? null,
    [parentCategories, selectedParentCategoryId]
  );
  const selectedChild = useMemo(
    () => subcategoryOptions.find((c) => c.id === selectedChildCategoryId) ?? null,
    [subcategoryOptions, selectedChildCategoryId]
  );

  const categorySummary = useMemo(() => {
    if (!selectedParent) return 'Choisir une catégorie';
    if (selectedChild) return `${selectedParent.name} · ${selectedChild.name}`;
    if (subcategoryOptions.length > 0) return `${selectedParent.name} · Sous-catégorie à préciser`;
    return selectedParent.name;
  }, [selectedParent, selectedChild, subcategoryOptions.length]);

  const citySuggestions = useMemo(() => {
    if (!cityFieldFocused) return [];
    return getSellCitySuggestions(city, 4);
  }, [city, cityFieldFocused]);

  const openCategoryPicker = useCallback(() => setCategoryPickerOpen(true), []);
  const closeCategoryPicker = useCallback(() => setCategoryPickerOpen(false), []);

  return (
    <View style={styles.root}>
      <SellDetailFormGroup title="Catégorie">
        {categoriesLoading ? (
          <View style={styles.loadingSlot}>
            <Loader />
          </View>
        ) : categoriesError ? (
          <Text style={styles.loadError}>{categoriesError}</Text>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Catégorie : ${categorySummary}`}
            onPress={openCategoryPicker}
            style={({ pressed }) => [
              styles.categorySelector,
              selectedParent && styles.categorySelectorFilled,
              pressed && styles.categorySelectorPressed,
            ]}
          >
            <View style={styles.categorySelectorIcon}>
              <Ionicons
                name={selectedParent ? getSellParentIcon(selectedParent.slug) : 'grid-outline'}
                size={20}
                color={selectedParent ? colors.primary : colors.textSecondary}
              />
            </View>
            <View style={styles.categorySelectorText}>
              <Text style={styles.categorySelectorLabel} maxFontSizeMultiplier={1.3}>
                {categorySummary}
              </Text>
              <Text style={styles.categorySelectorHint} maxFontSizeMultiplier={1.25}>
                Modifier la catégorie ou la sous-catégorie
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </SellDetailFormGroup>

      <SellDetailFormGroup title="Présentation">
        <View style={styles.fieldStack}>
          <View style={styles.labelCounterRow}>
            <Text style={styles.fieldLabel} maxFontSizeMultiplier={1.35}>
              Titre <Text style={styles.requiredMark}>*</Text>
            </Text>
            <SellFieldCounter counter={title.length} max={LISTING_TITLE_MAX} />
          </View>
          <Input
            placeholder={sellGuidance.titlePlaceholder}
            value={title}
            onChangeText={onTitleChange}
            maxLength={LISTING_TITLE_MAX}
            error={showTitleError ? (titleError ?? undefined) : undefined}
            containerStyle={styles.fieldInput}
          />
        </View>

        <View style={styles.fieldStack}>
          <View style={styles.labelCounterRow}>
            <Text style={styles.fieldLabel} maxFontSizeMultiplier={1.35}>
              Description <Text style={styles.requiredMark}>*</Text>
            </Text>
            <SellFieldCounter counter={description.length} max={LISTING_DESCRIPTION_MAX} />
          </View>
          <Input
            placeholder={sellGuidance.descriptionPlaceholder}
            value={description}
            onChangeText={onDescriptionChange}
            multiline
            numberOfLines={4}
            style={styles.descriptionInput}
            maxLength={LISTING_DESCRIPTION_MAX}
            error={showDescriptionError ? (descriptionError ?? undefined) : undefined}
            containerStyle={styles.fieldInput}
          />
        </View>

        {dynamicAttributesPilotActive && selectedParentCategoryId != null ? (
          <DynamicCategoryAttributesFields
            definitions={dynamicDefs}
            optionsByDefinitionId={dynamicOptionsByDef}
            loading={dynamicLoading}
            values={dynamicValues}
            onChange={onDynamicChange}
            progressive
          />
        ) : null}
      </SellDetailFormGroup>

      <SellDetailFormGroup title="Prix et localisation">
        <Input
          label="Prix (FCFA) *"
          placeholder="50000"
          value={priceStr}
          onChangeText={onPriceChange}
          keyboardType={Platform.OS === 'web' ? 'numeric' : 'number-pad'}
          error={showPriceError ? (priceError ?? undefined) : undefined}
          containerStyle={styles.fieldInput}
        />

        <Input
          label="Ville *"
          placeholder="Ex. Douala"
          value={city}
          onChangeText={onCityChange}
          onFocus={() => setCityFieldFocused(true)}
          onBlur={() => setCityFieldFocused(false)}
          maxLength={20}
          error={showCityError ? (cityError ?? undefined) : undefined}
          containerStyle={styles.fieldInput}
        />
        {cityRecognizedLabel ? (
          <Text style={styles.cityRecognized} maxFontSizeMultiplier={1.3}>
            Ville reconnue : {cityRecognizedLabel}
          </Text>
        ) : null}
        {citySuggestions.length > 0 ? (
          <View style={styles.citySuggestBlock}>
            <Text style={styles.citySuggestLabel} maxFontSizeMultiplier={1.25}>
              Suggestions
            </Text>
            <View style={styles.citySuggestRow}>
              {citySuggestions.map((label) => {
                const selected = city.trim().toLowerCase() === label.toLowerCase();
                return (
                  <Pressable
                    key={label}
                    accessibilityRole="button"
                    accessibilityLabel={`Ville ${label}`}
                    onPress={() => onCityChipPress(label)}
                    style={({ pressed }) => [
                      styles.citySuggestChip,
                      selected && styles.citySuggestChipSelected,
                      pressed && styles.citySuggestChipPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.citySuggestChipText,
                        selected && styles.citySuggestChipTextSelected,
                      ]}
                      maxFontSizeMultiplier={1.3}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </SellDetailFormGroup>

      <Text style={styles.draftLegalNotice} maxFontSizeMultiplier={1.3}>
        {DRAFT_REMINDERS_NOTICE}
      </Text>

      <SellCategoryPickerModal
        visible={categoryPickerOpen}
        onClose={closeCategoryPicker}
        parentCategories={parentCategories}
        subcategoryOptions={subcategoryOptions}
        selectedParentCategoryId={selectedParentCategoryId}
        selectedChildCategoryId={selectedChildCategoryId}
        onSelectParent={onSelectParent}
        onSelectChild={onSelectChild}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.base,
  },
  formGroup: {
    gap: spacing.sm,
  },
  formGroupTitle: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  formGroupBody: {
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    flex: 1,
  },
  requiredMark: {
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
  },
  labelCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  fieldStack: {
    gap: spacing.xs,
  },
  fieldInput: {
    marginBottom: 0,
  },
  charCounter: {
    ...typography.xs,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  charCounterAtLimit: {
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
  },
  descriptionInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  loadingSlot: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadError: {
    ...typography.sm,
    color: colors.error,
  },
  categorySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  categorySelectorFilled: {
    borderColor: colors.primary + '55',
    backgroundColor: SELECTED_BG,
  },
  categorySelectorPressed: {
    opacity: 0.92,
  },
  categorySelectorIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categorySelectorText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  categorySelectorLabel: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  categorySelectorHint: {
    ...typography.xs,
    color: colors.textMuted,
  },
  cityRecognized: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: -spacing.xs,
  },
  citySuggestBlock: {
    gap: spacing.xs,
    marginTop: -spacing.xs,
  },
  citySuggestLabel: {
    ...typography.xs,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  citySuggestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  citySuggestChip: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  citySuggestChipSelected: {
    borderColor: colors.primary,
    backgroundColor: SELECTED_BG,
  },
  citySuggestChipPressed: {
    opacity: 0.9,
  },
  citySuggestChipText: {
    ...typography.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  citySuggestChipTextSelected: {
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  draftLegalNotice: {
    ...typography.xs,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
});
