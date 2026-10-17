import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
  upsert: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    from: mocks.from,
  },
}));

describe('emailPreferences', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getSession.mockReset();
    mocks.maybeSingle.mockReset();
    mocks.single.mockReset();
    mocks.upsert.mockReset();
    mocks.eq.mockReset();
    mocks.select.mockReset();
    mocks.from.mockReset();

    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.upsert.mockReturnValue({ select: () => ({ single: mocks.single }) });
    mocks.from.mockImplementation(() => ({
      select: mocks.select,
      upsert: mocks.upsert,
    }));
  });

  it('refuse sans session', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { setMarketingEmailOptIn } = await import('./emailPreferences');
    const result = await setMarketingEmailOptIn(true, 'signup');
    expect(result.data).toBeNull();
    expect(result.error?.message).toMatch(/Connexion/);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('opt-in écrit marketing_opt_in true + source signup', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });
    mocks.single.mockResolvedValue({
      data: {
        marketing_opt_in: true,
        marketing_opt_in_at: '2026-10-17T00:00:00.000Z',
        marketing_opt_in_source: 'signup',
        unsubscribed_at: null,
      },
      error: null,
    });
    const { setMarketingEmailOptIn } = await import('./emailPreferences');
    const result = await setMarketingEmailOptIn(true, 'signup');
    expect(result.error).toBeNull();
    expect(result.data?.marketing_opt_in).toBe(true);
    expect(mocks.upsert).toHaveBeenCalled();
    const payload = mocks.upsert.mock.calls[0][0] as { marketing_opt_in: boolean };
    expect(payload.marketing_opt_in).toBe(true);
  });

  it('opt-out pose unsubscribed_at et marketing_opt_in false', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });
    mocks.single.mockResolvedValue({
      data: {
        marketing_opt_in: false,
        marketing_opt_in_at: null,
        marketing_opt_in_source: 'settings',
        unsubscribed_at: '2026-10-17T00:00:00.000Z',
      },
      error: null,
    });
    const { setMarketingEmailOptIn } = await import('./emailPreferences');
    const result = await setMarketingEmailOptIn(false, 'settings');
    expect(result.data?.marketing_opt_in).toBe(false);
    expect(result.data?.unsubscribed_at).toBeTruthy();
    const payload = mocks.upsert.mock.calls[0][0] as {
      marketing_opt_in: boolean;
      unsubscribed_at: string | null;
    };
    expect(payload.marketing_opt_in).toBe(false);
    expect(payload.unsubscribed_at).toBeTruthy();
  });
});
