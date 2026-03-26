/**
 * Définitions et options d’attributs dynamiques (client Supabase, aligné web).
 *
 * Résolution du profil effectif : même principe que `lib/data/categoryAttributes.ts` (web) —
 * voir `docs/category-attributes/24_gate_resolution_alignment.md`.
 */

import { supabase, supabaseRuntime } from '@/lib/supabase';
import type {
  CategoryAttributeDefinitionType,
  CategoryAttributeOption,
  EffectiveCategoryAttributeDefinitionResolved,
  EffectiveCategoryAttributeSource,
} from '@/lib/categoryAttributesTypes';

type DefinitionRow = {
  id: string;
  key: string;
  label_fr: string;
  type: string;
  required: boolean | null;
  filterable: boolean | null;
  sort_order: number | null;
  form_profile: string | null;
  category_id: number | null;
};

const ALLOWED_TYPES: readonly CategoryAttributeDefinitionType[] = [
  'text',
  'number',
  'select',
  'boolean',
  'date',
];

function isCategoryAttributeDefinitionType(v: string): v is CategoryAttributeDefinitionType {
  return (ALLOWED_TYPES as readonly string[]).includes(v);
}

function isSupabaseOk(): boolean {
  return supabaseRuntime.isConfigured;
}

/** Aligné seed / taxonomie web (`electronique` + enfants niveau 2). Pas de inférence `vehicle` ici (comme le web). */
const ELECTRONICS_FORM_PROFILE = 'electronics' as const;
const ELECTRONICS_BRANCH_SLUGS = new Set([
  'electronique',
  'telephones-objets-connectes',
  'accessoires-telephone',
  'informatique',
  'tv-audio',
]);

/**
 * Profil métier effectif pour charger les définitions profil : colonne DB, ou repli **electronics**
 * si `form_profile` vide et slug dans la branche canonique (équivalent web `getCanonicalRootSlug` → `electronique`).
 */
function resolveFormProfileForDynamicDefinitions(
  formProfileFromDb: string | null | undefined,
  categorySlug: string | null | undefined
): string | null {
  const trimmed = (formProfileFromDb ?? '').trim();
  if (trimmed) return trimmed;
  const slug = (categorySlug ?? '').trim().toLowerCase();
  if (!slug) return null;
  if (ELECTRONICS_BRANCH_SLUGS.has(slug)) return ELECTRONICS_FORM_PROFILE;
  return null;
}

/**
 * Même logique que le web : profil effectif + définitions scoping catégorie, fusion par `key`.
 */
export async function getEffectiveCategoryAttributeDefinitionsResolved(
  categoryId: number
): Promise<EffectiveCategoryAttributeDefinitionResolved[]> {
  if (!isSupabaseOk()) return [];
  if (!Number.isFinite(categoryId) || categoryId <= 0) return [];

  try {
    const { data: cat, error: catErr } = await supabase
      .from('categories')
      .select('id, form_profile, slug')
      .eq('id', categoryId)
      .maybeSingle();

    if (catErr || !cat) return [];

    const effectiveProfile = resolveFormProfileForDynamicDefinitions(
      cat.form_profile as string | null | undefined,
      typeof cat.slug === 'string' ? cat.slug : undefined
    );

    const profileRows: DefinitionRow[] = [];
    if (effectiveProfile) {
      const { data, error } = await supabase
        .from('category_attribute_definitions')
        .select('id, key, label_fr, type, required, filterable, sort_order, form_profile, category_id')
        .eq('form_profile', effectiveProfile);

      if (error) {
        console.warn('[categoryAttributes] profile defs', error);
      } else {
        profileRows.push(...((data ?? []) as DefinitionRow[]));
      }
    }

    const { data: catScoped, error: catScopedErr } = await supabase
      .from('category_attribute_definitions')
      .select('id, key, label_fr, type, required, filterable, sort_order, form_profile, category_id')
      .eq('category_id', categoryId);

    if (catScopedErr) {
      console.warn('[categoryAttributes] category defs', catScopedErr);
    }

    const catRows = (catScoped ?? []) as DefinitionRow[];

    const byKey = new Map<string, DefinitionRow>();
    for (const r of profileRows) {
      byKey.set(r.key, r);
    }
    for (const r of catRows) {
      byKey.set(r.key, r);
    }

    const merged = Array.from(byKey.values());
    merged.sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.key).localeCompare(String(b.key))
    );

    const out: EffectiveCategoryAttributeDefinitionResolved[] = [];
    for (const r of merged) {
      if (!r.type || !isCategoryAttributeDefinitionType(r.type)) continue;
      const source: EffectiveCategoryAttributeSource =
        r.category_id != null ? 'category' : 'profile';
      out.push({
        definition_id: r.id,
        key: r.key,
        label_fr: r.label_fr,
        type: r.type,
        required: !!r.required,
        filterable: !!r.filterable,
        sort_order: typeof r.sort_order === 'number' ? r.sort_order : 0,
        source,
      });
    }
    return out;
  } catch (e) {
    console.warn('[categoryAttributes] getEffectiveCategoryAttributeDefinitionsResolved', e);
    return [];
  }
}

export async function getCategoryAttributeOptionsByDefinitionIds(
  definitionIds: string[]
): Promise<Map<string, CategoryAttributeOption[]>> {
  const result = new Map<string, CategoryAttributeOption[]>();
  if (!isSupabaseOk() || definitionIds.length === 0) return result;

  try {
    const { data, error } = await supabase
      .from('category_attribute_options')
      .select('id, attribute_definition_id, value, label_fr, sort_order')
      .in('attribute_definition_id', definitionIds)
      .order('sort_order', { ascending: true });

    if (error) {
      console.warn('[categoryAttributes] options', error);
      return result;
    }

    for (const row of data ?? []) {
      const aid = row.attribute_definition_id as string;
      if (!aid) continue;
      if (!result.has(aid)) result.set(aid, []);
      const value = String((row as { value?: string }).value ?? '').trim();
      if (!value) continue;
      const opt: CategoryAttributeOption = {
        id: String((row as { id: string }).id),
        attribute_definition_id: aid,
        value,
        label_fr: String((row as { label_fr?: string }).label_fr ?? value),
        sort_order:
          typeof (row as { sort_order?: number }).sort_order === 'number'
            ? (row as { sort_order: number }).sort_order
            : 0,
      };
      result.get(aid)!.push(opt);
    }
    for (const arr of result.values()) {
      arr.sort((a, b) => a.sort_order - b.sort_order || a.value.localeCompare(b.value));
    }
    return result;
  } catch (e) {
    console.warn('[categoryAttributes] getCategoryAttributeOptionsByDefinitionIds', e);
    return result;
  }
}
