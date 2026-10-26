import { describe, expect, it } from 'vitest';
import { sanitizeUpdateUrl } from './sanitizeUpdateUrl';

describe('sanitizeUpdateUrl', () => {
  it('accepte les URLs HTTPS officielles des stores YOUMBIA', () => {
    expect(sanitizeUpdateUrl('android', 'https://play.google.com/store/apps/details?id=com.youmbia.mobile'))
      .toBe('https://play.google.com/store/apps/details?id=com.youmbia.mobile');
    expect(sanitizeUpdateUrl('ios', 'https://apps.apple.com/app/6774914586'))
      .toBe('https://apps.apple.com/app/6774914586');
    expect(sanitizeUpdateUrl('android', 'market://details?id=com.youmbia.mobile'))
      .toBe('market://details?id=com.youmbia.mobile');
  });

  it('rejette les faux domaines, redirections et protocoles dangereux', () => {
    for (const url of [
      'https://play.google.com.evil.tld/store/apps/details?id=com.youmbia.mobile',
      'https://evil.tld/redirect?next=play.google.com',
      'http://play.google.com/store/apps/details?id=com.youmbia.mobile',
      'javascript:play.google.com',
      'https://someone@play.google.com/store/apps/details?id=com.youmbia.mobile',
      'market://details?id=com.other.application',
      'market://evil/details?id=com.youmbia.mobile',
      'https://apps.apple.com.evil.tld/app/6774914586',
      '',
    ]) {
      expect(sanitizeUpdateUrl('android', url)).toBeNull();
    }
  });

  it('n’accepte jamais un store Android comme URL iOS ni inversement', () => {
    expect(sanitizeUpdateUrl('ios', 'https://play.google.com/store/apps/details?id=com.youmbia.mobile')).toBeNull();
    expect(sanitizeUpdateUrl('android', 'https://apps.apple.com/app/6774914586')).toBeNull();
  });
});
