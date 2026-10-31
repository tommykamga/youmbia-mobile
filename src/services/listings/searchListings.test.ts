import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listingMatchesCityFilter } from './searchQuery';
import { searchListings } from './searchListings';

const mocks = vi.hoisted(() => ({
  from: vi.fn(), categories: vi.fn(), executed: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/services/categories', () => ({ getMarketplaceCategoriesCached: mocks.categories }));
vi.mock('@/lib/listingImageUrl', () => ({
  getSignedUrlsMap: vi.fn(async () => new Map()),
  listingStoragePathsForCardCover: () => [],
  mapListingCardImages: () => [],
  toDisplayImageUrl: (value: string) => value,
}));

// Independent SQL LIKE evaluator: accents remain significant, % and _ are wildcards.
function ilike(value: unknown, pattern: string): boolean {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    let c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) c = pattern[++i];
    else if (c === '%') { source += '[\\s\\S]*'; continue; }
    else if (c === '_') { source += '[\\s\\S]'; continue; }
    source += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return value != null && new RegExp('^' + source + '$', 'i').test(String(value));
}

const taxonomy = [
  { id: 5, name: 'Véhicules', parent_id: null },
  { id: 6, name: 'Voitures', parent_id: 5 },
  { id: 7, name: 'Berlines', parent_id: 6 },
  { id: 9, name: 'Autres', parent_id: null },
];
function row(id: string, city: string | null, category_id = 7, price = 100) {
  return { id, city, category_id, price, title: 'iPhone Douala', description: 'occasion',
    status: 'active', created_at: '2026-01-01', updated_at: '2026-01-01',
    user_id: null, listing_images: [] };
}
let rows: ReturnType<typeof row>[];
let failure: { message: string } | null;
let ranges: number[][];
let orders: string[];

beforeEach(() => {
  vi.clearAllMocks();
  rows = []; failure = null; ranges = []; orders = [];
  mocks.categories.mockResolvedValue(taxonomy);
  mocks.from.mockImplementation((table: string) => {
    const predicates: ((r: Record<string, unknown>) => boolean)[] = [];
    let bounds = [0, Infinity];
    let orderColumn = ''; let ascending = true;
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((key: string, value: unknown) => { predicates.push(r => r[key] === value); return builder; }),
      in: vi.fn((key: string, values: unknown[]) => { predicates.push(r => values.includes(r[key])); return builder; }),
      ilike: vi.fn((key: string, pattern: string) => { predicates.push(r => ilike(r[key], pattern)); return builder; }),
      or: vi.fn((clause: string) => {
        predicates.push(r => clause.split(',').some(part => {
          const [key, op, ...rest] = part.split('.');
          return op === 'ilike' && ilike(r[key], rest.join('.'));
        }));
        return builder;
      }),
      gte: (key: string, value: number) => { predicates.push(r => Number(r[key]) >= value); return builder; },
      lte: (key: string, value: number) => { predicates.push(r => Number(r[key]) <= value); return builder; },
      limit: () => builder,
      order: (key: string, options: { ascending: boolean }) => {
        orderColumn = key; ascending = options.ascending; orders.push(key); return builder;
      },
      range: (from: number, to: number) => { bounds = [from, to]; ranges.push(bounds); return builder; },
      then: (resolve: (value: unknown) => unknown) => {
        mocks.executed(table);
        let filtered = table === 'listings' ? rows.filter(r => predicates.every(p => p(r))) : [];
        if (orderColumn === 'price') filtered = [...filtered].sort((a, b) => (a.price - b.price) * (ascending ? 1 : -1));
        return Promise.resolve(resolve({ data: filtered.slice(bounds[0], bounds[1] + 1), count: filtered.length, error: failure }));
      },
    };
    return builder;
  });
});

describe('V5-01 search service regression', () => {
  it.each([1, 2])('reports category outage on page %i without executing an incomplete listing query', async page => {
    mocks.categories.mockRejectedValueOnce(new Error('offline'));
    const result = await searchListings({ categoryId: 5, page });
    expect(result).toEqual({ data: null, total: 0, error: { message: 'Impossible de charger les catégories. Veuillez réessayer.' } });
    expect(mocks.executed).not.toHaveBeenCalled();
  });

  it('includes parent, child and grandchild, excludes unrelated categories, and retries after failure', async () => {
    mocks.categories.mockRejectedValueOnce(new Error('offline'));
    await searchListings({ categoryId: 5 });
    rows = [row('parent', 'Douala', 5), row('child', 'Douala', 6), row('grandchild', 'Douala', 7), row('other', 'Douala', 9)];
    const result = await searchListings({ categoryId: '5' });
    expect(result.error).toBeNull();
    expect(result.data?.map(r => r.id)).toEqual(['parent', 'child', 'grandchild']);
    expect(result.total).toBe(3);
    const leaf = await searchListings({ categoryId: 7 });
    expect(leaf.data?.map(r => r.id)).toEqual(['grandchild']);
  });

  it('does not require the taxonomy for an unfiltered search', async () => {
    mocks.categories.mockRejectedValue(new Error('offline'));
    rows = [row('a', 'Douala')];
    expect((await searchListings()).data?.length).toBe(1);
    expect(mocks.categories).not.toHaveBeenCalled();
  });

  const cities = ['Douala', 'DOUALA 🇨🇲', 'Douala Bonapriso', 'Douala et Yaoundé',
    'Yaoundé', 'YAOUNDE', 'Yaoundé Cameroun', 'Yaoundé'.normalize('NFD'),
    'Ngaoundéré', 'Ngaoundere', 'Ngaoundére', 'Ngaounderé', 'Ngaoundéré'.normalize('NFD'),
    'Bafoussam', 'Buea', 'Limbe', 'Dibombari', 'Melong', 'Kribi', 'Édéa', 'Edea',
    'A_B', 'AxB', '100% Ville', '100 Ville', 'A\\B', 'Somewhere).or(id.eq.1)', '', null];
  it.each(['Douala', 'Douala Cameroun', 'Yaoundé', 'YAOUNDE', 'Ngaoundere',
    'Bafoussam', 'Buea', 'Limbe', 'Dibombari', 'Melong', 'Kribi', 'Édéa',
    'Douala Bonapriso', 'Douala et Yaoundé', 'A_B', '100% Ville', 'A\\B',
    'Somewhere).or(id.eq.1)', '', '  '])('server/client city parity for %j', async city => {
    rows = cities.map((value, i) => row(String(i), value));
    const result = await searchListings({ city, pageSize: 100 });
    expect(result.error).toBeNull();
    expect(result.data?.map(r => r.id)).toEqual(rows.filter(r => listingMatchesCityFilter(r.city, city)).map(r => r.id));
    // Returned historical values are preserved verbatim.
    expect(result.data?.map(r => r.city)).toEqual(rows.filter(r => listingMatchesCityFilter(r.city, city)).map(r => r.city));
  });

  it('includes controlled accented and decomposed variants, preserving historical inclusion', async () => {
    rows = cities.map((value, i) => row(String(i), value));
    const yaounde = await searchListings({ city: 'Yaoundé', pageSize: 100 });
    expect(yaounde.data?.map(r => r.city)).toEqual([
      'Douala et Yaoundé', 'Yaoundé', 'YAOUNDE', 'Yaoundé Cameroun', 'Yaoundé'.normalize('NFD'),
    ]);
    const ngaoundere = await searchListings({ city: 'Ngaoundere', pageSize: 100 });
    expect(ngaoundere.data?.map(r => r.city)).toEqual([
      'Ngaoundéré', 'Ngaoundere', 'Ngaoundére', 'Ngaounderé', 'Ngaoundéré'.normalize('NFD'),
    ]);
    const unknown = await searchListings({ city: 'Édéa', pageSize: 100 });
    expect(unknown.data?.map(r => r.city)).toEqual(['Édéa']);
    const ambiguous = await searchListings({ city: 'Douala Bonapriso', pageSize: 100 });
    expect(ambiguous.data?.map(r => r.city)).toEqual(['Douala Bonapriso']);
  });

  it('returns an empty page after exhaustion and keeps the default discovery order', async () => {
    rows = [row('a', 'Douala')];
    const result = await searchListings({ page: 2, pageSize: 1 });
    expect(result).toEqual({ data: [], total: 1, error: null });
    expect(ranges).toEqual([[1, 1]]);
    expect(orders).toHaveLength(1);
    expect(orders[0]).not.toBe('price');
  });

  it('keeps filters and counts before pagination, with text tokens, price and sort', async () => {
    rows = [row('a', 'Yaoundé', 7, 200), row('b', 'Yaounde', 6, 150), row('c', 'Yaoundé Cameroun', 5, 100),
      row('wrong-city', 'Douala'), row('wrong-cat', 'Yaoundé', 9),
      { ...row('sold', 'Yaoundé'), status: 'sold' }, { ...row('wrong-text', 'Yaoundé'), title: 'Samsung' }];
    const options = { query: 'iphone douala', city: 'Yaounde', categoryId: 5,
      minPrice: 100, maxPrice: 200, sortBy: 'price_asc' as const, pageSize: 2 };
    const first = await searchListings({ ...options, page: 1 });
    const second = await searchListings({ ...options, page: 2 });
    expect(first.data?.map(r => r.id)).toEqual(['c', 'b']);
    expect(second.data?.map(r => r.id)).toEqual(['a']);
    expect(first.total).toBe(3); expect(second.total).toBe(3);
    expect(ranges).toEqual([[0, 1], [2, 3]]);
    expect(orders).toEqual(['price', 'price']);
  });

  it('preserves database errors', async () => {
    failure = { message: 'request failed' };
    expect(await searchListings()).toEqual({ data: null, total: 0, error: failure });
  });
});
