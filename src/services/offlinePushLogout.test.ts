import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

describe('actual installed Supabase SDK offline signOut semantics', () => {
  it('returns a network error without claiming local/server logout has completed', async () => {
    const key = 'ymb-e2e-offline-session';
    const session = {
      access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer',
      user: { id: '00000000-0000-0000-0000-000000000001', email: 'offline@ymb-e2e.invalid' },
    };
    const values = new Map([[key, JSON.stringify(session)]]);
    const fetcher = vi.fn(async () => { throw new TypeError('simulated device offline'); });
    const client = createClient('http://127.0.0.1:55421', 'synthetic-local-only-key', {
      auth: { storageKey: key, autoRefreshToken: false, detectSessionInUrl: false, persistSession: true,
        storage: { getItem: name => values.get(name) ?? null, setItem: (name, value) => { values.set(name, value); }, removeItem: name => { values.delete(name); } } },
      global: { fetch: fetcher },
    });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await client.auth.getSession();
      const result = await client.auth.signOut();
      expect(result.error).not.toBeNull();
      expect(fetcher).toHaveBeenCalled();
      expect(values.has(key)).toBe(true);
    } finally {
      errorLog.mockRestore();
      client.auth.stopAutoRefresh();
    }
  });
});
