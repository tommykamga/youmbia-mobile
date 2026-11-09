import { describe, expect, it } from 'vitest';
import { renderLifecycleEmailHtml, type LifecycleRenderInput } from './renderLifecycleEmail';

const id = '123e4567-e89b-12d3-a456-426614174000';
const base = {
  cta: { href: 'https://www.youmbia.com/', label: 'Explorer les annonces', enabled: true },
  unsubscribeUrl: 'https://ainzxommczlyjhymuwgu.supabase.co/functions/v1/lifecycle-email-unsubscribe?uid=123&sig=456',
  fullName: 'Émilie Dupont',
} as const;

const listing = {
  id,
  title: 'Téléphone neuf',
  city: 'Douala',
  price: 125000,
  imageUrl: 'https://www.youmbia.com/images/example.jpg',
};

describe('EMAIL-UX-V2 safe premium lifecycle rendering', () => {
  it('shows 3 enriched cards only with complete trusted active listing data', () => {
    const input: LifecycleRenderInput = {
      ...base, campaignId: 'weekly_discovery', discoveryListings: [listing, listing, listing],
    };
    const html = renderLifecycleEmailHtml(input);
    expect(html).toContain('125');
    expect(html).toContain('FCFA');
    expect(html).toContain('https://www.youmbia.com/annonce/' + id);
    expect((html.match(/Voir l’annonce →/g) ?? []).length).toBe(3);
    expect(html).toContain('Bonjour Émilie,');
    expect(html).toContain('app-store-badge.png');
    expect(html).toContain('google-play-badge.png');
  });

  it('refuses private/hostile image URLs and falls back to the legacy list', () => {
    const html = renderLifecycleEmailHtml({
      ...base,
      campaignId: 'weekly_discovery',
      discoveryListings: [
        { ...listing, imageUrl: 'http://localhost/secret.png' }, listing, listing,
      ],
    });
    expect(html).not.toContain('http://localhost');
    expect(html).toContain('Téléphone neuf');
    expect(html).not.toContain('125');
  });

  it('escapes untrusted listing titles and maintains the visible prod unsubscribe button', () => {
    const html = renderLifecycleEmailHtml({
      ...base,
      campaignId: 'weekly_discovery',
      discoveryListings: [
        { ...listing, title: '<script>alert(1)</script>' }, listing, listing,
      ],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Se désinscrire des e-mails marketing');
    expect(html).toContain('display:inline-block;margin-top:12px;padding:12px 20px');
  });

  it('keeps service email free of marketing unsubscribe and handles missing listing media', () => {
    const html = renderLifecycleEmailHtml({
      ...base, campaignId: 'listing_published_service',
      listingTitle: 'Mon annonce', listingCity: 'Yaoundé', listingRich: null,
    });
    expect(html).toContain('Mon annonce');
    expect(html).not.toContain('Se désinscrire des e-mails marketing');
    expect(html).toContain('app-store-badge.png');
  });

  it('preserves non-promotional first listing message for new, second-hand and pro items', () => {
    const html = renderLifecycleEmailHtml({
      ...base, campaignId: 'first_listing_h24',
    });
    expect(html).toContain('publiez votre annonce gratuitement');
    expect(html).toContain('Se désinscrire');
  });
});
