/** Offset is server rows consumed, never the number of deduplicated cards. */
export type DiscoveryPage<T> = {
  data: T[];
  pagination: { nextOffset: number; hasMore: boolean };
};
export type DiscoveryFeedCache<T> = {
  listings: T[];
  paginationVersion: 1;
  pageSize: number;
  nextOffset: number;
  hasMore: boolean;
};
export type DiscoveryFeedState<T> = {
  status: 'loading' | 'success' | 'empty' | 'error';
  data: T[];
  message: string;
  nextOffset: number;
  hasMore: boolean;
  ready: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  loadMoreError: string | null;
};

export function createDiscoveryFeedController<T extends { id: string }>(
  pageSize: number,
  fetchPage: (offset: number, limit: number) => Promise<DiscoveryPage<T>>,
  saveFirstPage: (cache: DiscoveryFeedCache<T>) => void = () => {},
) {
  let generation = 0;
  let request: object | null = null;
  let state: DiscoveryFeedState<T> = {
    status: 'loading', data: [], message: '', nextOffset: 0, hasMore: false,
    ready: false, refreshing: false, loadingMore: false, loadMoreError: null,
  };
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<typeof state>) => {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  };
  const unique = (items: T[]) => {
    const seen = new Set<string>();
    return items.filter(item => !seen.has(item.id) && !!seen.add(item.id));
  };

  async function run(append: boolean) {
    if (append && (request || !state.ready || !state.hasMore)) return;
    // A refresh/criteria change invalidates an already running next page.
    if (!append) generation++;
    const version = generation;
    const token = {};
    request = token;
    const offset = append ? state.nextOffset : 0;
    publish({
      loadingMore: append, refreshing: !append, loadMoreError: null,
      ...(!append ? { ready: false } : {}),
    });
    try {
      const page = await fetchPage(offset, pageSize);
      if (version !== generation || request !== token) return;
      if (!Number.isInteger(page.pagination.nextOffset) ||
          page.pagination.nextOffset < offset ||
          (page.pagination.hasMore && page.pagination.nextOffset <= offset)) {
        throw new Error('Pagination Découverte invalide');
      }
      const data = unique(append ? [...state.data, ...page.data] : page.data);
      publish({
        status: data.length || page.pagination.hasMore ? 'success' : 'empty', data, ready: true,
        nextOffset: page.pagination.nextOffset, hasMore: page.pagination.hasMore,
        loadingMore: false, refreshing: false, message: '',
      });
      if (!append) {
        saveFirstPage({
          listings: data, paginationVersion: 1, pageSize,
          nextOffset: page.pagination.nextOffset, hasMore: page.pagination.hasMore,
        });
      }
    } catch (error) {
      if (version !== generation || request !== token) return;
      const message = error instanceof Error ? error.message : 'Chargement impossible';
      publish({
        status: state.data.length ? 'success' : 'error', message,
        loadMoreError: state.data.length ? message : null,
        loadingMore: false, refreshing: false,
      });
    } finally {
      if (request === token) request = null;
    }
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    generation: () => generation,
    cancel: () => { generation++; request = null; },
    /** Old caches can paint immediately but cannot supply a safe server offset. */
    restoreCache: (payload: unknown) => {
      const cache = payload as Partial<DiscoveryFeedCache<T>> | null;
      if (!cache || !Array.isArray(cache.listings) || !cache.listings.length ||
          cache.listings.some(item => !item || typeof item.id !== 'string')) return false;
      const compatible = cache.paginationVersion === 1 && cache.pageSize === pageSize &&
        Number.isInteger(cache.nextOffset) && cache.nextOffset! >= cache.listings.length &&
        typeof cache.hasMore === 'boolean';
      publish({
        status: 'success', data: unique(cache.listings), ready: compatible,
        hasMore: compatible ? cache.hasMore! : false,
        nextOffset: compatible ? cache.nextOffset! : 0,
      });
      return compatible;
    },
    refresh: () => run(false),
    loadMore: () => state.loadMoreError ? Promise.resolve() : run(true),
    retry: () => run(state.ready),
  };
}
