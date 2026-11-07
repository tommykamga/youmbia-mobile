import { useEffect, useLayoutEffect, useRef } from 'react';
import type { FlatList, ViewToken } from 'react-native';
import type { HomeFeedGridRow } from './homeFeedGridRows';
import {
  HOME_FEED_VIEWABILITY_CONFIG,
  flatListingIndexById,
  gridRowIndexByListingId,
  pickListingScrollAnchor,
  type ListingScrollAnchor,
} from './homeFeedGridScrollAnchor';

type Params = {
  enabled: boolean;
  listRef: React.RefObject<FlatList<any> | null>;
  columnCount: 1 | 2;
  useGrid: boolean;
  flatData: readonly unknown[];
  gridRows: readonly HomeFeedGridRow[] | null;
};

export const HOME_FEED_SCROLL_INDEX_MAX_ATTEMPTS = 3;

export type PendingScrollToAnchor = {
  layoutEpoch: number;
  listingId: string;
  index: number;
  viewPosition: number;
  attempts: number;
};

/**
 * Si l’ID d’ancre n’est plus dans les données (retry, filtre, pagination partielle),
 * on ne fait **aucun** scroll programmé — la position courante de la liste est conservée.
 */
export const MISSING_ANCHOR_SCROLL_FALLBACK = 'preserve-viewport' as const;

export function resolveAnchorListIndex(
  anchor: ListingScrollAnchor,
  useGrid: boolean,
  flatData: readonly unknown[],
  gridRows: readonly HomeFeedGridRow[] | null
): number {
  if (useGrid && gridRows) {
    return gridRowIndexByListingId(gridRows, anchor.listingId);
  }
  return flatListingIndexById(flatData, anchor.listingId);
}

type ScrollIndexFailureInfo = {
  index: number;
  averageItemLength: number;
  highestMeasuredFrameIndex: number;
};

/** Reprise bornée après `onScrollToIndexFailed` : offset approximatif puis nouveau `scrollToIndex`. */
export function planScrollIndexFailureRetry(
  pending: PendingScrollToAnchor | null,
  layoutEpoch: number,
  info: ScrollIndexFailureInfo,
  maxAttempts: number = HOME_FEED_SCROLL_INDEX_MAX_ATTEMPTS
):
  | { kind: 'noop' }
  | { kind: 'stop' }
  | { kind: 'retry'; offset: number; pending: PendingScrollToAnchor } {
  if (!pending || pending.layoutEpoch !== layoutEpoch) {
    return { kind: 'noop' };
  }
  if (pending.attempts >= maxAttempts) {
    return { kind: 'stop' };
  }
  if (pending.index !== info.index) {
    return { kind: 'noop' };
  }
  const offset = Math.max(0, info.averageItemLength * info.index);
  return {
    kind: 'retry',
    offset,
    pending: { ...pending, attempts: pending.attempts + 1 },
  };
}

type ViewableChangeInfo = { viewableItems: ViewToken[]; changed: ViewToken[] };

function listingIdsFromViewableItem(item: unknown): string[] {
  if (item == null || typeof item !== 'object') return [];
  if ('kind' in item) {
    const row = item as HomeFeedGridRow;
    if (row.kind !== 'cells') return [];
    return row.cells
      .filter((c): c is Exclude<typeof c, number> => typeof c !== 'number')
      .map((c) => c.id);
  }
  if ('id' in item && typeof (item as { id: unknown }).id === 'string') {
    return [(item as { id: string }).id];
  }
  return [];
}

export function viewableItemsIncludeListingId(
  viewableItems: readonly ViewToken[],
  listingId: string
): boolean {
  for (const token of viewableItems) {
    if (token.isViewable === false) continue;
    if (listingIdsFromViewableItem(token.item).includes(listingId)) return true;
  }
  return false;
}

export function createStableOnViewableItemsChanged(
  readEnabled: () => boolean,
  readRestoring: () => boolean,
  readPending: () => PendingScrollToAnchor | null,
  readLayoutEpoch: () => number,
  writeAnchor: (anchor: ListingScrollAnchor | null) => void,
  onRestoreConfirmed: () => void
): (info: ViewableChangeInfo) => void {
  return (info: ViewableChangeInfo) => {
    if (!readEnabled()) return;

    const pending = readPending();
    const epoch = readLayoutEpoch();

    if (pending && readRestoring() && pending.layoutEpoch === epoch) {
      if (viewableItemsIncludeListingId(info.viewableItems, pending.listingId)) {
        onRestoreConfirmed();
      }
      return;
    }

    if (readRestoring()) return;

    const anchor = pickListingScrollAnchor(info.viewableItems);
    if (anchor) writeAnchor(anchor);
  };
}

export type FlatListScrollLike = {
  scrollToIndex: (opts: {
    index: number;
    viewPosition?: number;
    animated?: boolean;
  }) => void;
  scrollToOffset?: (opts: { offset: number; animated?: boolean }) => void;
};

/** Machine d’état testable (FlatList mockée) — le hook l’alimente via refs. */
export class HomeFeedScrollRestoreSession {
  pending: PendingScrollToAnchor | null = null;
  restoring = false;
  layoutEpoch = 0;
  unmounted = false;
  anchor: ListingScrollAnchor | null = null;

