// Test-only entrypoint. Never deployed as the production dispatcher.
import { createTransactionalPushHandler } from '../../dispatch-transactional-push/handler.ts';
if (Deno.env.get('E2E_PROJECT_ID') !== 'youmbia-push-e2e-local') throw new Error('isolated project required');
const backend = new URL(Deno.env.get('SUPABASE_URL') ?? '');
if (!['kong', 'supabase_kong_youmbia-push-e2e-local'].includes(backend.hostname)) throw new Error('local Docker backend required');
const mockUrl = 'http://host.docker.internal:55541';
const secret = Deno.env.get('TRANSACTIONAL_PUSH_DISPATCH_SECRET')!;
const transport: typeof fetch = (input, init) => {
  const url = new URL(String(input));
  if (url.origin !== 'https://exp.host' || !['/--/api/v2/push/send', '/--/api/v2/push/getReceipts'].includes(url.pathname)) {
    throw new Error('unexpected outbound destination');
  }
  const headers = new Headers(init?.headers);
  headers.set('x-e2e-secret', secret);
  // No route to the real Expo service. All sends and receipts use this local server.
  return fetch(mockUrl + url.pathname, { ...init, headers });
};
Deno.serve(createTransactionalPushHandler(name => name === 'TRANSACTIONAL_PUSH_WORKER_ENABLED' ? 'true' : Deno.env.get(name), transport));
