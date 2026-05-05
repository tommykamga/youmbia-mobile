/**
 * Champs attributs dynamiques — création d’annonce (pilotes Véhicules + Électronique).
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { Input } from '@/components/Input';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import type {
  CategoryAttributeOption,
  EffectiveCategoryAttributeDefinitionResolved,
} from '@/lib/categoryAttributesTypes';

export type DynamicAttributeValues = Record<string, string>;

type Props = {
  definitions: EffectiveCategoryAttributeDefinitionResolved[];
  optionsByDefinitionId: Map<string, CategoryAttributeOption[]>;
  loading: boolean;
  values: DynamicAttributeValues;
  onChange: (key: string, value: string) => void;
};

function fieldLabel(def: EffectiveCategoryAttributeDefinitionResolved): string {
  return def.required ? `${def.label_fr} *` : def.label_fr;
}

export function DynamicCategoryAttributesFields({
  definitions,
  optionsByDefinitionId,
  loading,
  values,
  onChange,
}: Props) {
  const [selectOpen, setSelectOpen] = useState(false);
  const [activeSelectKey, setActiveSelectKey] = useState<string | null>(null);
  const [activeSelectDefId, setActiveSelectDefId] = useState<string | null>(null);
  const [activeSelectLabel, setActiveSelectLabel] = useState<string>('');

  const openSelect = useCallback(
    (def: EffectiveCategoryAttributeDefinitionResolved) => {
      setActiveSelectKey(def.key);
      setActiveSelectDefId(def.definition_id);
      setActiveSelectLabel(fieldLabel(def));
      setSelectOpen(true);
    },
    []
  );

  const closeSelect = useCallback(() => {
    setSelectOpen(false);
  }, []);

  const activeOptions = useMemo(() => {
    if (!activeSelectDefId) return [];
    return optionsByDefinitionId.get(activeSelectDefId) ?? [];
  }, [activeSelectDefId, optionsByDefinitionId]);

  const activeValue = activeSelectKey ? (values[activeSelectKey] ?? '') : '';
  const activeValueLabel = useMemo(() => {
    if (!activeValue) return 'Sélectionnez…';
    const opt = activeOptions.find((o) => o.value === activeValue);
    return opt?.label_fr ?? activeValue;
  }, [activeOptions, activeValue]);

  const handleSelectPick = useCallback(
    (next: string) => {
      if (!activeSelectKey) return;
      onChange(activeSelectKey, next);
      closeSelect();
    },
    [activeSelectKey, onChange, closeSelect]
  );

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>Chargement des champs complémentaires…</Text>
      </View>
    );
  }

  if (definitions.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.sectionTitle}>Caractéristiques</Text>
      <Text style={styles.sectionHint}>
        Complétez les caractéristiques pour une meilleure visibilité.
      </Text>

      {definitions.map((def) => {
        const v = values[def.key] ?? '';
        const label = fieldLabel(def);

        switch (def.type) {
          case 'text':
            return (
              <Input
                key={def.key}
                label={label}
                placeholder=""
                value={v}
                onChangeText={(t) => onChange(def.key, t)}
              />
            );
          case 'number':
            return (
              <Input
                key={def.key}
                label={label}
                placeholder="0"
                value={v}
                onChangeText={(t) => onChange(def.key, t)}
                keyboardType={Platform.OS === 'web' ? 'numeric' : 'decimal-pad'}
              />
            );
          case 'date':
            return (
              <Input
                key={def.key}
                label={label}
                placeholder="AAAA-MM-JJ"
                value={v}
                onChangeText={(t) => onChange(def.key, t)}
              />
            );
          case 'boolean': {
            const boolOptions: { value: string; label: string }[] = [
              { value: '', label: '—' },
              { value: 'true', label: 'Oui' },
              { value: 'false', label: 'Non' },
            ];
            return (
              <View key={def.key} style={styles.fieldBlock}>
                <Text style={styles.label}>{label}</Text>
                <View style={styles.chipsRow}>
                  {boolOptions.map((opt) => {
                    const selected = v === opt.value;
                    return (
                      <Pressable
                        key={opt.label || 'empty'}
                        style={({ pressed }) => [
                          styles.chip,
                          selected && styles.chipSelected,
                          pressed && styles.chipPressed,
                        ]}
                        onPress={() => onChange(def.key, opt.value)}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          }
          case 'select': {
            const opts = optionsByDefinitionId.get(def.definition_id) ?? [];
            const selectedOpt = v
              ? opts.find((o) => o.value === v) ?? null
              : null;
            const display = selectedOpt?.label_fr ?? (v ? v : 'Sélectionnez…');
            const disabled = opts.length === 0;
            return (
              <View key={def.key} style={styles.fieldBlock}>
                <Text style={styles.label}>{label}</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.selectRow,
                    disabled && styles.selectRowDisabled,
                    pressed && !disabled && styles.selectRowPressed,
                  ]}
                  onPress={() => {
                    if (disabled) return;
                    openSelect(def);
                  }}
                >
                  <Text
                    style={[
                      styles.selectValue,
                      !v && styles.selectValuePlaceholder,
                      disabled && styles.selectValueDisabled,
                    ]}
                    numberOfLines={1}
                  >
                    {disabled ? 'Aucune option disponible' : display}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={disabled ? colors.textMuted : colors.textSecondary}
                  />
                </Pressable>
              </View>
            );
          }
          default:
            return null;
        }
      })}

      <Modal
        visible={selectOpen}
        transparent
        animationType="slide"
        onRequestClose={closeSelect}
      >
        <Pressable style={styles.sheetOverlay} onPress={closeSelect}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {activeSelectLabel || 'Sélection'}
              </Text>
              <Pressable
                onPress={closeSelect}
                hitSlop={10}
                style={({ pressed }) => [styles.sheetCloseBtn, pressed && styles.sheetCloseBtnPressed]}
              >
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                style={({ pressed }) => [styles.optionRow, pressed && styles.optionRowPressed]}
                onPress={() => handleSelectPick('')}
              >
                <Text style={styles.optionText}>—</Text>
                {activeValue === '' ? (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                ) : null}
              </Pressable>

              {activeOptions.map((opt) => {
                const selected = activeValue === opt.value;
                return (
                  <Pressable
                    key={opt.id}
                    style={({ pressed }) => [styles.optionRow, pressed && styles.optionRowPressed]}
                    onPress={() => handleSelectPick(opt.value)}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]} numberOfLines={2}>
                      {opt.label_fr || opt.value}
                    </Text>
                    {selected ? (
                      <Ionicons name="checkmark" size={18} color={colors.primary} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.sheetFooter}>
              <Text style={styles.sheetFooterHint} numberOfLines={1}>
                Choix actuel : {activeValueLabel}
              </Text>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  sectionHint: {
    ...typography.sm,
    color: colors.textMuted,
    marginBottom: spacing.base,
  },
  loadingBox: {
    marginBottom: spacing.lg,
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.sm,
    color: colors.textMuted,
  },
  fieldBlock: {
    marginBottom: spacing.base,
  },
  label: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: '100%',
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '12',
  },
  chipPressed: {
    opacity: 0.85,
  },
  chipText: {
    ...typography.sm,
    color: colors.text,
    fontWeight: fontWeights.medium,
  },
  chipTextSelected: {
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },

  selectRow: {
    minHeight: 48,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  selectRowPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  selectRowDisabled: {
    opacity: 0.7,
  },
  selectValue: {
    flex: 1,
    minWidth: 0,
    ...typography.sm,
    color: colors.text,
    fontWeight: fontWeights.medium,
  },
  selectValuePlaceholder: {
    color: colors.textMuted,
    fontWeight: fontWeights.medium,
  },
  selectValueDisabled: {
    color: colors.textMuted,
  },

  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingBottom: spacing.lg,
    maxHeight: '84%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  sheetTitle: {
    flex: 1,
    minWidth: 0,
    ...typography.base,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginRight: spacing.sm,
  },
  sheetCloseBtn: {
    padding: spacing.xs,
  },
  sheetCloseBtnPressed: {
    opacity: 0.75,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.base,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  optionRowPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
    ...typography.sm,
    color: colors.text,
    fontWeight: fontWeights.medium,
  },
  optionTextSelected: {
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  sheetFooter: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  sheetFooterHint: {
    ...typography.xs,
    color: colors.textMuted,
  },
});
