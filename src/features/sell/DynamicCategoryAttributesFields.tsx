/**
 * Champs attributs dynamiques — création d’annonce (pilotes Véhicules + Électronique).
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Input } from '@/components/Input';
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
            const withEmpty = [{ value: '', label: 'Sélectionnez…' }, ...opts.map((o) => ({ value: o.value, label: o.label_fr }))];
            return (
              <View key={def.key} style={styles.fieldBlock}>
                <Text style={styles.label}>{label}</Text>
                <View style={styles.chipsWrap}>
                  {withEmpty.map((opt) => {
                    const selected = v === opt.value;
                    return (
                      <Pressable
                        key={`${def.key}-${opt.value || 'empty'}`}
                        style={({ pressed }) => [
                          styles.chip,
                          selected && styles.chipSelected,
                          pressed && styles.chipPressed,
                        ]}
                        onPress={() => onChange(def.key, opt.value)}
                      >
                        <Text
                          style={[styles.chipText, selected && styles.chipTextSelected]}
                          numberOfLines={2}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          }
          default:
            return null;
        }
      })}
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
});
