import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadListingImages } from './uploadListingImages';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  storageFrom: vi.fn(),
  compress: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    storage: { from: mocks.storageFrom },
  },
}));

vi.mock('@/lib/listingPhotoUploadCompression', () => ({
  compressListingPhotoForStorageUpload: mocks.compress,
}));

vi.mock('@/lib/analytics', () => ({
  trackListingImagesUploaded: mocks.track,
}));

vi.mock('base64-arraybuffer', () => ({
  decode: () => new ArrayBuffer(8),
}));

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LISTING_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

beforeEach(() => {
  mocks.getUser.mockReset();
  mocks.from.mockReset();
  mocks.storageFrom.mockReset();
  mocks.compress.mockReset();
  mocks.track.mockReset();
  mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  mocks.compress.mockImplementation(async (input: { base64?: string; uri?: string }) => ({
    base64: input.base64 || `from-uri:${input.uri}`,
  }));
});

function mockStorageOk() {
  mocks.storageFrom.mockReturnValue({
    upload: vi.fn().mockResolvedValue({ error: null }),
  });
}

describe('uploadListingImages — brouillon / iOS uri', () => {
  it('uploade depuis uri sans base64 et crée listing_images avec sort_order', async () => {
    mockStorageOk();
    const insertPayloads: Record<string, unknown>[] = [];
    mocks.from.mockImplementation((table: string) => {
      if (table !== 'listing_images') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
        insert: (payload: Record<string, unknown>) => {
          insertPayloads.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    });

    const result = await uploadListingImages(
      LISTING_ID,
      [
        { uri: 'file:///photo0.jpg', base64: null },
        { uri: 'file:///photo1.jpg', base64: null },
      ],
      { sortOrders: [0, 1] }
    );

    expect(result.status).toBe('ok');
    expect(result.data.uploadedCount).toBe(2);
    expect(mocks.compress).toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'file:///photo0.jpg' })
    );
    expect(insertPayloads).toEqual([
      {
        listing_id: LISTING_ID,
        url: `${USER_ID}/${LISTING_ID}/0.jpg`,
        sort_order: 0,
      },
      {
        listing_id: LISTING_ID,
        url: `${USER_ID}/${LISTING_ID}/1.jpg`,
        sort_order: 1,
      },
    ]);
  });

  it('update existant au même sort_order (pas de doublon DB)', async () => {
    mockStorageOk();
    const updates: { id: string; url: string }[] = [];
    let inserts = 0;
    mocks.from.mockImplementation((table: string) => {
      if (table !== 'listing_images') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              limit: async () => ({ data: [{ id: 'img-existing' }], error: null }),
            }),
          }),
        }),
        update: (payload: { url: string }) => ({
          eq: (_col: string, id: string) => {
            updates.push({ id, url: payload.url });
            return Promise.resolve({ error: null });
          },
        }),
        insert: () => {
          inserts += 1;
          return Promise.resolve({ error: null });
        },
      };
    });

    const result = await uploadListingImages(
      LISTING_ID,
      [{ uri: 'file:///again.jpg', base64: null }],
      { sortOrders: [0] }
    );

    expect(result.status).toBe('ok');
    expect(inserts).toBe(0);
    expect(updates).toEqual([
      { id: 'img-existing', url: `${USER_ID}/${LISTING_ID}/0.jpg` },
    ]);
  });

  it('échoue proprement si ni uri ni base64', async () => {
    const result = await uploadListingImages(LISTING_ID, [{ uri: null, base64: null }]);
    expect(result.status).toBe('failed');
    expect(result.data.uploadedCount).toBe(0);
    expect(mocks.storageFrom).not.toHaveBeenCalled();
  });
});
