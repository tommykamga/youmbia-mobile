/**
 * Mock @supabase/supabase-js pour harness HTTP local Lot 04A.
 * Aucune connexion réseau / cloud.
 */

type RpcResult = { data: unknown; error: { message: string } | null };

export type MockDbState = {
  killSwitch: boolean;
  unsubscribed: Set<string>;
  suppressions: Map<string, string>;
  claims: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  profiles: Map<string, { full_name: string | null }>;
  lastRpc: string[];
};

export const mockState: MockDbState = {
  killSwitch: true,
  unsubscribed: new Set(),
  suppressions: new Map(),
  claims: [],
  events: [],
  profiles: new Map(),
  lastRpc: [],
};

export function resetMockState(partial?: Partial<MockDbState>) {
  mockState.killSwitch = partial?.killSwitch ?? true;
  mockState.unsubscribed = partial?.unsubscribed ?? new Set();
  mockState.suppressions = partial?.suppressions ?? new Map();
  mockState.claims = partial?.claims ?? [];
  mockState.events = [];
  mockState.profiles = partial?.profiles ?? new Map();
  mockState.lastRpc = [];
}

function ok(data: unknown): RpcResult {
  return { data, error: null };
}

function err(message: string): RpcResult {
  return { data: null, error: { message } };
}

export function createClient(_url: string, _key: string, _opts?: unknown) {
  return {
    async rpc(name: string, args: Record<string, unknown> = {}): Promise<RpcResult> {
      mockState.lastRpc.push(name);

      if (name === 'claim_lifecycle_emails') {
        if (mockState.killSwitch) return ok([]);
        const rows = mockState.claims.splice(0, Number(args.p_limit ?? 20));
        return ok(rows);
      }

      if (name === 'revalidate_lifecycle_send_eligibility') {
        const id = String(args.p_outbox_id ?? '');
        const row = mockState.claims.find((c) => c.id === id) ??
          // claimed rows already removed — eligibility uses recipient from claim payload stored separately
          null;
        void row;
        // Look up by scanning events store — harness injects eligibility via claims meta
        const meta = (globalThis as { __elig?: Record<string, unknown> }).__elig?.[id];
        if (meta) return ok(meta);
        return ok({
          ok: true,
          recipient_email: 'optin@example.test',
          skip_reason: null,
        });
      }

      if (name === 'complete_lifecycle_email_claim') return ok(true);
      if (name === 'defer_lifecycle_email_after_dry_run') return ok(true);
      if (name === 'log_lifecycle_email_event') {
        mockState.events.push(args);
        return ok(null);
      }
      if (name === 'apply_lifecycle_unsubscribe') {
        const email = String(args.p_email ?? '').toLowerCase();
        const uid = String(args.p_user_id ?? '');
        if (!email || !uid) return err('invalid');
        mockState.unsubscribed.add(`${uid}|${email}`);
        return ok(true);
      }
      return err(`unknown_rpc:${name}`);
    },

    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(col: string, val: string) {
              return {
                async maybeSingle() {
                  if (table === 'profiles' && col === 'id') {
                    return { data: mockState.profiles.get(val) ?? { full_name: null }, error: null };
                  }
                  return { data: null, error: null };
                },
              };
            },
          };
        },
        upsert(row: Record<string, unknown>, _opts?: unknown) {
          if (table === 'email_suppressions') {
            const email = String(row.email ?? '').toLowerCase();
            mockState.suppressions.set(email, String(row.reason ?? ''));
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
}

export type SupabaseClient = ReturnType<typeof createClient>;
