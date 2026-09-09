import { describe, expect, it } from 'vitest';
import {
  buildCopiedListingImageDestPath,
  isOwnedListingImageStoragePath,
  listingIdFromListingImageStoragePath,
  resolveCopiedListingImageDest,
  toPendingCopiedDraftImages,
} from './listingDuplicateImages';

const USER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SOURCE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TARGET = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

describe('listingDuplicateImages', () => {
  it('extrait l’id listing du path Storage et refuse http / path plat', () => {
    expect(listingIdFromListingImageStoragePath(`${USER}/${SOURCE}/0.jpg`)).toBe(SOURCE);
    expect(listingIdFromListingImageStoragePath('https://cdn.example/0.jpg')).toBeNull();
    expect(listingIdFromListingImageStoragePath(`${USER}/0.jpg`)).toBeNull();
  });

  it('n’accepte que les paths du user courant', () => {
    expect(isOwnedListingImageStoragePath(`${USER}/${SOURCE}/0.jpg`, USER)).toBe(true);
    expect(isOwnedListingImageStoragePath(`other/${SOURCE}/0.jpg`, USER)).toBe(false);
  });

  it('dest = userId/newListingId/n.jpg, distinct de la source', () => {
    const dest = buildCopiedListingImageDestPath(USER, TARGET, 0);
    expect(dest).toBe(`${USER}/${TARGET}/0.jpg`);
    expect(dest).toContain(TARGET);
    expect(dest).not.toContain(SOURCE);
    expect(dest).not.toBe(`${USER}/${SOURCE}/0.jpg`);
  });

  it('refuse une copie vers le même listing (couplage source)', () => {
    const same = resolveCopiedListingImageDest({
      sourcePath: `${USER}/${SOURCE}/0.jpg`,
      targetListingId: SOURCE,
      userId: USER,
      sortOrder: 0,
    });
    expect(same.ok).toBe(false);

    const ok = resolveCopiedListingImageDest({
      sourcePath: `${USER}/${SOURCE}/0.jpg`,
      targetListingId: TARGET,
      userId: USER,
      sortOrder: 2,
    });
    expect(ok).toEqual({ ok: true, destPath: `${USER}/${TARGET}/2.jpg` });
  });

  it('préremplit sans id listing_images source', () => {
    const pending = toPendingCopiedDraftImages([
      { path: `${USER}/${SOURCE}/0.jpg`, sort_order: 0, displayUrl: 'https://signed/0.jpg' },
      { path: `${USER}/${SOURCE}/1.jpg`, sort_order: 1, displayUrl: 'https://signed/1.jpg' },
    ]);
    expect(pending).toHaveLength(2);
    expect(pending.every((img) => img.id === '')).toBe(true);
    expect(pending.map((img) => img.path)).toEqual([
      `${USER}/${SOURCE}/0.jpg`,
      `${USER}/${SOURCE}/1.jpg`,
    ]);
  });
});
