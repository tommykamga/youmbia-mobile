import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const qaUrl = process.env.LINK01_QA_URL;
const qaKey = process.env.LINK01_QA_ANON_KEY;
const enabled = Boolean(qaUrl && qaKey);
if (enabled && !/^http:\/\/(127\.0\.0\.1|localhost):55331$/.test(qaUrl!)) {
  throw new Error('LINK-01 integration tests require the dedicated loopback QA backend');
}
vi.mock('@/lib/supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return {supabase:createClient(qaUrl || 'http://127.0.0.1:55331', qaKey || 'local-qa-only', {auth:{persistSession:false,autoRefreshToken:false}})};
});
vi.mock('@/lib/shopMediaUrl', () => ({resolveShopMediaUrls:async (shop: unknown) => shop}));

const suite = enabled ? describe : describe.skip;
suite('LINK-01 local Supabase route integration (synthetic fixtures)', () => {
  const client = createClient(qaUrl || 'http://127.0.0.1:55331', qaKey || 'local-qa-only', {auth:{persistSession:false,autoRefreshToken:false}});
  beforeAll(async () => {
    const {data,error} = await client.from('link01_qa_identity').select('id').single();
    expect(error).toBeNull();
    expect(data?.id).toBe('youmbia-link01-phase1-local-only');
  });
  it('resolves the historically reported owner UUID and canonical slug to the same shop', async () => {
    const {getShopBySlug} = await import('./getShopBySlug');
    for (const segment of ['154cb365-a83e-47f7-b9ab-ce33352c7dd0','w-electronik','de9efd15-12ce-4a79-99be-198f50552002']) {
      const result = await getShopBySlug(segment);
      expect(result.error).toBeNull();
      expect(result.data?.id).toBe('de9efd15-12ce-4a79-99be-198f50552002');
    }
  });
  it('does not expose a hidden shop or nonexistent resource to an anonymous client', async () => {
    const {getShopBySlug} = await import('./getShopBySlug');
    expect((await getShopBySlug('qa-hidden')).data).toBeNull();
    expect((await getShopBySlug('qa-does-not-exist')).data).toBeNull();
    const {data,error} = await client.from('shops').select('id').eq('slug','qa-hidden');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
  it('reads the historically reported seller identifier from the isolated fixture', async () => {
    const {data,error} = await client.from('profiles').select('id,full_name').eq('id','98cb3b62-f959-4b89-8ea3-ccd8b969e037').single();
    expect(error).toBeNull();
    expect(data?.full_name).toBe('LINK01 QA Vendeur');
  });
});
