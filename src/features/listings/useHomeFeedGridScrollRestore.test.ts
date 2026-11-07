import { describe, expect, it, vi } from 'vitest';
import { buildHomeFeedGridRows } from './homeFeedGridRows';
import {
  HOME_FEED_SCROLL_INDEX_MAX_ATTEMPTS,
  MISSING_ANCHOR_SCROLL_FALLBACK,
  createStableOnViewableItemsChanged,
  planScrollIndexFailureRetry,
  resolveAnchorListIndex,
} from './useHomeFeedGridScrollRestore';

const listings = (ids: string[]) => ids.map((id) => ({ id }));

describe('createStableOnViewableItemsChanged', () => {
  it('assigné une fois dans useRef, le callback ne change pas de référence', () => {
    const onChange = createStableOnViewableItemsChanged(
      () => true,
      () => false,
      () => {}
    );
    const listRef = { current: onChange };
    expect(listRef.current).toBe(onChange);
  });

  it('respecte enabled via ref (loading → success)', () => {
    let enabled = false;
    const anchors: string[] = [];
    const onChange = createStableOnViewableItemsChanged(
      () => enabled,
      () => false,
      (a) => {
        if (a) anchors.push(a.listingId);
      }
    );

    onChange({
      viewableItems: [{ item: { id: 'a' }, key: 'a', index: 0, isViewable: true }],
      changed: [],
    });
    expect(anchors).toEqual([]);

    enabled = true;
    onChange({
      viewableItems: [{ item: { id: 'a' }, key: 'a', index: 0, isViewable: true }],
      changed: [],
    });
    expect(anchors).toEqual(['a']);
  });

  it('n’écrit pas d’ancre pendant restoring', () => {
    let anchorId: string | null = null;
    const onChange = createStableOnViewableItemsChanged(
      () => true,
      () => true,
      (a) => {
        anchorId = a?.listingId ?? null;
      }
    );
    onChange({
      viewableItems: [{ item: { id: 'x' }, key: 'x', index: 0, isViewable: true }],
      changed: [],
    });
    expect(anchorId).toBeNull();
  });
});

describe('planScrollIndexFailureRetry', () => {
  const basePending = {
    layoutEpoch: 1,
    listingId: 'l3',
    index: 4,
    viewPosition: 0,
    attempts: 0,
  };

  it('retry après failure avec offset puis incrémente attempts', () => {
    const plan = planScrollIndexFailureRetry(basePending, 1, {
      index: 4,
      averageItemLength: 120,
      highestMeasuredFrameIndex: 2,
    });
    expect(plan).toEqual({
      kind: 'retry',
      offset: 480,
      pending: { ...basePending, attempts: 1 },
    });
  });

  it('arrête après le plafond — pas de boucle', () => {
    const exhausted = { ...basePending, attempts: HOME_FEED_SCROLL_INDEX_MAX_ATTEMPTS };
    expect(planScrollIndexFailureRetry(exhausted, 1, {
      index: 4,
      averageItemLength: 120,
      highestMeasuredFrameIndex: 2,
    })).toEqual({ kind: 'stop' });
  });

  it('ignore si epoch de layout a changé (changement colonnes)', () => {
    expect(
      planScrollIndexFailureRetry(basePending, 2, {
        index: 4,
        averageItemLength: 120,
        highestMeasuredFrameIndex: 2,
      })
    ).toEqual({ kind: 'noop' });
  });

  it('simule failure → retry → même ID d’ancre', () => {
    const list = {
      scrollToOffset: vi.fn(),
      scrollToIndex: vi.fn(),
    };
    let pending = basePending;
    const epoch = 1;

    const first = planScrollIndexFailureRetry(pending, epoch, {
      index: 4,
      averageItemLength: 100,
      highestMeasuredFrameIndex: 1,
    });
    expect(first.kind).toBe('retry');
    if (first.kind !== 'retry') return;
    pending = first.pending;
    list.scrollToOffset({ offset: first.offset, animated: false });

    const second = planScrollIndexFailureRetry(pending, epoch, {
      index: 4,
      averageItemLength: 100,
      highestMeasuredFrameIndex: 3,
    });
    expect(second.kind).toBe('retry');
    expect(pending.listingId).toBe('l3');
    expect(list.scrollToOffset).toHaveBeenCalledWith({ offset: 400, animated: false });
  });
});

describe('resolveAnchorListIndex / disparition ancre', () => {
  const flat = listings(['l1', 'l2', 'l3']);
  const rows = buildHomeFeedGridRows(flat, 2);
  const anchor = { listingId: 'l3', viewPosition: 0 };

  it('transition 1 → 2 → 1 sur le même ID', () => {
    expect(resolveAnchorListIndex(anchor, false, flat, null)).toBe(2);
    expect(resolveAnchorListIndex(anchor, true, flat, rows)).toBe(1);
    expect(resolveAnchorListIndex(anchor, false, flat, null)).toBe(2);
  });

  it('ancre absente des données : index -1 (fallback preserve-viewport)', () => {
    const gone = resolveAnchorListIndex(
      { listingId: 'missing', viewPosition: 0 },
      false,
      flat,
      null
    );
    expect(gone).toBe(-1);
    expect(MISSING_ANCHOR_SCROLL_FALLBACK).toBe('preserve-viewport');
  });
});

describe('démontage avant retry', () => {
  it('annule le pending si epoch incrémenté (unmount simulé)', () => {
    expect(
      planScrollIndexFailureRetry(
        { layoutEpoch: 1, listingId: 'a', index: 2, viewPosition: 0, attempts: 1 },
        99,
        { index: 2, averageItemLength: 50, highestMeasuredFrameIndex: 0 }
      )
    ).toEqual({ kind: 'noop' });
  });
});
