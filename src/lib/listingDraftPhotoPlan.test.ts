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
    expect(nextListingImageSortOrders([null, 2], 1)).toEqual([3]);
    expect(nextListingImageSortOrders([0, 1], 0)).toEqual([]);
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
