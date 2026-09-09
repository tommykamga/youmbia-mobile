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

  it('migrations scindées : enum seul puis garde-fous (pas de policies RLS ; pas d’usage enum dans tx ADD VALUE)', () => {
    const enumMig = read('supabase/migrations/20260909110000_listing_status_draft_v1.sql');
    const guards = read('supabase/migrations/20260909110100_listing_draft_guards_v1.sql');

    expect(enumMig).toMatch(/ADD VALUE IF NOT EXISTS 'draft'/);
    expect(enumMig).toMatch(/COMMENT ON TYPE public\.listing_status/);
    // Migration 1 : hors commentaires SQL + ALTER/COMMENT, aucune utilisation de la valeur.
    const enumSqlOnly = enumMig
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(enumSqlOnly).not.toMatch(/NEW\.status\s*=\s*'draft'/);
    expect(enumSqlOnly).not.toMatch(/OLD\.status\s*=\s*'draft'/);
    expect(enumSqlOnly).not.toMatch(/status\s*=\s*'draft'/);
    expect(enumSqlOnly).not.toMatch(/CREATE OR REPLACE FUNCTION/i);
    expect(enumSqlOnly).not.toMatch(/CREATE TRIGGER/i);
    expect(enumSqlOnly).not.toMatch(/DROP TRIGGER/i);
    // Seule occurrence du littéral SQL 'draft' exécutable : ADD VALUE.
    // Le COMMENT mentionne draft en prose dans une seule chaîne (pas un 2e littéral 'draft').
    const draftLiterals = [...enumSqlOnly.matchAll(/'draft'/g)];
    expect(draftLiterals).toHaveLength(1);
    expect(enumSqlOnly).toMatch(/ADD VALUE IF NOT EXISTS 'draft'/);
    expect(enumSqlOnly).toMatch(/draft = brouillon/);

    expect(guards).toMatch(/set_listings_sale_cycle/);
    expect(guards).toMatch(/OLD\.status = 'draft' AND NEW\.status = 'active'/);
    expect(guards).toMatch(/trg_listings_match_saved_searches_publish_draft/);
    expect(guards).toMatch(/exception TOM-98/i);
    expect(guards).not.toMatch(/DROP TYPE/i);
    expect(guards).not.toMatch(/DELETE FROM public\.listings/i);
    expect(guards).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(guards).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(guards).not.toMatch(/CREATE POLICY/i);
    expect(guards).not.toMatch(/DROP POLICY/i);
    expect(enumMig).not.toMatch(/CREATE POLICY/i);
    expect(enumMig).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
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

    const guards = read('supabase/migrations/20260909110100_listing_draft_guards_v1.sql');
    expect(guards).toMatch(/WHEN \(OLD\.status = 'draft' AND NEW\.status = 'active'\)/);
    expect(guards).toMatch(/Ledger UNIQUE/);
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

  it('6b) photos brouillon : save via uri/base64, resume images, publish réutilise, pas de filtre base64-only', async () => {
    mocks.getListingForEdit.mockResolvedValue({
      data: {
        id: 'draft-photos-1',
        title: 'iPhone',
        price: 100000,
        city: 'Yaoundé',
        description: 'OK',
        category_id: 20,
        status: 'draft',
        shop_id: null,
        images: [
          'https://example.com/0.jpg',
          'https://example.com/1.jpg',
          'https://example.com/2.jpg',
        ],
        imageItems: [
          { id: 'i0', path: 'u/d/0.jpg', sort_order: 0, displayUrl: 'https://example.com/0.jpg' },
          { id: 'i1', path: 'u/d/1.jpg', sort_order: 1, displayUrl: 'https://example.com/1.jpg' },
          { id: 'i2', path: 'u/d/2.jpg', sort_order: 2, displayUrl: 'https://example.com/2.jpg' },
        ],
      },
      error: null,
    });
    mocks.getListingDynamicAttributeValuesForForm.mockResolvedValue({});

    const { buildListingResumeDraft } = await import('./buildListingResumeDraft');
    const resume = await buildListingResumeDraft('draft-photos-1');
    expect(resume.success).toBe(true);
    if (!resume.success) return;
    expect(resume.data.existingImages.map((i) => i.sort_order)).toEqual([0, 1, 2]);
    expect(resume.data.existingImages.map((i) => i.displayUrl)).toEqual([
      'https://example.com/0.jpg',
      'https://example.com/1.jpg',
      'https://example.com/2.jpg',
    ]);

    const sell = read('app/sell/index.tsx');
    const upload = read('src/services/listings/uploadListingImages.ts');
    const plan = read('src/lib/listingDraftPhotoPlan.ts');
    const editSvc = read('src/services/listings/getListingForEdit.ts');
    const imageUrl = read('src/lib/listingImageUrl.ts');
    expect(sell).toMatch(/filterUploadableListingPhotos/);
    expect(sell).toMatch(/nextListingImageSortOrders/);
    expect(sell).toMatch(/uploadNewDraftImages/);
    expect(sell).toMatch(/deleteListingImage/);
    expect(sell).toMatch(/existingDraftImages/);
    expect(sell).toMatch(/\[DRAFT_RESUME\] setImages count/);
    // Plus de filtre silencieux base64-only (régression iOS physique).
    expect(sell).not.toMatch(/img is PickedImage & \{ base64: string \}/);
    expect(plan).toMatch(/base64.*uri|uri.*base64/s);
    expect(upload).toMatch(/upsert: true/);
    expect(upload).toMatch(/\.eq\('sort_order', sortOrder\)/);
    expect(editSvc).toMatch(/from\('listing_images'\)/);
    expect(editSvc).toMatch(/mapListingImageRowsToEditItems/);
    expect(editSvc).toMatch(/\[DRAFT_RESUME\] dbImages count/);
    expect(imageUrl).toMatch(/createSignedUrl/);
    expect(imageUrl).toMatch(/isListingImageStoragePath/);

    const publish = read('src/services/listings/publishListingDraft.ts');
    expect(publish).toMatch(/\.update\(/);
    expect(publish).not.toMatch(/uploadListingImages/);
    expect(publish).not.toMatch(/listing_images/);
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
