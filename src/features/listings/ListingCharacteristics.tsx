/**
 * Blocs « Détails de l’article » (legacy) + « Caractéristiques » (dynamiques),
 * avec dédoublonnage visuel aligné sur le web (priorité dynamique pour condition/brand/model).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import type { ListingDynamicAttributeDisplay } from '@/services/listings/getListingDynamicAttributesForDisplay';
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

export function ListingCharacteristics({ condition, brand, model, dynamicItems }: Props) {
  const dynamicKeySet = buildDynamicKeySetForLegacyDedup(dynamicItems);
  const showCondition = shouldShowLegacyListingDetailField('condition', condition, dynamicKeySet);
  const showBrand = shouldShowLegacyListingDetailField('brand', brand, dynamicKeySet);
  const showModel = shouldShowLegacyListingDetailField('model', model, dynamicKeySet);
  const showLegacyBlock = showCondition || showBrand || showModel;
  const showDynamicBlock = dynamicItems.length > 0;

  if (!showLegacyBlock && !showDynamicBlock) return null;

  return (
    <View style={styles.wrapper}>
      {showLegacyBlock ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Détails de l&apos;article</Text>
          <View style={styles.grid}>
            {showCondition ? (
              <View style={styles.cell}>
                <Text style={styles.dt}>État</Text>
                <Text style={styles.dd}>{condition}</Text>
              </View>
            ) : null}
            {showBrand ? (
              <View style={styles.cell}>
                <Text style={styles.dt}>Marque</Text>
                <Text style={styles.dd}>{brand}</Text>
              </View>
            ) : null}
            {showModel ? (
              <View style={styles.cell}>
                <Text style={styles.dt}>Modèle</Text>
                <Text style={styles.dd}>{model}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {showDynamicBlock ? (
        <View style={[styles.card, showLegacyBlock && styles.cardSpacing]}>
          <Text style={styles.sectionTitle}>Caractéristiques</Text>
          <View style={styles.grid}>
            {dynamicItems.map((item) => (
              <View key={item.attributeDefinitionId} style={styles.cell}>
                <Text style={styles.dt}>{item.label_fr}</Text>
                <Text style={styles.dd}>{item.displayValue}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardSpacing: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.lg,
    paddingBottom: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing['2xl'],
    rowGap: spacing.xl,
  },
  cell: {
    width: '47%',
    minWidth: 120,
  },
  dt: {
    ...typography.xs,
    fontWeight: fontWeights.bold,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  dd: {
    ...typography.base,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
});
