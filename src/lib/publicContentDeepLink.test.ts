import { describe, expect, it } from 'vitest';
import { getPublicContentHref } from './publicContentDeepLink';
import { redirectSystemPath } from '../../app/+native-intent';
describe('LINK-01 public native entry', () => {
  for (const initial of [true, false]) {
    it(`maps seller aliases, listings and shops before routing (initial=${initial})`, () => {
      for (const alias of ['seller', 'vendeur']) {
        const path = `/${alias}/abc-123?utm_source=whatsapp#details`;
        expect(redirectSystemPath({path, initial})).toBe('/user/abc-123?utm_source=whatsapp#details');
        expect(getPublicContentHref(`https://youmbia.com${path}`)).toBe('/user/abc-123?utm_source=whatsapp#details');
      }
      expect(redirectSystemPath({path:'https://www.youmbia.com/annonce/abc',initial})).toBe('/listing/abc');
      expect(getPublicContentHref('youmbiamobile://shop/W-ELECTRONIK')).toBe('/shop/w-electronik');
    });
  }
  it('leaves auth tokens, internal routes and unknown paths byte-for-byte unchanged', () => {
    for (const path of ['/auth/confirm?token_hash=fake&type=magiclink','youmbiamobile://auth/callback#access_token=fake','/conversation/id','/not-known']) {
      expect(redirectSystemPath({path, initial:true})).toBe(path);
    }
  });
  it('rejects external domains, protocols, credentials, malformed/encoded path separators', () => {
    for (const url of ['http://www.youmbia.com/seller/abc','https://evil.test/seller/abc','https://youmbia.com.evil.test/shop/abc','https://u:p@www.youmbia.com/seller/abc','https://www.youmbia.com:444/seller/abc','https://www.youmbia.com/seller/%2fabc','https://www.youmbia.com/seller/%ZZ','javascript:alert(1)','youmbiamobile://evil/seller/abc']) expect(getPublicContentHref(url)).toBeNull();
  });
});

it('preserves legacy case-insensitive public routes without accepting malformed credentials', () => {
  expect(getPublicContentHref('https://www.youmbia.com/ANNONCE/AbC')).toBe('/listing/AbC');
  expect(getPublicContentHref('youmbiamobile://SHOP/W-ELECTRONIK?utm_source=wa')).toBe('/shop/w-electronik?utm_source=wa');
  expect(getPublicContentHref('youmbiamobile://u:p@shop/w-electronik')).toBeNull();
});
