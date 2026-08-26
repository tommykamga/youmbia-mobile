import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROFILE_PROVISIONING_ERROR_MESSAGE,
  ensureProfile,
  getCurrentProfile,
  getProfileSeedFromAuthUser,
  resetEnsureProfileLockForTests,
} from './profile';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
}));

const USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';
const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260826120000_handle_new_user_profile_provisioning.sql'
);

function authUser(overrides?: {
  id?: string;
  user_metadata?: Record<string, unknown>;
}) {
  return {
    id: overrides?.id ?? USER_ID,
    user_metadata: overrides?.user_metadata ?? {},
  };
}

function mockGetUser(user: ReturnType<typeof authUser> | null, error: { message: string } | null = null) {
  mocks.getUser.mockResolvedValue({
    data: { user },
    error,
  });
}

describe('handle_new_user migration contract', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('crée profiles.id = NEW.id via trigger AFTER INSERT ON auth.users', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.handle_new_user\(\)/);
    expect(sql).toMatch(/RETURNS trigger/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
    expect(sql).toMatch(/INSERT INTO public\.profiles \(id, full_name, avatar_url\)/);
    expect(sql).toMatch(/VALUES \(NEW\.id,/);
    expect(sql).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS on_auth_user_created ON auth\.users/);
    expect(sql).toMatch(/AFTER INSERT ON auth\.users/);
    expect(sql).toMatch(/EXECUTE FUNCTION public\.handle_new_user\(\)/);
  });

  it('mappe email / Google / Apple via raw_user_meta_data sans toucher shop/trust', () => {
    expect(sql).toMatch(/raw_user_meta_data ->> 'full_name'/);
    expect(sql).toMatch(/raw_user_meta_data ->> 'name'/);
    expect(sql).toMatch(/raw_user_meta_data ->> 'avatar_url'/);
    expect(sql).toMatch(/raw_user_meta_data ->> 'picture'/);
    expect(sql).not.toMatch(/shop_id/);
    expect(sql).not.toMatch(/seller_type/);
    expect(sql).not.toMatch(/trust_score/);
    expect(sql).not.toMatch(/is_banned/);
  });

  it('empêche user A de créer ou modifier le profil de B (INSERT/UPDATE own)', () => {
    expect(sql).toMatch(/policyname = 'profiles_insert_own'/);
    expect(sql).toMatch(/FOR INSERT/);
    expect(sql).toMatch(/WITH CHECK \(id = \(SELECT auth\.uid\(\)\)\)/);
    expect(sql).toMatch(/policyname = 'profiles_update_own'/);
    expect(sql).toMatch(/USING \(id = \(SELECT auth\.uid\(\)\)\)/);
    expect(sql).not.toMatch(/DROP POLICY/);
  });
});

describe('getProfileSeedFromAuthUser', () => {
  it('nouveau compte email → id = auth.users.id, metadata vides', () => {
    const seed = getProfileSeedFromAuthUser(authUser({ user_metadata: {} }));
    expect(seed).toEqual({ id: USER_ID, full_name: null, avatar_url: null });
    expect(seed.id).toBe(USER_ID);
  });

  it('nouveau compte Google → full_name + picture', () => {
    const seed = getProfileSeedFromAuthUser(
      authUser({
        user_metadata: {
          name: 'Marina Solange',
          picture: 'https://lh3.googleusercontent.com/a/photo',
        },
      })
    );
    expect(seed.id).toBe(USER_ID);
    expect(seed.full_name).toBe('Marina Solange');
    expect(seed.avatar_url).toBe('https://lh3.googleusercontent.com/a/photo');
  });

  it('nouveau compte Apple → full_name prioritaire sur name', () => {
    const seed = getProfileSeedFromAuthUser(
      authUser({
        user_metadata: {
          full_name: 'Tommy Kamga',
          name: 'ignored',
          avatar_url: 'https://apple.example/avatar.jpg',
        },
      })
    );
    expect(seed.id).toBe(USER_ID);
    expect(seed.full_name).toBe('Tommy Kamga');
    expect(seed.avatar_url).toBe('https://apple.example/avatar.jpg');
  });
});

