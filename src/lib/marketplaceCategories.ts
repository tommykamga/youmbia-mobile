import type { MarketplaceCategory } from '@/services/categories';
import type Ionicons from '@expo/vector-icons/Ionicons';

export function getRootMarketplaceCategories(categories: MarketplaceCategory[]): MarketplaceCategory[] {
  return categories.filter((category) => category.parent_id == null);
}

export function getChildMarketplaceCategories(
  categories: MarketplaceCategory[],
  parentId: number
): MarketplaceCategory[] {
  return categories.filter((category) => category.parent_id === parentId);
}

export function categoryHasChildren(categories: MarketplaceCategory[], categoryId: number): boolean {
  return categories.some((category) => category.parent_id === categoryId);
}

export function buildRootCategoryTree(categories: MarketplaceCategory[]): Record<number, number[]> {
  const childrenByParent = new Map<number, number[]>();

  for (const category of categories) {
    if (category.parent_id == null) {
      continue;
    }
    const siblings = childrenByParent.get(category.parent_id) ?? [];
    siblings.push(category.id);
    childrenByParent.set(category.parent_id, siblings);
  }

  const collectDescendants = (rootId: number): number[] => {
    const collected = new Set<number>([rootId]);
    const stack = [rootId];

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
  };

  const tree: Record<number, number[]> = {};
  for (const root of getRootMarketplaceCategories(categories)) {
    tree[root.id] = collectDescendants(root.id);
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
