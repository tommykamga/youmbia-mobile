import { describe, expect, it, vi } from 'vitest';
import { getListingHrefFromUrl } from './listingDeepLink';

vi.mock('@/lib/analytics', () => ({ setListingViewSource: vi.fn() }));

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
