import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  canSellerMarkListingSold,
  canSellerReactivateListing,
  canSellerRenewListing,
  canViewerAccessListingDetail,
  isDiscoveryListingStatus,
  LISTING_STATUS,
} from '@/lib/listingStatus';
import {
  applyListingSaleCycleInsert,
  applyListingSaleCycleUpdate,
} from '@/lib/listingSaleCycle';
import { applyListingRenewalUpdate } from '@/lib/listingRenewal';
import {
  isListingEligibleForSavedSearchAlert,
  shouldDispatchSavedSearchAlertOnEvent,
  shouldMatchSavedSearchOnListingTransition,
} from '@/lib/savedSearchMatch';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

const mocks = vi.hoisted(() => ({
  getListingForEdit: vi.fn(),
  getListingDynamicAttributeValuesForForm: vi.fn(),
}));

vi.mock('./getListingForEdit', () => ({
  getListingForEdit: mocks.getListingForEdit,
}));

vi.mock('./getListingDynamicAttributeValuesForForm', () => ({
  getListingDynamicAttributeValuesForForm: mocks.getListingDynamicAttributeValuesForForm,
}));

describe('TOM-98 Lot A — brouillons d’annonces', () => {
  beforeEach(() => {
    mocks.getListingForEdit.mockReset();
    mocks.getListingDynamicAttributeValuesForForm.mockReset();
  });

  it('migration additive unique : enum draft + garde-fous (pas de policies RLS redondantes)', () => {
    const mig = read('supabase/migrations/20260909110000_listing_status_draft_v1.sql');
    expect(mig).toMatch(/ADD VALUE IF NOT EXISTS 'draft'/);
    expect(mig).toMatch(/OLD\.status = 'draft' AND NEW\.status = 'active'/);
    expect(mig).toMatch(/trg_listings_match_saved_searches_publish_draft/);
    expect(mig).toMatch(/exception TOM-98/i);
    expect(mig).not.toMatch(/DROP TYPE/i);
    expect(mig).not.toMatch(/DELETE FROM public\.listings/i);
    expect(mig).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(mig).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(mig).not.toMatch(/CREATE POLICY/i);
    expect(mig).not.toMatch(/DROP POLICY/i);
  });

  it('1–2) draft privé : hors discovery ; autre user ne lit pas la fiche', () => {
    expect(isDiscoveryListingStatus(LISTING_STATUS.draft)).toBe(false);
    expect(
      canViewerAccessListingDetail({
        status: LISTING_STATUS.draft,
        ownerId: 'owner',
        viewerId: 'other',
      })
    ).toBe(false);
    expect(
      canViewerAccessListingDetail({
        status: LISTING_STATUS.draft,
        ownerId: 'owner',
        viewerId: 'owner',
      })
    ).toBe(true);
  });

  it('3) draft absent de Search/Home/Similar/For You (filtre active)', () => {
    const publicFeed = read('src/services/listings/getPublicListings.ts');
    const search = read('src/services/listings/searchListings.ts');
    const similar = read('src/services/listings/getSimilarListings.ts');
    const byIds = read('src/services/listings/getListingsByIds.ts');
    const byCity = read('src/services/listings/getListingsByCity.ts');
    const shop = read('src/services/shops/getShopListings.ts');
    const profile = read('src/services/users/getUserProfile.ts');
    for (const src of [publicFeed, search, byIds, byCity, shop, profile]) {
      expect(src).toMatch(/\.eq\('status', 'active'\)/);
    }
    expect(similar).toMatch(/\.eq\('status', ACTIVE_LISTING_STATUS\)/);
  });

  it('4) Saved Search : matrice TOM-97 + exception draft→active TOM-98', () => {
    expect(shouldMatchSavedSearchOnListingTransition({ event: 'insert', newStatus: 'active' })).toBe(
      true
    );
    expect(shouldMatchSavedSearchOnListingTransition({ event: 'insert', newStatus: 'draft' })).toBe(
      false
    );
    expect(
      shouldMatchSavedSearchOnListingTransition({
        event: 'update',
        oldStatus: 'draft',
        newStatus: 'active',
      })
    ).toBe(true);
    expect(
      shouldMatchSavedSearchOnListingTransition({
        event: 'update',
        oldStatus: 'draft',
        newStatus: 'draft',
      })
    ).toBe(false);
    expect(
      shouldMatchSavedSearchOnListingTransition({
        event: 'update',
        oldStatus: 'active',
        newStatus: 'active',
      })
    ).toBe(false);
    expect(
      shouldMatchSavedSearchOnListingTransition({
        event: 'update',
        oldStatus: 'hidden',
        newStatus: 'active',
      })
    ).toBe(false);
    expect(
      shouldMatchSavedSearchOnListingTransition({
        event: 'update',
        oldStatus: 'sold',
        newStatus: 'active',
      })
    ).toBe(false);

    expect(
      isListingEligibleForSavedSearchAlert({
        id: 'l1',
        user_id: 'seller',
        status: 'draft',
        title: 'iPhone',
        price: 1000,
        created_at: '2026-09-01T00:00:00.000Z',
      })
    ).toBe(false);
    expect(shouldDispatchSavedSearchAlertOnEvent('insert')).toBe(true);
    expect(shouldDispatchSavedSearchAlertOnEvent('publish_from_draft')).toBe(true);
    expect(shouldDispatchSavedSearchAlertOnEvent('update')).toBe(false);

    const mig = read('supabase/migrations/20260909110000_listing_status_draft_v1.sql');
    expect(mig).toMatch(/WHEN \(OLD\.status = 'draft' AND NEW\.status = 'active'\)/);
    expect(mig).toMatch(/Ledger UNIQUE/);
    const insertTrigger = read('supabase/migrations/20260908250000_saved_search_alerts_v1.sql');
    expect(insertTrigger).toMatch(/WHEN \(NEW\.status = 'active'\)/);
    expect(insertTrigger).toMatch(/UNIQUE \(saved_search_id, listing_id\)/);
  });

  it('5) draft ne déclenche pas lifecycle sold/renewal incorrectement', () => {
    expect(canSellerMarkListingSold('draft')).toBe(false);
    expect(canSellerRenewListing('draft')).toBe(false);
    expect(canSellerReactivateListing('draft')).toBe(false);
    expect(
      applyListingSaleCycleInsert({
        status: 'draft',
        created_at: '2026-09-01T00:00:00.000Z',
        now: '2026-09-01T00:00:00.000Z',
      })
    ).toEqual({ sold_at: null, sale_cycle_started_at: null });
    expect(
      applyListingSaleCycleUpdate({
        oldStatus: 'draft',
        newStatus: 'active',
        oldSoldAt: null,
        oldSaleCycleStartedAt: null,
        now: '2026-09-09T12:00:00.000Z',
      })
    ).toEqual({
      sold_at: null,
      sale_cycle_started_at: '2026-09-09T12:00:00.000Z',
    });
    expect(
      applyListingRenewalUpdate({
        oldStatus: 'draft',
        newStatus: 'active',
        oldRenewedAt: null,
        oldCreatedAt: '2026-01-01T00:00:00.000Z',
        now: '2026-09-09T12:00:00.000Z',
        clientRenewedAt: '2026-09-09T12:00:00.000Z',
      })
    ).toEqual({ renewed_at: null });
  });

  it('6) reprise reconstructible depuis DB persistée, sans mémoire session préalable', async () => {
    mocks.getListingForEdit.mockResolvedValue({
      data: {
        id: 'draft-persisted-1',
        title: 'Vélo route',
        price: 75000,
        city: 'Douala',
        description: 'Bon état général',
        category_id: 20,
        status: 'draft',
        shop_id: null,
        images: [],
        imageItems: [
          {
            id: 'img-1',
            path: 'u/d/0.jpg',
            sort_order: 0,
            displayUrl: 'https://example.com/0.jpg',
          },
        ],
      },
      error: null,
    });
    mocks.getListingDynamicAttributeValuesForForm.mockResolvedValue({ marque: 'Decathlon' });

    const { buildListingResumeDraft } = await import('./buildListingResumeDraft');
    const result = await buildListingResumeDraft('draft-persisted-1');

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.listingId).toBe('draft-persisted-1');
    expect(result.data.title).toBe('Vélo route');
    expect(result.data.price).toBe(75000);
    expect(result.data.city).toBe('Douala');
    expect(result.data.dynamicValues.marque).toBe('Decathlon');
    expect(result.data.existingImages).toHaveLength(1);
    expect(mocks.getListingForEdit).toHaveBeenCalledWith('draft-persisted-1');

    const sell = read('app/sell/index.tsx');
    const mine = read('app/account/listings.tsx');
    expect(sell).toMatch(/useLocalSearchParams/);
    expect(sell).toMatch(/routeDraftId/);
    expect(sell).toMatch(/buildListingResumeDraft/);
    expect(sell).not.toMatch(/listingPublishResumeDraft/);
    expect(mine).toMatch(/params:\s*\{\s*draftId:/);
    expect(mine).not.toMatch(/buildListingResumeDraft/);
  });

  it('7) suppression brouillon exposée Mes annonces + deleteListing', () => {
    const mine = read('app/account/listings.tsx');
    expect(mine).toMatch(/DRAFT_LISTING_DELETE_CONFIRM/);
    expect(mine).toMatch(/DRAFT_LISTING_SECTION_TITLE/);
    expect(mine).toMatch(/deleteListing/);
  });

  it('8) publication draft = même id (UPDATE status), pas un second insert', () => {
    const publish = read('src/services/listings/publishListingDraft.ts');
    expect(publish).toMatch(/\.update\(/);
    expect(publish).toMatch(/status: LISTING_STATUS\.active/);
    expect(publish).toMatch(/\.eq\('status', LISTING_STATUS\.draft\)/);
    expect(publish).toMatch(/checkListingPublishDailyQuota/);
    expect(publish).not.toMatch(/\.insert\(/);
    const sell = read('app/sell/index.tsx');
    expect(sell).toMatch(/publishListingDraft/);
    expect(sell).toMatch(/editingDraftId/);
  });

  it('9) quota partagé create + publish ; draft save n’appelle pas le quota', () => {
    const create = read('src/services/listings/createListing.ts');
    const publish = read('src/services/listings/publishListingDraft.ts');
    const draftSvc = read('src/services/listings/createListingDraft.ts');
    const quota = read('src/services/listings/checkListingPublishDailyQuota.ts');
    expect(create).toMatch(/checkListingPublishDailyQuota/);
    expect(publish).toMatch(/checkListingPublishDailyQuota/);
    expect(draftSvc).not.toMatch(/checkListingPublishDailyQuota/);
    expect(quota).toMatch(/neq\('status', LISTING_STATUS\.draft\)/);
    expect(isDiscoveryListingStatus('active')).toBe(true);
  });
});
