import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getListingHrefFromUrl } from '@/lib/listingDeepLink';

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  setSession: vi.fn(),
  getSession: vi.fn(),
  captureAuthSuccess: vi.fn(),
  linkingParse: vi.fn((url: string) => {
    try {
      const u = new URL(url);
      const queryParams: Record<string, string> = {};
      u.searchParams.forEach((value, key) => {
        queryParams[key] = value;
      });
      return { path: u.pathname.replace(/^\//, ''), queryParams };
    } catch {
      return { path: null, queryParams: {} };
    }
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: mocks.verifyOtp,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      setSession: mocks.setSession,
      getSession: mocks.getSession,
    },
  },
}));

vi.mock('@/lib/analytics', () => ({
  captureAuthSuccess: mocks.captureAuthSuccess,
  setListingViewSource: vi.fn(),
  getListingViewSource: vi.fn(() => 'other'),
}));

vi.mock('expo-linking', () => ({
  parse: mocks.linkingParse,
}));

async function loadHandler() {
  vi.resetModules();
  mocks.verifyOtp.mockReset();
  mocks.exchangeCodeForSession.mockReset();
  mocks.setSession.mockReset();
  mocks.getSession.mockReset();
  mocks.captureAuthSuccess.mockReset();
  return import('./handleSupabaseAuthDeepLink');
}

const FAKE_TOKEN = 'tok_test_not_a_real_secret_abc';
const VALID_MAGIC =
  `https://www.youmbia.com/auth/confirm?token_hash=${FAKE_TOKEN}&type=magiclink`;

const sessionUser = { id: 'user-1', email: 'u@example.com' };
const session = { user: sessionUser, access_token: 'at', refresh_token: 'rt' };

describe('handleSupabaseAuthDeepLink — Magic Link HTTPS', () => {
  beforeEach(() => {
    vi.stubGlobal('__DEV__', false);
  });

  it('accepte une URL Magic Link YOUMBIA valide et crée la session via verifyOtp', async () => {
    const mod = await loadHandler();
    mocks.verifyOtp.mockResolvedValue({ data: { session }, error: null });

    const result = await mod.handleSupabaseAuthDeepLink(VALID_MAGIC);

    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      type: 'magiclink',
      token_hash: FAKE_TOKEN,
    });
    expect(result).toEqual({ consumed: true, navigateTo: '/(tabs)/home' });
    expect(mocks.captureAuthSuccess).toHaveBeenCalledWith(sessionUser, { method: 'email' });
  });

  it('reconnaît uniquement /auth/confirm HTTPS sur hôtes YOUMBIA', async () => {
    const mod = await loadHandler();
    expect(mod.isYoumbiaMagicLinkConfirmUrl(VALID_MAGIC)).toBe(true);
    expect(
      mod.isYoumbiaMagicLinkConfirmUrl(
        'https://youmbia.com/auth/confirm?token_hash=x&type=magiclink'
      )
    ).toBe(true);
    expect(
      mod.isYoumbiaMagicLinkConfirmUrl('https://www.youmbia.com/auth/confirm/')
    ).toBe(true);
    expect(
      mod.isYoumbiaMagicLinkConfirmUrl(
        'http://www.youmbia.com/auth/confirm?token_hash=x&type=magiclink'
      )
    ).toBe(false);
    expect(
      mod.isYoumbiaMagicLinkConfirmUrl(
        'https://www.youmbia.com/annonce/abc?token_hash=x&type=magiclink'
      )
    ).toBe(false);
  });

  it('rejette une URL malformée (non URL) sans appeler verifyOtp', async () => {
    const mod = await loadHandler();
    const result = await mod.handleSupabaseAuthDeepLink('not a url%%%');
    expect(result).toEqual({ consumed: false });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('rejette une URL externe même avec token_hash', async () => {
    const mod = await loadHandler();
    const result = await mod.handleSupabaseAuthDeepLink(
      `https://evil.example/auth/confirm?token_hash=${FAKE_TOKEN}&type=magiclink`
    );
    expect(result).toEqual({ consumed: false });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('gère un token_hash absent', async () => {
    const mod = await loadHandler();
    const result = await mod.handleSupabaseAuthDeepLink(
      'https://www.youmbia.com/auth/confirm?type=magiclink'
    );
    expect(result.consumed).toBe(true);
    if (result.consumed) {
      expect(result.errorMessage).toMatch(/incomplet/i);
      expect(result.navigateTo).toBe('/(auth)/login');
    }
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('rejette un type autre que magiclink', async () => {
    const mod = await loadHandler();
    const result = await mod.handleSupabaseAuthDeepLink(
      `https://www.youmbia.com/auth/confirm?token_hash=${FAKE_TOKEN}&type=recovery`
    );
    expect(result.consumed).toBe(true);
    if (result.consumed) {
      expect(result.errorMessage).toMatch(/invalide/i);
    }
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('gère un token expiré sans exposer le token dans le message', async () => {
    const mod = await loadHandler();
    mocks.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: { message: 'Token has expired or is invalid', code: 'otp_expired' },
    });

    const result = await mod.handleSupabaseAuthDeepLink(VALID_MAGIC);

    expect(result.consumed).toBe(true);
    if (result.consumed) {
      expect(result.errorMessage).toMatch(/expiré|déjà été utilisé/i);
      expect(result.errorMessage).not.toContain(FAKE_TOKEN);
      expect(JSON.stringify(result)).not.toContain(FAKE_TOKEN);
    }
  });

  it('déduplique les ouvertures concurrentes (un seul verifyOtp)', async () => {
    const mod = await loadHandler();
    let resolveVerify!: (value: unknown) => void;
    mocks.verifyOtp.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveVerify = resolve;
        })
    );

    const p1 = mod.handleSupabaseAuthDeepLink(VALID_MAGIC);
    const p2 = mod.handleSupabaseAuthDeepLink(VALID_MAGIC);

    resolveVerify!({ data: { session }, error: null });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ consumed: true, navigateTo: '/(tabs)/home' });
    expect(r2).toEqual({ consumed: true, navigateTo: '/(tabs)/home' });

    const r3 = await mod.handleSupabaseAuthDeepLink(VALID_MAGIC);
    expect(r3).toEqual({ consumed: true, navigateTo: null });
    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
  });

  it('déduplique www et apex pour le même token_hash', async () => {
    const mod = await loadHandler();
    mocks.verifyOtp.mockResolvedValue({ data: { session }, error: null });

    const www = VALID_MAGIC;
    const apex = `https://youmbia.com/auth/confirm?token_hash=${FAKE_TOKEN}&type=magiclink`;

    const r1 = await mod.handleSupabaseAuthDeepLink(www);
    const r2 = await mod.handleSupabaseAuthDeepLink(apex);

    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ consumed: true, navigateTo: '/(tabs)/home' });
    expect(r2).toEqual({ consumed: true, navigateTo: null });
  });
});

