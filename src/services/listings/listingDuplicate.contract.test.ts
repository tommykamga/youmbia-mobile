import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  canSellerDuplicateListing,
  LISTING_STATUS,
} from '@/lib/listingStatus';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('TOM-98 Lot B — duplication d’annonce', () => {
  it('aucune migration Supabase ajoutée pour la duplication', () => {
    const migrations = readdirSync(resolve(process.cwd(), 'supabase/migrations'));
    expect(migrations.some((name) => /duplicate/i.test(name))).toBe(false);
    const duplicateSvc = read('src/services/listings/buildListingDuplicateDraft.ts');
    const copySvc = read('src/services/listings/copyListingImagesToListing.ts');
    expect(duplicateSvc).not.toMatch(/supabase\/migrations/);
    expect(copySvc).not.toMatch(/supabase\/migrations/);
  });

  it('Mes annonces : Dupliquer seulement si éligible (pas draft/suspended)', () => {
    const mine = read('app/account/listings.tsx');
    expect(mine).toMatch(/canSellerDuplicateListing/);
    expect(mine).toMatch(/DUPLICATE_LISTING_ACTION/);
    expect(mine).toMatch(/buildListingDuplicateDraft/);
    expect(canSellerDuplicateListing(LISTING_STATUS.active)).toBe(true);
    expect(canSellerDuplicateListing(LISTING_STATUS.sold)).toBe(true);
    expect(canSellerDuplicateListing(LISTING_STATUS.hidden)).toBe(true);
    expect(canSellerDuplicateListing(LISTING_STATUS.draft)).toBe(false);
    expect(canSellerDuplicateListing(LISTING_STATUS.suspended)).toBe(false);
  });

  it('wizard : préremplit sans réutiliser l’id source ; copie images au save/publish', () => {
    const sell = read('app/sell/index.tsx');
    expect(sell).toMatch(/setEditingDraftId\(null\)/);
    expect(sell).toMatch(/toPendingCopiedDraftImages/);
    expect(sell).toMatch(/copyListingImagesToListing/);
    expect(sell).toMatch(/listingId === duplicateSourceId/);
    expect(sell).toMatch(/rollbackNewListingIfNeeded/);
    expect(sell).toMatch(/deleteListing/);
    expect(sell).toMatch(/isPersistedListingImageId/);
    expect(sell).not.toMatch(/imagesSkipped/);
    expect(sell).toMatch(/checkListingPublishDailyQuota/);
    expect(sell).toMatch(/createListingDraft/);
    expect(sell).toMatch(/publishListingDraft/);
  });

  it('copie images : dest contient newListingId, rollback dest, jamais delete source', () => {
    const copy = read('src/services/listings/copyListingImagesToListing.ts');
    expect(copy).toMatch(/resolveCopiedListingImageDest/);
    expect(copy).toMatch(/rollbackCopiedDestImages/);
    expect(copy).toMatch(/\.eq\('listing_id', targetListingId\)/);
    expect(copy).toMatch(/storage\.from\(BUCKET\)\.remove\(destPaths\)/);
    expect(copy).not.toMatch(/sourceListingId/);
    expect(copy).toMatch(/insert\(\{[\s\S]*listing_id: listingId[\s\S]*url: destPath/);
  });

  it('payload duplicate n’inclut pas lifecycle / stats / modération', () => {
    const payload = read('src/services/listings/buildListingDuplicateDraft.ts');
    expect(payload).toMatch(/LISTING_DUPLICATE_LIFECYCLE_KEYS/);
    expect(payload).toMatch(/'sold_at'/);
    expect(payload).toMatch(/'views_count'/);
    expect(payload).toMatch(/buildListingDuplicateFormPayload/);
    expect(payload).toMatch(/sourceListingId: listing\.id/);
    expect(payload).toMatch(/sourceImages: toPendingCopiedDraftImages/);
    expect(payload).toMatch(/getListingForEdit/);
    expect(payload).not.toMatch(/\.update\(/);
    expect(payload).not.toMatch(/\.insert\(/);
    expect(payload).not.toMatch(/\.delete\(/);
    const returnBlock = payload.slice(payload.indexOf('return {'));
    expect(returnBlock).not.toMatch(/sold_at:/);
    expect(returnBlock).not.toMatch(/views_count:/);
    expect(returnBlock).not.toMatch(/user_id:/);
    expect(returnBlock).not.toMatch(/status:/);
  });

  it('owner-only via getListingForEdit (filtre user_id) ; quota publish inchangé', () => {
    const edit = read('src/services/listings/getListingForEdit.ts');
    expect(edit).toMatch(/\.eq\('user_id', user\.id\)/);
    const create = read('src/services/listings/createListing.ts');
    const publish = read('src/services/listings/publishListingDraft.ts');
    const draft = read('src/services/listings/createListingDraft.ts');
    expect(create).toMatch(/checkListingPublishDailyQuota/);
    expect(publish).toMatch(/checkListingPublishDailyQuota/);
    expect(draft).not.toMatch(/checkListingPublishDailyQuota/);
    expect(create).toMatch(/user_id: user\.id/);
    expect(draft).toMatch(/user_id: user\.id/);
    expect(create).toMatch(/status: 'active'/);
    expect(draft).toMatch(/status: LISTING_STATUS\.draft/);
    expect(create).not.toMatch(/sold_at/);
    expect(draft).not.toMatch(/sold_at/);
  });

  it('reprise brouillon après relaunch = images persistées du NOUVEL id', () => {
    const sell = read('app/sell/index.tsx');
    const resume = read('src/services/listings/buildListingResumeDraft.ts');
    expect(sell).toMatch(/copyListingImagesToListing/);
    expect(sell).toMatch(/getListingForEdit\(listingId\)/);
    expect(sell).toMatch(/setExistingDraftImages\(refreshed/);
    expect(resume).toMatch(/existingImages: listing\.imageItems/);
    expect(resume).toMatch(/LISTING_STATUS\.draft/);
  });

  it('analytics duplicate suit Mixpanel existant', () => {
    const analytics = read('src/lib/analytics.ts');
    expect(analytics).toMatch(/listing_duplicate_started/);
    expect(analytics).toMatch(/listing_duplicate_published/);
    const sell = read('app/sell/index.tsx');
    expect(sell).toMatch(/creation_origin: 'duplicate'/);
    expect(sell).toMatch(/trackListingDuplicatePublished/);
  });
});
