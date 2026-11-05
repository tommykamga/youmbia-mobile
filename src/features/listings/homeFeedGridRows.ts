import type { PublicListing } from '@/services/listings';

export type HomeFeedGridRow =
  | { key: string; kind: 'cells'; cells: (PublicListing | number)[] }
  | { key: string; kind: 'extra' };

/** Regroupe les cartes en rangées pour la grille accueil / favoris (1 ou 2 colonnes). */
export function buildHomeFeedGridRows(
  entries: readonly unknown[],
  columnCount: 1 | 2
): HomeFeedGridRow[] {
  const rows: HomeFeedGridRow[] = [];
  let batch: (PublicListing | number)[] = [];

  const flush = () => {
    if (batch.length === 0) return;
    rows.push({
      key: batch.map((c) => (typeof c === 'number' ? `sk-${c}` : c.id)).join('|'),
      kind: 'cells',
      cells: [...batch],
    });
    batch = [];
  };

  for (const entry of entries) {
    if (
      entry != null &&
      typeof entry === 'object' &&
      'type' in entry &&
      (entry as { type?: string }).type === 'extra'
    ) {
      flush();
      rows.push({ key: 'extra-component', kind: 'extra' });
      continue;
    }
    batch.push(entry as PublicListing | number);
    if (batch.length >= columnCount) flush();
  }
  flush();
  return rows;
}
