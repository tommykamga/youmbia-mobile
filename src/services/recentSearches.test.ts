import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_RECENT_SEARCHES,
  buildRecentSearchLabel,
  clearRecentSearches,
  getRecentSearches,
  mergeRecentSearch,
  rememberRecentSearch,
  resetRecentSearchesForTests,
  type RecentSearch,
} from './recentSearches';

const memory = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => memory.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      memory.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      memory.delete(key);
    }),
  },
}));

function item(partial: Partial<RecentSearch> & { query: string }): RecentSearch {
  return {
    category: null,
    categoryId: null,
    city: null,
    searchedAt: '2026-09-03T10:00:00.000Z',
    ...partial,
  };
}

describe('mergeRecentSearch', () => {
  it('remonte la dernière recherche en premier et dédoublonne', () => {
    const first = item({ query: 'iphone' });
    const second = item({ query: 'moto', searchedAt: '2026-09-03T11:00:00.000Z' });
    const again = item({ query: 'IPHONE', searchedAt: '2026-09-03T12:00:00.000Z' });

    const merged = mergeRecentSearch(mergeRecentSearch([first], second), again);
    expect(merged.map((entry) => entry.query)).toEqual(['IPHONE', 'moto']);
  });

  it('plafonne à MAX_RECENT_SEARCHES', () => {
    const seed = Array.from({ length: MAX_RECENT_SEARCHES }, (_, index) =>
      item({ query: `q${index}` })
    );
    const next = mergeRecentSearch(seed, item({ query: 'nouveau' }));
    expect(next).toHaveLength(MAX_RECENT_SEARCHES);
    expect(next[0].query).toBe('nouveau');
    expect(next.some((entry) => entry.query === `q${MAX_RECENT_SEARCHES - 1}`)).toBe(false);
    expect(next.some((entry) => entry.query === 'q0')).toBe(true);
  });
});

describe('recentSearches storage', () => {
  beforeEach(() => {
    memory.clear();
    resetRecentSearchesForTests();
  });

  it('persiste, dédoublonne et expose Effacer', async () => {
    await rememberRecentSearch({ query: 'table' });
    await rememberRecentSearch({ query: 'chaise', city: 'Yaoundé' });
    await rememberRecentSearch({ query: 'TABLE' });

    const items = await getRecentSearches();
    expect(items).toHaveLength(2);
    expect(items[0].query).toBe('TABLE');
    expect(items[1].query).toBe('chaise');
    expect(buildRecentSearchLabel(items[1])).toBe('chaise · Yaoundé');

    await clearRecentSearches();
    expect(await getRecentSearches()).toEqual([]);
  });

  it('n’enregistre pas une entrée vide', async () => {
    const items = await rememberRecentSearch({ query: '   ' });
    expect(items).toEqual([]);
  });
});
