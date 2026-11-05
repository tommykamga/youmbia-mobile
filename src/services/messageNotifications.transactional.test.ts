import { describe, expect, it, vi } from 'vitest';
import { shouldScheduleLocalMessageNotification } from './messageNotifications';
const runtime = vi.hoisted(() => ({ native: true }));
vi.mock('@/services/auth', () => ({ getSession: vi.fn() }));
vi.mock('@/services/conversations', () => ({ getConversations: vi.fn() }));
vi.mock('@/services/notifications', () => ({
  isPushNotificationsAvailable: () => runtime.native,
  getPushPermissionStatus: vi.fn(), initializeNotifications: vi.fn(), reserveNotificationDispatch: vi.fn(),
}));
describe('transactional message local fallback', () => {
  it('never duplicates remote push on native builds, including when the local token cache is missing', async () => {
    runtime.native = true;
    expect(await shouldScheduleLocalMessageNotification()).toBe(false);
  });
  it('preserves the local fallback in Expo Go', async () => {
    runtime.native = false;
    expect(await shouldScheduleLocalMessageNotification()).toBe(true);
  });
});
