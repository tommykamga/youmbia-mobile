import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOrCreateConversation } from './getOrCreateConversation';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: mocks.getUser }, from: mocks.from } }));
const buyer = 'buyer';
const seller = 'seller';
function query(result: unknown) {
  const builder = { select: vi.fn(), eq: vi.fn(), insert: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result), single: vi.fn().mockResolvedValue(result) };
  builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder); builder.insert.mockReturnValue(builder);
  return builder;
}
beforeEach(() => { vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ data: { user: { id: buyer } }, error: null }); });
describe('getOrCreateConversation concurrency compatibility', () => {
  it('creates using the authenticated buyer and the loaded listing owner', async () => {
    const listing = query({ data: { id: 'listing', user_id: seller }, error: null });
    const existing = query({ data: null, error: null });
    const inserted = query({ data: { id: 'thread' }, error: null });
    mocks.from.mockReturnValueOnce(listing).mockReturnValueOnce(existing).mockReturnValueOnce(inserted);
    expect(await getOrCreateConversation('listing')).toEqual({ data: { id: 'thread' }, error: null });
    expect(inserted.insert).toHaveBeenCalledWith({ listing_id: 'listing', buyer_id: buyer, seller_id: seller });
  });
  it('returns the unique winning conversation after a concurrent insert without rewriting participants', async () => {
    const inserted = query({ data: null, error: { code: '23505', message: 'unique' } });
    const winner = query({ data: { id: 'winning-thread' }, error: null });
    mocks.from.mockReturnValueOnce(query({ data: { id: 'listing', user_id: seller }, error: null }))
      .mockReturnValueOnce(query({ data: null, error: null })).mockReturnValueOnce(inserted).mockReturnValueOnce(winner);
    expect(await getOrCreateConversation('listing')).toEqual({ data: { id: 'winning-thread' }, error: null });
    expect(winner.eq.mock.calls).toEqual([['listing_id', 'listing'], ['buyer_id', buyer], ['seller_id', seller]]);
    expect(winner.insert).not.toHaveBeenCalled();
  });
  it('does not turn a security denial into a successful conversation', async () => {
    mocks.from.mockReturnValueOnce(query({ data: { id: 'listing', user_id: seller }, error: null }))
      .mockReturnValueOnce(query({ data: null, error: null }))
      .mockReturnValueOnce(query({ data: null, error: { code: '42501', message: 'denied' } }));
    expect((await getOrCreateConversation('listing')).data).toBeNull();
    expect(mocks.from).toHaveBeenCalledTimes(3);
  });
});
