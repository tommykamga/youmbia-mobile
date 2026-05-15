/**
 * Préremplissages locaux génériques (publication) — AsyncStorage, sans logique métier par niche.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'youmbia.publishMemory.v1';

export type ListingPublishMemory = {
  lastCity?: string;
  lastParentCategoryId?: number;
  lastChildCategoryId?: number | null;
  /** Clé = id catégorie (feuille), valeur = derniers attributs dynamiques utilisés. */
  attributeHintsByCategory: Record<string, Record<string, string>>;
};

const EMPTY: ListingPublishMemory = { attributeHintsByCategory: {} };

function normalizeMemory(raw: unknown): ListingPublishMemory {
  if (!raw || typeof raw !== 'object') return { ...EMPTY };
  const o = raw as ListingPublishMemory;
  return {
    lastCity: typeof o.lastCity === 'string' ? o.lastCity : undefined,
    lastParentCategoryId:
      typeof o.lastParentCategoryId === 'number' && Number.isFinite(o.lastParentCategoryId)
        ? o.lastParentCategoryId
        : undefined,
    lastChildCategoryId:
      o.lastChildCategoryId === null
        ? null
        : typeof o.lastChildCategoryId === 'number' && Number.isFinite(o.lastChildCategoryId)
          ? o.lastChildCategoryId
          : undefined,
    attributeHintsByCategory:
      o.attributeHintsByCategory && typeof o.attributeHintsByCategory === 'object'
        ? o.attributeHintsByCategory
        : {},
  };
}

export async function readListingPublishMemory(): Promise<ListingPublishMemory> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    return normalizeMemory(JSON.parse(raw));
  } catch {
    return { ...EMPTY };
  }
}

export type SaveListingPublishMemoryInput = {
  city?: string;
  parentCategoryId?: number | null;
  childCategoryId?: number | null;
  publishCategoryId?: number | null;
  dynamicValues?: Record<string, string>;
};

export async function saveListingPublishMemory(input: SaveListingPublishMemoryInput): Promise<void> {
  try {
    const prev = await readListingPublishMemory();
    const next: ListingPublishMemory = {
      ...prev,
      attributeHintsByCategory: { ...prev.attributeHintsByCategory },
    };

    const city = input.city?.trim();
    if (city) next.lastCity = city;

    if (input.parentCategoryId != null && Number.isFinite(input.parentCategoryId)) {
      next.lastParentCategoryId = input.parentCategoryId;
    }
    if (input.childCategoryId !== undefined) {
      next.lastChildCategoryId = input.childCategoryId;
    }

    const catId = input.publishCategoryId;
    const dyn = input.dynamicValues;
    if (catId != null && Number.isFinite(catId) && dyn && Object.keys(dyn).length > 0) {
      const key = String(catId);
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(dyn)) {
        const trimmed = String(v ?? '').trim();
        if (trimmed) cleaned[k] = trimmed;
      }
      if (Object.keys(cleaned).length > 0) {
        next.attributeHintsByCategory[key] = cleaned;
      }
    }

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // non bloquant
  }
}

export function getAttributeHintsForCategory(
  memory: ListingPublishMemory,
  categoryId: number
): Record<string, string> {
  return memory.attributeHintsByCategory[String(categoryId)] ?? {};
}
