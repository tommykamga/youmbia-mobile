import { describe, expect, it } from 'vitest';
import { renderLifecycleEmailHtml, renderLifecycleEmailText } from './templates';

describe('lifecycle templates FR', () => {
  it('rend HTML YOUMBIA avec unsub et sans CTA si désactivé', () => {
    const html = renderLifecycleEmailHtml({
      campaignId: 'first_listing_h24',
      fullName: 'Ada',
      cta: { href: null, label: 'Publier', enabled: false },
      unsubscribeUrl: 'https://example.test/unsub',
    });
    expect(html).toContain('YOUMBIA');
    expect(html).toContain('#16A34A');
    expect(html).toContain('Se désinscrire');
    expect(html).not.toContain('>Publier</a>');
  });

  it('inclut le CTA quand enabled', () => {
    const html = renderLifecycleEmailHtml({
      campaignId: 'welcome_h0',
      cta: {
        href: 'https://www.youmbia.com/',
        label: 'Découvrir YOUMBIA',
        enabled: true,
      },
      unsubscribeUrl: 'https://example.test/unsub',
    });
    expect(html).toContain('https://www.youmbia.com/');
    expect(html).toContain('Découvrir YOUMBIA');
  });

  it('texte plain contient unsub', () => {
    const text = renderLifecycleEmailText({
      campaignId: 'abandoned_draft_h24',
      listingTitle: 'Vélo',
      cta: { href: null, label: 'x', enabled: false },
      unsubscribeUrl: 'https://example.test/unsub',
    });
    expect(text).toContain('Vélo');
    expect(text).toContain('https://example.test/unsub');
  });
});
