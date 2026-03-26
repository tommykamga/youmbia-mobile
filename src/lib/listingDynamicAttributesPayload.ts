/**
 * Construction du payload `listing_attribute_values` (aligné web `lib/listingDynamicAttributesPayload.ts`).
 */

import type {
  CategoryAttributeOption,
  EffectiveCategoryAttributeDefinitionResolved,
} from '@/lib/categoryAttributesTypes';

export type ListingDynamicAttributeRowInsert = {
  attribute_definition_id: string;
  option_id: string | null;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
};

/**
 * Identifiants de définitions dont la valeur UI est vide (édition : suppression DB ciblée).
 * Aligné web `collectEmptyDynamicAttributeDefinitionIds`.
 */
export function collectEmptyDynamicAttributeDefinitionIds(
  defs: EffectiveCategoryAttributeDefinitionResolved[],
  values: Record<string, string>
): string[] {
  const out: string[] = [];
  for (const def of defs) {
    const raw = values[def.key];
    if (raw === undefined || raw === null) {
      out.push(def.definition_id);
      continue;
    }
    if (String(raw).trim() === '') {
      out.push(def.definition_id);
    }
  }
  return out;
}

export function buildListingDynamicAttributeRows(
  defs: EffectiveCategoryAttributeDefinitionResolved[],
  values: Record<string, string>,
  optionsByDefinitionId: Map<string, CategoryAttributeOption[]>
): ListingDynamicAttributeRowInsert[] {
  const out: ListingDynamicAttributeRowInsert[] = [];

  for (const def of defs) {
    const raw = values[def.key];
    if (raw === undefined || raw === null) continue;
    const trimmed = String(raw).trim();
    if (trimmed === '') continue;

    const empty = (): ListingDynamicAttributeRowInsert => ({
      attribute_definition_id: def.definition_id,
      option_id: null,
      value_text: null,
      value_number: null,
      value_boolean: null,
      value_date: null,
    });

    switch (def.type) {
      case 'text':
        out.push({ ...empty(), value_text: trimmed });
        break;
      case 'number': {
        const n = Number(trimmed);
        if (!Number.isFinite(n)) {
          console.warn('[listingDynamicAttributesPayload] invalidNumber', def.key, trimmed);
          continue;
        }
        out.push({ ...empty(), value_number: n });
        break;
      }
      case 'boolean': {
        if (trimmed !== 'true' && trimmed !== 'false') {
          console.warn('[listingDynamicAttributesPayload] invalidBoolean', def.key, trimmed);
          continue;
        }
        out.push({ ...empty(), value_boolean: trimmed === 'true' });
        break;
      }
      case 'date': {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
          console.warn('[listingDynamicAttributesPayload] invalidDate', def.key, trimmed);
          continue;
        }
        out.push({ ...empty(), value_date: trimmed });
        break;
      }
      case 'select': {
        const opts = optionsByDefinitionId.get(def.definition_id) ?? [];
        const opt = opts.find((o) => o.value === trimmed);
        if (!opt) {
          console.warn('[listingDynamicAttributesPayload] selectOptionNotFound', def.key, trimmed);
          continue;
        }
        out.push({ ...empty(), option_id: opt.id });
        break;
      }
      default:
        break;
    }
  }

  return out;
}
