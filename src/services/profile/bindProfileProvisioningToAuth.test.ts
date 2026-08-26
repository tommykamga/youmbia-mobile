import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import {
  provisionProfileOnAuthEvent,
  resetProfileProvisioningAuthForTests,
  startProfileProvisioningOnAuth,
} from './bindProfileProvisioningToAuth';

const mocks = vi.hoisted(() => ({
  ensureProfile: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock('./profile', () => ({
  ensureProfile: mocks.ensureProfile,
}));

vi.mock('@/services/auth', () => ({
  onAuthStateChange: mocks.onAuthStateChange,
}));

vi.mock('@/lib/supabase', () => ({
  supabaseRuntime: { isConfigured: true, canPersistSession: true },
}));

const USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';

function sessionFor(userId: string): Session {
  return { user: { id: userId } } as Session;
}

describe('provisionProfileOnAuthEvent', () => {
  beforeEach(() => {
    resetProfileProvisioningAuthForTests();
    mocks.ensureProfile.mockReset();
    mocks.ensureProfile.mockResolvedValue({
      data: { id: USER_ID, full_name: null, avatar_url: null },
      error: null,
    });
  });

  it('utilisateur déconnecté → aucun ensure', async () => {
    await provisionProfileOnAuthEvent('SIGNED_OUT', null);
    await provisionProfileOnAuthEvent('INITIAL_SESSION', null);
    expect(mocks.ensureProfile).not.toHaveBeenCalled();
  });

  it('session restaurée (INITIAL_SESSION) + profil à créer → ensure', async () => {
    await provisionProfileOnAuthEvent('INITIAL_SESSION', sessionFor(USER_ID));
    expect(mocks.ensureProfile).toHaveBeenCalledTimes(1);
  });

  it('SIGNED_IN → ensure', async () => {
    await provisionProfileOnAuthEvent('SIGNED_IN', sessionFor(USER_ID));
    expect(mocks.ensureProfile).toHaveBeenCalledTimes(1);
  });

  it('événements Auth successifs après succès → pas de ensure supplémentaire', async () => {
    await provisionProfileOnAuthEvent('INITIAL_SESSION', sessionFor(USER_ID));
    await provisionProfileOnAuthEvent('SIGNED_IN', sessionFor(USER_ID));
    await provisionProfileOnAuthEvent('TOKEN_REFRESHED', sessionFor(USER_ID));
    expect(mocks.ensureProfile).toHaveBeenCalledTimes(1);
  });

  it('erreur réseau ensure → non bloquant, nouvel essai ultérieur possible', async () => {
    mocks.ensureProfile.mockResolvedValueOnce({
      data: null,
      error: { message: 'Impossible de préparer votre profil vendeur. Réessayez dans quelques instants.' },
    });

    await expect(
      provisionProfileOnAuthEvent('INITIAL_SESSION', sessionFor(USER_ID))
    ).resolves.toBeUndefined();
    expect(mocks.ensureProfile).toHaveBeenCalledTimes(1);

    mocks.ensureProfile.mockResolvedValueOnce({
      data: { id: USER_ID, full_name: null, avatar_url: null },
      error: null,
    });
    await provisionProfileOnAuthEvent('TOKEN_REFRESHED', sessionFor(USER_ID));
    expect(mocks.ensureProfile).toHaveBeenCalledTimes(2);
  });

  it('USER_UPDATED (Apple) relance ensure même après un succès', async () => {
    await provisionProfileOnAuthEvent('SIGNED_IN', sessionFor(USER_ID));
    await provisionProfileOnAuthEvent('USER_UPDATED', sessionFor(USER_ID));
    expect(mocks.ensureProfile.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('user A → uniquement profil A (ensure sans id tiers)', async () => {
    await provisionProfileOnAuthEvent('SIGNED_IN', sessionFor(USER_ID));
    expect(mocks.ensureProfile).toHaveBeenCalledTimes(1);
    expect(sessionFor(USER_ID).user.id).not.toBe(OTHER_ID);
  });

  it('ensure qui throw → application non bloquée', async () => {
    mocks.ensureProfile.mockRejectedValueOnce(new Error('Network request failed'));
    await expect(
      provisionProfileOnAuthEvent('SIGNED_IN', sessionFor(USER_ID))
    ).resolves.toBeUndefined();
  });
});

describe('startProfileProvisioningOnAuth', () => {
  beforeEach(() => {
    resetProfileProvisioningAuthForTests();
    mocks.onAuthStateChange.mockReset();
    mocks.onAuthStateChange.mockReturnValue(() => {});
    mocks.ensureProfile.mockReset();
    mocks.ensureProfile.mockResolvedValue({
      data: { id: USER_ID, full_name: null },
      error: null,
    });
  });

  it("n'enregistre qu'un seul listener Auth (refcount)", () => {
    const stop1 = startProfileProvisioningOnAuth();
    const stop2 = startProfileProvisioningOnAuth();
    expect(mocks.onAuthStateChange).toHaveBeenCalledTimes(1);
    stop1();
    stop2();
  });
});