describe('handleSupabaseAuthDeepLink — non-régression OAuth / PKCE', () => {
  beforeEach(() => {
    vi.stubGlobal('__DEV__', false);
  });

  it('conserve exchangeCodeForSession pour un callback custom-scheme PKCE', async () => {
    const mod = await loadHandler();
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session },
      error: null,
    });

    const url = 'youmbiamobile://auth/callback?code=pkce-code-1';
    const result = await mod.handleSupabaseAuthDeepLink(url);

    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('pkce-code-1');
    expect(result).toEqual({ consumed: true, navigateTo: '/(tabs)/home' });
  });

  it('conserve setSession pour implicit tokens en custom-scheme', async () => {
    const mod = await loadHandler();
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.setSession.mockResolvedValue({ data: { session }, error: null });

    const url =
      'youmbiamobile://#access_token=access-xyz&refresh_token=refresh-xyz&type=bearer';
    const result = await mod.handleSupabaseAuthDeepLink(url);

    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.setSession).toHaveBeenCalledWith({
      access_token: 'access-xyz',
      refresh_token: 'refresh-xyz',
    });
    expect(result.consumed).toBe(true);
  });

  it('ne traite pas une URL HTTPS d’annonce comme callback OAuth', async () => {
    const mod = await loadHandler();
    const result = await mod.handleSupabaseAuthDeepLink(
      'https://www.youmbia.com/annonce/listing-123'
    );
    expect(result).toEqual({ consumed: false });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});

describe('non-régression liens annonces', () => {
  it('résout toujours /annonce/{id} vers /listing/{id}', () => {
    expect(getListingHrefFromUrl('https://www.youmbia.com/annonce/abc-123')).toBe(
      '/listing/abc-123'
    );
    expect(getListingHrefFromUrl('https://youmbia.com/annonce/abc-123')).toBe(
      '/listing/abc-123'
    );
    expect(getListingHrefFromUrl('youmbiamobile://annonce/abc-123')).toBe(
      '/listing/abc-123'
    );
  });

  it('ne confond pas /auth/confirm avec une annonce', () => {
    expect(
      getListingHrefFromUrl(
        `https://www.youmbia.com/auth/confirm?token_hash=${FAKE_TOKEN}&type=magiclink`
      )
    ).toBeNull();
  });
});
