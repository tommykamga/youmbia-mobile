import { describe, expect, it } from 'vitest';
import {
  filterUploadableListingPhotos,
  isUploadableListingPhoto,
  isPersistedListingImageId,
  nextListingImageSortOrders,
  pendingCopiedListingImageSources,
} from './listingDraftPhotoPlan';

describe('listingDraftPhotoPlan', () => {
  it('accepte uri seule (iOS sans base64) et base64 seul', () => {
    expect(isUploadableListingPhoto({ uri: 'file:///tmp/a.jpg', base64: null })).toBe(true);
    expect(isUploadableListingPhoto({ uri: '', base64: 'abc' })).toBe(true);
    expect(isUploadableListingPhoto({ uri: null, base64: null })).toBe(false);
    expect(isUploadableListingPhoto({ uri: '   ', base64: '  ' })).toBe(false);
  });

  it('filtre les photos uploadables sans perdre l’ordre', () => {
    const photos = [
      { uri: 'file:///1.jpg', base64: null },
      { uri: null, base64: null },
      { uri: 'file:///3.jpg', base64: 'xx' },
    ];
    expect(filterUploadableListingPhotos(photos)).toEqual([photos[0], photos[2]]);
  });

  it('calcule des sort_order stables après images existantes (pas de collision)', () => {
    expect(nextListingImageSortOrders([0, 1], 2)).toEqual([2, 3]);
    expect(nextListingImageSortOrders([], 3)).toEqual([0, 1, 2]);
    expect(nextListingImageSortOrders([null, 2], 1)).toEqual([0]);
    expect(nextListingImageSortOrders([0, 1], 0)).toEqual([]);
  });

  it('réutilise un emplacement libre après suppression au milieu (4 photos 0–3, retirer 1)', () => {
    const afterMiddleDelete = [0, 2, 3];
    expect(nextListingImageSortOrders(afterMiddleDelete, 1)).toEqual([1]);
    const orders = nextListingImageSortOrders(afterMiddleDelete, 1);
    expect(orders.every((n) => n >= 0 && n < 4)).toBe(true);
    expect(new Set([...afterMiddleDelete, ...orders]).size).toBe(4);
  });

  it('assigne les premiers slots libres après suppression en début ou fin', () => {
    expect(nextListingImageSortOrders([1, 2, 3], 1)).toEqual([0]);
    expect(nextListingImageSortOrders([0, 1, 2], 1)).toEqual([3]);
  });

  it('remplit plusieurs slots libres sans doublon', () => {
    expect(nextListingImageSortOrders([0, 3], 2)).toEqual([1, 2]);
    const orders = nextListingImageSortOrders([0, 3], 2);
    expect(new Set(orders).size).toBe(2);
  });

  it('distingue images persistées et copies en attente (sans id source)', () => {
    expect(isPersistedListingImageId('img-uuid')).toBe(true);
    expect(isPersistedListingImageId('')).toBe(false);
    expect(isPersistedListingImageId(null)).toBe(false);
    expect(
      pendingCopiedListingImageSources([
        { id: '', path: 'u/src/0.jpg', sort_order: 0 },
        { id: 'persisted', path: 'u/new/1.jpg', sort_order: 1 },
      ])
    ).toEqual([{ path: 'u/src/0.jpg', sort_order: 0 }]);
  });
});
