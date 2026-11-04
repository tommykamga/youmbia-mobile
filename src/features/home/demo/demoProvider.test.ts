import { describe, expect, it } from 'vitest';
import { createDemoProvider, DEMO_LISTINGS, isHomeDemoEnabled } from './demoProvider';
import { createDiscoveryFeedController } from '@/features/listings/discoveryFeedController';
import { formatPrice } from '@/lib/format';

describe('isolated home demonstration', () => {
  it('is off unless development AND the exact explicit flag are enabled', () => {
    for (const value of [undefined, '', '0', 'true', '1']) expect(isHomeDemoEnabled(false, value)).toBe(false);
    for (const value of [undefined, '', '0', 'true']) expect(isHomeDemoEnabled(true, value)).toBe(false);
    expect(isHomeDemoEnabled(true, '1')).toBe(true);
  });
  it('provides 48 stable distinct fixtures including long text, long prices and no-photo cases', () => {
    expect(DEMO_LISTINGS).toHaveLength(48);
    expect(new Set(DEMO_LISTINGS.map(x => x.id)).size).toBe(48);
    expect(new Set(DEMO_LISTINGS.map(x => x.city)).size).toBe(6);
    expect(new Set(DEMO_LISTINGS.map(x => x.fixtureCategorySlug)).size).toBe(6);
    expect(DEMO_LISTINGS.some(x => x.images.length === 0)).toBe(true);
    expect(DEMO_LISTINGS.some(x => x.title.length > 140)).toBe(true);
    expect(DEMO_LISTINGS[0].price).toBe(1234567890);
    expect(formatPrice(DEMO_LISTINGS[0].price)).toBe('1\u202f234\u202f567\u202f890\u00a0FCFA');
    expect(formatPrice(DEMO_LISTINGS[7].price)).toMatch(/^\d[\d\u202f]*\u00a0FCFA$/);
  });
  it('uses the real progressive controller across all eight lots and the exhaustion probe', async () => {
    const provider = createDemoProvider({ query: '', city: '', category: null });
    const feed = createDiscoveryFeedController(6, provider.loadPage);
    await feed.refresh();
    expect(feed.getSnapshot().data).toHaveLength(6);
    await feed.loadMore(); expect(feed.getSnapshot().data).toHaveLength(12);
    for (let i = 0; i < 7; i++) await feed.loadMore();
    expect(feed.getSnapshot()).toMatchObject({ hasMore: false, nextOffset: 48 });
    expect(feed.getSnapshot().data.map(x => x.id)).toEqual(DEMO_LISTINGS.map(x => x.id));
  });
  it('combines city, query, category and price without mutating the stable catalogue', async () => {
    const criteria = { query: 'smartphone', city: 'douala', category: 101, min: 1e9, max: 2e9 };
    const provider = createDemoProvider(criteria, [{ id: 101, name: 'Électronique', slug: 'electronique', parent_id: null }]);
    const result = await provider.loadPage(0, 6);
    expect(result.data.length).toBeGreaterThan(0);
    for (const x of result.data) {
      expect(x.city).toBe('Douala'); expect(x.category_id).toBe(101);
      expect(x.title.toLowerCase()).toContain('smartphone'); expect(x.price).toBeGreaterThanOrEqual(1e9);
    }
    expect(createDemoProvider({ query: '', city: '', category: null }).total).toBe(48);
    expect(createDemoProvider({ query: 'introuvable', city: '', category: null }).total).toBe(0);
  });
});

it('exposes stable local shops without remote media, contact details or verification claims', () => {
  const first = createDemoProvider({ query: '', city: '', category: null }).shops;
  const filtered = createDemoProvider({ query: 'smartphone', city: 'Douala', category: 1 }).shops;
  expect(first).toHaveLength(3); expect(filtered).toBe(first);
  expect(new Set(first.map(shop => shop.id)).size).toBe(3);
  for (const shop of first) {
    expect(shop.id).toMatch(/^home-demo-shop-/); expect(shop.is_verified).toBe(false);
    expect(shop.verification_proven).toBe(false); expect(shop.active_listings_count).toBe(8);
    expect(shop.banner_url).toBeNull(); expect(shop.logo_url).toBeNull();
    expect(shop.phone).toBeNull(); expect(shop.whatsapp_phone).toBeNull();
  }
});


it('uses supplied business IDs instead of invented demo category IDs', async () => {
  const categories = [{ id: 987, name: 'Électronique', slug: 'electronique', parent_id: null }];
  const provider = createDemoProvider({ query: '', city: '', category: 987 }, categories);
  const page = await provider.loadPage(0, 6);
  expect(page.data).toHaveLength(6);
  expect(page.data.every(listing => listing.category_id === 987)).toBe(true);
  expect(createDemoProvider({ query: '', city: '', category: 1 }, categories).total).toBe(0);
  expect(DEMO_LISTINGS.every(listing => listing.category_id === null)).toBe(true);
});


it('reuses business category descendant rules for a root selection', async () => {
  const provider = createDemoProvider({ query: '', city: '', category: 101 }, [
    { id: 101, name: 'Électronique', slug: 'electronique', parent_id: null },
    { id: 987, name: 'Informatique', slug: 'informatique', parent_id: 101 },
  ]);
  expect(provider.total).toBe(16);
  const page = await provider.loadPage(0, 50);
  expect(new Set(page.data.map(x => x.category_id))).toEqual(new Set([101, 987]));
});