describe('ensureProfile', () => {
  let upsertCalls: { payload: Record<string, unknown>; options: unknown }[];
  let updateCalls: Record<string, unknown>[];
  let selectResults: { data: unknown; error: unknown }[];

  beforeEach(() => {
    resetEnsureProfileLockForTests();
    upsertCalls = [];
    updateCalls = [];
    selectResults = [];
    mocks.from.mockReset();
    mocks.getUser.mockReset();

    mocks.from.mockImplementation((table: string) => {
      expect(table).toBe('profiles');
      return {
        select: () => ({
          eq: (column: string, value: string) => {
            expect(column).toBe('id');
            expect(value).toBe(USER_ID);
            expect(value).not.toBe(OTHER_ID);
            return {
              maybeSingle: async () => selectResults.shift() ?? { data: null, error: null },
            };
          },
        }),
        update: (payload: Record<string, unknown>) => {
          updateCalls.push(payload);
          return {
            eq: (column: string, value: string) => {
              expect(column).toBe('id');
              expect(value).toBe(USER_ID);
              return {
                select: () => ({
                  maybeSingle: async () => ({
                    data: { id: USER_ID, ...payload },
                    error: null,
                  }),
                }),
              };
            },
          };
        },
        upsert: (payload: Record<string, unknown>, options: unknown) => {
          upsertCalls.push({ payload, options });
          expect(payload.id).toBe(USER_ID);
          expect(payload.id).not.toBe(OTHER_ID);
          expect(payload).not.toHaveProperty('shop_id');
          expect(payload).not.toHaveProperty('seller_type');
          expect(payload).not.toHaveProperty('phone');
          expect(payload).not.toHaveProperty('bio');
          return Promise.resolve({ data: null, error: null });
        },
      };
    });
  });

  it('profil existant → aucun upsert, aucun écrasement (reconnexion)', async () => {
    mockGetUser(authUser());
    const existing = {
      id: USER_ID,
      full_name: 'Nom déjà enregistré',
      avatar_url: 'path/old.jpg',
      phone: '+237600000001',
      seller_type: 'pro',
      shop_id: 'shop-1',
      is_banned: false,
    };
    selectResults.push({ data: existing, error: null });

    const result = await ensureProfile();

    expect(result.error).toBeNull();
    expect(result.data).toEqual(existing);
    expect(upsertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it('profil absent → création avec metadata, profiles.id === auth.users.id', async () => {
    mockGetUser(
      authUser({
        user_metadata: { full_name: 'Marina Solange', picture: 'https://img.test/a.png' },
      })
    );
    selectResults.push({ data: null, error: null });
    const created = {
      id: USER_ID,
      full_name: 'Marina Solange',
      avatar_url: 'https://img.test/a.png',
      phone: null,
      shop_id: null,
      seller_type: 'individual',
    };
    selectResults.push({ data: created, error: null });

    const result = await ensureProfile();

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe(USER_ID);
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].payload).toEqual({
      id: USER_ID,
      full_name: 'Marina Solange',
      avatar_url: 'https://img.test/a.png',
    });
    expect(upsertCalls[0].options).toEqual({ onConflict: 'id', ignoreDuplicates: true });
  });

  it("user A ne peut pas cibler le profil de B (toujours auth.uid())", async () => {
    mockGetUser(authUser({ id: USER_ID }));
    selectResults.push({ data: null, error: null });
    selectResults.push({
      data: { id: USER_ID, full_name: null, avatar_url: null },
      error: null,
    });

    await ensureProfile();

    expect(upsertCalls[0].payload.id).toBe(USER_ID);
    expect(upsertCalls[0].payload.id).not.toBe(OTHER_ID);
  });

  it('échec upsert → message métier, pas de SQL brut', async () => {
    mockGetUser(authUser());
    selectResults.push({ data: null, error: null });
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
      upsert: () =>
        Promise.resolve({
          data: null,
          error: {
            message:
              'insert or update on table "profiles" violates foreign key constraint "profiles_id_fkey"',
          },
        }),
    }));

    const result = await ensureProfile();

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe(PROFILE_PROVISIONING_ERROR_MESSAGE);
    expect(result.error?.message.toLowerCase()).not.toContain('fkey');
    expect(result.error?.message.toLowerCase()).not.toContain('violates');
  });

  it('sans session → erreur contrôlée', async () => {
    mockGetUser(null);
    const result = await ensureProfile();
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('Non connecté');
    expect(upsertCalls).toHaveLength(0);
  });

  it('profil avec full_name existant → jamais écrasé par metadata Auth', async () => {
    mockGetUser(authUser({ user_metadata: { full_name: 'Nom Apple' } }));
    selectResults.push({
      data: {
        id: USER_ID,
        full_name: 'Nom déjà enregistré',
        avatar_url: 'keep.jpg',
        phone: '+237600000001',
      },
      error: null,
    });

    const result = await ensureProfile();

    expect(result.data?.full_name).toBe('Nom déjà enregistré');
    expect(result.data?.avatar_url).toBe('keep.jpg');
    expect(updateCalls).toHaveLength(0);
    expect(upsertCalls).toHaveLength(0);
  });

  it('Apple : profil créé sans nom, puis metadata → full_name enrichi seulement si vide', async () => {
    mockGetUser(authUser({ user_metadata: {} }));
    selectResults.push({ data: null, error: null });
    selectResults.push({
      data: { id: USER_ID, full_name: null, avatar_url: null },
      error: null,
    });

    const created = await ensureProfile();
    expect(created.data?.full_name ?? null).toBeNull();
    expect(upsertCalls).toHaveLength(1);

    mockGetUser(authUser({ user_metadata: { full_name: 'Tommy Kamga' } }));
    selectResults.push({
      data: { id: USER_ID, full_name: null, avatar_url: null, phone: null },
      error: null,
    });

    const filled = await ensureProfile();

    expect(updateCalls).toEqual([{ full_name: 'Tommy Kamga' }]);
    expect(filled.data?.full_name).toBe('Tommy Kamga');
    expect(upsertCalls).toHaveLength(1);
  });

  it('appels concurrents → un seul SELECT/UPSERT', async () => {
    mockGetUser(
      authUser({
        user_metadata: { full_name: 'Marina Solange' },
      })
    );

    let releaseFirstSelect: ((value: { data: unknown; error: unknown }) => void) | undefined;
    let selectCount = 0;
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            selectCount += 1;
            if (selectCount === 1) {
              return new Promise<{ data: unknown; error: unknown }>((resolve) => {
                releaseFirstSelect = resolve;
              });
            }
            return Promise.resolve({
              data: { id: USER_ID, full_name: 'Marina Solange', avatar_url: null },
              error: null,
            });
          },
        }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
      upsert: (payload: Record<string, unknown>, options: unknown) => {
        upsertCalls.push({ payload, options });
        return Promise.resolve({ data: null, error: null });
      },
    }));

    const p1 = ensureProfile();
    const p2 = ensureProfile();
    await Promise.resolve();
    expect(selectCount).toBe(1);

    releaseFirstSelect?.({ data: null, error: null });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1.data?.id).toBe(USER_ID);
    expect(r2.data?.id).toBe(USER_ID);
    expect(upsertCalls).toHaveLength(1);
  });
});

