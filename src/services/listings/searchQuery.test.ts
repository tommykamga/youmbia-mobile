import { describe, expect, it } from 'vitest';
import type { MarketplaceCategoryIdentity } from '@/lib/marketplaceCategories';
import {
  appendUniqueSearchListings,
  buildSearchTextOrClauses,
  compareSearchRelevance,
  computeSearchRelevanceScore,
  listingMatchesCategoryFilter,
  listingMatchesCityFilter,
  listingMatchesPriceFilter,
  listingMatchesQueryTokens,
  resolveSearchCategoryFilter,
  tokenizeSearchQuery,
} from './searchQuery';

const TAXONOMY: MarketplaceCategoryIdentity[] = [
  { id: 5, name: 'Véhicules', slug: 'vehicules', parent_id: null },
  { id: 6, name: 'Voitures', slug: 'voitures', parent_id: 5 },
  { id: 7, name: 'Motos', slug: 'motos', parent_id: 5 },
  { id: 8, name: 'Berlines', slug: 'berlines', parent_id: 6 },
  { id: 19, name: 'Électronique', slug: 'electronique', parent_id: null },
  { id: 20, name: 'Téléphones', slug: 'telephones-objets-connectes', parent_id: 19 },
];

function listing(partial: {
  id?: string;
  title: string;
  city?: string;
  description?: string;
  category_id?: number;
  created_at?: string;
  price?: number;
}) {
  return {
    id: partial.id ?? '1',
    title: partial.title,
    city: partial.city ?? '',
    description: partial.description ?? '',
    category_id: partial.category_id ?? null,
    created_at: partial.created_at ?? '2026-01-01T00:00:00.000Z',
    price: partial.price ?? 1000,
  };
}

