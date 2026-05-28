/**
 * Aides et placeholders titre / description — écran Vendre (mapping local, sans Supabase).
 */
import type { MarketplaceCategory } from '@/services/categories';
import { findMarketplaceRootId } from '@/lib/marketplaceCategories';

export type SellCategoryGuidanceKey =
  | 'electronique_telephones'
  | 'informatique'
  | 'vehicules'
  | 'immobilier'
  | 'mode'
  | 'autres';

export type SellCategoryGuidance = {
  titlePlaceholder: string;
  titleHint: string;
  descriptionPlaceholder: string;
  descriptionHint: string;
};

const SELL_CATEGORY_GUIDANCE: Record<SellCategoryGuidanceKey, SellCategoryGuidance> = {
  electronique_telephones: {
    titlePlaceholder: 'Exemple : iPhone 13 Pro Max 256 Go',
    titleHint: 'Exemple : iPhone 13 Pro Max 256 Go',
    descriptionPlaceholder:
      'Indiquez l’état, la capacité, les accessoires inclus et toute information utile.',
    descriptionHint:
      'Indiquez l’état, la capacité, les accessoires inclus et toute information utile.',
  },
  informatique: {
    titlePlaceholder: 'Exemple : PC Portable HP EliteBook i5 16 Go',
    titleHint: 'Exemple : PC Portable HP EliteBook i5 16 Go',
    descriptionPlaceholder: 'Précisez les caractéristiques techniques et l’état général.',
    descriptionHint: 'Précisez les caractéristiques techniques et l’état général.',
  },
  vehicules: {
    titlePlaceholder: 'Exemple : Toyota Corolla 2020 essence',
    titleHint: 'Exemple : Toyota Corolla 2020 essence',
    descriptionPlaceholder:
      'Indiquez l’année, le kilométrage, l’état et les documents disponibles.',
    descriptionHint: 'Indiquez l’année, le kilométrage, l’état et les documents disponibles.',
  },
  immobilier: {
    titlePlaceholder: 'Exemple : Appartement 3 chambres à Douala',
    titleHint: 'Exemple : Appartement 3 chambres à Douala',
    descriptionPlaceholder: 'Précisez la localisation, le nombre de pièces et les équipements.',
    descriptionHint: 'Précisez la localisation, le nombre de pièces et les équipements.',
  },
  mode: {
    titlePlaceholder: 'Exemple : Robe de soirée taille M',
    titleHint: 'Exemple : Robe de soirée taille M',
    descriptionPlaceholder: 'Indiquez la taille, la marque, l’état et les détails utiles.',
    descriptionHint: 'Indiquez la taille, la marque, l’état et les détails utiles.',
  },
  autres: {
    titlePlaceholder: 'Décrivez clairement votre annonce',
    titleHint: 'Décrivez clairement votre annonce',
    descriptionPlaceholder: 'Ajoutez les informations importantes pour les acheteurs.',
    descriptionHint: 'Ajoutez les informations importantes pour les acheteurs.',
  },
};

const ROOT_SLUG_TO_GUIDANCE_KEY: Record<string, SellCategoryGuidanceKey> = {
  electronique: 'electronique_telephones',
  telephones: 'electronique_telephones',
  informatique: 'informatique',
  vehicules: 'vehicules',
  immobilier: 'immobilier',
  mode: 'mode',
  'mode-beaute': 'mode',
};

const DEFAULT_GUIDANCE_KEY: SellCategoryGuidanceKey = 'autres';

export function resolveSellCategoryGuidanceKeyFromRootSlug(
  rootSlug: string | null | undefined
): SellCategoryGuidanceKey {
  const normalized = (rootSlug ?? '').trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_GUIDANCE_KEY;
  }
  return ROOT_SLUG_TO_GUIDANCE_KEY[normalized] ?? DEFAULT_GUIDANCE_KEY;
}

export function getSellCategoryGuidanceForRootSlug(
  rootSlug: string | null | undefined
): SellCategoryGuidance {
  const key = resolveSellCategoryGuidanceKeyFromRootSlug(rootSlug);
  return SELL_CATEGORY_GUIDANCE[key];
}

export function getSellCategoryGuidanceForCategoryId(
  categories: MarketplaceCategory[],
  categoryId: number | null | undefined
): SellCategoryGuidance {
  if (categoryId == null) {
    return SELL_CATEGORY_GUIDANCE[DEFAULT_GUIDANCE_KEY];
  }

  const rootId = findMarketplaceRootId(categories, categoryId);
  const rootSlug =
    rootId != null
      ? (categories.find((category) => category.id === rootId)?.slug ?? null)
      : (categories.find((category) => category.id === categoryId)?.slug ?? null);

  return getSellCategoryGuidanceForRootSlug(rootSlug);
}
