import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveShopMediaUrls, resolveShopsMediaUrls, isDisplayableShopMediaUrl } from './shopMediaUrl';
import type { PublicShop } from '@/types/shops';

const mocks = vi.hoisted(() => ({
  getSignedUrlsMap: vi.fn(),
}));

vi.mock('@/lib/listingImageUrl', () => ({
  getSignedUrlsMap: mocks.getSignedUrlsMap,
  isListingImageHttpUrl: (s: string) => /^https?:\/\//i.test(String(s ?? '').trim()),
  toDisplayImageUrl: (urlOrPath: string, signedMap?: Map<string, string>) => {
    const s = String(urlOrPath ?? '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    return signedMap?.get(s) ?? '';
  },
}));

const baseShop = (over: Partial<PublicShop>): PublicShop => ({
  id: 'shop-1',
  owner_id: 'owner-1',
  name: 'Test boutique',
  slug: 'test-boutique',
  status: 'active',
  description: null,
  logo_url: null,
  banner_url: null,
  whatsapp_phone: null,
  phone: null,
  city: 'Douala',
  is_verified: false,
  is_featured: false,
  created_at: '2026-01-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSignedUrlsMap.mockResolvedValue(new Map());
});

describe('resolveShopMediaUrls', () => {
  it('returns null media when DB fields are empty', async () => {
    const out = await resolveShopMediaUrls(baseShop({}));
    expect(out.logo_url).toBeNull();
    expect(out.banner_url).toBeNull();
    expect(mocks.getSignedUrlsMap).not.toHaveBeenCalled();
  });

  it('keeps absolute http URLs without Storage calls', async () => {
    const out = await resolveShopMediaUrls(
      baseShop({
        logo_url: 'https://cdn.example/logo.png',
        banner_url: 'https://cdn.example/banner.png',
      })
    );
    expect(out.logo_url).toBe('https://cdn.example/logo.png');
    expect(out.banner_url).toBe('https://cdn.example/banner.png');
    expect(mocks.getSignedUrlsMap).not.toHaveBeenCalled();
  });

  it('maps storage paths to signed URLs from batch', async () => {
    const path = 'owner-1/shops/shop-1/logo.jpg';
    mocks.getSignedUrlsMap.mockResolvedValue(new Map([[path, 'https://signed.example/logo']]));
    const out = await resolveShopMediaUrls(baseShop({ logo_url: path }));
    expect(out.logo_url).toBe('https://signed.example/logo');
    expect(mocks.getSignedUrlsMap).toHaveBeenCalledTimes(1);
    expect(mocks.getSignedUrlsMap).toHaveBeenCalledWith([path]);
  });

  it('does not expose raw storage path when batch signing fails', async () => {
    const path = 'owner-1/shops/shop-1/banner.jpg';
    mocks.getSignedUrlsMap.mockResolvedValue(new Map());
    const out = await resolveShopMediaUrls(baseShop({ banner_url: path }));
    expect(out.banner_url).toBeNull();
  });

  it('signs logo and banner in one batch call', async () => {
    const logoPath = 'owner-1/shops/shop-1/logo.jpg';
    const bannerPath = 'owner-1/shops/shop-1/banner.jpg';
    mocks.getSignedUrlsMap.mockResolvedValue(
      new Map([
        [logoPath, 'https://signed.example/logo'],
        [bannerPath, 'https://signed.example/banner'],
      ])
    );
    const out = await resolveShopMediaUrls(
      baseShop({ logo_url: logoPath, banner_url: bannerPath })
    );
    expect(out.logo_url).toBe('https://signed.example/logo');
    expect(out.banner_url).toBe('https://signed.example/banner');
    expect(mocks.getSignedUrlsMap).toHaveBeenCalledTimes(1);
  });
});

describe('resolveShopsMediaUrls', () => {
  it('batch-signs all shops with a single Storage map request', async () => {
    const pathA = 'o1/shops/a/logo.jpg';
    const pathB = 'o2/shops/b/banner.jpg';
    mocks.getSignedUrlsMap.mockResolvedValue(
      new Map([
        [pathA, 'https://signed/a'],
        [pathB, 'https://signed/b'],
      ])
    );
    const shops = [
      baseShop({ id: 'a', logo_url: pathA, banner_url: null }),
      baseShop({ id: 'b', logo_url: null, banner_url: pathB }),
    ];
    const out = await resolveShopsMediaUrls(shops);
    expect(out[0].logo_url).toBe('https://signed/a');
    expect(out[1].banner_url).toBe('https://signed/b');
    expect(mocks.getSignedUrlsMap).toHaveBeenCalledTimes(1);
    expect(mocks.getSignedUrlsMap).toHaveBeenCalledWith([pathA, pathB]);
  });
});

describe('isDisplayableShopMediaUrl', () => {
  it('accepts https only', () => {
    expect(isDisplayableShopMediaUrl('https://x/y.jpg')).toBe(true);
    expect(isDisplayableShopMediaUrl('http://x/y.jpg')).toBe(true);
  });

  it('rejects storage paths and invalid values', () => {
    expect(isDisplayableShopMediaUrl('owner/shops/x/logo.jpg')).toBe(false);
    expect(isDisplayableShopMediaUrl('')).toBe(false);
    expect(isDisplayableShopMediaUrl(null)).toBe(false);
    expect(isDisplayableShopMediaUrl('not-a-url')).toBe(false);
  });
});
