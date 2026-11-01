import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publishListingSafely } from './publishListingSafely';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), create: vi.fn(), update: vi.fn(), quota: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc, auth: { getUser: mocks.getUser } } }));
vi.mock('./createListingDraft', () => ({ createListingDraft: mocks.create, updateListingDraft: mocks.update }));
vi.mock('./checkListingPublishDailyQuota', () => ({ checkListingPublishDailyQuota: mocks.quota }));
vi.mock('./listingDetailSessionCache', () => ({ removeListingDetailSession: vi.fn() }));
const id = '10000000-0000-4000-8000-000000000001';
function options() {
  return { listingId: null as string | null, payload: { title: 'Titre prêt' },
    onPrepared: vi.fn(), persistAttributes: vi.fn().mockResolvedValue(undefined), persistPhotos: vi.fn().mockResolvedValue(undefined) };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ data: { id }, error: null });
  mocks.update.mockResolvedValue({ data: { id }, error: null });
  mocks.quota.mockResolvedValue({ ok: true });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  mocks.rpc.mockImplementation(async (name: string) => ({ data: [{ id, status: name.startsWith('prepare') ? 'draft' : 'active', already_published: false }], error: null }));
});
describe('validated publication orchestration (mocked services, not RLS)', () => {
  it('records the draft before attributes/photos, then finalizes', async () => {
    const p = options();
    const order: string[] = [];
    p.onPrepared.mockImplementation(() => order.push('prepared'));
    p.persistAttributes.mockImplementation(async () => { order.push('attributes'); });
    p.persistPhotos.mockImplementation(async () => { order.push('photos'); });
    const result = await publishListingSafely(p);
    expect(order).toEqual(['prepared', 'prepared', 'attributes', 'photos']);
    expect(result).toEqual({ id, alreadyPublished: false });
    expect(mocks.rpc.mock.calls.map((x) => x[0])).toEqual(['prepare_listing_publication', 'finalize_listing_publication']);
    expect(mocks.rpc.mock.invocationCallOrder[1]).toBeGreaterThan(p.persistPhotos.mock.invocationCallOrder[0]);
  });
  it.each(['persistAttributes', 'persistPhotos'] as const)('keeps the same private id if %s fails', async (step) => {
    const p = options(); p[step].mockRejectedValueOnce(new Error('network failure'));
    await expect(publishListingSafely(p)).rejects.toThrow('network failure');
    expect(p.onPrepared).toHaveBeenCalledWith(id);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const resumed = { ...p, listingId: id };
    await expect(publishListingSafely(resumed)).resolves.toMatchObject({ id });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it('recovers a committed finalization whose response was lost, without re-uploading', async () => {
    const p = options(); let committed = false;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name.startsWith('finalize')) { committed = true; throw new Error('response lost'); }
      return { data: [{ id, status: committed ? 'active' : 'draft', already_published: committed }], error: null };
    });
    await expect(publishListingSafely(p)).rejects.toThrow('response lost');
    const result = await publishListingSafely({ ...p, listingId: id });
    expect(result.alreadyPublished).toBe(true);
    expect(p.persistAttributes).toHaveBeenCalledTimes(1);
    expect(p.persistPhotos).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it('fails closed if the server protocol is unavailable', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'RPC unavailable' } });
    const p = options();
    await expect(publishListingSafely(p)).rejects.toThrow('RPC unavailable');
    expect(p.onPrepared).toHaveBeenCalledWith(id);
    expect(p.persistPhotos).not.toHaveBeenCalled();
  });
  it('does not rewrite already finalized content or check quota on a receipt retry', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ id, status: 'active', already_published: true }], error: null });
    await expect(publishListingSafely({ ...options(), listingId: id })).resolves.toEqual({ id, alreadyPublished: true });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.quota).not.toHaveBeenCalled();
  });
  it('does not claim success for an invalid finalization response', async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: [{ id, status: name.startsWith('finalize') ? 'hidden' : 'draft', already_published: false }], error: null }));
    await expect(publishListingSafely(options())).rejects.toThrow('réessayée');
  });
});