describe('getCurrentProfile self-healing', () => {
  let upsertCalls: { payload: Record<string, unknown> }[];
  let selectResults: { data: unknown; error: unknown }[];
  let fromCallCount: number;

  beforeEach(() => {
    resetEnsureProfileLockForTests();
    upsertCalls = [];
    selectResults = [];
    fromCallCount = 0;
    mocks.from.mockReset();
    mocks.getUser.mockReset();

    mocks.from.mockImplementation((table: string) => {
      expect(table).toBe('profiles');
      fromCallCount += 1;
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => selectResults.shift() ?? { data: null, error: null },
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
        upsert: (payload: Record<string, unknown>) => {
          upsertCalls.push({ payload });
          return Promise.resolve({ data: null, error: null });
        },
      };
    });
  });

  it('ligne présente → lecture seule, pas de ensure/écriture', async () => {
    mockGetUser(authUser());
    const existing = {
      id: USER_ID,
      full_name: 'Marina',
      avatar_url: null,
      phone: null,
      is_banned: null,
      created_at: '2026-01-01',
    };
    selectResults.push({ data: existing, error: null });

    const result = await getCurrentProfile();

    expect(result.data).toEqual(existing);
    expect(upsertCalls).toHaveLength(0);
    expect(fromCallCount).toBe(1);
  });

  it('ligne absente → self-healing via ensureProfile', async () => {
    mockGetUser(authUser({ user_metadata: { name: 'Marina Solange' } }));
    selectResults.push({ data: null, error: null });
    selectResults.push({ data: null, error: null });
    selectResults.push({
      data: { id: USER_ID, full_name: 'Marina Solange', avatar_url: null },
      error: null,
    });

    const result = await getCurrentProfile();

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe(USER_ID);
    expect(result.data?.full_name).toBe('Marina Solange');
    expect(upsertCalls).toHaveLength(1);
    expect(fromCallCount).toBeLessThanOrEqual(4);
  });

  it('ensure échoue → fallback UI, pas de SQL brut, pas de boucle', async () => {
    mockGetUser(authUser());
    selectResults.push({ data: null, error: null });
    selectResults.push({
      data: null,
      error: { message: 'insert or update on table "profiles" violates foreign key' },
    });

    const result = await getCurrentProfile();

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe(USER_ID);
    expect(result.data?.full_name).toBeNull();
    expect(JSON.stringify(result).toLowerCase()).not.toContain('violates');
    expect(fromCallCount).toBeLessThanOrEqual(4);
  });
});
