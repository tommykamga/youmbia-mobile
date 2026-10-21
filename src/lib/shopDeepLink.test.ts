import { describe, expect, it } from 'vitest';
import { getShopHrefFromUrl } from './shopDeepLink';

const OWNER_ID = '154cb365-a83e-47f7-b9ab-ce33352c7dd0';

describe('getShopHrefFromUrl', () => {
  it('ouvre le lien HTTPS partagé par identifiant propriétaire, même avec query/trailing slash', () => {
    expect(getShopHrefFromUrl(`https://www.youmbia.com/shop/${OWNER_ID}?utm_source=whatsapp`))
      .toBe(`/shop/${OWNER_ID}`);
    expect(getShopHrefFromUrl(`https://youmbia.com/shop/${OWNER_ID}/`))
      .toBe(`/shop/${OWNER_ID}`);
  });

  it('garde le slug canonique et les deux formats du schéma natif', () => {
    expect(getShopHrefFromUrl('https://www.youmbia.com/shop/w-electronik'))
      .toBe('/shop/w-electronik');
    expect(getShopHrefFromUrl('youmbiamobile://shop/w-electronik'))
      .toBe('/shop/w-electronik');
    expect(getShopHrefFromUrl('youmbiamobile:///shop/w-electronik'))
      .toBe('/shop/w-electronik');
  });

  it('rejette domaines externes, HTTP, URLs arbitraires et segments non valides', () => {
    for (const invalid of [
      'http://www.youmbia.com/shop/w-electronik',
      'https://www.youmbia.com.evil.tld/shop/w-electronik',
      'https://evil.tld/shop/w-electronik',
      'https://www.youmbia.com/annonce/abc',
      'https://www.youmbia.com/shop/',
      'https://www.youmbia.com/shop/w-electronik/edit',
      'https://www.youmbia.com/shop/%2fetc',
      'youmbiamobile://evil/shop/w-electronik',
      'javascript:alert(1)',
      '',
    ]) {
      expect(getShopHrefFromUrl(invalid)).toBeNull();
    }
  });
});