  constructor(private readonly listRef: { current: FlatListScrollLike | null }) {}

  finishRestore(): void {
    this.pending = null;
    this.restoring = false;
  }

  cancelAll(): void {
    this.layoutEpoch += 1;
    this.finishRestore();
  }

  startRestore(pending: PendingScrollToAnchor): void {
    this.pending = pending;
    this.restoring = true;
    this.invokeScrollToIndex();
  }

  /** Ne termine pas le pending : confirmation via viewables ou failure async. */
  invokeScrollToIndex(): void {
    const list = this.listRef.current;
    const pending = this.pending;
    if (!list || !pending || this.unmounted || pending.layoutEpoch !== this.layoutEpoch) {
      this.finishRestore();
      return;
    }
    try {
      list.scrollToIndex({
        index: pending.index,
        viewPosition: pending.viewPosition,
        animated: false,
      });
    } catch {
      // Garde pending pour onScrollToIndexFailed ou confirmation viewable.
    }
  }

  handleScrollToIndexFailed(info: ScrollIndexFailureInfo): void {
    if (this.unmounted) return;

    const plan = planScrollIndexFailureRetry(this.pending, this.layoutEpoch, info);

    if (plan.kind === 'noop') return;
    if (plan.kind === 'stop') {
      this.finishRestore();
      return;
    }

    this.pending = plan.pending;
    const list = this.listRef.current;
    if (!list) return;

    list.scrollToOffset?.({ offset: plan.offset, animated: false });
    this.invokeScrollToIndex();
  }

  handleViewableItemsChanged(info: ViewableChangeInfo, enabled: boolean): void {
    const onChange = createStableOnViewableItemsChanged(
      () => enabled,
      () => this.restoring,
      () => this.pending,
      () => this.layoutEpoch,
      (anchor) => {
        if (anchor) this.anchor = anchor;
      },
      () => this.finishRestore()
    );
    onChange(info);
  }
}

export function useHomeFeedGridScrollRestore({
  enabled,
  listRef,
  columnCount,
  useGrid,
  flatData,
  gridRows,
}: Params) {
  const anchorRef = useRef<ListingScrollAnchor | null>(null);
  const prevColumnCountRef = useRef(columnCount);
  const prevUseGridRef = useRef(useGrid);
  const didMountRef = useRef(false);
  const enabledRef = useRef(enabled);
  const sessionRef = useRef<HomeFeedScrollRestoreSession | null>(null);

  enabledRef.current = enabled;

  if (!sessionRef.current) {
    sessionRef.current = new HomeFeedScrollRestoreSession(listRef);
  }

  const session = sessionRef.current;

  const onViewableItemsChangedRef = useRef<
    ((info: ViewableChangeInfo) => void) | null
  >(null);
  if (!onViewableItemsChangedRef.current) {
    onViewableItemsChangedRef.current = (info: ViewableChangeInfo) => {
      session.handleViewableItemsChanged(info, enabledRef.current);
      anchorRef.current = session.anchor;
    };
  }
  const onViewableItemsChanged = onViewableItemsChangedRef.current;

  const onScrollToIndexFailedRef = useRef<
    ((info: ScrollIndexFailureInfo) => void) | null
  >(null);
  if (!onScrollToIndexFailedRef.current) {
    onScrollToIndexFailedRef.current = (info: ScrollIndexFailureInfo) => {
      session.handleScrollToIndexFailed(info);
    };
  }
  const onScrollToIndexFailed = onScrollToIndexFailedRef.current;

  useEffect(() => {
    session.unmounted = false;
    return () => {
      session.unmounted = true;
      session.cancelAll();
    };
  }, [session]);

  useLayoutEffect(() => {
    if (!enabled) {
      prevColumnCountRef.current = columnCount;
      prevUseGridRef.current = useGrid;
      session.finishRestore();
      return;
    }

    const layoutModeChanged =
      prevColumnCountRef.current !== columnCount || prevUseGridRef.current !== useGrid;

    if (!didMountRef.current) {
      didMountRef.current = true;
      prevColumnCountRef.current = columnCount;
      prevUseGridRef.current = useGrid;
      return;
    }

    prevColumnCountRef.current = columnCount;
    prevUseGridRef.current = useGrid;

    if (!layoutModeChanged) return;

    session.layoutEpoch += 1;
    const epoch = session.layoutEpoch;
    session.finishRestore();

    const anchor = anchorRef.current;
    if (!anchor) return;

    const listIndex = resolveAnchorListIndex(anchor, useGrid, flatData, gridRows);
    if (listIndex < 0) {
      return;
    }

    if (!listRef.current) return;

    const pending: PendingScrollToAnchor = {
      layoutEpoch: epoch,
      listingId: anchor.listingId,
      index: listIndex,
      viewPosition: anchor.viewPosition,
      attempts: 0,
    };

    requestAnimationFrame(() => {
      if (session.unmounted || epoch !== session.layoutEpoch) {
        session.finishRestore();
        return;
      }
      session.startRestore(pending);
    });
  }, [enabled, columnCount, useGrid, flatData, gridRows, listRef, session]);

  return {
    onViewableItemsChanged,
    viewabilityConfig: HOME_FEED_VIEWABILITY_CONFIG,
    onScrollToIndexFailed,
  };
}
