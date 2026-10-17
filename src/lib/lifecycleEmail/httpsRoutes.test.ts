import { describe, expect, it } from 'vitest';
import {
  assertEmailCtaIsHttps,
  resolveLifecycleHttpsRoute,
  YOUMBIA_MOBILE_SCHEME,
} from './httpsRoutes';

describe('lifecycle HTTPS routes + fallback', () => {
  it('welcome : HTTPS home ouvrable App Link + scheme mobile en secondaire', () => {
    const route = resolveLifecycleHttpsRoute('welcome_h0');
    expect(assertEmailCtaIsHttps(route.httpsUrl)).toBe(true);
    expect(route.httpsUrl).toBe('https://www.youmbia.com/');
    expect(route.opensInAppViaHttps).toBe(true);
    expect(route.webFallbackUrl).toBe(route.httpsUrl);
    expect(route.mobileSchemeUrl?.startsWith(`${YOUMBIA_MOBILE_SCHEME}://`)).toBe(true);
    expect(route.ctaEnabled).toBe(true);
  });

  it('first_listing dry-run : CTA désactivé, fallback web conservé', () => {
    const route = resolveLifecycleHttpsRoute('first_listing_h24', { dryRun: true });
    expect(route.ctaEnabled).toBe(false);
    expect(assertEmailCtaIsHttps(route.webFallbackUrl)).toBe(true);
    expect(route.httpsUrl.startsWith('https://')).toBe(true);
  });

  it('first_listing live : CTA HTTPS home (fallback web), jamais scheme dans httpsUrl', () => {
    const route = resolveLifecycleHttpsRoute('first_listing_h24', { dryRun: false });
    expect(route.ctaEnabled).toBe(true);
    expect(route.httpsUrl).not.toMatch(/^youmbiamobile:/);
    expect(assertEmailCtaIsHttps(route.httpsUrl)).toBe(true);
  });

  it('abandoned_draft : HTTPS home (pas /annonce — reprise = app /sell)', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const route = resolveLifecycleHttpsRoute('abandoned_draft_h24', {
      dryRun: false,
      listingId: id,
    });
    expect(route.httpsUrl).toBe('https://www.youmbia.com/');
    expect(route.httpsUrl).not.toContain('/annonce/');
    expect(route.ctaEnabled).toBe(true);
    expect(route.mobileSchemeUrl).toContain('sell');
  });

  it('rejette les CTA email non-HTTPS', () => {
    expect(assertEmailCtaIsHttps('youmbiamobile://home')).toBe(false);
    expect(assertEmailCtaIsHttps('http://www.youmbia.com/')).toBe(false);
  });
});
