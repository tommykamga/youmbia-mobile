import { describe, expect, it, vi } from 'vitest';
import { getPublicSellerUrl, getPublicListingUrl } from './shareListing';
import { getPublicShopUrl } from './shareShop';
vi.mock('@/lib/analytics', () => ({ trackListingShareInitiated: vi.fn(), trackListingShared: vi.fn() }));
describe('LINK-01 public sharing contract', () => {
  it('shares canonical seller URL', () => {
    expect(getPublicSellerUrl('98cb3b62-f959-4b89-8ea3-ccd8b969e037')).toBe('https://www.youmbia.com/seller/98cb3b62-f959-4b89-8ea3-ccd8b969e037');
  });
  it('encodes each identifier as one path segment', () => {
    expect(getPublicListingUrl('a?b#c')).toBe('https://www.youmbia.com/annonce/a%3Fb%23c');
    expect(getPublicSellerUrl('a/b')).toBe('https://www.youmbia.com/seller/a%2Fb');
    expect(getPublicShopUrl('W Electronik')).toBe('https://www.youmbia.com/shop/w%20electronik');
  });
});
