import type { MarketplaceCategory } from '@/services/categories';
import type Ionicons from '@expo/vector-icons/Ionicons';

export type MarketplaceCategoryIdentity = {
  id: number;
  name: string;
  slug?: string | null;
  parent_id?: number | null;
};

/**
 * Compatibilité legacy uniquement — pas une taxonomie parallèle.
 * Clé = libellé historique normalisé (sans accents, minuscule) → slug canonique actuel.
 * Source de vérité : table `categories` (id / slug / parent_id).
 */
export const LEGACY_MARKETPLACE_CATEGORY_ALIASES: Record<string, string> = {
  vehicules: 'vehicules',
  mode: 'mode-beaute',
  maison: 'maison-decoration',
  electronique: 'electronique',
  sport: 'loisirs-sports',
  loisirs: 'loisirs-sports',
  autre: 'autres',
};

function normalizeCategoryKey(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function compareCategoryId(a: { id: number }, b: { id: number }): number {
  return a.id - b.id;
}

export function getRootMarketplaceCategories(categories: MarketplaceCategory[]): MarketplaceCategory[] {
  return categories.filter((category) => category.parent_id == null).slice().sort(compareCategoryId);
}

export function getChildMarketplaceCategories(
  categories: MarketplaceCategory[],
  parentId: number
): MarketplaceCategory[] {
  return categories
    .filter((category) => category.parent_id === parentId)
    .slice()
    .sort(compareCategoryId);
}

export function categoryHasChildren(categories: MarketplaceCategory[], categoryId: number): boolean {
  return categories.some((category) => category.parent_id === categoryId);
}

function buildChildrenByParent(categories: MarketplaceCategoryIdentity[]): Map<number, number[]> {
  const childrenByParent = new Map<number, number[]>();

  for (const category of categories) {
    if (category.parent_id == null) {
      continue;
    }
    const siblings = childrenByParent.get(category.parent_id) ?? [];
    siblings.push(category.id);
    childrenByParent.set(category.parent_id, siblings);
  }

  return childrenByParent;
}

/**
 * Branche générique : nœud + descendants à tout niveau.
 * Toujours au moins `[categoryId]`, même si l’id est absent de la liste.
 */
export function collectCategoryBranchIds(
  categories: MarketplaceCategoryIdentity[],
  categoryId: number
): number[] {
  const childrenByParent = buildChildrenByParent(categories);
  const collected = new Set<number>([categoryId]);
  const stack = [categoryId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (currentId == null) {
      continue;
    }
    for (const childId of childrenByParent.get(currentId) ?? []) {
      if (!collected.has(childId)) {
        collected.add(childId);
        stack.push(childId);
      }
    }
  }

  return [...collected];
}

export function buildRootCategoryTree(categories: MarketplaceCategory[]): Record<number, number[]> {
  const tree: Record<number, number[]> = {};
  for (const root of getRootMarketplaceCategories(categories)) {
    tree[root.id] = collectCategoryBranchIds(categories, root.id);
  }
  return tree;
}

export function resolveMarketplaceCategoryLabel(
  categories: MarketplaceCategory[],
  categoryId: number | null | undefined
): string | null {
  if (categoryId == null) {
    return null;
  }
  const match = categories.find((category) => category.id === categoryId);
  return match?.name?.trim() || match?.slug?.trim() || null;
}

/**
 * Sélection parent / enfant pour l'écran Vendre à partir d'un id catégorie (feuille ou racine).
 */
export function resolveSellCategorySelection(
  categories: MarketplaceCategory[],
  categoryId: number
): { parentId: number; childId: number | null } {
  const rootId = findMarketplaceRootId(categories, categoryId);
  if (rootId == null) {
    return { parentId: categoryId, childId: null };
  }
  if (categoryId === rootId) {
    return { parentId: rootId, childId: null };
  }
  return { parentId: rootId, childId: categoryId };
}

export function findMarketplaceRootId(
  categories: MarketplaceCategory[],
  categoryId: number
): number | null {
  let current = categories.find((category) => category.id === categoryId) ?? null;

  while (current) {
    if (current.parent_id == null) {
      return current.id;
    }
    current = categories.find((category) => category.id === current?.parent_id) ?? null;
  }

  return null;
}

export function isDescendantOrSelf(
  categories: MarketplaceCategory[],
  ancestorId: number,
  categoryId: number
): boolean {
  if (categoryId === ancestorId) {
    return true;
  }

  let current = categories.find((category) => category.id === categoryId) ?? null;
  while (current?.parent_id != null) {
    if (current.parent_id === ancestorId) {
      return true;
    }
    current = categories.find((category) => category.id === current?.parent_id) ?? null;
  }

  return false;
}

export function findMarketplaceCategoryByLabel(
  categories: readonly MarketplaceCategoryIdentity[],
  label: string | null | undefined
): MarketplaceCategoryIdentity | null {
  const normalized = normalizeCategoryKey(label);
  if (!normalized) {
    return null;
  }

  const byName = categories.find((category) => normalizeCategoryKey(category.name) === normalized);
  if (byName) {
    return byName;
  }

  const bySlug = categories.find((category) => normalizeCategoryKey(category.slug) === normalized);
  if (bySlug) {
    return bySlug;
  }

  const aliasSlug = LEGACY_MARKETPLACE_CATEGORY_ALIASES[normalized];
  if (!aliasSlug) {
    return null;
  }
  return categories.find((category) => normalizeCategoryKey(category.slug) === aliasSlug) ?? null;
}

export function getMarketplaceCategoryIdByLabel(
  categories: readonly MarketplaceCategoryIdentity[],
  label: string | null | undefined
): number | null {
  return findMarketplaceCategoryByLabel(categories, label)?.id ?? null;
}

export function isMarketplaceCategoryQueryLabel(value: string | null | undefined): boolean {
  const normalized = normalizeCategoryKey(value);
  if (!normalized) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(LEGACY_MARKETPLACE_CATEGORY_ALIASES, normalized);
}

export function hasUniqueMarketplaceSlugs(categories: readonly MarketplaceCategoryIdentity[]): boolean {
  const seen = new Set<string>();
  for (const category of categories) {
    const slug = normalizeCategoryKey(category.slug);
    if (!slug) {
      return false;
    }
    if (seen.has(slug)) {
      return false;
    }
    seen.add(slug);
  }
  return true;
}

const SELL_PARENT_ICON_BY_SLUG: Record<string, keyof typeof Ionicons.glyphMap> = {
  vehicules: 'car-outline',
  electronique: 'laptop-outline',
  'maison-decoration': 'home-outline',
  'mode-beaute': 'shirt-outline',
  immobilier: 'business-outline',
  alimentation: 'nutrition-outline',
  services: 'construct-outline',
  informatique: 'hardware-chip-outline',
  'loisirs-sports': 'fitness-outline',
  autres: 'grid-outline',
  telephones: 'phone-portrait-outline',
  mode: 'shirt-outline',
};

export function getSellParentIcon(slug: string): keyof typeof Ionicons.glyphMap {
  return SELL_PARENT_ICON_BY_SLUG[slug] ?? 'grid-outline';
}
