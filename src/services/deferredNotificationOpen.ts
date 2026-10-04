export type DeferredNotificationOpenCoordinator<T> = {
  enqueue: (notification: T) => void;
  readColdStartOnce: (read: () => Promise<T | null>) => Promise<void>;
  setNavigationReady: (ready: boolean) => void;
  setSessionReady: (ready: boolean) => void;
  getPendingCount: () => number;
};

type DeferredNotificationOpenOptions<T> = {
  getKey: (notification: T) => string;
  consume: (notification: T) => void;
  onConsumed?: (notification: T) => void;
  onDuplicate?: (notification: T) => void;
  onError?: (error: unknown) => void;
};

/**
 * Small runtime coordinator kept independent from React and Expo Router.
 * Notification routing can wait for prerequisites, but app rendering never does.
 */
export function createDeferredNotificationOpenCoordinator<T>(
  options: DeferredNotificationOpenOptions<T>,
): DeferredNotificationOpenCoordinator<T> {
  let navigationReady = false;
  let sessionReady = false;
  let coldStartRead = false;
  const pending: T[] = [];
  const queuedKeys = new Set<string>();
  const consumedKeys = new Set<string>();

  const flush = () => {
    if (!navigationReady || !sessionReady) return;

    while (pending.length > 0) {
      const notification = pending.shift();
      if (!notification) continue;

      const key = options.getKey(notification);
      queuedKeys.delete(key);
      if (consumedKeys.has(key)) continue;

      // Mark before invoking navigation so an exception can never create a replay loop.
      consumedKeys.add(key);
      try {
        options.consume(notification);
      } catch (error) {
        options.onError?.(error);
      } finally {
        options.onConsumed?.(notification);
      }
    }
  };

  const enqueue = (notification: T) => {
    const key = options.getKey(notification);
    if (queuedKeys.has(key) || consumedKeys.has(key)) {
      options.onDuplicate?.(notification);
      return;
    }
    queuedKeys.add(key);
    pending.push(notification);
    flush();
  };

  return {
    enqueue,

    async readColdStartOnce(read) {
      if (coldStartRead) return;
      coldStartRead = true;
      try {
        const notification = await read();
        if (notification) enqueue(notification);
      } catch (error) {
        options.onError?.(error);
      }
    },

    setNavigationReady(ready) {
      navigationReady = ready;
      flush();
    },

    setSessionReady(ready) {
      sessionReady = ready;
      flush();
    },

    getPendingCount() {
      return pending.length;
    },
  };
}
