import { describe, expect, it } from 'vitest';
import type { PublicListing } from '@/services/listings';
import { sortListings } from './sortListings';

function listing(partial: Partial<PublicListing> & Pick<PublicListing, 'id' | 'title'>): PublicListing {
  return {
    price: 1000,
    city: 'Douala',
    created_at: '2026-01-01T00:00:00.000Z',
    images: [],
    views_count: 0,
    seller_id: 's',
    updated_at: '2026-01-01T00:00:00.000Z',
    boosted: false,
    ...partial,
  };
}

describe('sortListings', () => {
  it('sans query, aucun comportement existant n’est modifié (boost puis date)', () => {
    const olderBoosted = listing({
      id: 'b',
      title: 'Ancien boost',
      boosted: true,
      created_at: '2025-01-01T00:00:00.000Z',
    });
    const newer = listing({
      id: 'n',
      title: 'Récent',
      created_at: '2026-06-01T00:00:00.000Z',
    });
    expect(sortListings([newer, olderBoosted], 'recent').map((item) => item.id)).toEqual(['b', 'n']);
  });

  it('recent trie sur created_at, sans promotion par renouvellement ou édition', () => {
    const newerRenewed = listing({
      id: 'renewed',
      title: 'Ancien renouvelé',
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
      last_published_at: '2026-08-01T00:00:00.000Z',
    });
    const createdYesterday = listing({
      id: 'created',
      title: 'Créé récemment',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-09-02T00:00:00.000Z',
    });
    expect(sortListings([createdYesterday, newerRenewed], 'recent').map((item) => item.id)).toEqual([
      'created',
      'renewed',
    ]);
  });

  it('départage les dates égales par id décroissant, indépendamment de l’ordre reçu', () => {
    const a = listing({ id: '00000000-0000-4000-8000-000000000001', title: 'A' });
    const b = listing({ id: '00000000-0000-4000-8000-000000000002', title: 'B' });
    for (const input of [[a, b], [b, a]]) {
      expect(sortListings(input, 'recent')).toEqual([b, a]);
    }
  });

  it('reste stable à clé identique et ne modifie pas le tableau source', () => {
    const first = listing({ id: 'same', title: 'Premier' });
    const second = listing({ id: 'same', title: 'Second' });
    const input = [first, second];
    const sorted = sortListings(input, 'recent');
    expect(sorted).not.toBe(input);
    expect(sorted[0]).toBe(first);
    expect(sorted[1]).toBe(second);
    expect(input).toEqual([first, second]);
    expect(sortListings(sorted, 'recent')).toEqual(sorted);
  });

  it('relevance privilégie un match titre à un match description', () => {
    const descriptionOnly = listing({
      id: 'd',
      title: 'Accessoire',
      description: 'iphone en boite',
      created_at: '2026-08-01T00:00:00.000Z',
    });
    const exact = listing({
      id: 'e',
      title: 'iphone',
      description: 'autre',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const sorted = sortListings([descriptionOnly, exact], 'relevance', { query: 'iphone' });
    expect(sorted[0].id).toBe('e');
  });

  it('relevance : égalité de score → annonce la plus récente d’abord', () => {
    const older = listing({
      id: 'old',
      title: 'iPhone 13',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const newer = listing({
      id: 'new',
      title: 'iPhone 13',
      created_at: '2026-08-01T00:00:00.000Z',
    });
    const sorted = sortListings([older, newer], 'relevance', { query: 'iphone' });
    expect(sorted.map((item) => item.id)).toEqual(['new', 'old']);
  });

  it('recent reste indépendant du score de pertinence', () => {
    const olderTitleMatch = listing({
      id: 'match',
      title: 'iphone',
      created_at: '2025-01-01T00:00:00.000Z',
    });
    const newerUnrelated = listing({
      id: 'recent',
      title: 'Canapé',
      created_at: '2026-08-01T00:00:00.000Z',
    });
    const sorted = sortListings([olderTitleMatch, newerUnrelated], 'recent', { query: 'iphone' });
    expect(sorted.map((item) => item.id)).toEqual(['recent', 'match']);
  });

  it('price_asc et price_desc restent inchangés', () => {
    const cheap = listing({ id: 'c', title: 'Autre', price: 10 });
    const expensiveMatch = listing({ id: 'e', title: 'iphone', price: 500 });
    expect(
      sortListings([expensiveMatch, cheap], 'price_asc', { query: 'iphone' }).map((item) => item.id)
    ).toEqual(['c', 'e']);
    expect(
      sortListings([cheap, expensiveMatch], 'price_desc', { query: 'iphone' }).map((item) => item.id)
    ).toEqual(['e', 'c']);
  });
});
