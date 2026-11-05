/**
 * Grille premium de caractéristiques — attributs dynamiques + champs legacy dédupliqués.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import type { ListingDynamicAttributeDisplay } from '@/services/listings/getListingDynamicAttributesForDisplay';
import { getListingAttributeIcon } from '@/lib/listingAttributeIcon';
import {
  buildDynamicKeySetForLegacyDedup,
  shouldShowLegacyListingDetailField,
} from '@/lib/listingDetailLegacyDynamicDedup';

type Props = {
  condition?: string | null;
  brand?: string | null;
  model?: string | null;
  dynamicItems: ListingDynamicAttributeDisplay[];
};

type SpecCell = {
  id: string;
  label: string;
  value: string;
  iconKey: string;
};

function SpecTile({ cell }: { cell: SpecCell }) {
  const icon = getListingAttributeIcon(cell.iconKey, cell.label);
  return (
    <View style={styles.tile}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={styles.tileLabel} numberOfLines={2}>
        {cell.label}
      </Text>
      <Text style={styles.tileValue}>{cell.value}</Text>
    </View>
  );
}

export function ListingCharacteristics({ condition, brand, model, dynamicItems }: Props) {
  const cells = useMemo(() => {
    const dynamicKeySet = buildDynamicKeySetForLegacyDedup(dynamicItems);
    const list: SpecCell[] = [];

    if (shouldShowLegacyListingDetailField('condition', condition, dynamicKeySet) && condition?.trim()) {
      list.push({ id: 'legacy-condition', label: 'État', value: condition.trim(), iconKey: 'condition' });
    }
    if (shouldShowLegacyListingDetailField('brand', brand, dynamicKeySet) && brand?.trim()) {
      list.push({ id: 'legacy-brand', label: 'Marque', value: brand.trim(), iconKey: 'brand' });
    }
    if (shouldShowLegacyListingDetailField('model', model, dynamicKeySet) && model?.trim()) {
      list.push({ id: 'legacy-model', label: 'Modèle', value: model.trim(), iconKey: 'model' });
    }

    for (const item of dynamicItems) {
      const value = item.displayValue?.trim();
      if (!value) continue;
      list.push({
        id: item.attributeDefinitionId,
        label: item.label_fr,
        value,
        iconKey: item.key,
      });
    }

    return list;
  }, [brand, condition, dynamicItems, model]);

  if (cells.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.sectionTitle}>Caractéristiques</Text>
      <View style={styles.grid}>
        {cells.map((cell) => (
          <SpecTile key={cell.id} cell={cell} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 0,
    maxWidth: '100%',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.sm,
    minHeight: 88,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  tileLabel: {
    ...typography.xs,
    fontWeight: fontWeights.medium,
    color: colors.textMuted,
    marginBottom: 2,
  },
  tileValue: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
});
