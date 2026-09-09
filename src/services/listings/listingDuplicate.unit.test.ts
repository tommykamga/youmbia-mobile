import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildListingDuplicateDraft,
  buildListingDuplicateFormPayload,
  LISTING_DUPLICATE_LIFECYCLE_KEYS,
} from './buildListingDuplicateDraft';
import { LISTING_STATUS, LISTING_DUPLICATE_NOT_ELIGIBLE_MESSAGE } from '@/lib/listingStatus';
import { peekListingPublishDuplicateDraft, resetListingPublishDuplicateDraftForTests } from '@/lib/listingPublishDraft';
import { applyListingSaleCycleInsert } from '@/lib/listingSaleCycle';
import { createListingDraft } from './createListingDraft';
import { createListing } from './createListing';
import { LISTING_PUBLISH_QUOTA_REACHED_MESSAGE, MAX_LISTINGS_PER_24H } from './checkListingPublishDailyQuota';

const mocks = vi.hoisted(() => ({
  getListingForEdit: vi.fn(),
  getListingDynamicAttributeValuesForForm: vi.fn(),
  trackStarted: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  checkQuota: vi.fn(),
}));

vi.mock('./getListingForEdit', () => ({
  getListingForEdit: mocks.getListingForEdit,
}));

vi.mock('./getListingDynamicAttributeValuesForForm', () => ({
  getListingDynamicAttributeValuesForForm: mocks.getListingDynamicAttributeValuesForForm,
}));

vi.mock('@/lib/analytics', () => ({
  trackListingDuplicateStarted: mocks.trackStarted,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
}));

vi.mock('./listingDetailSessionCache', () => ({
  removeListingDetailSession: vi.fn(),
}));

