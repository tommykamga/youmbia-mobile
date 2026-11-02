import { describe, expect, it } from 'vitest';
import appConfig from '../../app.json';

describe('TOM-101 Android App Links boutique', () => {
  it('déclare /shop pour les hôtes HTTPS YOUMBIA sans retirer /annonce', () => {
    const filters = appConfig.expo.android.intentFilters;
    const data = filters.flatMap((item) => item.data);
    for (const host of ['youmbia.com', 'www.youmbia.com']) {
      expect(data.some((entry) =>
        entry.scheme === 'https' && entry.host === host && entry.pathPrefix === '/shop'
      )).toBe(true);
      expect(data.some((entry) =>
        entry.scheme === 'https' && entry.host === host && entry.pathPrefix === '/annonce'
      )).toBe(true);
    }
  });
});
