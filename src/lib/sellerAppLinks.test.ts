import { describe, expect, it } from 'vitest';
import config from '../../app.json';
describe('LINK-01 seller App Links contract', () => {
  it('claims both seller routes on both hosts without adding auth paths', () => {
    const filter = config.expo.android.intentFilters[0];
    expect(filter.autoVerify).toBe(true);
    for (const host of ['www.youmbia.com','youmbia.com']) {
      for (const pathPrefix of ['/seller/','/vendeur/']) {
        expect(filter.data).toContainEqual({scheme:'https',host,pathPrefix});
      }
    }
    expect([...new Set(filter.data.filter(x => x.pathPrefix.startsWith('/auth')).map(x => x.pathPrefix))].sort())
      .toEqual(['/auth/callback','/auth/confirm']);
  });
});