vi.mock('./checkListingPublishDailyQuota', async () => {
  const actual = await vi.importActual<typeof import('./checkListingPublishDailyQuota')>(
    './checkListingPublishDailyQuota'
  );
  return {
    ...actual,
    checkListingPublishDailyQuota: mocks.checkQuota,
  };
});

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SOURCE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const NEW_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function sourceListing(overrides?: Partial<{
  id: string;
  status: string;
  title: string;
  price: number;
}>) {
  return {
    id: SOURCE_ID,
    title: 'iPhone 13',
    price: 150000,
    city: 'Douala',
    description: 'Très bon état',
    category_id: 20,
    status: 'active',
    shop_id: null,
    images: ['https://signed/0.jpg'],
    imageItems: [
      {
        id: 'src-img-1',
        path: `${USER_ID}/${SOURCE_ID}/0.jpg`,
        sort_order: 0,
        displayUrl: 'https://signed/0.jpg',
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  mocks.getListingForEdit.mockReset();
  mocks.getListingDynamicAttributeValuesForForm.mockReset();
  mocks.trackStarted.mockReset();
  mocks.getUser.mockReset();
  mocks.from.mockReset();
  mocks.checkQuota.mockReset();
  mocks.checkQuota.mockResolvedValue({ ok: true, count: 0 });
  mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  mocks.getListingDynamicAttributeValuesForForm.mockResolvedValue({ marque: 'Apple' });
  resetListingPublishDuplicateDraftForTests();
});

describe('buildListingDuplicateFormPayload', () => {
  it('source active → payload distinct, sans id listing_images source ni lifecycle', () => {
    const payload = buildListingDuplicateFormPayload(sourceListing(), { marque: 'Apple' });
    expect(payload.sourceListingId).toBe(SOURCE_ID);
    expect(payload.sourceListingId).not.toBe(NEW_ID);
    expect(payload.title).toMatch(/copie/i);
    expect(payload.price).toBe(150000);
    expect(payload.city).toBe('Douala');
    expect(payload.dynamicValues).toEqual({ marque: 'Apple' });
    expect(payload.sourceImages).toHaveLength(1);
    expect(payload.sourceImages[0]).not.toHaveProperty('id');
    expect(payload.sourceImages[0]?.path).toBe(`${USER_ID}/${SOURCE_ID}/0.jpg`);
    for (const key of LISTING_DUPLICATE_LIFECYCLE_KEYS) {
      expect(payload).not.toHaveProperty(key);
    }
    expect(payload).not.toHaveProperty('sold_at');
    expect(payload).not.toHaveProperty('views_count');
    expect(payload).not.toHaveProperty('favorites');
  });

  it('source sold → nouvelle annonce sans sold_at / status sold', () => {
    const payload = buildListingDuplicateFormPayload(sourceListing({ status: 'sold' }), {});
    expect(payload).not.toHaveProperty('sold_at');
    expect(payload).not.toHaveProperty('status');
    expect(applyListingSaleCycleInsert({ status: 'draft', created_at: '2026-01-01', now: '2026-09-09' })).toEqual({
      sold_at: null,
      sale_cycle_started_at: null,
    });
  });
});

describe('buildListingDuplicateDraft', () => {
  it('owner active → mémoire session, nouvel ID non réutilisé, source non mutée', async () => {
    mocks.getListingForEdit.mockResolvedValue({ data: sourceListing(), error: null });
    const result = await buildListingDuplicateDraft(SOURCE_ID);
    expect(result.success).toBe(true);
    const draft = peekListingPublishDuplicateDraft();
    expect(draft?.sourceListingId).toBe(SOURCE_ID);
    expect(draft?.sourceImages[0]).not.toHaveProperty('id');
    expect(mocks.trackStarted).toHaveBeenCalledWith({ source_listing_id: SOURCE_ID });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('annonce tierce : getListingForEdit refuse, pas de draft', async () => {
    mocks.getListingForEdit.mockResolvedValue({
      data: null,
      error: { message: 'Annonce introuvable ou accès refusé.' },
    });
    const result = await buildListingDuplicateDraft(SOURCE_ID);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toMatch(/introuvable|refusé/i);
    expect(peekListingPublishDuplicateDraft()).toBeNull();
    expect(mocks.trackStarted).not.toHaveBeenCalled();
  });

  it('refuse draft et suspended', async () => {
    mocks.getListingForEdit.mockResolvedValue({
      data: sourceListing({ status: LISTING_STATUS.draft }),
      error: null,
    });
    const draftRes = await buildListingDuplicateDraft(SOURCE_ID);
    expect(draftRes.success).toBe(false);
    if (!draftRes.success) {
      expect(draftRes.error.message).toBe(LISTING_DUPLICATE_NOT_ELIGIBLE_MESSAGE);
    }

    mocks.getListingForEdit.mockResolvedValue({
      data: sourceListing({ status: LISTING_STATUS.suspended }),
      error: null,
    });
    const susp = await buildListingDuplicateDraft(SOURCE_ID);
    expect(susp.success).toBe(false);
  });
});

describe('Save Draft / Publish duplicate — quota et user_id session', () => {
  it('Save Draft crée un NOUVEAU draft (id distinct, user_id session) sans quota', async () => {
    let insertPayload: Record<string, unknown> | null = null;
    mocks.from.mockReturnValue({
      insert: (payload: Record<string, unknown>) => {
        insertPayload = payload;
        return {
          select: () => ({
            single: async () => ({ data: { id: NEW_ID }, error: null }),
          }),
        };
      },
    });

    const result = await createListingDraft({
      title: 'iPhone 13 (copie)',
      price: 140000,
      categoryId: 20,
      city: 'Douala',
    });

    expect(result.data?.id).toBe(NEW_ID);
    expect(result.data?.id).not.toBe(SOURCE_ID);
    expect(insertPayload).toMatchObject({
      user_id: USER_ID,
      status: LISTING_STATUS.draft,
      title: 'iPhone 13 (copie)',
    });
    expect(insertPayload).not.toHaveProperty('sold_at');
    expect(insertPayload).not.toHaveProperty('views_count', 99);
    expect(insertPayload).toMatchObject({ views_count: 0 });
    expect(mocks.checkQuota).not.toHaveBeenCalled();
  });

  it('Publish duplicate respecte le quota (createListing)', async () => {
    mocks.checkQuota.mockResolvedValue({
      ok: false,
      count: MAX_LISTINGS_PER_24H,
      error: { message: LISTING_PUBLISH_QUOTA_REACHED_MESSAGE },
    });

    const result = await createListing({
      title: 'iPhone 13 (copie)',
      price: 140000,
      categoryId: 20,
      city: 'Douala',
      description: 'Très bon état, copie pour republication.',
    });

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe(LISTING_PUBLISH_QUOTA_REACHED_MESSAGE);
    expect(mocks.checkQuota).toHaveBeenCalledWith(USER_ID);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
