import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signUp } from './signInOut';

const authMocks = vi.hoisted(() => ({
  signUp: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signUp: authMocks.signUp } },
}));

vi.mock('@/lib/analytics', () => ({
  captureAuthSuccess: vi.fn(),
  trackSignOut: vi.fn(),
}));

vi.mock('@/services/notifications', () => ({
  unregisterCurrentPushToken: vi.fn(),
}));

describe('signUp consent metadata boundary', () => {
  beforeEach(() => {
    authMocks.signUp.mockReset();
    authMocks.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });
  });

  it('does not put marketing consent in client-controlled Auth metadata', async () => {
    await signUp(' USER@example.test ', 'password123');

    expect(authMocks.signUp).toHaveBeenCalledWith({
      email: 'USER@example.test',
      password: 'password123',
    });
  });
});
