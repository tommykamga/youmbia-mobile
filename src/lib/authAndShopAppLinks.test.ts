import { describe, expect, it } from 'vitest';
import appConfig from '../../app.json';

describe('TOM-104 Auth / Shop App Links', () => {
  it('déclare les hôtes iOS apex et www', () => {
    expect(appConfig.expo.ios.associatedDomains).toContain('applinks:www.youmbia.com');
    expect(appConfig.expo.ios.associatedDomains).toContain('applinks:youmbia.com');
  });

  it('préserve annonce, boutique, et auth/confirm sur chaque hôte Android', () => {
    const paths = appConfig.expo.android.intentFilters[0].data;
    for (const host of ['www.youmbia.com', 'youmbia.com']) {
      for (const prefix of ['/annonce', '/shop', '/auth/confirm']) {
        expect(paths.some(x=>x.host===host && x.scheme==='https' && x.pathPrefix===prefix)).toBe(true);
      }
    }
  });
});
