import { describe, expect, it, vi } from 'vitest';
import { createDiscoveryFeedController, type DiscoveryPage } from './discoveryFeedController';

type Item = { id: string };
const page = (ids: string[], nextOffset: number, hasMore: boolean): DiscoveryPage<Item> => ({
  data: ids.map(id => ({ id })), pagination: { nextOffset, hasMore },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('progressive discovery lifecycle', () => {
  it('locks synchronously against double endReached and keeps server order', async () => {
    const next = deferred<DiscoveryPage<Item>>();
    const fetch = vi.fn().mockResolvedValueOnce(page(['b', 'a'], 2, true)).mockReturnValueOnce(next.promise);
    const feed = createDiscoveryFeedController(2, fetch);
    await feed.refresh();
    const pending = feed.loadMore();
    await feed.loadMore();
    expect(fetch.mock.calls).toEqual([[0, 2], [2, 2]]);
    expect(feed.getSnapshot().data.map(x => x.id)).toEqual(['b', 'a']);
    next.resolve(page(['c'], 3, false));
    await pending;
    expect(feed.getSnapshot().data.map(x => x.id)).toEqual(['b', 'a', 'c']);
    await feed.loadMore();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('advances by server consumption through duplicates, including within a batch', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(page(['a', 'b'], 2, true))
      .mockResolvedValueOnce(page(['b', 'b'], 4, true)).mockResolvedValueOnce(page(['c'], 5, false));
    const feed = createDiscoveryFeedController(2, fetch);
    await feed.refresh(); await feed.loadMore(); await feed.loadMore();
    expect(fetch.mock.calls).toEqual([[0, 2], [2, 2], [4, 2]]);
    expect(feed.getSnapshot().data.map(x => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('probes one empty page after an exact full final page, then stops', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(page(['a', 'b'], 2, true))
      .mockResolvedValueOnce(page([], 2, false));
    const feed = createDiscoveryFeedController(2, fetch);
    await feed.refresh(); await feed.loadMore(); await feed.loadMore();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(feed.getSnapshot()).toMatchObject({ hasMore: false, data: [{ id: 'a' }, { id: 'b' }] });
  });

  it('keeps loaded cards on failure, suppresses automatic retry, and retries the same offset once', async () => {
    const retry = deferred<DiscoveryPage<Item>>();
    const fetch = vi.fn().mockResolvedValueOnce(page(['a'], 1, true))
      .mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(retry.promise);
    const feed = createDiscoveryFeedController(1, fetch);
    await feed.refresh(); await feed.loadMore(); await feed.loadMore();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(feed.getSnapshot()).toMatchObject({ data: [{ id: 'a' }], loadMoreError: 'offline', nextOffset: 1 });
    const pending = feed.retry(); await feed.retry(); await feed.loadMore();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[2]).toEqual([1, 1]);
    retry.resolve(page(['b'], 2, false)); await pending;
    expect(feed.getSnapshot()).toMatchObject({ loadMoreError: null, data: [{ id: 'a' }, { id: 'b' }] });
  });

  it.each(['resolve', 'reject'] as const)('ignores old next-page %s after a refresh', async outcome => {
    const old = deferred<DiscoveryPage<Item>>();
    const current = deferred<DiscoveryPage<Item>>();
    const fetch = vi.fn().mockResolvedValueOnce(page(['old'], 1, true))
      .mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const feed = createDiscoveryFeedController(1, fetch);
    await feed.refresh(); const pending = feed.loadMore(); const refresh = feed.refresh();
    if (outcome === 'resolve') old.resolve(page(['stale'], 2, false));
    else old.reject(new Error('stale error'));
    await pending;
    expect(feed.getSnapshot()).toMatchObject({ refreshing: true, loadMoreError: null });
    current.resolve(page(['new'], 1, true)); await refresh;
    expect(feed.getSnapshot().data).toEqual([{ id: 'new' }]);
  });

  it('invalidates in-flight requests on unmount/criteria change and never caches them', async () => {
    const old = deferred<DiscoveryPage<Item>>(); const save = vi.fn();
    const feed = createDiscoveryFeedController(2, () => old.promise, save);
    const pending = feed.refresh(); const before = feed.getSnapshot();
    feed.cancel(); old.resolve(page(['old city'], 1, false)); await pending;
    expect(feed.getSnapshot()).toBe(before); expect(save).not.toHaveBeenCalled();
  });

  it.each(['before-new-results', 'after-new-results'] as const)(
    'discards a pending next page on criteria invalidation: %s', async arrival => {
      const oldNext = deferred<DiscoveryPage<Item>>();
      const newResults = deferred<DiscoveryPage<Item>>();
      const save = vi.fn();
      const fetch = vi.fn().mockResolvedValueOnce(page(['global'], 1, true))
        .mockReturnValueOnce(oldNext.promise).mockReturnValueOnce(newResults.promise);
      const feed = createDiscoveryFeedController(1, fetch, save);
      await feed.refresh();
      const pendingOld = feed.loadMore();
      expect(feed.getSnapshot().loadingMore).toBe(true);
      // Explicit invalidation, independent of network timing or wall-clock sleeps.
      feed.cancel();
      const pendingNew = feed.refresh();
      if (arrival === 'before-new-results') {
        oldNext.resolve(page(['stale-global-page'], 2, false));
        await pendingOld;
        expect(feed.getSnapshot().refreshing).toBe(true);
      }
      newResults.resolve(page(['douala'], 1, false));
      await pendingNew;
      const filtered = feed.getSnapshot();
      if (arrival === 'after-new-results') {
        oldNext.resolve(page(['stale-global-page'], 2, false));
        await pendingOld;
      }
      expect(feed.getSnapshot()).toBe(filtered);
      expect(filtered).toMatchObject({ data: [{ id: 'douala' }], hasMore: false });
      expect(save.mock.calls.map(([cache]) => cache.listings)).toEqual([
        [{ id: 'global' }], [{ id: 'douala' }],
      ]);
      expect(fetch.mock.calls).toEqual([[0, 1], [1, 1], [0, 1]]);
    },
  );

  it('resumes a compatible first-page cache at the server offset, even with missing hydrated cards', async () => {
    const fetch = vi.fn().mockResolvedValue(page(['c'], 3, false));
    const feed = createDiscoveryFeedController(2, fetch);
    expect(feed.restoreCache({ listings: [{ id: 'a' }], paginationVersion: 1,
      pageSize: 2, nextOffset: 2, hasMore: true })).toBe(true);
    await feed.loadMore(); expect(fetch).toHaveBeenCalledWith(2, 2);
    expect(feed.getSnapshot().data).toEqual([{ id: 'a' }, { id: 'c' }]);
  });

  it('shows a legacy cache but waits for page-zero revalidation before loading more', async () => {
    const fetch = vi.fn().mockResolvedValue(page(['fresh'], 1, false));
    const feed = createDiscoveryFeedController(2, fetch);
    expect(feed.restoreCache({ listings: [{ id: 'cached' }] })).toBe(false);
    expect(feed.getSnapshot().data).toEqual([{ id: 'cached' }]);
    await feed.loadMore(); expect(fetch).not.toHaveBeenCalled();
    await feed.refresh(); expect(fetch).toHaveBeenCalledWith(0, 2);
  });

  it('does not reopen a known exhausted cache and rejects a different page size', async () => {
    const fetch = vi.fn(); const feed = createDiscoveryFeedController(2, fetch);
    const cache = { listings: [{ id: 'a' }], paginationVersion: 1, pageSize: 2, nextOffset: 1, hasMore: false };
    expect(feed.restoreCache(cache)).toBe(true); await feed.loadMore(); expect(fetch).not.toHaveBeenCalled();
    expect(feed.restoreCache({ ...cache, pageSize: 6 })).toBe(false);
  });

  it('keeps cached cards on refresh failure and retries page zero explicitly', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page(['fresh'], 1, false));
    const feed = createDiscoveryFeedController(2, fetch);
    feed.restoreCache({ listings: [{ id: 'cached' }] });
    await feed.refresh(); expect(feed.getSnapshot().data).toEqual([{ id: 'cached' }]);
    await feed.retry(); expect(fetch.mock.calls).toEqual([[0, 2], [0, 2]]);
    expect(feed.getSnapshot().data).toEqual([{ id: 'fresh' }]);
  });

  it('refuses a non-advancing hasMore contract instead of looping', async () => {
    const feed = createDiscoveryFeedController(2, async () => page(['a'], 0, true));
    await feed.refresh(); expect(feed.getSnapshot()).toMatchObject({ status: 'error', message: 'Pagination Découverte invalide' });
  });
});
