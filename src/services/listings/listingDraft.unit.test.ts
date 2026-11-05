import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createListingDraft, updateListingDraft, hasListingDraftContent } from './createListingDraft';
import { publishListingDraft } from './publishListingDraft';
import { createListing } from './createListing';
import { buildListingResumeDraft } from './buildListingResumeDraft';
import { LISTING_STATUS } from '@/lib/listingStatus';
import {
  LISTING_PUBLISH_QUOTA_REACHED_MESSAGE,
  MAX_LISTINGS_PER_24H,
} from './checkListingPublishDailyQuota';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  checkQuota: vi.fn(),
  getListingForEdit: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
}));

vi.mock('./getListingForEdit', () => ({ getListingForEdit: mocks.getListingForEdit }));
vi.mock('./getListingDynamicAttributeValuesForForm', () => ({
  getListingDynamicAttributeValuesForForm: vi.fn().mockResolvedValue({}),
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
const OTHER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DRAFT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

beforeEach(() => {
  mocks.getUser.mockReset();
  mocks.from.mockReset();
  mocks.checkQuota.mockReset();
  mocks.checkQuota.mockResolvedValue({ ok: true, count: 0 });
});

describe('createListingDraft', () => {
  it('crée un draft privé (status draft, user_id courant) sans consommer le quota', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    let insertPayload: Record<string, unknown> | null = null;
    mocks.from.mockReturnValue({
      insert: (payload: Record<string, unknown>) => {
        insertPayload = payload;
        return {
          select: () => ({
            single: async () => ({ data: { id: DRAFT_ID }, error: null }),
          }),
        };
      },
    });

    const result = await createListingDraft({
      title: 'iPhone',
      price: 100000,
      categoryId: 20,
      city: 'Douala',
    });

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe(DRAFT_ID);
    expect(insertPayload).toMatchObject({
      status: LISTING_STATUS.draft,
      user_id: USER_ID,
      title: 'iPhone',
      price: 100000,
    });
    expect(mocks.checkQuota).not.toHaveBeenCalled();
  });

  it('refuse un brouillon totalement vide', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    const result = await createListingDraft({});
    expect(result.data).toBeNull();
    expect(result.error?.message).toMatch(/au moins/i);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('hasListingDraftContent détecte un champ utile', () => {
    expect(hasListingDraftContent({ title: 'x' })).toBe(true);
    expect(hasListingDraftContent({})).toBe(false);
  });
});

describe('updateListingDraft / publishListingDraft — isolation propriétaire', () => {
  it('update draft filtre user_id + status draft (autre user = introuvable)', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: OTHER_ID } }, error: null });
    const filters: { column: string; value: unknown }[] = [];
    mocks.from.mockReturnValue({
      update: () => {
        const chain = {
          eq: (column: string, value: unknown) => {
            filters.push({ column, value });
            return chain;
          },
          select: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        };
        return chain;
      },
    });

    const result = await updateListingDraft(DRAFT_ID, { title: 'Hack' });
    expect(result.error?.message).toMatch(/introuvable|non autorisé/i);
    expect(filters).toEqual(
      expect.arrayContaining([
        { column: 'id', value: DRAFT_ID },
        { column: 'user_id', value: OTHER_ID },
        { column: 'status', value: LISTING_STATUS.draft },
      ])
    );
    expect(mocks.checkQuota).not.toHaveBeenCalled();
  });

  it('publish draft → active conserve le même id et passe par le quota', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    let updatePayload: Record<string, unknown> | null = null;
    const filters: { column: string; value: unknown }[] = [];
    mocks.from.mockReturnValue({
      update: (payload: Record<string, unknown>) => {
        updatePayload = payload;
        const chain = {
          eq: (column: string, value: unknown) => {
            filters.push({ column, value });
            return chain;
          },
          select: () => ({
            maybeSingle: async () => ({
              data: { id: DRAFT_ID, status: LISTING_STATUS.active },
              error: null,
            }),
          }),
        };
        return chain;
      },
    });

    const result = await publishListingDraft(DRAFT_ID, {
      title: 'iPhone 13 Pro',
      price: 250000,
      categoryId: 20,
      city: 'Yaoundé',
      description: 'Très bon état, batterie neuve.',
    });

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: DRAFT_ID, status: LISTING_STATUS.active });
    expect(updatePayload).toMatchObject({ status: LISTING_STATUS.active });
    expect(mocks.checkQuota).toHaveBeenCalledWith(USER_ID);
    expect(filters).toEqual(
      expect.arrayContaining([
        { column: 'user_id', value: USER_ID },
        { column: 'status', value: LISTING_STATUS.draft },
      ])
    );
  });

  it('quota atteint : publish refuse et ne mutate pas (reste draft)', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mocks.checkQuota.mockResolvedValue({
      ok: false,
      count: MAX_LISTINGS_PER_24H,
      error: { message: LISTING_PUBLISH_QUOTA_REACHED_MESSAGE },
    });

    const result = await publishListingDraft(DRAFT_ID, {
      title: 'iPhone 13 Pro',
      price: 250000,
      categoryId: 20,
      city: 'Yaoundé',
      description: 'Très bon état, batterie neuve.',
    });

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe(LISTING_PUBLISH_QUOTA_REACHED_MESSAGE);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe('createListing quota', () => {
  it('publication classique respecte le même quota avant insert', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mocks.checkQuota.mockResolvedValue({
      ok: false,
      count: MAX_LISTINGS_PER_24H,
      error: { message: LISTING_PUBLISH_QUOTA_REACHED_MESSAGE },
    });

    const result = await createListing({
      title: 'Annonce',
      price: 1000,
      categoryId: 20,
      city: 'Douala',
      description: 'Description assez longue pour passer.',
    });

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe(LISTING_PUBLISH_QUOTA_REACHED_MESSAGE);
    expect(mocks.checkQuota).toHaveBeenCalledWith(USER_ID);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

// Service integration with an in-memory Supabase double, not a PostgreSQL/RLS test.
describe('V5-02A incomplete draft lifecycle', () => {
  it.each([
    { title: 'Titre seul' },
    { categoryId: 20 },
    { title: 'Titre', description: '' },
    { title: 'Titre', description: '   ' },
    { title: 'Titre', description: null },
  ])('saves, resumes and publishes the same id: %j', async (payload) => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    let stored: Record<string, unknown> = {};
    const filters: Record<string, unknown> = {};
    const chain = {
      eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
      select: () => chain,
      single: async () => ({ data: { id: DRAFT_ID }, error: null }),
      maybeSingle: async () => ({ data: { id: DRAFT_ID, status: stored.status }, error: null }),
    };
    mocks.from.mockReturnValue({
      insert: (row: Record<string, unknown>) => { stored = { ...row, id: DRAFT_ID }; return chain; },
      update: (row: Record<string, unknown>) => { stored = { ...stored, ...row }; return chain; },
    });
    expect((await createListingDraft(payload)).data?.id).toBe(DRAFT_ID);
    expect(stored.description).toBe('');
    expect(stored.status).toBe('draft');
    expect((await updateListingDraft(DRAFT_ID, payload)).data?.id).toBe(DRAFT_ID);
    expect(stored.description).toBe('');
    mocks.getListingForEdit.mockResolvedValue({ data: stored, error: null });
    const resumed = await buildListingResumeDraft(DRAFT_ID);
    expect(resumed.success).toBe(true);
    if (resumed.success) {
      expect(resumed.data.description).toBe('');
      expect(resumed.data.listingId).toBe(DRAFT_ID);
    }
    const published = await publishListingDraft(DRAFT_ID, {
      title: 'Titre complet', price: 1000, categoryId: 20,
      description: 'Description de publication complète.', city: 'Douala',
    });
    expect(published.data?.id).toBe(DRAFT_ID);
    expect(stored.status).toBe('active');
    expect(filters).toMatchObject({ id: DRAFT_ID, user_id: USER_ID, status: 'draft' });
    expect(stored).not.toHaveProperty('created_at');
  });
});
