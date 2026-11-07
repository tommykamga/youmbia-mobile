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

export function createStableOnViewableItemsChanged(
  readEnabled: () => boolean,
  readRestoring: () => boolean,
  writeAnchor: (anchor: ListingScrollAnchor | null) => void
): (info: ViewableChangeInfo) => void {
  return (info: ViewableChangeInfo) => {
    if (!readEnabled() || readRestoring()) return;
    const anchor = pickListingScrollAnchor(info.viewableItems);
    if (anchor) writeAnchor(anchor);
  };
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
  const restoringRef = useRef(false);
  const didMountRef = useRef(false);
  const enabledRef = useRef(enabled);
  const layoutEpochRef = useRef(0);
  const pendingScrollRef = useRef<PendingScrollToAnchor | null>(null);
  const unmountedRef = useRef(false);

  enabledRef.current = enabled;

  const onViewableItemsChangedRef = useRef<
    ((info: ViewableChangeInfo) => void) | null
  >(null);
  if (!onViewableItemsChangedRef.current) {
    onViewableItemsChangedRef.current = createStableOnViewableItemsChanged(
      () => enabledRef.current,
      () => restoringRef.current,
      (anchor) => {
        if (anchor) anchorRef.current = anchor;
      }
    );
  }
  const onViewableItemsChanged = onViewableItemsChangedRef.current;

  const onScrollToIndexFailedRef = useRef<
    ((info: ScrollIndexFailureInfo) => void) | null
  >(null);
  if (!onScrollToIndexFailedRef.current) {
    onScrollToIndexFailedRef.current = (info: ScrollIndexFailureInfo) => {
      const list = listRef.current;
      if (!list || unmountedRef.current) return;

      const plan = planScrollIndexFailureRetry(
        pendingScrollRef.current,
        layoutEpochRef.current,
        info
      );

      if (plan.kind === 'noop' || plan.kind === 'stop') {
        if (plan.kind === 'stop') {
          pendingScrollRef.current = null;
          restoringRef.current = false;
        }
        return;
      }

      pendingScrollRef.current = plan.pending;
      list.scrollToOffset({ offset: plan.offset, animated: false });

      const epochAtRetry = layoutEpochRef.current;
      const pendingAtRetry = plan.pending;

      requestAnimationFrame(() => {
        if (unmountedRef.current || epochAtRetry !== layoutEpochRef.current) {
          pendingScrollRef.current = null;
          restoringRef.current = false;
          return;
        }
        const liveList = listRef.current;
        if (!liveList || pendingScrollRef.current?.layoutEpoch !== epochAtRetry) {
          pendingScrollRef.current = null;
          restoringRef.current = false;
          return;
        }
        try {
          liveList.scrollToIndex({
            index: pendingAtRetry.index,
            viewPosition: pendingAtRetry.viewPosition,
            animated: false,
          });
        } catch {
          return;
        }
        pendingScrollRef.current = null;
        restoringRef.current = false;
      });
    };
  }
  const onScrollToIndexFailed = onScrollToIndexFailedRef.current;

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      pendingScrollRef.current = null;
      restoringRef.current = false;
      layoutEpochRef.current += 1;
    };
  }, []);

  useLayoutEffect(() => {
    if (!enabled) {
      prevColumnCountRef.current = columnCount;
      prevUseGridRef.current = useGrid;
      pendingScrollRef.current = null;
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

    layoutEpochRef.current += 1;
    const epoch = layoutEpochRef.current;
    pendingScrollRef.current = null;

    const anchor = anchorRef.current;
    if (!anchor) return;

    const listIndex = resolveAnchorListIndex(anchor, useGrid, flatData, gridRows);
    if (listIndex < 0) {
      return;
    }

    const list = listRef.current;
    if (!list) return;

    restoringRef.current = true;
    pendingScrollRef.current = {
      layoutEpoch: epoch,
      listingId: anchor.listingId,
      index: listIndex,
      viewPosition: anchor.viewPosition,
      attempts: 0,
    };

    requestAnimationFrame(() => {
      if (unmountedRef.current || epoch !== layoutEpochRef.current) {
        pendingScrollRef.current = null;
        restoringRef.current = false;
        return;
      }
      const liveList = listRef.current;
      const pending = pendingScrollRef.current;
      if (!liveList || !pending || pending.layoutEpoch !== epoch) {
        pendingScrollRef.current = null;
        restoringRef.current = false;
        return;
      }
      try {
        liveList.scrollToIndex({
          index: pending.index,
          viewPosition: pending.viewPosition,
          animated: false,
        });
        pendingScrollRef.current = null;
        restoringRef.current = false;
      } catch {
        // Attendre onScrollToIndexFailed pour reprise bornée.
      }
    });
  }, [enabled, columnCount, useGrid, flatData, gridRows, listRef]);

  return {
    onViewableItemsChanged,
    viewabilityConfig: HOME_FEED_VIEWABILITY_CONFIG,
    onScrollToIndexFailed,
  };
}
