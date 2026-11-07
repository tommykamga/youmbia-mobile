import type { HomeFeedGridRow } from './homeFeedGridRows';

export type ListingScrollAnchor = {
  listingId: string;
  /** `scrollToIndex` viewPosition (0 = haut de la fenêtre visible). */
  viewPosition: number;
};

export const HOME_FEED_VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 28,
  minimumViewTime: 64,
} as const;

type ViewableToken = {
  item: unknown;
  index: number | null;
  isViewable?: boolean;
};

function listingIdFromGridRow(row: HomeFeedGridRow): string | null {
  if (row.kind !== 'cells') return null;
  for (const cell of row.cells) {
    if (typeof cell !== 'number' && cell?.id) return cell.id;
  }
  return null;
}

function listingIdFromFlatEntry(entry: unknown): string | null {
  if (entry == null || typeof entry !== 'object') return null;
  if ('type' in entry && (entry as { type?: string }).type === 'extra') return null;
  if ('kind' in entry) return listingIdFromGridRow(entry as HomeFeedGridRow);
  if ('id' in entry && typeof (entry as { id: unknown }).id === 'string') {
    return (entry as { id: string }).id;
  }
  return null;
}

/** Choisit l’annonce la plus haute encore visible (ancre de lecture). */
export function pickListingScrollAnchor(
  viewableItems: readonly ViewableToken[]
): ListingScrollAnchor | null {
  const visible = viewableItems
    .filter((t) => t.isViewable !== false && t.index != null)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  for (const token of visible) {
    const listingId = listingIdFromFlatEntry(token.item);
    if (listingId) return { listingId, viewPosition: 0 };
  }
  return null;
}

export function flatListingIndexById(entries: readonly unknown[], listingId: string): number {
  let idx = 0;
  for (const entry of entries) {
    if (
      entry != null &&
      typeof entry === 'object' &&
      'type' in entry &&
      (entry as { type?: string }).type === 'extra'
    ) {
      idx += 1;
      continue;
    }
    if (typeof entry === 'number') {
      idx += 1;
      continue;
    }
    if (entry != null && typeof entry === 'object' && 'id' in entry) {
      if ((entry as { id: string }).id === listingId) return idx;
      idx += 1;
    }
  }
  return -1;
}

export function gridRowIndexByListingId(
  rows: readonly HomeFeedGridRow[],
  listingId: string
): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.kind !== 'cells') continue;
    if (row.cells.some((c) => typeof c !== 'number' && c.id === listingId)) return i;
  }
  return -1;
}

export function resolveFlatListScrollIndexForAnchor(
  anchor: ListingScrollAnchor,
  useGrid: boolean,
  flatData: readonly unknown[],
  gridRows: readonly HomeFeedGridRow[] | null
): number {
  if (useGrid && gridRows) {
    const rowIndex = gridRowIndexByListingId(gridRows, anchor.listingId);
    return rowIndex >= 0 ? rowIndex : 0;
  }
  const flatIndex = flatListingIndexById(flatData, anchor.listingId);
  return flatIndex >= 0 ? flatIndex : 0;
}

/** Largeur intérieure mesurée ou estimation ; jamais NaN. */
export function resolveGridInnerWidthForLayout(
  measuredInnerWidth: number | null | undefined,
  fallbackInnerWidth: number
): number {
  const measured = measuredInnerWidth;
  if (typeof measured === 'number' && Number.isFinite(measured) && measured > 0) {
    return measured;
  }
  const fallback = fallbackInnerWidth;
  if (Number.isFinite(fallback) && fallback > 0) return fallback;
  return 0;
}
