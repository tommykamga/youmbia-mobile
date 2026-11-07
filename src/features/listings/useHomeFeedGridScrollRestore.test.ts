import { describe, expect, it, vi } from 'vitest';
import { buildHomeFeedGridRows } from './homeFeedGridRows';
import {
  HOME_FEED_SCROLL_INDEX_MAX_ATTEMPTS,
  MISSING_ANCHOR_SCROLL_FALLBACK,
  HomeFeedScrollRestoreSession,
  createStableOnViewableItemsChanged,
  planScrollIndexFailureRetry,
  resolveAnchorListIndex,
  viewableItemsIncludeListingId,
} from './useHomeFeedGridScrollRestore';

const listings = (ids: string[]) => ids.map((id) => ({ id }));

const noopFns = () => ({
  readPending: (): null => null,
  readEpoch: () => 0,
  onConfirmed: () => {},
  writeAnchor: () => {},
});

describe('createStableOnViewableItemsChanged', () => {
  it('assigné une fois dans useRef, le callback ne change pas de référence', () => {
    const { readPending, readEpoch, onConfirmed, writeAnchor } = noopFns();
    const onChange = createStableOnViewableItemsChanged(
      () => true,
      () => false,
      readPending,
      readEpoch,
      writeAnchor,
      onConfirmed
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
      () => null,
      () => 0,
      (a) => {
        if (a) anchors.push(a.listingId);
      },
      () => {}
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

  it('pendant restoring, confirme la cible sans voler l’ancre', () => {
    let confirmed = 0;
    let stolen: string | null = 'keep';
    const pending = {
      layoutEpoch: 1,
      listingId: 'target',
      index: 2,
      viewPosition: 0,
      attempts: 0,
    };
    const onChange = createStableOnViewableItemsChanged(
      () => true,
      () => true,
      () => pending,
      () => 1,
      (a) => {
        if (a) stolen = a.listingId;
      },
      () => {
        confirmed += 1;
      }
    );
    onChange({
      viewableItems: [{ item: { id: 'other' }, key: 'o', index: 0, isViewable: true }],
      changed: [],
    });
    expect(confirmed).toBe(0);
    expect(stolen).toBe('keep');

    onChange({
      viewableItems: [{ item: { id: 'target' }, key: 't', index: 2, isViewable: true }],
      changed: [],
    });
    expect(confirmed).toBe(1);
    expect(stolen).toBe('keep');
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
    expect(
      planScrollIndexFailureRetry(exhausted, 1, {
        index: 4,
        averageItemLength: 120,
        highestMeasuredFrameIndex: 2,
      })
    ).toEqual({ kind: 'stop' });
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
});

describe('HomeFeedScrollRestoreSession (FlatList mockée)', () => {
  const basePending = {
    layoutEpoch: 1,
    listingId: 'l3',
    index: 4,
    viewPosition: 0,
    attempts: 0,
  };

  function makeSession() {
    const list = {
      scrollToIndex: vi.fn(),
      scrollToOffset: vi.fn(),
    };
    const session = new HomeFeedScrollRestoreSession({ current: list });
    session.layoutEpoch = 1;
    return { session, list };
  }

  it('garde pending après scrollToIndex puis reprise async onScrollToIndexFailed', () => {
    const { session, list } = makeSession();
    session.startRestore(basePending);
    expect(session.pending).toEqual(basePending);
    expect(list.scrollToIndex).toHaveBeenCalledTimes(1);

    session.handleScrollToIndexFailed({
      index: 4,
      averageItemLength: 100,
      highestMeasuredFrameIndex: 1,
    });
    expect(session.pending?.attempts).toBe(1);
    expect(list.scrollToOffset).toHaveBeenCalledWith({ offset: 400, animated: false });
    expect(list.scrollToIndex).toHaveBeenCalledTimes(2);
    expect(session.restoring).toBe(true);
  });

  it('confirme par viewable ID et libère pending', () => {
    const { session } = makeSession();
    session.startRestore(basePending);
    session.handleViewableItemsChanged(
      {
        viewableItems: [{ item: { id: 'l3' }, key: 'l3', index: 4, isViewable: true }],
        changed: [],
      },
      true
    );
    expect(session.pending).toBeNull();
    expect(session.restoring).toBe(false);
  });

  it('trois reprises puis stop sans boucle (4e failure)', () => {
    const { session, list } = makeSession();
    session.startRestore(basePending);
    const fail = {
      index: 4,
      averageItemLength: 50,
      highestMeasuredFrameIndex: 0,
    };
    session.handleScrollToIndexFailed(fail);
    session.handleScrollToIndexFailed(fail);
    session.handleScrollToIndexFailed(fail);
    session.handleScrollToIndexFailed(fail);
    expect(session.pending).toBeNull();
    expect(session.restoring).toBe(false);
    expect(list.scrollToIndex.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('exception synchrone scrollToIndex : pending conservé', () => {
    const list = {
      scrollToIndex: vi.fn(() => {
        throw new Error('sync');
      }),
      scrollToOffset: vi.fn(),
    };
    const session = new HomeFeedScrollRestoreSession({ current: list });
    session.layoutEpoch = 1;
    session.startRestore(basePending);
    expect(session.pending).not.toBeNull();
    session.handleScrollToIndexFailed({
      index: 4,
      averageItemLength: 80,
      highestMeasuredFrameIndex: 0,
    });
    expect(session.pending?.attempts).toBe(1);
  });

  it('unmount annule pending', () => {
    const { session } = makeSession();
    session.startRestore(basePending);
    session.unmounted = true;
    session.cancelAll();
    expect(session.pending).toBeNull();
  });

  it('changement colonnes (epoch) rend noop le failure', () => {
    const { session } = makeSession();
    session.startRestore(basePending);
    session.layoutEpoch = 2;
    session.handleScrollToIndexFailed({
      index: 4,
      averageItemLength: 100,
      highestMeasuredFrameIndex: 0,
    });
    expect(session.pending?.layoutEpoch).toBe(1);
  });
});

describe('resolveAnchorListIndex / disparition ancre', () => {
  const flat = listings(['l1', 'l2', 'l3']);
  const rows = buildHomeFeedGridRows(flat, 2);
  const anchor = { listingId: 'l3', viewPosition: 0 };

  it('transition 1 → 2 → 1 sur le même ID', () => {
    expect(resolveAnchorListIndex(anchor, false, flat, null)).toBe(2);
    expect(resolveAnchorListIndex(anchor, true, flat, rows)).toBe(1);
  });

  it('ancre absente : index -1 (preserve-viewport)', () => {
    expect(
      resolveAnchorListIndex({ listingId: 'missing', viewPosition: 0 }, false, flat, null)
    ).toBe(-1);
    expect(MISSING_ANCHOR_SCROLL_FALLBACK).toBe('preserve-viewport');
  });
});

describe('viewableItemsIncludeListingId', () => {
  it('détecte une cellule grille', () => {
    const rows = buildHomeFeedGridRows(listings(['a', 'b']), 2);
    expect(
      viewableItemsIncludeListingId(
        [{ item: rows[0], key: rows[0].key, index: 0, isViewable: true }],
        'b'
      )
    ).toBe(true);
  });
});
