import { describe, expect, it } from 'vitest';
import type { MarketplaceCategoryIdentity } from '@/lib/marketplaceCategories';
import {
  ACTIVE_LISTING_STATUS,
  rankSimilarListings,
  resolveSimilarFetchCategoryIds,
  scoreSimilarListing,
  shouldFetchSimilarListings,
  SIMILAR_LISTINGS_LIMIT,
  type SimilarRankCandidate,
  type SimilarSeed,
} from './similarListingsRank';

const TAXONOMY: MarketplaceCategoryIdentity[] = [
  { id: 5, name: 'Véhicules', slug: 'vehicules', parent_id: null },
  { id: 6, name: 'Voitures', slug: 'voitures', parent_id: 5 },
  { id: 7, name: 'Motos', slug: 'motos', parent_id: 5 },
  { id: 8, name: 'Berlines', slug: 'berlines', parent_id: 6 },
  { id: 19, name: 'Électronique', slug: 'electronique', parent_id: null },
  { id: 20, name: 'Téléphones', slug: 'telephones-objets-connectes', parent_id: 19 },
];

const seed: SimilarSeed = {
  id: 'current',
  categoryId: 8,
  city: 'Douala',
  price: 1000,
};

function item(partial: Partial<SimilarRankCandidate> & Pick<SimilarRankCandidate, 'id'>): SimilarRankCandidate {
  return {
    category_id: 8,
    city: 'Douala',
    price: 1000,
    created_at: '2026-01-01T00:00:00.000Z',
    status: ACTIVE_LISTING_STATUS,
    ...partial,
  };
}

describe('similarListingsRank', () => {
  it('exclut l’annonce courante', () => {
    const ranked = rankSimilarListings(seed, [item({ id: 'current' }), item({ id: 'other' })], TAXONOMY);
    expect(ranked.map((row) => row.id)).toEqual(['other']);
  });

  it('exclut sold/inactive/hidden/suspended', () => {
    const ranked = rankSimilarListings(
      seed,
      [
        item({ id: 'hidden', status: 'hidden' }),
        item({ id: 'suspended', status: 'suspended' }),
        item({ id: 'sold', status: 'sold' }),
        item({ id: 'ok', status: ACTIVE_LISTING_STATUS }),
      ],
      TAXONOMY
    );
    expect(ranked.map((row) => row.id)).toEqual(['ok']);
  });

  it('priorise la même catégorie précise devant la catégorie parente', () => {
    const sameLeaf = item({ id: 'leaf', category_id: 8, city: 'Yaoundé', price: 9000 });
    const sameParent = item({ id: 'sibling', category_id: 6, city: 'Douala', price: 1000 });
    expect(scoreSimilarListing(seed, sameLeaf, TAXONOMY)).toBeGreaterThan(
      scoreSimilarListing(seed, sameParent, TAXONOMY)
    );
    const ranked = rankSimilarListings(seed, [sameParent, sameLeaf], TAXONOMY);
    expect(ranked.map((row) => row.id)).toEqual(['leaf', 'sibling']);
  });

  it('à score égal, last_published_at gagne sur created_at', () => {
    const olderCreated = item({
      id: 'old-created',
      created_at: '2026-08-01T00:00:00.000Z',
    });
    const renewed = item({
      id: 'renewed',
      created_at: '2026-01-01T00:00:00.000Z',
      last_published_at: '2026-09-01T00:00:00.000Z',
    });
    const ranked = rankSimilarListings(seed, [olderCreated, renewed], TAXONOMY);
    expect(ranked.map((row) => row.id)).toEqual(['renewed', 'old-created']);
  });

  it('préfère la même ville à prix égal et catégorie égale', () => {
    const otherCity = item({ id: 'yaounde', city: 'Yaoundé', created_at: '2026-08-01T00:00:00.000Z' });
    const sameCity = item({ id: 'douala', city: 'Douala', created_at: '2026-01-01T00:00:00.000Z' });
    const ranked = rankSimilarListings(seed, [otherCity, sameCity], TAXONOMY);
    expect(ranked[0].id).toBe('douala');
  });

  it('applique un bonus de proximité de prix', () => {
    const far = item({ id: 'far', price: 8000, city: 'Yaoundé' });
    const close = item({ id: 'close', price: 1100, city: 'Yaoundé' });
    expect(scoreSimilarListing(seed, close, TAXONOMY)).toBeGreaterThan(scoreSimilarListing(seed, far, TAXONOMY));
  });

  it('sans category_id : résultat vide, pas de fallback texte, pas de fetch', () => {
    expect(shouldFetchSimilarListings(null)).toBe(false);
    expect(shouldFetchSimilarListings(undefined)).toBe(false);
    expect(shouldFetchSimilarListings(8)).toBe(true);

    const uncategorized: SimilarSeed = {
      id: 'legacy-null-category',
      categoryId: null,
      city: 'Douala',
      price: 1000,
    };
    const tempting = [
      item({ id: 'same-city', city: 'Douala', category_id: 8 }),
      item({ id: 'same-price', price: 1000, category_id: 20 }),
    ];
    expect(rankSimilarListings(uncategorized, tempting, TAXONOMY)).toEqual([]);
  });

  it('retourne vide s’il n’y a aucun candidat admissible', () => {
    expect(rankSimilarListings(seed, [item({ id: 'current' })], TAXONOMY)).toEqual([]);
    expect(rankSimilarListings(seed, [], TAXONOMY)).toEqual([]);
  });

  it('déduplique et respecte la limite', () => {
    const many = Array.from({ length: 8 }, (_, index) => item({ id: 'dup', created_at: `2026-0${index + 1}-01T00:00:00.000Z` }));
    const extras = Array.from({ length: 6 }, (_, index) =>
      item({ id: `n${index}`, created_at: `2026-02-0${index + 1}T00:00:00.000Z` })
    );
    const ranked = rankSimilarListings(seed, [...many, ...extras], TAXONOMY, 4);
    const ids = ranked.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(SIMILAR_LISTINGS_LIMIT);
    expect(ids).not.toContain('current');
  });

  it('borne le fetch à la branche parente, pas à toute la racine', () => {
    expect(resolveSimilarFetchCategoryIds(TAXONOMY, 8).sort((a, b) => a - b)).toEqual([6, 8]);
    expect(resolveSimilarFetchCategoryIds(TAXONOMY, 8)).not.toContain(7);
    expect(resolveSimilarFetchCategoryIds(TAXONOMY, 5).sort((a, b) => a - b)).toEqual([5, 6, 7, 8]);
  });
});
