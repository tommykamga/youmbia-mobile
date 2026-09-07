import { describe, expect, it, vi } from 'vitest';
import {
  buildListingShareMessage,
  buildWhatsAppShareUrl,
  getPublicListingUrl,
} from './shareListing';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Share: { share: vi.fn() },
  Linking: { openURL: vi.fn() },
}));

vi.mock('@/lib/analytics', () => ({
  trackListingShareInitiated: vi.fn(),
  trackListingShared: vi.fn(),
}));

const LISTING = {
  id: 'abc-123',
  title: 'iPhone 13',
  price: 150000,
  city: 'Douala',
};

describe('buildListingShareMessage', () => {
  it('formate titre, prix, ville et URL canonique sur des lignes distinctes', () => {
    const message = buildListingShareMessage(LISTING);
    const url = getPublicListingUrl(LISTING.id);

    expect(url).toBe('https://www.youmbia.com/annonce/abc-123');
    expect(message.startsWith('iPhone 13\n')).toBe(true);
    expect(message).toContain('FCFA');
    expect(message).toContain('Douala');
    expect(message).toContain(`Voir l'annonce sur YOUMBIA : ${url}`);
    expect(message.split('\n').at(-1)).toBe(`Voir l'annonce sur YOUMBIA : ${url}`);
    expect(message).not.toMatch(/découvrez/i);
    expect(message).not.toMatch(/promo|gratuit|boost/i);
  });

  it('omet la ville absente sans ligne vide', () => {
    const message = buildListingShareMessage({
      id: LISTING.id,
      title: LISTING.title,
      price: LISTING.price,
    });
    const lines = message.split('\n');
    expect(lines[0]).toBe('iPhone 13');
    expect(lines[1]).toMatch(/FCFA/);
    expect(lines.at(-1)).toBe(
      'Voir l\'annonce sur YOUMBIA : https://www.youmbia.com/annonce/abc-123'
    );
    expect(lines).not.toContain('');
  });
});

describe('buildWhatsAppShareUrl', () => {
  it('encode le message pour wa.me sans casser l’URL canonique', () => {
    const message = buildListingShareMessage(LISTING);
    const url = buildWhatsAppShareUrl(message);
    const encoded = url.slice('https://wa.me/?text='.length);

    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(url).not.toMatch(/\s/);
    expect(decodeURIComponent(encoded)).toBe(message);
    expect(encoded).toContain('https%3A%2F%2Fwww.youmbia.com%2Fannonce%2Fabc-123');
  });
});
