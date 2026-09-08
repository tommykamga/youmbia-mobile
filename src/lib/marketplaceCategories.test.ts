import { describe, expect, it } from 'vitest';
import type { MarketplaceCategory } from '@/services/categories';
import {
  buildRootCategoryTree,
  collectCategoryBranchIds,
  findMarketplaceCategoryByLabel,
  findMarketplaceRootId,
  getChildMarketplaceCategories,
  getMarketplaceCategoryIdByLabel,
  getRootMarketplaceCategories,
  hasUniqueMarketplaceSlugs,
  isDescendantOrSelf,
  isMarketplaceCategoryQueryLabel,
  LEGACY_MARKETPLACE_CATEGORY_ALIASES,
  resolveSellCategorySelection,
} from './marketplaceCategories';

function cat(
  partial: Pick<MarketplaceCategory, 'id' | 'name' | 'slug' | 'parent_id'> &
    Partial<Pick<MarketplaceCategory, 'level' | 'form_profile'>>
): MarketplaceCategory {
  return {
    icon: null,
    form_profile: partial.form_profile ?? null,
    level: partial.level ?? (partial.parent_id == null ? 1 : 2),
    id: partial.id,
    name: partial.name,
    slug: partial.slug,
    parent_id: partial.parent_id,
  };
}

const TAXONOMY: MarketplaceCategory[] = [
  cat({ id: 5, name: 'Véhicules', slug: 'vehicules', parent_id: null, form_profile: 'vehicle' }),
  cat({ id: 6, name: 'Voitures', slug: 'voitures', parent_id: 5 }),
  cat({ id: 7, name: 'Motos', slug: 'motos', parent_id: 5 }),
  cat({ id: 8, name: 'Berlines', slug: 'berlines', parent_id: 6, level: 3 }),
  cat({ id: 19, name: 'Électronique', slug: 'electronique', parent_id: null, form_profile: 'electronics' }),
  cat({ id: 20, name: 'Téléphones', slug: 'telephones-objets-connectes', parent_id: 19 }),
  cat({ id: 22, name: 'Maison & Décoration', slug: 'maison-decoration', parent_id: null }),
  cat({ id: 30, name: 'Mode & Beauté', slug: 'mode-beaute', parent_id: null }),
  cat({ id: 48, name: 'Alimentation', slug: 'alimentation', parent_id: null }),
  cat({ id: 54, name: 'Loisirs & Sports', slug: 'loisirs-sports', parent_id: null }),
  cat({ id: 55, name: 'Autres', slug: 'autres', parent_id: null }),
  cat({ id: 99, name: 'Orphelin', slug: 'orphelin', parent_id: 999 }),
];

describe('marketplaceCategories', () => {
  it('trie les racines et enfants par id stable', () => {
    const shuffled = [TAXONOMY[10], TAXONOMY[0], TAXONOMY[4]];
    expect(getRootMarketplaceCategories(shuffled).map((item) => item.id)).toEqual([5, 19, 55]);
    expect(getChildMarketplaceCategories(TAXONOMY, 5).map((item) => item.id)).toEqual([6, 7]);
  });

  it('collecte la branche d’un nœud à tout niveau', () => {
    expect(collectCategoryBranchIds(TAXONOMY, 5).sort((a, b) => a - b)).toEqual([5, 6, 7, 8]);
    expect(collectCategoryBranchIds(TAXONOMY, 6).sort((a, b) => a - b)).toEqual([6, 8]);
    expect(collectCategoryBranchIds(TAXONOMY, 8)).toEqual([8]);
    expect(collectCategoryBranchIds(TAXONOMY, 1234)).toEqual([1234]);
  });

  it('construit l’arbre des racines sans casser les ids existants', () => {
    const tree = buildRootCategoryTree(TAXONOMY);
    expect(tree[5].sort((a, b) => a - b)).toEqual([5, 6, 7, 8]);
    expect(tree[19].sort((a, b) => a - b)).toEqual([19, 20]);
    expect(tree[6]).toBeUndefined();
  });

  it('remonte à la racine et ignore les orphelins', () => {
    expect(findMarketplaceRootId(TAXONOMY, 8)).toBe(5);
    expect(findMarketplaceRootId(TAXONOMY, 5)).toBe(5);
    expect(findMarketplaceRootId(TAXONOMY, 99)).toBeNull();
    expect(findMarketplaceRootId(TAXONOMY, 404)).toBeNull();
  });

  it('résout la sélection Vendre parent / enfant', () => {
    expect(resolveSellCategorySelection(TAXONOMY, 5)).toEqual({ parentId: 5, childId: null });
    expect(resolveSellCategorySelection(TAXONOMY, 7)).toEqual({ parentId: 5, childId: 7 });
    expect(resolveSellCategorySelection(TAXONOMY, 99)).toEqual({ parentId: 99, childId: null });
  });

  it('détecte descendant ou soi-même', () => {
    expect(isDescendantOrSelf(TAXONOMY, 5, 8)).toBe(true);
    expect(isDescendantOrSelf(TAXONOMY, 5, 5)).toBe(true);
    expect(isDescendantOrSelf(TAXONOMY, 19, 8)).toBe(false);
  });

  it('résout un libellé par nom, slug ou alias historique', () => {
    expect(findMarketplaceCategoryByLabel(TAXONOMY, '  Véhicules ' )?.id).toBe(5);
    expect(getMarketplaceCategoryIdByLabel(TAXONOMY, 'electronique')).toBe(19);
    expect(getMarketplaceCategoryIdByLabel(TAXONOMY, 'Mode')).toBe(30);
    expect(getMarketplaceCategoryIdByLabel(TAXONOMY, 'Maison')).toBe(22);
    expect(getMarketplaceCategoryIdByLabel(TAXONOMY, 'Sport')).toBe(54);
    expect(getMarketplaceCategoryIdByLabel(TAXONOMY, 'Autre')).toBe(55);
    expect(getMarketplaceCategoryIdByLabel(TAXONOMY, null)).toBeNull();
    expect(getMarketplaceCategoryIdByLabel(TAXONOMY, 'Inconnue')).toBeNull();
  });

  it('mappe les aliases legacy vers le slug live sans taxonomie parallèle', () => {
    expect(isMarketplaceCategoryQueryLabel('Véhicules')).toBe(true);
    expect(isMarketplaceCategoryQueryLabel('électronique')).toBe(true);
    expect(isMarketplaceCategoryQueryLabel('Toyota')).toBe(false);
    expect(LEGACY_MARKETPLACE_CATEGORY_ALIASES.mode).toBe('mode-beaute');
    expect(LEGACY_MARKETPLACE_CATEGORY_ALIASES.sport).toBe('loisirs-sports');
  });

  it('garantit des slugs uniques sur la taxonomie de référence', () => {
    expect(hasUniqueMarketplaceSlugs(TAXONOMY)).toBe(true);
    expect(
      hasUniqueMarketplaceSlugs([
        cat({ id: 1, name: 'A', slug: 'dup', parent_id: null }),
        cat({ id: 2, name: 'B', slug: 'dup', parent_id: null }),
      ])
    ).toBe(false);
  });
});