describe('searchQuery', () => {
  it('tokenise iphone douala en deux tokens exploitables', () => {
    expect(tokenizeSearchQuery('iphone douala')).toEqual(['iphone', 'douala']);
    expect(tokenizeSearchQuery('iPhone Douala')).toEqual(['iphone', 'douala']);
    expect(tokenizeSearchQuery('   ')).toEqual([]);
    expect(tokenizeSearchQuery('')).toEqual([]);
    expect(tokenizeSearchQuery('chaussures de sport')).toEqual(['chaussures', 'sport']);
  });

  it('satisfait les deux tokens iphone douala dans des champs différents', () => {
    const query = 'iphone douala';
    const splitFields = listing({ title: 'iPhone 13 Pro', city: 'Douala', category_id: 20 });
    expect(listingMatchesQueryTokens(splitFields, query)).toBe(true);
    expect(listingMatchesQueryTokens(listing({ title: 'iPhone 13 Pro', city: 'Yaoundé' }), query)).toBe(
      false
    );
  });

  it('filtre une racine sur toute la branche descendante', () => {
    const filter = resolveSearchCategoryFilter(TAXONOMY, 5);
    expect(filter.mode).toBe('in');
    if (filter.mode !== 'in') return;
    expect([...filter.ids].sort((a, b) => a - b)).toEqual([5, 6, 7, 8]);
    expect(listingMatchesCategoryFilter(8, filter)).toBe(true);
    expect(listingMatchesCategoryFilter(20, filter)).toBe(false);
  });

  it('filtre un nœud intermédiaire sur ses descendants', () => {
    const filter = resolveSearchCategoryFilter(TAXONOMY, 6);
    expect(filter.mode).toBe('in');
    if (filter.mode !== 'in') return;
    expect([...filter.ids].sort((a, b) => a - b)).toEqual([6, 8]);
    expect(listingMatchesCategoryFilter(8, filter)).toBe(true);
    expect(listingMatchesCategoryFilter(7, filter)).toBe(false);
  });

  it('filtre une feuille de façon exacte', () => {
    const filter = resolveSearchCategoryFilter(TAXONOMY, 20);
    expect(filter).toEqual({ mode: 'eq', id: 20 });
    expect(listingMatchesCategoryFilter(20, filter)).toBe(true);
    expect(listingMatchesCategoryFilter(19, filter)).toBe(false);
  });

  it('matche le texte + ville (iphone douala)', () => {
    const query = 'iphone douala';
    const inDouala = listing({ title: 'iPhone 13 Pro', city: 'Douala', category_id: 20 });
    const inYaounde = listing({ title: 'iPhone 13 Pro', city: 'Yaoundé', category_id: 20 });
    const samsungDouala = listing({ title: 'Samsung A54', city: 'Douala', category_id: 20 });
    const splitFields = listing({ title: 'iPhone 13 Pro', city: 'Douala' });

    expect(tokenizeSearchQuery(query)).toEqual(['iphone', 'douala']);
    expect(listingMatchesQueryTokens(inDouala, query)).toBe(true);
    expect(listingMatchesQueryTokens(splitFields, query)).toBe(true);
    expect(listingMatchesQueryTokens(inYaounde, query)).toBe(false);
    expect(listingMatchesQueryTokens(samsungDouala, query)).toBe(false);
    expect(listingMatchesCityFilter(inDouala.city, 'Douala')).toBe(true);
    expect(listingMatchesCityFilter(inYaounde.city, 'Douala')).toBe(false);
  });

  it('applique prix min/max', () => {
    expect(listingMatchesPriceFilter(50, 100, 200)).toBe(false);
    expect(listingMatchesPriceFilter(150, 100, 200)).toBe(true);
    expect(listingMatchesPriceFilter(250, 100, 200)).toBe(false);
    expect(listingMatchesPriceFilter(50, null, null)).toBe(true);
  });

  it('privilégie le titre exact devant la catégorie et la description', () => {
    const query = 'vehicules';
    const exactTitle = listing({ title: 'vehicules', description: 'autre', category_id: 20 });
    const categoryOnly = listing({
      title: 'Toyota Corolla',
      description: 'rien',
      category_id: 6,
    });
    const descriptionOnly = listing({
      title: 'Accessoire',
      description: 'vehicules en stock',
      category_id: 20,
    });

    const exactScore = computeSearchRelevanceScore(exactTitle, query, TAXONOMY);
    const categoryScore = computeSearchRelevanceScore(categoryOnly, query, TAXONOMY);
    const descriptionScore = computeSearchRelevanceScore(descriptionOnly, query, TAXONOMY);

    expect(exactScore).toBeGreaterThan(categoryScore);
    expect(categoryScore).toBeGreaterThan(descriptionScore);
    expect(listingMatchesQueryTokens(descriptionOnly, query)).toBe(true);
  });

  it('classe iPhone à Douala devant iPhone ailleurs pour la même requête', () => {
    const query = 'iphone douala';
    const douala = listing({
      id: 'd',
      title: 'iPhone 13',
      city: 'Douala',
      category_id: 20,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const yaounde = listing({
      id: 'y',
      title: 'iPhone 13',
      city: 'Yaoundé',
      category_id: 20,
      created_at: '2026-06-01T00:00:00.000Z',
    });
    expect(compareSearchRelevance(douala, yaounde, query, TAXONOMY)).toBeLessThan(0);
  });

  it('combine catégorie + ville', () => {
    const filter = resolveSearchCategoryFilter(TAXONOMY, 19);
    const ok = listing({ title: 'iPhone', city: 'Douala', category_id: 20, price: 150 });
    const wrongCat = listing({ title: 'iPhone', city: 'Douala', category_id: 7, price: 150 });
    const wrongCity = listing({ title: 'iPhone', city: 'Yaoundé', category_id: 20, price: 150 });

    expect(listingMatchesCategoryFilter(ok.category_id, filter)).toBe(true);
    expect(listingMatchesCityFilter(ok.city, 'Douala')).toBe(true);
    expect(listingMatchesPriceFilter(ok.price, 100, 200)).toBe(true);

    expect(listingMatchesCategoryFilter(wrongCat.category_id, filter)).toBe(false);
    expect(listingMatchesCityFilter(wrongCity.city, 'Douala')).toBe(false);
  });

  it('aucun résultat si aucun token ne matche', () => {
    const listingRow = listing({ title: 'Toyota Corolla', city: 'Bafoussam', description: 'essence' });
    expect(listingMatchesQueryTokens(listingRow, 'iphone douala')).toBe(false);
  });

  it('pagine sans duplicate évident', () => {
    const page1 = [listing({ id: 'a', title: 'A' }), listing({ id: 'b', title: 'B' })];
    const page2 = [listing({ id: 'b', title: 'B' }), listing({ id: 'c', title: 'C' })];
    const merged = appendUniqueSearchListings(page1, page2);
    expect(merged.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('construit des clauses AND par token sans concaténation non maîtrisée', () => {
    const clauses = buildSearchTextOrClauses(['iphone', 'douala'], true, ['owner-1']);
    expect(clauses).toEqual([
      'title.ilike.%iphone%,city.ilike.%iphone%,description.ilike.%iphone%,user_id.in.(owner-1)',
      'title.ilike.%douala%,city.ilike.%douala%,description.ilike.%douala%',
    ]);
  });

  it('neutralise les caractères utilisateur dans les clauses PostgREST', () => {
    const clauses = buildSearchTextOrClauses(['iphone).or(id.eq.1', 'douala,evil', '%_'], true);
    expect(clauses).toEqual([
      'title.ilike.%iphoneorideq1%,city.ilike.%iphoneorideq1%,description.ilike.%iphoneorideq1%',
      'title.ilike.%doualaevil%,city.ilike.%doualaevil%,description.ilike.%doualaevil%',
    ]);
    expect(clauses.join(' ')).not.toContain('.or(');
    expect(clauses.join(' ')).not.toContain('id.eq');
  });
});
