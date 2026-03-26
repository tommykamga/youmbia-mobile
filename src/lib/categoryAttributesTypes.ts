/**
 * Types attributs dynamiques (alignés sur le web `lib/data/categoryAttributes.ts`).
 */

export type CategoryAttributeDefinitionType = 'text' | 'number' | 'select' | 'boolean' | 'date';

export type EffectiveCategoryAttributeSource = 'profile' | 'category';

export interface EffectiveCategoryAttributeDefinition {
  key: string;
  label_fr: string;
  type: CategoryAttributeDefinitionType;
  required: boolean;
  filterable: boolean;
  sort_order: number;
  source: EffectiveCategoryAttributeSource;
}

export type EffectiveCategoryAttributeDefinitionResolved = EffectiveCategoryAttributeDefinition & {
  definition_id: string;
};

export interface CategoryAttributeOption {
  id: string;
  attribute_definition_id: string;
  value: string;
  label_fr: string;
  sort_order: number;
}
