import { describe, expect, it } from 'vitest';
import {
  buildLifecycleRenderedEmail,
  renderLifecycleEmailHtml,
  renderLifecycleEmailText,
} from './templates';
import { LIFECYCLE_CAMPAIGN_IDS } from './campaigns';

describe('lifecycle templates FR brandés', () => {
  it.each([...LIFECYCLE_CAMPAIGN_IDS])(
    'rend %s avec marque YOUMBIA, marketing et unsub',
    (campaignId) => {
      const pack = buildLifecycleRenderedEmail({
        campaignId,
        fullName: 'Ada',
        unsubscribeUrl: 'https://example.test/unsub',
        listingTitle: campaignId === 'abandoned_draft_h24' ? 'Vélo ville' : null,
        listingId:
          campaignId === 'abandoned_draft_h24'
            ? '11111111-1111-4111-8111-111111111111'
            : null,
        dryRun: false,
      });
      expect(pack.category).toBe('marketing');
      expect(pack.subject.length).toBeGreaterThan(5);
      expect(pack.html).toContain('YOUMBIA');
      expect(pack.html).toContain('#16A34A');
      expect(pack.html).toContain('Communication marketing');
      expect(pack.html).toContain('Se désinscrire');
      expect(pack.html).not.toContain('magic link');
      expect(pack.html).not.toContain('youmbiamobile://');
      expect(pack.text).toContain('marketing');
      expect(pack.tags.some((t) => t.value === 'marketing')).toBe(true);
      expect(pack.headers['List-Unsubscribe']).toContain('https://example.test/unsub');
    }
  );

  it('dry-run first_listing : pas de bouton CTA, fallback HTTPS présent', () => {
    const html = renderLifecycleEmailHtml({
      campaignId: 'first_listing_h24',
      fullName: 'Ada',
      cta: { href: null, label: 'Publier', enabled: false },
      unsubscribeUrl: 'https://example.test/unsub',
      webFallbackUrl: 'https://www.youmbia.com/',
    });
    expect(html).not.toContain('>Publier</a>');
    expect(html).toContain('https://www.youmbia.com/');
  });

  it('texte plain contient unsub et fallback', () => {
    const text = renderLifecycleEmailText({
      campaignId: 'abandoned_draft_h24',
      listingTitle: 'Vélo',
      cta: { href: null, label: 'x', enabled: false },
      unsubscribeUrl: 'https://example.test/unsub',
      webFallbackUrl: 'https://www.youmbia.com/',
    });
    expect(text).toContain('Vélo');
    expect(text).toContain('https://example.test/unsub');
    expect(text).toContain('https://www.youmbia.com/');
  });
});
