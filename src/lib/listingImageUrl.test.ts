import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearListingSignedUrlMemoryCacheForTests,
  getSignedUrlsMap,
  isListingImageStoragePath,
  toDisplayImageUrl,
} from './listingImageUrl';

const mocks = vi.hoisted(() => ({
  createSignedUrls: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrls: mocks.createSignedUrls,
        createSignedUrl: mocks.createSignedUrl,
      }),
    },
  },
}));

beforeEach(() => {
  mocks.createSignedUrls.mockReset();
  mocks.createSignedUrl.mockReset();
  clearListingSignedUrlMemoryCacheForTests();
});

describe('listingImageUrl — paths Storage', () => {
  it('détecte un path Storage vs URL HTTP', () => {
    expect(isListingImageStoragePath('user/listing/0.jpg')).toBe(true);
    expect(isListingImageStoragePath('https://cdn.example/0.jpg')).toBe(false);
  });

  it('4 paths => 4 signed URLs (batch), ordre des clés préservé pour lookup', async () => {
    const paths = [
      'u/l/0.jpg',
      'u/l/1.jpg',
      'u/l/2.jpg',
      'u/l/3.jpg',
    ];
    mocks.createSignedUrls.mockResolvedValue({
      data: paths.map((path) => ({
        path,
        signedUrl: `https://signed.example/${path}?token=abc`,
        error: null,
      })),
      error: null,
    });

    const map = await getSignedUrlsMap(paths);
    expect(map.size).toBe(4);
    expect(map.get('u/l/0.jpg')).toContain('https://signed.example/u/l/0.jpg');
    expect(map.get('u/l/3.jpg')).toContain('https://signed.example/u/l/3.jpg');
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('batch partiel => fallback createSignedUrl unitaire', async () => {
    mocks.createSignedUrls.mockResolvedValue({
      data: [
        { path: 'u/l/0.jpg', signedUrl: 'https://signed/0.jpg?t=1', error: null },
        { path: 'u/l/1.jpg', signedUrl: null, error: 'not found' },
      ],
      error: null,
    });
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed/1-fallback.jpg?t=2' },
      error: null,
    });

    const map = await getSignedUrlsMap(['u/l/0.jpg', 'u/l/1.jpg']);
    expect(map.get('u/l/0.jpg')).toContain('https://signed/0.jpg');
    expect(map.get('u/l/1.jpg')).toContain('https://signed/1-fallback.jpg');
    expect(mocks.createSignedUrl).toHaveBeenCalledWith('u/l/1.jpg', expect.any(Number));
  });

  it('matching par index si item.path manquant', async () => {
    mocks.createSignedUrls.mockResolvedValue({
      data: [
        { path: null, signedUrl: 'https://signed/by-index.jpg?t=1', error: null },
      ],
      error: null,
    });

    const map = await getSignedUrlsMap(['user/listing/0.jpg']);
    expect(map.get('user/listing/0.jpg')).toContain('https://signed/by-index.jpg');
  });

  it('toDisplayImageUrl laisse passer http et résout path via map', () => {
    const map = new Map([['a/b/0.jpg', 'https://signed/0.jpg?t=x']]);
    expect(toDisplayImageUrl('https://cdn/x.jpg', map)).toBe('https://cdn/x.jpg');
    expect(toDisplayImageUrl('a/b/0.jpg', map)).toBe('https://signed/0.jpg?t=x');
    expect(toDisplayImageUrl('missing.jpg', map)).toBe('');
  });
});
