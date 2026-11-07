import { useCallback, useLayoutEffect, useRef } from 'react';
import type { FlatList, ViewToken } from 'react-native';
import type { HomeFeedGridRow } from './homeFeedGridRows';
import {
  HOME_FEED_VIEWABILITY_CONFIG,
  pickListingScrollAnchor,
  resolveFlatListScrollIndexForAnchor,
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

  const onViewableItemsChanged = useCallback(
    (info: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
      if (!enabled || restoringRef.current) return;
      const anchor = pickListingScrollAnchor(info.viewableItems);
      if (anchor) anchorRef.current = anchor;
    },
    [enabled]
  );

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number; highestMeasuredFrameIndex: number }) => {
      const list = listRef.current;
      if (!list) return;
      const offset = Math.max(0, info.averageItemLength * info.index);
      list.scrollToOffset({ offset, animated: false });
    },
    [listRef]
  );

  useLayoutEffect(() => {
    if (!enabled) {
      prevColumnCountRef.current = columnCount;
      prevUseGridRef.current = useGrid;
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

    const anchor = anchorRef.current;
    if (!anchor) return;

    const list = listRef.current;
    if (!list) return;

    const index = resolveFlatListScrollIndexForAnchor(anchor, useGrid, flatData, gridRows);
    restoringRef.current = true;

    requestAnimationFrame(() => {
      try {
        list.scrollToIndex({
          index,
          viewPosition: anchor.viewPosition,
          animated: false,
        });
      } catch {
        list.scrollToOffset?.({ offset: 0, animated: false });
      }
      requestAnimationFrame(() => {
        restoringRef.current = false;
      });
    });
  }, [enabled, columnCount, useGrid, flatData, gridRows, listRef]);

  return {
    onViewableItemsChanged,
    viewabilityConfig: HOME_FEED_VIEWABILITY_CONFIG,
    onScrollToIndexFailed,
  };
}
