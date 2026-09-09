import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getListingForEdit, mapListingImageRowsToEditItems } from './getListingForEdit';
import { deleteListingImage } from './deleteListingImage';
import { buildListingResumeDraft } from './buildListingResumeDraft';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  getSignedUrlsMap: vi.fn(),
  resolveSingle: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
}));

vi.mock('@/lib/listingImageUrl', () => ({
  getSignedUrlsMap: mocks.getSignedUrlsMap,
  toDisplayImageUrl: (path: string, map?: Map<string, string>) => {
    if (/^https?:\/\//i.test(path)) return path;
    return map?.get(path) ?? '';
  },
  resolveSingleListingImageUrl: mocks.resolveSingle,
  isListingImageHttpUrl: (p: string) => /^https?:\/\//i.test(String(p ?? '').trim()),
}));

vi.mock('@/lib/listingSchemaFeatures', () => ({
  normalizeListingSchemaFeatures: () => ({
    boosted: false,
    district: null,
    urgent: false,
  }),
}));

vi.mock('./getListingDynamicAttributeValuesForForm', () => ({
  getListingDynamicAttributeValuesForForm: vi.fn().mockResolvedValue({}),
}));

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LISTING_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function mockListingAndImages(imageRows: { id: string; url: string; sort_order: number }[]) {
  mocks.from.mockImplementation((table: string) => {
    if (table === 'listings') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: LISTING_ID,
                  title: 'Draft photos',
                  price: 1,
                  city: 'Douala',
                  description: '',
                  category_id: 1,
                  status: 'draft',
                  shop_id: null,
                  user_id: USER_ID,
                },
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === 'listing_images') {
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({ data: imageRows, error: null }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

beforeEach(() => {
  mocks.getUser.mockReset();
  mocks.from.mockReset();
  mocks.getSignedUrlsMap.mockReset();
  mocks.resolveSingle.mockReset();
  mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

describe('getListingForEdit — reload photos draft (paths Storage)', () => {
  it('url = storage path => 4 signed images, ordre sort_order', async () => {
    const rows = [
      { id: 'i3', url: `${USER_ID}/${LISTING_ID}/3.jpg`, sort_order: 3 },
      { id: 'i0', url: `${USER_ID}/${LISTING_ID}/0.jpg`, sort_order: 0 },
      { id: 'i1', url: `${USER_ID}/${LISTING_ID}/1.jpg`, sort_order: 1 },
      { id: 'i2', url: `${USER_ID}/${LISTING_ID}/2.jpg`, sort_order: 2 },
    ];
    mockListingAndImages(rows);
    mocks.getSignedUrlsMap.mockImplementation(async (paths: string[]) => {
      const map = new Map<string, string>();
      for (const p of paths) map.set(p, `https://signed.example/${p}?t=1`);
      return map;
    });

    const result = await getListingForEdit(LISTING_ID);
    expect(result.error).toBeNull();
    expect(result.data?.imageItems).toHaveLength(4);
    expect(result.data?.imageItems.map((i) => i.sort_order)).toEqual([0, 1, 2, 3]);
    expect(result.data?.imageItems.map((i) => i.path)).toEqual([
      `${USER_ID}/${LISTING_ID}/0.jpg`,
      `${USER_ID}/${LISTING_ID}/1.jpg`,
      `${USER_ID}/${LISTING_ID}/2.jpg`,
      `${USER_ID}/${LISTING_ID}/3.jpg`,
    ]);
    expect(result.data?.images).toHaveLength(4);
    expect(result.data?.images.every((u) => u.startsWith('https://'))).toBe(true);
  });

  it('batch partiel => fallback unitaire, ne vide pas toute la liste', async () => {
    mockListingAndImages([
      { id: 'a', url: 'u/l/0.jpg', sort_order: 0 },
      { id: 'b', url: 'u/l/1.jpg', sort_order: 1 },
      { id: 'c', url: 'u/l/2.jpg', sort_order: 2 },
    ]);
    mocks.getSignedUrlsMap.mockResolvedValue(new Map([['u/l/0.jpg', 'https://signed/0.jpg']]));
    mocks.resolveSingle.mockImplementation(async (path: string) => {
      if (path === 'u/l/1.jpg') return 'https://signed/1-recovered.jpg';
      return '';
    });

    const result = await getListingForEdit(LISTING_ID);
    expect(result.data?.imageItems.map((i) => i.id)).toEqual(['a', 'b']);
    expect(result.data?.imageItems).toHaveLength(2);
    expect(mocks.resolveSingle).toHaveBeenCalledWith('u/l/1.jpg');
    expect(mocks.resolveSingle).toHaveBeenCalledWith('u/l/2.jpg');
  });
});

describe('mapListingImageRowsToEditItems', () => {
  it('image persisted sans base64 : conserve id/path/sort_order + displayUrl', async () => {
    mocks.getSignedUrlsMap.mockResolvedValue(
      new Map([['owner/draft/0.jpg', 'https://signed/0.jpg?token=x']])
    );
    const items = await mapListingImageRowsToEditItems([
      { id: 'img-1', url: 'owner/draft/0.jpg', sort_order: 0 },
    ]);
    expect(items).toEqual([
      {
        id: 'img-1',
        path: 'owner/draft/0.jpg',
        sort_order: 0,
        displayUrl: 'https://signed/0.jpg?token=x',
      },
    ]);
  });
});

describe('buildListingResumeDraft — images.length = nombre signé DB', () => {
  it('resume draft => existingImages.length aligné sur imageItems', async () => {
    mockListingAndImages([
      { id: 'i0', url: 'u/d/0.jpg', sort_order: 0 },
      { id: 'i1', url: 'u/d/1.jpg', sort_order: 1 },
    ]);
    mocks.getSignedUrlsMap.mockResolvedValue(
      new Map([
        ['u/d/0.jpg', 'https://s/0.jpg'],
        ['u/d/1.jpg', 'https://s/1.jpg'],
      ])
    );

    const resume = await buildListingResumeDraft(LISTING_ID);
    expect(resume.success).toBe(true);
    if (!resume.success) return;
    expect(resume.data.existingImages).toHaveLength(2);
    expect(resume.data.existingImages.every((i) => i.displayUrl.startsWith('https://'))).toBe(
      true
    );
    expect(resume.data.existingImages.every((i) => !('base64' in i))).toBe(true);
  });
});

describe('deleteListingImage — détachement draft', () => {
  it('supprime la ligne si le listing appartient au user', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'listing_images') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'img-1', listing_id: LISTING_ID },
                error: null,
              }),
            }),
          }),
          delete: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      if (table === 'listings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { user_id: USER_ID },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(table);
    });

    const result = await deleteListingImage('img-1');
    expect(result).toEqual({ success: true });
  });
});
