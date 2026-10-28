import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';
import { dispatch, type Store } from './worker.ts';

import { handleDispatchRequest } from './request.ts';

export function createTransactionalPushHandler(getEnv: (name: string) => string | undefined, fetcher: typeof fetch = fetch) {
 return (req: Request) => handleDispatchRequest(req, getEnv('TRANSACTIONAL_PUSH_DISPATCH_SECRET'),
  getEnv('TRANSACTIONAL_PUSH_WORKER_ENABLED') === 'true', async () => {
  const url = getEnv('SUPABASE_URL');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return Response.json({ error: 'server_misconfigured' }, { status: 500 });
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  function checked<T>(result: { data: T; error: unknown }): T {
    if (result.error) throw new Error('database_operation_failed');
    return result.data;
  }
  const store: Store = {
    async claim() { return checked(await admin.rpc('claim_transactional_push', { p_limit: 10 })) ?? []; },
    async finish(row, patch) {
      const result = checked(await admin.from('transactional_push_deliveries').update(patch)
        .eq('id', row.delivery_id).eq('claim_id', row.claim).eq('state', 'sending').select('id'));
      if (result?.length !== 1) throw new Error('claim_lost');
    },
    async receipts() {
      return checked(await admin.from('transactional_push_deliveries').select('id,ticket_id,receipt_checks')
        .eq('state', 'accepted').lte('available_at', new Date().toISOString()).limit(100)) ?? [];
    },
    async receipt(row, patch) {
      checked(await admin.from('transactional_push_deliveries').update(patch)
        .eq('id', row.id).eq('state', 'accepted').eq('receipt_checks', row.receipt_checks));
    },
    async invalidate(id) { checked(await admin.rpc('invalidate_transactional_push_token', { p_delivery_id: id })); },
  };
  try {
    return Response.json(await dispatch(store, fetcher, getEnv('EXPO_ACCESS_TOKEN')));
  } catch {
    // No tokens, request headers, payloads, provider messages or user identities in logs.
    console.error('transactional_push_worker_failed');
    return Response.json({ error: 'dispatch_failed' }, { status: 500 });
  }
});
}
