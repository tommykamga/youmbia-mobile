import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getListingHrefFromUrl } from './listingDeepLink';
const mocks = vi.hoisted(() => ({source:vi.fn()}));
vi.mock('@/lib/analytics', () => ({setListingViewSource:mocks.source}));
describe('LINK-01 listing attribution and navigation contract', () => {
  beforeEach(() => mocks.source.mockClear());
  it('retains shared attribution for HTTPS including legacy casing and URL context', () => {
    expect(getListingHrefFromUrl('HTTPS://www.youmbia.com/ANNONCE/abc?utm_source=wa#details')).toBe('/listing/abc?utm_source=wa#details');
    expect(mocks.source).toHaveBeenCalledWith('shared');
  });
  it('retains custom scheme attribution without emitting analytics events', () => {
    expect(getListingHrefFromUrl('youmbiamobile://annonce/abc')).toBe('/listing/abc');
    expect(mocks.source).toHaveBeenCalledExactlyOnceWith('link');
  });
  it('does not mutate attribution for untrusted hosts or another resource family', () => {
    expect(getListingHrefFromUrl('https://evil.test/annonce/abc')).toBeNull();
    expect(getListingHrefFromUrl('https://www.youmbia.com/shop/abc')).toBeNull();
    expect(mocks.source).not.toHaveBeenCalled();
  });
});

describe('listing deep links for app variants', () => {
  it.each([
    ['youmbiamobile-dev', 'development'],
    ['youmbiamobile-qa', 'preview'],
    ['youmbiamobile', 'production'],
  ])('routes %s links for %s builds', (scheme) => {
    expect(getListingHrefFromUrl(`${scheme}://annonce/listing-123`, scheme)).toBe(
      '/listing/listing-123',
    );
  });

  it('does not route a different variant custom scheme', () => {
    expect(getListingHrefFromUrl('youmbiamobile://annonce/listing-123', 'youmbiamobile-dev')).toBeNull();
  });
});
