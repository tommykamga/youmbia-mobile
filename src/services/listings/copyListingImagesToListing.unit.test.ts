import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyListingImagesToListing } from './copyListingImagesToListing';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  storageFrom: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    storage: { from: mocks.storageFrom },
  },
}));

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SOURCE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const NEW_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OTHER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

type StorageCalls = {
  copy: { from: string; to: string }[];
  remove: string[][];
};

function mockStorage(options?: { copyFailsAt?: number }) {
  const calls: StorageCalls = { copy: [], remove: [] };
  mocks.storageFrom.mockReturnValue({
    copy: vi.fn(async (from: string, to: string) => {
      calls.copy.push({ from, to });
      if (options?.copyFailsAt != null && calls.copy.length > options.copyFailsAt) {
        return { error: { message: 'copy failed' } };
      }
      return { error: null };
    }),
    download: vi.fn(async () => ({ data: null, error: { message: 'unused' } })),
    upload: vi.fn(async () => ({ error: { message: 'unused' } })),
    remove: vi.fn(async (paths: string[]) => {
      calls.remove.push(paths);
      return { error: null };
    }),
  });
  return calls;
}

function mockListingImages(insertPayloads: Record<string, unknown>[], deleteFilters: Record<string, unknown>[]) {
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
      delete: () => {
        const filters: Record<string, unknown> = {};
        const chain = {
          eq: (column: string, value: unknown) => {
            filters[column] = value;
            return chain;
          },
          in: async (column: string, value: unknown) => {
            filters[column] = value;
            deleteFilters.push({ ...filters });
            return { error: null };
          },
        };
        return chain;
      },
    };
  });
}

beforeEach(() => {
  mocks.getUser.mockReset();
  mocks.from.mockReset();
  mocks.storageFrom.mockReset();
  mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

describe('copyListingImagesToListing', () => {
  it('copie vers un path contenant newListingId et insert sans réutiliser l’id source', async () => {
    const storage = mockStorage();
    const inserts: Record<string, unknown>[] = [];
    mockListingImages(inserts, []);

    const sourcePath = `${USER_ID}/${SOURCE_ID}/0.jpg`;
    const result = await copyListingImagesToListing(NEW_ID, [
      { path: sourcePath, sort_order: 0 },
    ]);

    expect(result.status).toBe('ok');
    expect(result.data.copiedCount).toBe(1);
    expect(storage.copy).toEqual([
      { from: sourcePath, to: `${USER_ID}/${NEW_ID}/0.jpg` },
    ]);
    expect(storage.copy[0]?.to).toContain(NEW_ID);
    expect(storage.copy[0]?.to).not.toBe(sourcePath);
    expect(inserts).toEqual([
      { listing_id: NEW_ID, url: `${USER_ID}/${NEW_ID}/0.jpg`, sort_order: 0 },
    ]);
    expect(inserts[0]).not.toHaveProperty('id');
    expect(storage.remove).toHaveLength(0);
  });

  it('newListingId !== sourceListingId : refuse de copier vers l’id source', async () => {
    mockStorage();
    const inserts: Record<string, unknown>[] = [];
    mockListingImages(inserts, []);

    const result = await copyListingImagesToListing(SOURCE_ID, [
      { path: `${USER_ID}/${SOURCE_ID}/0.jpg`, sort_order: 0 },
    ]);

    expect(result.status).toBe('failed');
    expect(inserts).toHaveLength(0);
  });

  it('refuse un path d’un autre utilisateur', async () => {
    mockStorage();
    const inserts: Record<string, unknown>[] = [];
    mockListingImages(inserts, []);

    const result = await copyListingImagesToListing(NEW_ID, [
      { path: `${OTHER_ID}/${SOURCE_ID}/0.jpg`, sort_order: 0 },
    ]);

    expect(result.status).toBe('failed');
    expect(inserts).toHaveLength(0);
  });

  it('échec copie → rollback dest uniquement (pas la source)', async () => {
    const storage = mockStorage({ copyFailsAt: 1 });
    const inserts: Record<string, unknown>[] = [];
    const deletes: Record<string, unknown>[] = [];
    mockListingImages(inserts, deletes);

    const source0 = `${USER_ID}/${SOURCE_ID}/0.jpg`;
    const source1 = `${USER_ID}/${SOURCE_ID}/1.jpg`;
    const result = await copyListingImagesToListing(NEW_ID, [
      { path: source0, sort_order: 0 },
      { path: source1, sort_order: 1 },
    ]);

    expect(result.status).toBe('failed');
    expect(inserts).toHaveLength(1);
    expect(deletes).toEqual([
      {
        listing_id: NEW_ID,
        url: [`${USER_ID}/${NEW_ID}/0.jpg`, `${USER_ID}/${NEW_ID}/1.jpg`],
      },
    ]);
    expect(deletes.every((row) => row.listing_id === NEW_ID)).toBe(true);
    expect(deletes.every((row) => row.listing_id !== SOURCE_ID)).toBe(true);
    expect(storage.remove.flat()).toEqual([
      `${USER_ID}/${NEW_ID}/0.jpg`,
      `${USER_ID}/${NEW_ID}/1.jpg`,
    ]);
    expect(storage.remove.flat().some((p) => p.includes(SOURCE_ID))).toBe(false);
    expect(storage.remove.flat().every((p) => p.includes(NEW_ID))).toBe(true);
  });
});
