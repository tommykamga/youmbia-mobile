import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signIn, signInWithOtp, resetPasswordForEmail, signOut } from './auth/signInOut';
import { toggleFavorite } from './favorites/toggleFavorite';
import { sendMessage } from './conversations/sendMessage';

const m = vi.hoisted(() => ({ getUser: vi.fn(), signIn: vi.fn(), otp: vi.fn(), reset: vi.fn(), signOut: vi.fn(), cleanup: vi.fn(), from: vi.fn(),
  capture: vi.fn(), trackOut: vi.fn(), added: vi.fn(), removed: vi.fn(), sent: vi.fn(), failed: vi.fn(), invoke: vi.fn(),
  select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), single: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: m.getUser, signInWithPassword: m.signIn, signInWithOtp: m.otp, resetPasswordForEmail: m.reset, signOut: m.signOut }, from: m.from, functions: { invoke: m.invoke } } }));
vi.mock('@/lib/analytics', () => ({ captureAuthSuccess: m.capture, trackSignOut: m.trackOut, trackListingFavorited: m.added, trackListingUnfavorited: m.removed, trackMessageSent: m.sent, trackMessageSendFailed: m.failed }));
vi.mock('@/services/notifications', () => ({ unregisterCurrentPushToken: m.cleanup }));
const q = { select: m.select, insert: m.insert, update: m.update, delete: m.delete, eq: m.eq, maybeSingle: m.maybeSingle, single: m.single,
  then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve({ count: 1, error: null }).then(resolve, reject) };
beforeEach(() => {
  vi.clearAllMocks();
  m.getUser.mockResolvedValue({ data: { user: { id: 'qa-user' } }, error: null });
  m.signIn.mockResolvedValue({ error: null }); m.otp.mockResolvedValue({ error: null }); m.reset.mockResolvedValue({ error: null });
  m.signOut.mockResolvedValue({ error: null }); m.cleanup.mockResolvedValue({ ok: true }); m.trackOut.mockResolvedValue(undefined);
  m.from.mockReturnValue(q); for (const fn of [m.select, m.insert, m.update, m.delete, m.eq]) fn.mockReturnValue(q);
  m.maybeSingle.mockResolvedValue({ data: null, error: null });
  m.single.mockResolvedValue({ data: { id: 'qa-message', conversation_id: 'qa-conversation', sender_id: 'qa-user', body: 'hello', created_at: '2026-11-01T00:00:00Z', read_at: null }, error: null });
  m.invoke.mockResolvedValue({ error: null });
});
describe('V5-07 previously unqualified critical service boundaries (mock transport)', () => {
  it('Auth rejects failed credentials and never emits success', async () => {
    m.signIn.mockResolvedValueOnce({ error: { message: 'invalid login' } });
    expect((await signIn(' qa@example.invalid ', 'bad')).ok).toBe(false); expect(m.capture).not.toHaveBeenCalled();
  });
  it('OTP/reset transport failures remain errors, not successful requests', async () => {
    m.otp.mockRejectedValueOnce(new Error('network offline')); m.reset.mockResolvedValueOnce({ error: { message: 'invalid redirect' } });
    expect((await signInWithOtp('qa@example.invalid')).ok).toBe(false); expect((await resetPasswordForEmail('qa@example.invalid')).ok).toBe(false);
  });
  it('logout clears the device token before signing out', async () => {
    await signOut(); expect(m.cleanup.mock.invocationCallOrder[0]).toBeLessThan(m.signOut.mock.invocationCallOrder[0]); expect(m.signOut).toHaveBeenCalledTimes(1);
  });
  it('favorite requires an authenticated actor without any mutation', async () => {
    m.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await toggleFavorite('qa-listing')).error).not.toBeNull(); expect(m.from).not.toHaveBeenCalled();
  });
  it('failed favorite persistence does not become success or analytics', async () => {
    m.insert.mockResolvedValueOnce({ error: { message: 'permission denied' } });
    expect((await toggleFavorite('qa-listing')).error).not.toBeNull(); expect(m.added).not.toHaveBeenCalled();
  });
  it('favorite removal failure leaves an error and no unfavorite event', async () => {
    m.maybeSingle.mockResolvedValueOnce({ data: { listing_id: 'qa-listing' }, error: null });
    m.eq.mockReturnValueOnce(q).mockReturnValueOnce(q).mockReturnValueOnce(q).mockResolvedValueOnce({ error: { message: 'network failure' } });
    expect((await toggleFavorite('qa-listing')).error).not.toBeNull(); expect(m.removed).not.toHaveBeenCalled();
  });
  it('message cannot be sent anonymously or with an empty body', async () => {
    m.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await sendMessage('qa-conversation', 'hello')).error).not.toBeNull();
    expect((await sendMessage('qa-conversation', '   ')).error).not.toBeNull(); expect(m.insert).not.toHaveBeenCalled();
  });
  it('rejected message insert never triggers push or success analytics', async () => {
    m.single.mockResolvedValueOnce({ data: null, error: { message: 'RLS denied' } });
    expect((await sendMessage('qa-conversation', 'hello')).error).not.toBeNull(); expect(m.invoke).not.toHaveBeenCalled(); expect(m.sent).not.toHaveBeenCalled();
  });
  it('a committed message remains successful when push transport fails', async () => {
    m.invoke.mockRejectedValueOnce(new Error('push offline'));
    const result = await sendMessage('qa-conversation', ' hello ');
    expect(result.error).toBeNull(); expect(result.data?.id).toBe('qa-message'); expect(m.insert).toHaveBeenCalledWith({ conversation_id: 'qa-conversation', sender_id: 'qa-user', body: 'hello' });
    expect(m.sent).toHaveBeenCalledTimes(1);
  });
});
