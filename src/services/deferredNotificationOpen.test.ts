import { describe, expect, it, vi } from 'vitest';
import { createDeferredNotificationOpenCoordinator } from './deferredNotificationOpen';

type Open = {
  id: string;
  target: string | null;
  source: 'cold_start' | 'listener';
};

function setup() {
  const consume = vi.fn<(notification: Open) => void>();
  const onConsumed = vi.fn<(notification: Open) => void>();
  const onError = vi.fn<(error: unknown) => void>();
  const coordinator = createDeferredNotificationOpenCoordinator<Open>({
    getKey: (notification) => notification.id,
    consume,
    onConsumed,
    onError,
  });
  return { coordinator, consume, onConsumed, onError };
}

describe('deferred notification open coordinator', () => {
  it('allows a normal cold start with no notification to complete', async () => {
    const { coordinator, consume } = setup();
    coordinator.setNavigationReady(true);
    coordinator.setSessionReady(true);

    await coordinator.readColdStartOnce(async () => null);

    expect(coordinator.getPendingCount()).toBe(0);
    expect(consume).not.toHaveBeenCalled();
  });

  it('consumes a notification without a destination without blocking startup', () => {
    const { coordinator, consume } = setup();
    coordinator.setNavigationReady(true);
    coordinator.setSessionReady(true);

    coordinator.enqueue({ id: 'no-target', target: null, source: 'cold_start' });

    expect(consume).toHaveBeenCalledOnce();
    expect(coordinator.getPendingCount()).toBe(0);
  });

  it('queues a cold-start conversation without blocking the coordinator', () => {
    const { coordinator, consume } = setup();

    coordinator.enqueue({
      id: 'conversation',
      target: '/conversation/123',
      source: 'cold_start',
    });

    expect(coordinator.getPendingCount()).toBe(1);
    expect(consume).not.toHaveBeenCalled();
  });

  it('defers navigation until the root navigator is ready', () => {
    const { coordinator, consume } = setup();
    coordinator.setSessionReady(true);
    coordinator.enqueue({ id: 'navigation', target: '/conversation/123', source: 'cold_start' });

    expect(consume).not.toHaveBeenCalled();
    coordinator.setNavigationReady(true);
    expect(consume).toHaveBeenCalledOnce();
  });

  it('defers navigation until session restoration has completed', () => {
    const { coordinator, consume } = setup();
    coordinator.setNavigationReady(true);
    coordinator.enqueue({ id: 'session', target: '/conversation/123', source: 'cold_start' });

    expect(consume).not.toHaveBeenCalled();
    coordinator.setSessionReady(true);
    expect(consume).toHaveBeenCalledOnce();
  });

  it('consumes a notification identifier only once', () => {
    const { coordinator, consume } = setup();
    coordinator.setNavigationReady(true);
    coordinator.setSessionReady(true);
    const notification: Open = {
      id: 'deduplicated',
      target: '/conversation/123',
      source: 'cold_start',
    };

    coordinator.enqueue(notification);
    coordinator.enqueue(notification);

    expect(consume).toHaveBeenCalledOnce();
  });

  it('reports a duplicate cold-start response so native state can be cleared', () => {
    const consume = vi.fn();
    const onDuplicate = vi.fn();
    const coordinator = createDeferredNotificationOpenCoordinator<Open>({
      getKey: (notification) => notification.id,
      consume,
      onDuplicate,
    });
    coordinator.setNavigationReady(true);
    coordinator.setSessionReady(true);

    coordinator.enqueue({ id: 'same-response', target: '/conversation/123', source: 'listener' });
    const coldStartDuplicate: Open = {
      id: 'same-response',
      target: '/conversation/123',
      source: 'cold_start',
    };
    coordinator.enqueue(coldStartDuplicate);

    expect(consume).toHaveBeenCalledOnce();
    expect(onDuplicate).toHaveBeenCalledWith(coldStartDuplicate);
  });

  it('reads the native cold-start response only once', async () => {
    const { coordinator, consume } = setup();
    const read = vi.fn(async (): Promise<Open | null> => ({
      id: 'native-last-response',
      target: '/conversation/123',
      source: 'cold_start',
    }));
    coordinator.setNavigationReady(true);
    coordinator.setSessionReady(true);

    await coordinator.readColdStartOnce(read);
    await coordinator.readColdStartOnce(read);

    expect(read).toHaveBeenCalledOnce();
    expect(consume).toHaveBeenCalledOnce();
  });

  it('contains route-consumption errors and still finalizes the notification', () => {
    const consume = vi.fn(() => {
      throw new Error('invalid route');
    });
    const onConsumed = vi.fn();
    const onError = vi.fn();
    const coordinator = createDeferredNotificationOpenCoordinator<Open>({
      getKey: (notification) => notification.id,
      consume,
      onConsumed,
      onError,
    });
    coordinator.setNavigationReady(true);
    coordinator.setSessionReady(true);

    coordinator.enqueue({ id: 'route-error', target: '/bad', source: 'cold_start' });

    expect(onError).toHaveBeenCalledOnce();
    expect(onConsumed).toHaveBeenCalledOnce();
    expect(coordinator.getPendingCount()).toBe(0);
  });

  it('allows a signed-out session result to release pending work', () => {
    const { coordinator, consume } = setup();
    coordinator.setNavigationReady(true);
    coordinator.enqueue({ id: 'signed-out', target: '/conversation/123', source: 'cold_start' });

    // Session readiness means restoration completed; it does not imply a signed-in user.
    coordinator.setSessionReady(true);

    expect(consume).toHaveBeenCalledOnce();
  });

  it('continues to consume background taps immediately after startup', () => {
    const { coordinator, consume } = setup();
    coordinator.setNavigationReady(true);
    coordinator.setSessionReady(true);

    coordinator.enqueue({ id: 'background', target: '/listing/123', source: 'listener' });

    expect(consume).toHaveBeenCalledWith({
      id: 'background',
      target: '/listing/123',
      source: 'listener',
    });
  });
});
