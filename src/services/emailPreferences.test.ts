import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

describe('emailPreferences', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getSession.mockReset();
    mocks.maybeSingle.mockReset();
    mocks.single.mockReset();
    mocks.upsert.mockReset();
    mocks.update.mockReset();
    mocks.insert.mockReset();
    mocks.eq.mockReset();
    mocks.select.mockReset();
    mocks.from.mockReset();
    mocks.rpc.mockReset();

    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.select.mockReturnValue({ eq: mocks.eq, single: mocks.single });
    mocks.upsert.mockReturnValue({ select: () => ({ single: mocks.single }) });
    mocks.update.mockReturnValue({
      eq: () => ({
        select: () => ({ maybeSingle: mocks.maybeSingle }),
      }),
    });
    mocks.insert.mockReturnValue({ select: () => ({ single: mocks.single }) });
    mocks.from.mockImplementation(() => ({
      select: mocks.select,
      upsert: mocks.upsert,
      update: mocks.update,
      insert: mocks.insert,
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
        optional_draft_reminders_opt_out: false,
        draft_reminders_notice_acknowledged_at: null,
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
        optional_draft_reminders_opt_out: false,
        draft_reminders_notice_acknowledged_at: null,
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

  it('opposition draft met à jour optional_draft_reminders_opt_out sans toucher marketing', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        marketing_opt_in: true,
        marketing_opt_in_at: '2026-10-17T00:00:00.000Z',
        marketing_opt_in_source: 'settings',
        unsubscribed_at: null,
        optional_draft_reminders_opt_out: true,
        draft_reminders_notice_acknowledged_at: null,
      },
      error: null,
    });
    const { setDraftRemindersAllowed } = await import('./emailPreferences');
    const result = await setDraftRemindersAllowed(false);
    expect(result.error).toBeNull();
    expect(result.data?.optional_draft_reminders_opt_out).toBe(true);
    expect(result.data?.marketing_opt_in).toBe(true);
    expect(mocks.update).toHaveBeenCalled();
    const payload = mocks.update.mock.calls[0][0] as {
      optional_draft_reminders_opt_out: boolean;
      marketing_opt_in?: boolean;
    };
    expect(payload.optional_draft_reminders_opt_out).toBe(true);
    expect(payload.marketing_opt_in).toBeUndefined();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('ack notice appelle le RPC sans p_user_id et vérifie la persistance', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        marketing_opt_in: false,
        marketing_opt_in_at: null,
        marketing_opt_in_source: null,
        unsubscribed_at: null,
        optional_draft_reminders_opt_out: false,
        draft_reminders_notice_acknowledged_at: '2026-10-18T00:00:00.000Z',
      },
      error: null,
    });
    const { acknowledgeDraftRemindersNotice } = await import('./emailPreferences');
    const result = await acknowledgeDraftRemindersNotice();
    expect(result.error).toBeNull();
    expect(result.data?.draft_reminders_notice_acknowledged_at).toBeTruthy();
    expect(mocks.rpc).toHaveBeenCalledWith('acknowledge_lifecycle_draft_reminders_notice');
    expect(mocks.rpc.mock.calls[0]).toHaveLength(1);
  });

  it('ack notice échoue si la persistance n’est pas vérifiable', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        marketing_opt_in: false,
        marketing_opt_in_at: null,
        marketing_opt_in_source: null,
        unsubscribed_at: null,
        optional_draft_reminders_opt_out: false,
        draft_reminders_notice_acknowledged_at: null,
      },
      error: null,
    });
    const { acknowledgeDraftRemindersNotice } = await import('./emailPreferences');
    const result = await acknowledgeDraftRemindersNotice();
    expect(result.data).toBeNull();
    expect(result.error?.message).toBeTruthy();
  });

  it('ack refuse sans session', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { acknowledgeDraftRemindersNotice } = await import('./emailPreferences');
    const result = await acknowledgeDraftRemindersNotice();
    expect(result.data).toBeNull();
    expect(result.error?.message).toMatch(/Connexion/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
