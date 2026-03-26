/**
 * Pré-remplissage formulaire édition — aligné web `getListingDynamicAttributeValuesForForm`.
 */

import { supabase, supabaseRuntime } from '@/lib/supabase';

export async function getListingDynamicAttributeValuesForForm(
  listingId: string
): Promise<Record<string, string>> {
  if (!supabaseRuntime.isConfigured || !listingId?.trim()) return {};

  try {
    const { data: rows, error } = await supabase
      .from('listing_attribute_values')
      .select('attribute_definition_id, option_id, value_text, value_number, value_boolean, value_date')
      .eq('listing_id', listingId.trim());

    if (error) {
      console.warn('[getListingDynamicAttributeValuesForForm] rows', error);
      return {};
    }
    if (!rows?.length) return {};

    const defIds = [...new Set(rows.map((r) => r.attribute_definition_id).filter(Boolean))];
    const { data: defs, error: defErr } = await supabase
      .from('category_attribute_definitions')
      .select('id, key, type')
      .in('id', defIds);

    if (defErr || !defs?.length) {
      if (defErr) console.warn('[getListingDynamicAttributeValuesForForm] defs', defErr);
      return {};
    }

    const defMap = new Map<string, { key: string; type: string }>(
      defs.map((d) => [d.id, { key: d.key, type: d.type }])
    );

    const optIds = [
      ...new Set(
        rows.map((r) => r.option_id).filter((id): id is string => id != null && id !== '')
      ),
    ];
    const optionValueById = new Map<string, string>();
    if (optIds.length > 0) {
      const { data: opts, error: optErr } = await supabase
        .from('category_attribute_options')
        .select('id, value')
        .in('id', optIds);
      if (optErr) console.warn('[getListingDynamicAttributeValuesForForm] options', optErr);
      else {
        for (const o of opts ?? []) {
          if (o.id) optionValueById.set(o.id, String(o.value ?? ''));
        }
      }
    }

    const out: Record<string, string> = {};
    for (const r of rows) {
      const def = defMap.get(r.attribute_definition_id);
      if (!def) continue;
      switch (def.type) {
        case 'text':
          if (r.value_text != null && String(r.value_text).trim() !== '') {
            out[def.key] = String(r.value_text);
          }
          break;
        case 'number':
          if (r.value_number != null && Number.isFinite(Number(r.value_number))) {
            out[def.key] = String(r.value_number);
          }
          break;
        case 'date':
          if (r.value_date != null && String(r.value_date).trim() !== '') {
            out[def.key] = String(r.value_date).slice(0, 10);
          }
          break;
        case 'boolean':
          if (r.value_boolean === true || r.value_boolean === false) {
            out[def.key] = r.value_boolean ? 'true' : 'false';
          }
          break;
        case 'select':
          if (r.option_id && optionValueById.has(r.option_id)) {
            out[def.key] = optionValueById.get(r.option_id)!;
          }
          break;
        default:
          break;
      }
    }
    return out;
  } catch (e) {
    console.warn('[getListingDynamicAttributeValuesForForm]', e);
    return {};
  }
}
