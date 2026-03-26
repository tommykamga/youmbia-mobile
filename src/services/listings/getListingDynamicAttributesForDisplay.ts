/**
 * Lecture des attributs dynamiques pour affichage fiche annonce (aligné sur le web).
 */

import { supabase, supabaseRuntime } from '@/lib/supabase';

export type ListingDynamicAttributeDisplay = {
  attributeDefinitionId: string;
  key: string;
  label_fr: string;
  displayValue: string;
  sortOrder: number;
};

type DefRow = {
  id: string;
  key: string;
  label_fr: string;
  type: string;
  sort_order: number | null;
};

function formatDateFr(valueDate: string): string {
  const s = String(valueDate).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDisplayValue(
  def: DefRow,
  row: {
    option_id: string | null;
    value_text: string | null;
    value_number: number | null;
    value_boolean: boolean | null;
    value_date: string | null;
  },
  optionLabelById: Map<string, string>
): string | null {
  switch (def.type) {
    case 'select': {
      if (row.option_id && optionLabelById.has(row.option_id)) {
        return optionLabelById.get(row.option_id)!;
      }
      if (row.value_text != null && String(row.value_text).trim() !== '') {
        return String(row.value_text);
      }
      return null;
    }
    case 'text': {
      if (row.value_text == null || String(row.value_text).trim() === '') return null;
      return String(row.value_text);
    }
    case 'number': {
      if (row.value_number == null || !Number.isFinite(Number(row.value_number))) return null;
      return new Intl.NumberFormat('fr-FR').format(Number(row.value_number));
    }
    case 'boolean': {
      if (row.value_boolean === null || row.value_boolean === undefined) return null;
      return row.value_boolean ? 'Oui' : 'Non';
    }
    case 'date': {
      if (row.value_date == null || String(row.value_date).trim() === '') return null;
      return formatDateFr(String(row.value_date));
    }
    default:
      return null;
  }
}

/**
 * Valeurs d’attributs dynamiques formatées pour la fiche annonce.
 * Retourne [] si aucune ligne, erreur, ou Supabase non configuré.
 */
export async function getListingDynamicAttributesForDisplay(
  listingId: string
): Promise<ListingDynamicAttributeDisplay[]> {
  if (!supabaseRuntime.isConfigured || !listingId?.trim()) return [];

  try {
    const { data: rows, error } = await supabase
      .from('listing_attribute_values')
      .select('attribute_definition_id, option_id, value_text, value_number, value_boolean, value_date')
      .eq('listing_id', listingId.trim());

    if (error) {
      console.warn('[getListingDynamicAttributesForDisplay] listing_attribute_values', error);
      return [];
    }
    if (!rows?.length) return [];

    const defIds = [
      ...new Set(rows.map((r) => r.attribute_definition_id).filter(Boolean)),
    ];
    if (defIds.length === 0) return [];

    const { data: defs, error: defErr } = await supabase
      .from('category_attribute_definitions')
      .select('id, key, label_fr, type, sort_order')
      .in('id', defIds);

    if (defErr || !defs?.length) {
      if (defErr) console.warn('[getListingDynamicAttributesForDisplay] definitions', defErr);
      return [];
    }

    const defMap = new Map<string, DefRow>((defs as DefRow[]).map((d) => [d.id, d]));

    const optIds = [
      ...new Set(
        rows.map((r) => r.option_id).filter((id): id is string => id != null && id !== '')
      ),
    ];
    const optionLabelById = new Map<string, string>();
    if (optIds.length > 0) {
      const { data: opts, error: optErr } = await supabase
        .from('category_attribute_options')
        .select('id, label_fr')
        .in('id', optIds);
      if (optErr) {
        console.warn('[getListingDynamicAttributesForDisplay] options', optErr);
      } else {
        for (const o of opts ?? []) {
          if (o.id) optionLabelById.set(o.id, String(o.label_fr ?? ''));
        }
      }
    }

    const out: ListingDynamicAttributeDisplay[] = [];
    for (const r of rows) {
      const def = defMap.get(r.attribute_definition_id);
      if (!def) continue;
      const displayValue = formatDisplayValue(def, r, optionLabelById);
      if (displayValue == null || displayValue === '') continue;
      out.push({
        attributeDefinitionId: def.id,
        key: def.key,
        label_fr: def.label_fr,
        displayValue,
        sortOrder: typeof def.sort_order === 'number' ? def.sort_order : 0,
      });
    }

    out.sort((a, b) => a.sortOrder - b.sortOrder || a.label_fr.localeCompare(b.label_fr, 'fr'));
    return out;
  } catch (e) {
    console.warn('[getListingDynamicAttributesForDisplay] exception', e);
    return [];
  }
}
